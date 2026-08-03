/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../..');

/**
 * `scripts/build-with-builder.js` resolves `out/`, the generated Sentry include and the
 * app-builder-lib NSIS templates from its own `__dirname`, so the tests below have to drive the
 * real repo — there is no temp copy to point them at. That made two test runs in one worktree race:
 * the second found no `out/` to back up (the first had already moved it aside), and the restores
 * then collided as `ENOTEMPTY: <repo>/out`. Those paths are genuinely process-global, so take a
 * lock on them rather than pretend otherwise. The whole file holds it for its full duration, which
 * is the simplest thing that is correct — the alternative is re-acquiring around each mutation for
 * no real gain, since only these tests contend for the lock in the first place.
 */
const LOCK_FILE = resolve(repoRoot, 'node_modules/.cache/aionui-build-with-builder.lock');
const LOCK_WAIT_MS = 120_000;

/**
 * The three tests below shell out to the real build script, which patches node_modules templates and
 * spawns node — measured at 4-10s each on an idle machine, so the 10s default was never an adequate
 * budget for them (the x64 case fails on an idle machine at 10s, before any load is involved). There
 * is no warm-up to hoist out of the budget the way a slow import could be: spawning the script *is*
 * the test, and its runtime is whatever the machine gives it. Hence an explicit, generous budget.
 */
const BUILD_SCRIPT_TIMEOUT_MS = 120_000;

/**
 * `link(2)` is the atomic primitive here, not `mkdir`/`open`: it publishes the lock and its contents
 * in one step. Creating the lock and then writing the owner pid into it would leave a window where a
 * waiter reads a lock with no owner, concludes it is abandoned, and steals it from a live holder.
 */
function tryTakeLock(): boolean {
  const staging = `${LOCK_FILE}.${process.pid}`;
  writeFileSync(staging, String(process.pid), 'utf8');
  try {
    linkSync(staging, LOCK_FILE);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    return false;
  } finally {
    // The lock keeps the inode alive through its own link, so dropping this name is safe either way.
    rmSync(staging, { force: true });
  }
}

function lockHolderIsGone(): boolean {
  // A run killed mid-test leaves the lock behind. Without this, one SIGKILL or Ctrl-C would wedge
  // every later run on this worktree until someone deleted the file by hand.
  try {
    const pid = Number.parseInt(readFileSync(LOCK_FILE, 'utf8'), 10);
    if (!Number.isInteger(pid)) return true;
    process.kill(pid, 0);
    return false;
  } catch (error) {
    // ENOENT: already released. EPERM: alive but not ours to signal. Anything else: gone.
    const code = (error as NodeJS.ErrnoException).code;
    return code !== 'EPERM';
  }
}

let holdsLock = false;

