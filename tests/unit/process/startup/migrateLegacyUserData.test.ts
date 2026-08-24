import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  chooseLegacyUserDataSource,
  migrateLegacyUserData,
  type DirProbe,
} from '@/process/startup/migrateLegacyUserData';

const probe = (over: Partial<DirProbe>): DirProbe => ({
  name: 'x',
  path: '/x',
  exists: true,
  hasUserData: true,
  backendDbMtimeMs: 0,
  ...over,
});

describe('chooseLegacyUserDataSource', () => {
  it('returns null when the destination already has user data', () => {
    const dest = probe({ name: 'Forge', path: '/Forge', hasUserData: true });
    const legacy = probe({ name: 'WePrompt', path: '/WePrompt', hasUserData: true });
    expect(chooseLegacyUserDataSource(dest, [legacy])).toBeNull();
  });

  it('returns null when no legacy candidate holds data', () => {
    const dest = probe({ name: 'Forge', path: '/Forge', hasUserData: false });
    const empty = probe({ name: 'WePrompt', path: '/WePrompt', exists: true, hasUserData: false });
    expect(chooseLegacyUserDataSource(dest, [empty])).toBeNull();
  });

  it('picks the candidate with the freshest backend DB', () => {
    const dest = probe({ name: 'Forge', path: '/Forge', hasUserData: false });
    const older = probe({ name: 'WePrompt', path: '/WePrompt', backendDbMtimeMs: 100 });
    const newer = probe({ name: 'AionUi', path: '/AionUi', backendDbMtimeMs: 900 });
    expect(chooseLegacyUserDataSource(dest, [older, newer])?.path).toBe('/AionUi');
  });
});

describe('migrateLegacyUserData', () => {
  let root: string;
  const NOW = 1_700_000_000_000;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-migrate-'));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const appData = () => path.join(root, 'AppData');
  const seedInstall = (name: string, opts: { db?: string; project?: string } = {}) => {
    const base = path.join(appData(), name);
    fs.mkdirSync(path.join(base, 'aionui'), { recursive: true });
    fs.mkdirSync(path.join(base, 'config'), { recursive: true });
    fs.mkdirSync(path.join(base, 'Local Storage'), { recursive: true });
    if (opts.db !== undefined) fs.writeFileSync(path.join(base, 'aionui', 'aionui-backend.db'), opts.db);
    fs.writeFileSync(path.join(base, 'aionui', '.aionui-enc-key'), 'enckey');
    if (opts.project !== undefined) fs.writeFileSync(path.join(base, 'Local Storage', 'leveldb.txt'), opts.project);
    return base;
  };

  it('copies a stranded legacy tree into an empty Forge root and writes the sentinel', () => {
    seedInstall('WePrompt', { db: 'OLD_DB', project: 'forge.projects.v1=[{proj}]' });
    const forge = path.join(appData(), 'Forge');
    fs.mkdirSync(forge, { recursive: true });

    const result = migrateLegacyUserData({ appDataPath: appData(), userDataPath: forge, nowMs: NOW });

    expect(result.migrated).toBe(true);
    expect(result.from).toBe(path.join(appData(), 'WePrompt'));
    expect(fs.readFileSync(path.join(forge, 'aionui', 'aionui-backend.db'), 'utf8')).toBe('OLD_DB');
    expect(fs.readFileSync(path.join(forge, 'aionui', '.aionui-enc-key'), 'utf8')).toBe('enckey');
    expect(fs.readFileSync(path.join(forge, 'Local Storage', 'leveldb.txt'), 'utf8')).toContain('forge.projects.v1');
    expect(fs.existsSync(path.join(forge, '.legacy-userdata-migrated'))).toBe(true);
  });

  it('never overwrites a Forge root that already has data', () => {
    seedInstall('WePrompt', { db: 'OLD_DB' });
    const forge = seedInstall('Forge', { db: 'CURRENT_DB' });

    const result = migrateLegacyUserData({ appDataPath: appData(), userDataPath: forge, nowMs: NOW });

    expect(result.migrated).toBe(false);
    expect(result.reason).toBe('destination-has-data');
    expect(fs.readFileSync(path.join(forge, 'aionui', 'aionui-backend.db'), 'utf8')).toBe('CURRENT_DB');
  });

  it('is idempotent: a second run after the sentinel exists copies nothing', () => {
    seedInstall('WePrompt', { db: 'OLD_DB' });
    const forge = path.join(appData(), 'Forge');
    fs.mkdirSync(forge, { recursive: true });

    migrateLegacyUserData({ appDataPath: appData(), userDataPath: forge, nowMs: NOW });
    // A new legacy folder appearing afterwards must not be pulled in.
    seedInstall('AionUi', { db: 'EVEN_OLDER' });
    const second = migrateLegacyUserData({ appDataPath: appData(), userDataPath: forge, nowMs: NOW });

    expect(second.migrated).toBe(false);
    expect(second.reason).toBe('already-ran');
    expect(fs.readFileSync(path.join(forge, 'aionui', 'aionui-backend.db'), 'utf8')).toBe('OLD_DB');
  });

  it('on a fresh install with no legacy folder, does nothing but records the sentinel', () => {
    const forge = path.join(appData(), 'Forge');
    fs.mkdirSync(forge, { recursive: true });

    const result = migrateLegacyUserData({ appDataPath: appData(), userDataPath: forge, nowMs: NOW });

    expect(result.migrated).toBe(false);
    expect(result.reason).toBe('no-legacy-source');
    expect(fs.existsSync(path.join(forge, '.legacy-userdata-migrated'))).toBe(true);
  });
});
