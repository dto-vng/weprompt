/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = path.resolve(process.cwd(), 'packages/shared-scripts/src/merge-locale-json.mjs');

describe('merge-locale-json driver', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'locale-merge-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  type Json = Record<string, unknown>;
  type DriverResult = { code: number; stderr: string };

  /** Writes JSON (or a raw string verbatim, for malformed/empty fixtures). */
  const write = (name: string, value: Json | string): string => {
    const file = path.join(dir, name);
    writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
    return file;
  };

  /** Invokes the driver against explicit paths, including intentionally missing fixtures. */
  const execute = (ancestorPath: string, oursPath: string, theirsPath: string): DriverResult => {
    let code = 0;
    let stderr = '';

    try {
      execFileSync('node', [SCRIPT, ancestorPath, oursPath, theirsPath, 'locales/en-US/conversation.json'], {
        stdio: 'pipe',
      });
    } catch (error) {
      const failure = error as { status?: number; stderr?: Buffer };
      code = failure.status ?? 1;
      stderr = failure.stderr?.toString() ?? '';
    }

    return { code, stderr };
  };

  /** Runs the driver like git does: node script %O %A %B %P. */
  const run = (
    base: Json | string,
    ours: Json | string,
    theirs: Json | string
  ): { code: number; oursRaw: string; stderr: string } => {
    const ancestorPath = write('base.json', base);
    const oursPath = write('ours.json', ours);
    const theirsPath = write('theirs.json', theirs);
    const result = execute(ancestorPath, oursPath, theirsPath);

    return { ...result, oursRaw: readFileSync(oursPath, 'utf8') };
  };

  const merged = (result: { oursRaw: string }): Json => JSON.parse(result.oursRaw) as Json;

  it('merges disjoint key additions from both sides cleanly', () => {
    const base = { welcome: { title: 'Hi' } };
    const result = run(base, { welcome: { title: 'Hi', oursNew: 'A' } }, { welcome: { title: 'Hi', theirsNew: 'B' } });

    expect(result.code).toBe(0);
    expect(merged(result)).toEqual({
      welcome: { title: 'Hi', oursNew: 'A', theirsNew: 'B' },
    });
    expect(Object.keys((merged(result) as { welcome: Json }).welcome)).toEqual(['title', 'oursNew', 'theirsNew']);
  });

  it('takes their edit when ours is untouched', () => {
    const result = run({ a: { k: 'old' } }, { a: { k: 'old' } }, { a: { k: 'new' } });

    expect(result.code).toBe(0);
    expect(merged(result)).toEqual({ a: { k: 'new' } });
  });

  it('exits 1 and lists the key path when both sides edit the same key differently', () => {
    const result = run({ a: { k: 'old' } }, { a: { k: 'mine' } }, { a: { k: 'theirs' } });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('a.k');
    expect(merged(result)).toEqual({ a: { k: 'mine' } });
  });

  it('drops a key deleted on one side when the other side left it untouched, conflicts otherwise', () => {
    const base = { a: { gone: 'x', edited: 'x' } };
    const clean = run(base, { a: { gone: 'x', edited: 'x' } }, { a: { edited: 'x' } });

    expect(clean.code).toBe(0);
    expect(merged(clean)).toEqual({ a: { edited: 'x' } });

    const conflicted = run(base, { a: { edited: 'x' } }, { a: { gone: 'CHANGED', edited: 'x' } });
    expect(conflicted.code).toBe(1);
    expect(conflicted.stderr).toContain('a.gone');
    expect(merged(conflicted)).toEqual({ a: { edited: 'x' } });
  });

  it('fails closed on malformed OURS: exit 2, file left byte-identical', () => {
    const brokenOurs = '{ "a": "1", }';
    const result = run({ a: '1' }, brokenOurs, { a: '1', b: '2' });

    expect(result.code).toBe(2);
    expect(result.oursRaw).toBe(brokenOurs);
    expect(result.stderr).toContain('ours');

    const missingOursPath = path.join(dir, 'missing-ours.json');
    const missing = execute(
      write('base-for-missing-ours.json', { a: '1' }),
      missingOursPath,
      write('theirs-for-missing-ours.json', { a: '2' })
    );
    expect(missing.code).toBe(2);
    expect(missing.stderr).toContain('ours');
    expect(existsSync(missingOursPath)).toBe(false);
  });

  it('fails closed on malformed THEIRS without touching ours', () => {
    const oursRaw = '{\n  "a": "1",\n  "mine": "M"\n}\n';
    const result = run({ a: '1' }, oursRaw, 'not json at all');

    expect(result.code).toBe(2);
    expect(result.oursRaw).toBe(oursRaw);
    expect(result.stderr).toContain('theirs');

    const oursPath = write('ours-for-missing-theirs.json', oursRaw);
    const missing = execute(
      write('base-for-missing-theirs.json', { a: '1' }),
      oursPath,
      path.join(dir, 'missing-theirs.json')
    );
    expect(missing.code).toBe(2);
    expect(missing.stderr).toContain('theirs');
    expect(readFileSync(oursPath, 'utf8')).toBe(oursRaw);
  });

  it('handles add/add with an empty ancestor file (git %O on both-sides-new)', () => {
    const result = run('', { a: 'A' }, { b: 'B' });

    expect(result.code).toBe(0);
    expect(merged(result)).toEqual({ a: 'A', b: 'B' });
  });

  it('treats arrays atomically: one-sided replace wins, two-sided divergence conflicts', () => {
    const oneSided = run({ list: ['a', 'b'] }, { list: ['a', 'b'] }, { list: ['z'] });

    expect(oneSided.code).toBe(0);
    expect(merged(oneSided)).toEqual({ list: ['z'] });

    const diverged = run({ list: ['a'] }, { list: ['a', 'mine'] }, { list: ['a', 'theirs'] });
    expect(diverged.code).toBe(1);
    expect(diverged.stderr).toContain('list');
  });

  it('conflicts when both sides replace the same non-object value with different structures', () => {
    const diverged = run({ k: 'scalar' }, { k: { a: 1 } }, { k: { b: 2 } });

    expect(diverged.code).toBe(1);
    expect(diverged.stderr).toContain('k');
    expect(merged(diverged)).toEqual({ k: { a: 1 } });

    const identical = run({ k: 'scalar' }, { k: { a: 1, b: 2 } }, { k: { b: 2, a: 1 } });
    expect(identical.code).toBe(0);
    expect(merged(identical)).toEqual({ k: { a: 1, b: 2 } });

    for (const base of [{ k: ['array'] }, { k: null }]) {
      const restructured = run(base, { k: { a: 1 } }, { k: { b: 2 } });
      expect(restructured.code).toBe(1);
      expect(restructured.stderr).toContain('k');
      expect(merged(restructured)).toEqual({ k: { a: 1 } });
    }
  });

  it('fails closed on a malformed (non-empty) ancestor', () => {
    const oursRaw = '{\n  "a": "mine"\n}\n';
    const result = run('{ broken', oursRaw, { a: 'theirs' });

    expect(result.code).toBe(2);
    expect(result.oursRaw).toBe(oursRaw);
    expect(result.stderr).toContain('ancestor');

    const whitespaceOnly = run('  \n\t', oursRaw, { a: 'theirs' });
    expect(whitespaceOnly.code).toBe(2);
    expect(whitespaceOnly.oursRaw).toBe(oursRaw);
    expect(whitespaceOnly.stderr).toContain('ancestor');

    const oursPath = write('ours-for-missing-ancestor.json', oursRaw);
    const missing = execute(
      path.join(dir, 'missing-ancestor.json'),
      oursPath,
      write('theirs-for-missing-ancestor.json', { a: 'theirs' })
    );
    expect(missing.code).toBe(2);
    expect(missing.stderr).toContain('ancestor');
    expect(readFileSync(oursPath, 'utf8')).toBe(oursRaw);
  });

  it('merges keys named after Object.prototype members instead of dropping them', () => {
    const result = run('', '{\n  "constructor": "C"\n}\n', '{\n  "__proto__": "P",\n  "toString": "T"\n}\n');

    expect(result.code).toBe(0);
    const value = merged(result);
    expect(Object.keys(value).toSorted()).toEqual(['__proto__', 'constructor', 'toString']);
    expect(value['toString']).toBe('T');
    expect(value['constructor']).toBe('C');
  });

  it('drives a real git merge: clean on disjoint keys, conflicted state on same-key edits', () => {
    const repo = mkdtempSync(path.join(tmpdir(), 'locale-merge-git-'));
    const git = (...args: string[]): string => execFileSync('git', args, { cwd: repo, stdio: 'pipe' }).toString();
    const file = path.join(repo, 'x.json');
    const commitJson = (value: Json, message: string): void => {
      writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
      git('commit', '--no-gpg-sign', '-qam', message);
    };

    try {
      git('init', '-q');
      git('config', 'user.email', 'test@test.local');
      git('config', 'user.name', 'test');
      git('config', 'commit.gpgsign', 'false');

      const hooksDirectory = path.join(repo, 'empty hooks');
      mkdirSync(hooksDirectory);
      git('config', 'core.hooksPath', hooksDirectory);

      const driverDirectory = path.join(repo, 'driver scripts');
      const driverRelativePath = 'driver scripts/merge locale json.mjs';
      mkdirSync(driverDirectory);
      copyFileSync(SCRIPT, path.join(repo, driverRelativePath));
      git('config', 'merge.locale-json.driver', `node "${driverRelativePath}" %O %A %B %P`);

      writeFileSync(path.join(repo, '.gitattributes'), '*.json merge=locale-json\n');
      writeFileSync(file, JSON.stringify({ a: '1' }, null, 2) + '\n');
      git('add', '-A');
      git('commit', '--no-gpg-sign', '-qm', 'base');

      git('checkout', '-qb', 'left');
      commitJson({ a: '1', left: 'L' }, 'left');
      git('checkout', '-q', '-');
      commitJson({ a: '1', right: 'R' }, 'right');
      git('merge', '--no-edit', '--no-gpg-sign', '-q', 'left');
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
        a: '1',
        right: 'R',
        left: 'L',
      });

      git('checkout', '-qb', 'left2');
      commitJson({ a: 'L2', right: 'R', left: 'L' }, 'left2');
      git('checkout', '-q', '-');
      commitJson({ a: 'R2', right: 'R', left: 'L' }, 'right2');
      expect(() => git('merge', '--no-edit', '--no-gpg-sign', 'left2')).toThrow();
      expect(git('ls-files', '-u')).not.toBe('');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
