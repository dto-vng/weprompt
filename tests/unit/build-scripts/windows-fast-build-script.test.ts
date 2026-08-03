import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  scripts: Record<string, string>;
};
const buildScript = readFileSync('scripts/build-with-builder.js', 'utf8');
const versionsScript = readFileSync('scripts/build-fast-debug-versions.ps1', 'utf8');
const worktreesScript = readFileSync('scripts/build-fast-debug-worktrees.ps1', 'utf8');

describe('Windows fast build scripts', () => {
  it('provides an x64 fast installer build that lowers compression and skips executable editing', () => {
    const script = packageJson.scripts['build-win:x64:fast'];

    expect(script).toBeTypeOf('string');
    expect(script).toContain('ELECTRON_BUILDER_COMPRESSION_LEVEL=1');
    expect(script).toContain('node scripts/build-with-builder.js x64 --win --x64');
    expect(script).toContain('--config.win.signAndEditExecutable=false');
  });

  it('supports a temporary build-time auto-update version override', () => {
    expect(buildScript).toContain("DEBUG_AUTO_UPDATE_CURRENT_VERSION_ENV = 'AIONUI_DEBUG_AUTO_UPDATE_CURRENT_VERSION'");
    expect(buildScript).toContain('applyDebugAutoUpdateVersionOverride(packageJsonPath)');
    expect(buildScript).toContain('const originalPackageJsonText = fs.readFileSync(packageJsonPath,');
    expect(buildScript).toContain('packageJson.version = debugAutoUpdateCurrentVersion');
    expect(buildScript).toContain('fs.writeFileSync(packageJsonPath, originalPackageJsonText)');
    expect(buildScript).toMatch(/finally\s*{[\s\S]*restorePackageVersionOverride\(\);[\s\S]*}/);
  });

  it('uses WePrompt installer names in both Windows fast-build workflows', () => {
    expect(versionsScript).toContain('out\\WePrompt-$version-win-x64.exe');
    expect(worktreesScript).toContain('out\\WePrompt-$($Build.version)-win-x64.exe');
    expect(versionsScript).not.toContain('AionUi-$version-win-x64.exe');
    expect(worktreesScript).not.toContain('AionUi-$($Build.version)-win-x64.exe');

    expect(worktreesScript).toContain('Programs\\Forge\\resources\\bundled-aioncore\\win32-x64');
    expect(worktreesScript).not.toContain('Programs\\AionUi\\resources\\bundled-aioncore\\win32-x64');
  });

  it('fails closed on updater and Sentry configuration in internal fast builds', () => {
    const forbiddenVariables = [
      'WEPROMPT_UPDATE_BASE_URL',
      'SENTRY_DSN',
      'SENTRY_AUTH_TOKEN',
      'SENTRY_UPLOAD_SOURCE_MAPS',
      'SENTRY_ORG',
      'SENTRY_PROJECT',
      'SENTRY_RELEASE',
    ];

    for (const source of [versionsScript, worktreesScript]) {
      expect(source).toContain("$env:WEPROMPT_INTERNAL_RELEASE = '1'");
      expect(source).toContain('must be unset for internal WePrompt builds');
      for (const name of forbiddenVariables) {
        expect(source).toContain(`'${name}'`);
      }
    }

    expect(versionsScript).not.toContain('$env:SENTRY_DSN = Resolve-SentryDsn');
    expect(worktreesScript).not.toContain('$env:SENTRY_DSN = [Text.Encoding]');
  });
});
