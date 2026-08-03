import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../..');

function installAuditFixture(binDir: string): void {
  const runnerPath = join(binDir, 'fake-bun.cjs');
  writeFileSync(
    runnerPath,
    "process.stdout.write(require('node:fs').readFileSync(process.env.WEPROMPT_TEST_AUDIT_JSON, 'utf8'));\n",
    'utf8'
  );

  if (process.platform === 'win32') {
    writeFileSync(join(binDir, 'bun.cmd'), `@"${process.execPath}" "${runnerPath}"\r\n`, 'utf8');
    return;
  }

  const executable = join(binDir, 'bun');
  writeFileSync(executable, `#!${process.execPath}\nrequire(${JSON.stringify(runnerPath)});\n`, 'utf8');
  chmodSync(executable, 0o755);
}

describe('dependency audit accepted-risk expiry', () => {
  it('fails after a high or critical baseline approval reaches review_by', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'weprompt-audit-expiry-'));
    const auditPath = join(tempDir, 'audit.json');
    const dateHookPath = join(tempDir, 'date-hook.cjs');
    const baseline = JSON.parse(readFileSync(resolve(repoRoot, '.security/audit-baseline.json'), 'utf8')) as {
      advisories: Array<{ id: number; package: string }>;
    };
    const auditMap = Object.fromEntries(
      baseline.advisories.map((entry) => [
        entry.package,
        [
          {
            id: entry.id,
            severity: 'high',
            title: 'accepted risk fixture',
            vulnerable_versions: '*',
          },
        ],
      ])
    );

    writeFileSync(auditPath, JSON.stringify(auditMap), 'utf8');
    writeFileSync(
      dateHookPath,
      `
const RealDate = Date;
global.Date = class FixedDate extends RealDate {
  constructor(...args) {
    super(...(args.length === 0 ? ['2026-08-16T00:00:00.000Z'] : args));
  }
  static now() {
    return new RealDate('2026-08-16T00:00:00.000Z').getTime();
  }
};
`,
      'utf8'
    );
    installAuditFixture(tempDir);

    try {
      const result = spawnSync(process.execPath, ['--require', dateHookPath, 'scripts/check-audit.js'], {
        cwd: repoRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${tempDir}${delimiter}${process.env.PATH ?? ''}`,
          WEPROMPT_TEST_AUDIT_JSON: auditPath,
        },
      });

      expect(result.status).not.toBe(0);
      expect(result.stdout + result.stderr).toContain('past its review_by date');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