// The hook's own budget has to outlast the wait, or vitest kills the waiter before the lock frees.
beforeAll(async () => {
  const deadline = Date.now() + LOCK_WAIT_MS;
  mkdirSync(dirname(LOCK_FILE), { recursive: true });

  for (;;) {
    if (tryTakeLock()) {
      holdsLock = true;
      return;
    }
    if (lockHolderIsGone()) {
      rmSync(LOCK_FILE, { force: true });
      continue;
    }
    if (Date.now() > deadline) {
      throw new Error(
        `Timed out after ${LOCK_WAIT_MS}ms waiting for ${LOCK_FILE} — another test run is using ${repoRoot}/out`
      );
    }
    // Polling is inherently sequential here — there is nothing to run in parallel.
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
}, LOCK_WAIT_MS + 10_000);

afterAll(() => {
  // Only the holder releases. A run that gave up waiting must not delete the live owner's lock.
  if (!holdsLock) return;
  holdsLock = false;
  rmSync(LOCK_FILE, { force: true });
});

function readInstallerErrorDefinitions(): Array<{ defineName: string; code: string }> {
  const source = readFileSync(resolve(repoRoot, 'resources/windows/installer-errors-sentry.nsh'), 'utf8');
  return Array.from(source.matchAll(/!define\s+(AIONUI_E_[A-Z0-9_]+)\s+"(E\d{4})"/g), (match) => ({
    defineName: match[1],
    code: match[2],
  }));
}

function resolveAppBuilderInstallUtil(): string {
  const direct = resolve(repoRoot, 'node_modules/app-builder-lib/templates/nsis/include/installUtil.nsh');
  if (existsSync(direct)) {
    return direct;
  }

  const bunModulesDir = resolve(repoRoot, 'node_modules/.bun');
  const appBuilderDir = readdirSync(bunModulesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('app-builder-lib@'))
    .map((entry) => resolve(bunModulesDir, entry.name, 'node_modules/app-builder-lib'))
    .find((candidate) => existsSync(resolve(candidate, 'package.json')));

  if (!appBuilderDir) {
    throw new Error('app-builder-lib installUtil.nsh not found');
  }

  return resolve(appBuilderDir, 'templates/nsis/include/installUtil.nsh');
}

describe('build-with-builder', () => {
  it('fails before packaging when multiple architectures would share one prepared AionCore runtime', () => {
    const result = spawnSync(process.execPath, ['scripts/build-with-builder.js', '--mac', '--arm64', '--x64'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('each architecture must prepare and verify its own AionCore lineage-bound runtime');
  });

  it('uses the WePrompt executable for current outputs and retains legacy upgrade cleanup names', () => {
    const source = readFileSync(resolve(repoRoot, 'scripts/build-with-builder.js'), 'utf8');

    expect(source).toContain("const CURRENT_WINDOWS_EXECUTABLE = 'WePrompt.exe'");
    expect(source).toContain("const LEGACY_WINDOWS_EXECUTABLES = ['Forge.exe', 'AionUi.exe']");
    expect(source).toContain("path.join(outDir, 'win-unpacked', CURRENT_WINDOWS_EXECUTABLE)");
    expect(source).not.toContain("path.join(outDir, 'win-unpacked', 'AionUi.exe')");
    expect(source).toContain('$PLUGINSDIR\\\\weprompt-fixed-uninstaller.exe');
    expect(source).toContain('legacyBundledUninstallerOverride');
  });

  it('uses WePrompt for fresh installs while retaining Forge and AionUi upgrade candidates', () => {
    const observability = readFileSync(resolve(repoRoot, 'resources/windows/installer-observability.nsh'), 'utf8');
    const updateVerify = readFileSync(resolve(repoRoot, 'resources/windows/installer-update-verify.nsh'), 'utf8');
    const repair = readFileSync(resolve(repoRoot, 'resources/windows/installer-repair-heal.nsh'), 'utf8');
    const processControl = readFileSync(resolve(repoRoot, 'resources/windows/installer-process-control.nsh'), 'utf8');
    const queryLockers = readFileSync(resolve(repoRoot, 'resources/windows/support/query-lockers.ps1'), 'utf8');

    expect(observability).toContain('!define AIONUI_APP_EXECUTABLE_FILENAME "WePrompt.exe"');
    expect(observability).toContain('!define AIONUI_LEGACY_FORGE_EXECUTABLE_FILENAME "Forge.exe"');
    expect(observability).toContain('!define AIONUI_LEGACY_AIONUI_EXECUTABLE_FILENAME "AionUi.exe"');
    expect(observability).toContain('!define AIONUI_CURRENT_UNINSTALLER_FILENAME "Uninstall WePrompt.exe"');
    expect(observability).toContain('!define AIONUI_LEGACY_FORGE_UNINSTALLER_FILENAME "Uninstall Forge.exe"');
    expect(observability).toContain('!define AIONUI_LEGACY_AIONUI_UNINSTALLER_FILENAME "Uninstall AionUi.exe"');
    expect(observability).toContain('$INSTDIR\\${AIONUI_APP_EXECUTABLE_FILENAME}');
    expect(observability).not.toContain('$INSTDIR\\AionUi.exe');
    expect(updateVerify).toContain('$INSTDIR\\${AIONUI_APP_EXECUTABLE_FILENAME}');
    expect(updateVerify).not.toContain('$INSTDIR\\AionUi.exe');

    for (const legacyMacro of ['AIONUI_LEGACY_FORGE_EXECUTABLE_FILENAME', 'AIONUI_LEGACY_AIONUI_EXECUTABLE_FILENAME']) {
      expect(repair).toContain(legacyMacro);
      expect(processControl).toContain(legacyMacro);
    }
    for (const executable of [
      'WePrompt.exe',
      'Forge.exe',
      'AionUi.exe',
      'Uninstall WePrompt.exe',
      'Uninstall Forge.exe',
      'Uninstall AionUi.exe',
    ]) {
      expect(queryLockers).toContain(`'${executable}'`);
    }
  });

  it('keeps internal installer failures local-only with WePrompt-visible diagnostics', () => {
    const errors = readFileSync(resolve(repoRoot, 'resources/windows/installer-errors-sentry.nsh'), 'utf8');
    const messages = readFileSync(resolve(repoRoot, 'resources/windows/installer-messages.nsh'), 'utf8');
    const sharedMessages = readFileSync(resolve(repoRoot, 'resources/messages.yml'), 'utf8');
    const reporter = readFileSync(resolve(repoRoot, 'resources/windows/support/report-installer-failure.ps1'), 'utf8');

    expect(errors).toContain('AIONUI_EXPORT_LOCAL_DIAGNOSTICS');
    expect(errors).toContain('MessageBox MB_OK|MB_ICONSTOP');
    expect(errors).not.toContain('MB_YESNO');
    expect(errors).not.toMatch(/SENTRY|Sentry|-Dsn/);
    expect(reporter).toContain("$statusPath = Join-Path $env:TEMP 'weprompt-installer-report.json'");
    expect(reporter).toContain("status = 'exported'");
    expect(reporter).toContain('localExportPath');
    expect(reporter).toContain('WePrompt installer failure');
    expect(reporter).not.toMatch(/Invoke-RestMethod|https?:\/\/|Sentry|Dsn|analytics\.json/i);
    expect(messages).not.toMatch(/"[^"\n]*\bAionUi\b[^"\n]*"/);
    expect(sharedMessages).not.toMatch(/\bAionUi\b/);
  });

  it('selects the unpacked app and DMG for only the requested macOS architecture', () => {
    const source = readFileSync(resolve(repoRoot, 'scripts/build-with-builder.js'), 'utf8');

    expect(source).toContain('function resolveMacArtifactPaths(outDir, targetArch, version)');
    expect(source).toContain("targetArch === 'arm64' ? 'mac-arm64' : 'mac'");
    expect(source).toContain('`WePrompt-${version}-mac-${targetArch}.dmg`');
    expect(source).toContain('resolveMacArtifactPaths(outDir, targetArch, packageVersion)');
    expect(source).not.toContain('function dmgExists(outDir)');
    expect(source).not.toContain("const candidates = ['mac', 'mac-arm64', 'mac-x64', 'mac-universal']");
  });

  it('rejects skip-vite when renderer output is only a source html shell', { timeout: BUILD_SCRIPT_TIMEOUT_MS }, () => {
    const outDir = resolve(repoRoot, 'out');
    const backupOutDir = resolve(repoRoot, `.tmp-out-backup-${process.pid}-${Date.now()}`);
    const tempDir = mkdtempSync(join(tmpdir(), 'aionui-build-skip-vite-test-'));
    const hookPath = join(tempDir, 'hook.cjs');

    writeFileSync(
      hookPath,
      `
const childProcess = require('node:child_process');
childProcess.execSync = function mockedExecSync(command) {
  return Buffer.from('');
};
`,
      'utf8'
    );

    let movedExistingOut = false;
    try {
      if (existsSync(outDir)) {
        renameSync(outDir, backupOutDir);
        movedExistingOut = true;
      }
      mkdirSync(resolve(outDir, 'main'), { recursive: true });
      mkdirSync(resolve(outDir, 'renderer'), { recursive: true });
      writeFileSync(resolve(outDir, 'main/index.js'), 'console.log("main placeholder");\n', 'utf8');
      writeFileSync(
        resolve(outDir, 'renderer/index.html'),
        '<!doctype html><html><body><div id="root"></div><script type="module" src="./main.tsx"></script></body></html>\n',
        'utf8'
      );

      const result = spawnSync(
        process.execPath,
        ['scripts/build-with-builder.js', 'x64', '--skip-vite', '--pack-only'],
        {
          cwd: repoRoot,
          encoding: 'utf8',
          env: {
            ...process.env,
            NODE_OPTIONS: [process.env.NODE_OPTIONS, `--require=${hookPath}`].filter(Boolean).join(' '),
          },
        }
      );

      expect(result.status).not.toBe(0);
      expect(result.stderr + result.stdout).toContain('Renderer build output is incomplete');
    } finally {
      rmSync(outDir, { recursive: true, force: true });
      if (movedExistingOut) {
        renameSync(backupOutDir, outDir);
      }
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('rejects skip-vite for a stale template inventory cache', { timeout: BUILD_SCRIPT_TIMEOUT_MS }, () => {
    const outDir = resolve(repoRoot, 'out');
    const backupOutDir = resolve(repoRoot, `.tmp-out-backup-${process.pid}-${Date.now()}`);
    const tempDir = mkdtempSync(join(tmpdir(), 'aionui-build-stale-template-inventory-test-'));
    const hookPath = join(tempDir, 'hook.cjs');

    writeFileSync(
      hookPath,
      `
const childProcess = require('node:child_process');
childProcess.execSync = function mockedExecSync() {
  return Buffer.from('');
};
`,
      'utf8'
    );

    let movedExistingOut = false;
    try {
      if (existsSync(outDir)) {
        renameSync(outDir, backupOutDir);
        movedExistingOut = true;
      }
      mkdirSync(resolve(outDir, 'main'), { recursive: true });
      mkdirSync(resolve(outDir, 'preload'), { recursive: true });
      mkdirSync(resolve(outDir, 'renderer/assets'), { recursive: true });
      const staleManifest = `${JSON.stringify(
        [{ id: 'legacy-template', format: 'html', packagedReferenceFile: null }],
        null,
        2
      )}\n`;
      const staleDigest = createHash('sha256').update(staleManifest).digest('hex');
      writeFileSync(resolve(outDir, 'main/index.js'), `const staleTemplateInventory = ${staleManifest};\n`, 'utf8');
      writeFileSync(resolve(outDir, 'main/presentation-template-inventory.sha256'), `${staleDigest}\n`, 'utf8');
      writeFileSync(resolve(outDir, 'preload/index.js'), '', 'utf8');
      writeFileSync(resolve(outDir, 'renderer/assets/index-test.js'), '', 'utf8');
      writeFileSync(
        resolve(outDir, 'renderer/index.html'),
        '<!doctype html><html><body><div id="root"></div><script type="module" src="./assets/index-test.js"></script></body></html>\n',
        'utf8'
      );

      const result = spawnSync(
        process.execPath,
        ['scripts/build-with-builder.js', 'x64', '--skip-vite', '--pack-only'],
        {
          cwd: repoRoot,
          encoding: 'utf8',
          env: {
            ...process.env,
            NODE_OPTIONS: [process.env.NODE_OPTIONS, `--require=${hookPath}`].filter(Boolean).join(' '),
          },
        }
      );

      expect(result.status).not.toBe(0);
      expect(result.stderr + result.stdout).toMatch(/presentation template inventory/i);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
      if (movedExistingOut) {
        renameSync(backupOutDir, outDir);
      }
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('releases the NSIS output directory before any update repair or uninstall work', () => {
    const script = readFileSync(resolve(repoRoot, 'resources/windows/installer-update-verify.nsh'), 'utf8');
    const preInit = script.match(/!macro AIONUI_INSTALLER_PREINIT([\s\S]*?)!macroend/)?.[1];
    const releaseMacro = script.match(/!macro AIONUI_RELEASE_INSTALL_DIR_OUTDIR([\s\S]*?)!macroend/)?.[1];

    expect(preInit).toBeTruthy();
    expect(releaseMacro).toBeTruthy();
    expect(releaseMacro).toContain('InitPluginsDir');
    expect(releaseMacro).toContain('SetOutPath "$PLUGINSDIR"');
    expect(releaseMacro).not.toContain('SetOutPath $INSTDIR');
    expect(preInit).toContain('!insertmacro AIONUI_RELEASE_INSTALL_DIR_OUTDIR');
    expect(preInit!.indexOf('AIONUI_RELEASE_INSTALL_DIR_OUTDIR')).toBeLessThan(
      preInit!.indexOf('AIONUI_SESSION_BEGIN')
    );
  });

  it('uses install-directory ownership checks in the shared Windows NSIS include', () => {
    const script = readFileSync(resolve(repoRoot, 'resources/windows/installer-process-control.nsh'), 'utf8');

    expect(script).toContain('!macro customCheckAppRunning');
    expect(script).toContain('$$ownedPrefix');
    expect(script).toContain('StartsWith($$ownedPrefix');
    expect(script).toContain('[System.IO.Path]::GetFullPath($$path)');
    expect(script).not.toContain("Name -ieq '${AIONUI_APP_EXECUTABLE_FILENAME}'");
  });

  it('records installer self-lock diagnostics when Restart Manager finds no locking process', () => {
    const script = readFileSync(resolve(repoRoot, 'resources/windows/installer-process-control.nsh'), 'utf8');
    const queryScript = readFileSync(resolve(repoRoot, 'resources/windows/support/query-lockers.ps1'), 'utf8');
    const captureMacro = script.match(/!macro AIONUI_CAPTURE_FAILED_PATH_LOCKERS[\s\S]*?!macroend/)?.[0];

    expect(script).toContain('aionui-query-lockers.ps1');
    expect(captureMacro).toContain('AIONUI_QUERY_LOCKERS');
    expect(captureMacro).not.toContain('AIONUI_QUERY_LOCKERS_INLINE_LEGACY');
    expect(queryScript).toContain('$CurrentOutDir');
    expect(queryScript).toContain('$script:installerSelfLock');
    expect(queryScript).toContain("'installer-self-lock'");
    expect(queryScript).toContain('outerInstallerPid');
    expect(queryScript).toContain('currentOutDir');
    expect(queryScript).toContain("name = 'WePrompt installer'");
  });

  it('continues with the bundled uninstaller when installed-uninstaller repair remains locked', () => {
    const script = readFileSync(resolve(repoRoot, 'resources/windows/installer-repair-heal.nsh'), 'utf8');
    const messages = readFileSync(resolve(repoRoot, 'resources/windows/installer-messages.nsh'), 'utf8');

    const retryFailureBranch = script.match(
      /\$\{If\} \$\{Errors\}\s+([\s\S]*?)\$\{Else\}\s+!insertmacro AIONUI_LOG_UNINSTALLER_REPAIR "after-copy-retry"/
    )?.[1];

    expect(retryFailureBranch).toBeTruthy();
    expect(retryFailureBranch).toContain('copy-failed-using-bundled');
    expect(retryFailureBranch).toContain('$AionUiBundledUninstaller');
    expect(retryFailureBranch).not.toContain('MessageBox');
    expect(retryFailureBranch).not.toContain('AIONUI_MSG_UNINSTALLER_LOCKED');
    expect(messages).not.toContain('existing uninstaller is locked');
  });

  it('keeps coded Windows installer failures on the unified reportable failure path', () => {
    const resourcesDir = resolve(repoRoot, 'resources/windows');
    const files = readdirSync(resourcesDir).filter((file) => file.endsWith('.nsh'));

    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(resolve(resourcesDir, file), 'utf8');
      source.split(/\r?\n/).forEach((line, index) => {
        if (line.includes('!macro AIONUI_FAIL ')) {
          offenders.push(`${file}:${index + 1}: defines non-reportable coded failure macro`);
        }
        if (line.includes('!insertmacro AIONUI_FAIL ')) {
          offenders.push(`${file}:${index + 1}: uses non-reportable coded failure macro`);
        }
        if (/^\s*Abort\b/.test(line)) {
          offenders.push(`${file}:${index + 1}: aborts without unified failure UI`);
        }
        if (line.includes('SetErrorLevel 2') && file !== 'installer-errors-sentry.nsh') {
          offenders.push(`${file}:${index + 1}: sets failure exit code outside unified failure UI`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });

  it('allows raw Windows installer MessageBox calls only for unified reporting or non-terminal prompts', () => {
    const resourcesDir = resolve(repoRoot, 'resources/windows');
    const files = readdirSync(resourcesDir).filter((file) => file.endsWith('.nsh'));

    const allowedMessageBoxes = new Map<string, RegExp[]>([
      ['installer-errors-sentry.nsh', [/MessageBox MB_OK\|MB_ICONSTOP/]],
      [
        'installer-process-control.nsh',
        [/AIONUI_MSG_FILE_OR_FOLDER_IN_USE_ZH/, /\$\(appRunning\)/, /AIONUI_MSG_CLOSE_OR_REMOVE_PREVIOUS_ZH/],
      ],
    ]);

    const offenders: string[] = [];
    for (const file of files) {
      const allowed = allowedMessageBoxes.get(file) ?? [];
      const source = readFileSync(resolve(resourcesDir, file), 'utf8');
      source.split(/\r?\n/).forEach((line, index) => {
        if (!line.includes('MessageBox')) {
          return;
        }
        if (allowed.some((pattern) => pattern.test(line))) {
          return;
        }
        offenders.push(`${file}:${index + 1}: unexpected raw MessageBox`);
      });
    }

    expect(offenders).toEqual([]);
  });

  it('routes app-cannot-be-closed cancellation through E1003 instead of quitting silently', () => {
    const script = readFileSync(resolve(repoRoot, 'resources/windows/installer-process-control.nsh'), 'utf8');
    const cannotCloseBranch = script.match(
      /AIONUI_MSG_CLOSE_OR_REMOVE_PREVIOUS_ZH[\s\S]*?IDRETRY aionui_wait_for_close([\s\S]*?)\$\{Else\}/
    )?.[1];

    expect(cannotCloseBranch).toBeTruthy();
    expect(cannotCloseBranch).toContain('AIONUI_E_INSTALL_DIR_REMOVE_OR_LOCKED');
    expect(cannotCloseBranch).toContain('AIONUI_FAIL_REPORTABLE_BILINGUAL_DIAGNOSTICS');
    expect(cannotCloseBranch).not.toMatch(/^\s*Quit\s*$/m);
  });

  it('covers each of the 12 Windows installer error codes with one explicit e2e scenario', () => {
    const expectedDefinitions = readInstallerErrorDefinitions();
    const result = spawnSync(
      process.execPath,
      [resolve(repoRoot, 'scripts/smoke-installer-failure-messagebox.js'), '--list-codes-json', '--compile-only'],
      { encoding: 'utf8' }
    );

    expect(result.status, result.stderr || result.stdout).toBe(0);
    const matrix = JSON.parse(result.stdout) as {
      codes: string[];
      scenarios?: Array<{ id: string; code: string; defineName: string }>;
    };
    const expectedCodes = expectedDefinitions.map((definition) => definition.code);
    const expectedDefineNames = expectedDefinitions.map((definition) => definition.defineName);
    const scenarioCodes = matrix.scenarios?.map((scenario) => scenario.code);
    const scenarioDefineNames = matrix.scenarios?.map((scenario) => scenario.defineName);
    const scenarioIds = matrix.scenarios?.map((scenario) => scenario.id);

    expect(expectedDefinitions).toHaveLength(12);
    expect(new Set(expectedCodes).size).toBe(12);
    expect(matrix.codes).toEqual(expectedCodes);
    expect(matrix.scenarios).toHaveLength(12);
    expect(new Set(scenarioIds).size).toBe(12);
    expect(scenarioCodes).toEqual(expectedCodes);
    expect(scenarioDefineNames).toEqual(expectedDefineNames);
  });

  it.each([
    {
      args: ['arm64', '--win', '--arm64'],
      expectedArch: 'arm64',
      internalRelease: true,
      mode: 'internal-release',
    },
    {
      args: ['auto', '--mac', '--x64'],
      expectedArch: 'x64',
      internalRelease: true,
      mode: 'internal-release',
    },
    {
      args: ['auto', '--mac', '--x64'],
      expectedArch: 'x64',
      internalRelease: false,
      mode: 'normal local',
    },
    {
      args: ['auto', '--mac', '--x64'],
      ci: 'true',
      expectedArch: 'x64',
      internalRelease: false,
      internalReleaseValue: '0',
      mode: 'non-internal CI',
      signingSentinel: 'ci-signing-sentinel',
    },
  ])(
    'runs a $mode package for $expectedArch with args $args',
    { timeout: BUILD_SCRIPT_TIMEOUT_MS },
    ({ args, ci, expectedArch, internalRelease, internalReleaseValue, signingSentinel }) => {
      const tempDir = mkdtempSync(join(tmpdir(), 'aionui-build-test-'));
      const hookPath = join(tempDir, 'hook.cjs');
      const callsPath = join(tempDir, 'prepare-calls.json');
      const builderCallsPath = join(tempDir, 'builder-calls.json');
      const outDir = resolve(repoRoot, 'out');
      const backupOutDir = resolve(repoRoot, `.tmp-out-backup-${process.pid}-${Date.now()}-${expectedArch}`);

      writeFileSync(
        hookPath,
        `
const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

const originalLoad = Module._load;

function recordPrepareCall(options) {
  const callsPath = process.env.AIONUI_PREPARE_CALLS_FILE;
  const calls = fs.existsSync(callsPath) ? JSON.parse(fs.readFileSync(callsPath, 'utf8')) : [];
  calls.push(options ?? null);
  fs.writeFileSync(callsPath, JSON.stringify(calls));
  return { prepared: true, dir: 'mock-bundled-aioncore', sourceType: 'mock' };
}

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === './prepareAioncore' || request.endsWith('/prepareAioncore')) {
    return recordPrepareCall;
  }

  if (request.endsWith('packages/shared-scripts/src/prepare-aioncore.js')) {
    return { prepareAioncore: recordPrepareCall };
  }

  if (request === './resolveAioncoreVersion.js' || request.endsWith('/resolveAioncoreVersion.js')) {
    return { resolveAioncoreVersion: () => 'v-test' };
  }

  return originalLoad.call(this, request, parent, isMain);
};

// Satisfy build-with-builder's output checks without clobbering real build
// artifacts: out/ lives in the actual repo (the script resolves it from its
// own __dirname), so only create empty placeholders when nothing is there.
function ensurePlaceholder(relativePath) {
  const target = path.join(process.cwd(), relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (!fs.existsSync(target)) {
    fs.writeFileSync(target, '');
  }
}

childProcess.execSync = function mockedExecSync(command) {
  const commandText = String(command);
  if (commandText.includes('electron-builder --config packages/desktop/electron-builder.yml')) {
    const callsPath = process.env.AIONUI_BUILDER_CALLS_FILE;
    const calls = fs.existsSync(callsPath) ? JSON.parse(fs.readFileSync(callsPath, 'utf8')) : [];
    calls.push({
      ci: process.env.CI ?? null,
      command: commandText,
      cscIdentityAutoDiscovery: process.env.CSC_IDENTITY_AUTO_DISCOVERY ?? null,
    });
    fs.writeFileSync(callsPath, JSON.stringify(calls));
  }
  if (commandText.includes('electron-vite build')) {
    ensurePlaceholder('out/main/index.js');
    const templateInventory = fs.readFileSync(
      path.join(process.cwd(), 'packages/desktop/resources/presentation-templates/manifest.json')
    );
    const templateInventoryDigest = crypto.createHash('sha256').update(templateInventory).digest('hex');
    fs.writeFileSync(
      path.join(process.cwd(), 'out/main/presentation-template-inventory.sha256'),
      templateInventoryDigest + '\\n'
    );
    ensurePlaceholder('out/preload/index.js');
    ensurePlaceholder('out/renderer/assets/index-test.js');
    ensurePlaceholder('out/renderer/assets/index-test.css');
    fs.writeFileSync(
      path.join(process.cwd(), 'out/renderer/index.html'),
      '<!doctype html><html><head><script type="module" src="./assets/index-test.js"></script><link rel="stylesheet" href="./assets/index-test.css"></head><body><div id="root"></div></body></html>\\n'
    );
  }
  return Buffer.from('');
};
`,
        'utf8'
      );

      let movedExistingOut = false;
      try {
        if (existsSync(outDir)) {
          renameSync(outDir, backupOutDir);
          movedExistingOut = true;
        }

        const { CI: _ci, WEPROMPT_INTERNAL_RELEASE: _internalRelease, ...normalPackageEnvironment } = process.env;
        const result = spawnSync(process.execPath, ['scripts/build-with-builder.js', ...args], {
          cwd: repoRoot,
          encoding: 'utf8',
          env: {
            ...(internalRelease ? process.env : normalPackageEnvironment),
            AIONUI_BUILDER_CALLS_FILE: builderCallsPath,
            AIONUI_PREPARE_CALLS_FILE: callsPath,
            CSC_IDENTITY_AUTO_DISCOVERY: internalRelease ? '' : (signingSentinel ?? 'preserve-me'),
            NODE_OPTIONS: [process.env.NODE_OPTIONS, `--require=${hookPath}`].filter(Boolean).join(' '),
            ...(ci ? { CI: ci } : {}),
            ...(internalRelease
              ? { WEPROMPT_INTERNAL_RELEASE: '1' }
              : internalReleaseValue
                ? { WEPROMPT_INTERNAL_RELEASE: internalReleaseValue }
                : {}),
          },
        });

        expect(result.status, result.stderr || result.stdout).toBe(0);
        expect(readFileSync(resolve(repoRoot, 'resources/windows/support/_sentry-dsn.generated.nsh'), 'utf8')).toBe(
          '!define AIONUI_SENTRY_DSN ""\n'
        );

        if (args.includes('--win')) {
          const installUtil = readFileSync(resolveAppBuilderInstallUtil(), 'utf8');
          expect(installUtil).toContain('WePrompt bundled-uninstaller override source');
          expect(installUtil).toContain('$PLUGINSDIR\\weprompt-fixed-uninstaller.exe');
          expect(installUtil.match(/WePrompt bundled-uninstaller override source/g)).toHaveLength(1);
          expect(installUtil).not.toContain('AionUi-bundled-uninstaller override source');
        }

        const calls = JSON.parse(readFileSync(callsPath, 'utf8')) as Array<{ arch?: string } | null>;
        expect(calls).toContainEqual(expect.objectContaining({ arch: expectedArch }));

        const builderCalls = JSON.parse(readFileSync(builderCallsPath, 'utf8')) as Array<{
          ci: string | null;
          command: string;
          cscIdentityAutoDiscovery: string | null;
        }>;
        expect(builderCalls).toHaveLength(1);
        if (!internalRelease) {
          expect(builderCalls[0]?.ci).toBe(ci ?? null);
        }
        expect(builderCalls[0]?.cscIdentityAutoDiscovery).toBe(
          internalRelease ? 'false' : (signingSentinel ?? 'preserve-me')
        );
        if (internalRelease && args.includes('--mac')) {
          expect(builderCalls[0]?.command).toContain('--config.mac.identity=-');
        } else {
          expect(builderCalls[0]?.command).not.toContain('--config.mac.identity=-');
        }
      } finally {
        rmSync(outDir, { recursive: true, force: true });
        if (movedExistingOut) {
          renameSync(backupOutDir, outDir);
        }
        rmSync(tempDir, { recursive: true, force: true });
      }
    }
  );
});
