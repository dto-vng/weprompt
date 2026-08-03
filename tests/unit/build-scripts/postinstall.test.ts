import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../..');

function installFailingBunx(binDir: string): void {
  if (process.platform === 'win32') {
    writeFileSync(join(binDir, 'bunx.cmd'), '@exit /b 23\r\n', 'utf8');
    return;
  }

  const executable = join(binDir, 'bunx');
  writeFileSync(executable, '#!/bin/sh\nexit 23\n', 'utf8');
  chmodSync(executable, 0o755);
}

describe('postinstall native dependency policy', () => {
  it('propagates local electron-builder dependency installation failures', () => {
    const binDir = mkdtempSync(join(tmpdir(), 'weprompt-postinstall-bin-'));
    installFailingBunx(binDir);

    try {
      const result = spawnSync(process.execPath, ['scripts/postinstall.js'], {
        cwd: repoRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          CI: 'false',
          GITHUB_ACTIONS: 'false',
          PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`,
        },
      });

      expect(result.status).not.toBe(0);
      expect(result.stdout + result.stderr).toContain('Postinstall failed');
    } finally {
      rmSync(binDir, { recursive: true, force: true });
    }
  });

  it('retains the intentional CI skip', () => {
    const binDir = mkdtempSync(join(tmpdir(), 'weprompt-postinstall-ci-bin-'));
    installFailingBunx(binDir);

    try {
      const result = spawnSync(process.execPath, ['scripts/postinstall.js'], {
        cwd: repoRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          CI: 'true',
          GITHUB_ACTIONS: 'false',
          PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`,
        },
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('skipping rebuild');
    } finally {
      rmSync(binDir, { recursive: true, force: true });
    }
  });
});
