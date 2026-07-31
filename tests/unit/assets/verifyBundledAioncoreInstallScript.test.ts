import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const scriptPath = 'resources/windows/support/verify-bundled-aioncore-install.ps1';
const script = readFileSync(scriptPath, 'utf8');

function writeFile(filePath: string, contents = '') {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
}

function writeJson(filePath: string, value: unknown) {
  writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createSchema2Install(tmp: string) {
  const installDir = join(tmp, 'install');
  const baseDir = join(installDir, 'resources', 'bundled-aioncore', 'win32-x64');
  const managedRoot = join(baseDir, 'managed-resources');
  const logPath = join(tmp, 'verify.log');
  const contract = {
    schemaVersion: 2,
    runtimeKey: 'win32-x64',
    node: {
      version: '24.11.0',
      root: 'node/node-v24.11.0-win-x64',
      executable: 'node.exe',
    },
    clis: [
      {
        name: 'claude',
        version: '2.1.215',
        root: 'cli/claude/2.1.215/win32-x64',
        platformDirectory: 'win32-x64',
        executable: 'claude.exe',
        requiredFiles: [] as string[],
        requiredDirectories: [] as string[],
      },
      {
        name: 'codex',
        version: '0.144.6',
        root: 'cli/codex/0.144.6/win32-x64',
        platformDirectory: 'win32-x64',
        executable: 'vendor/x86_64-pc-windows-msvc/bin/codex.exe',
        requiredFiles: ['vendor/x86_64-pc-windows-msvc/codex-path/rg.exe'],
        requiredDirectories: ['vendor/x86_64-pc-windows-msvc/codex-resources'],
      },
    ],
  };

  writeFile(join(baseDir, 'aioncore.exe'), 'x');
  writeJson(join(baseDir, 'manifest.json'), { platform: 'win32', arch: 'x64' });
  writeFile(join(managedRoot, 'node', 'node-v24.11.0-win-x64', 'node.exe'), 'x');
  writeFile(join(managedRoot, 'cli', 'claude', '2.1.215', 'win32-x64', 'claude.exe'), 'x');
  writeFile(
    join(managedRoot, 'cli', 'codex', '0.144.6', 'win32-x64', 'vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe'),
    'x'
  );
  writeFile(
    join(
      managedRoot,
      'cli',
      'codex',
      '0.144.6',
      'win32-x64',
      'vendor',
      'x86_64-pc-windows-msvc',
      'codex-path',
      'rg.exe'
    ),
    'x'
  );
  mkdirSync(
    join(managedRoot, 'cli', 'codex', '0.144.6', 'win32-x64', 'vendor', 'x86_64-pc-windows-msvc', 'codex-resources'),
    { recursive: true }
  );
  writeJson(join(managedRoot, 'manifest.json'), contract);

  return { installDir, baseDir, managedRoot, logPath, contract };
}

function runVerifier(installDir: string, logPath: string) {
  return spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
      '-InstallDir',
      installDir,
      '-RuntimeKey',
      'win32-x64',
      '-LogPath',
      logPath,
    ],
    { encoding: 'utf8' }
  );
}

describe('Windows bundled aioncore install verifier', () => {
  it('reads managed resources manifest instead of deriving Codex platform paths', () => {
    expect(script).toContain("Join-Path $managedRoot 'manifest.json'");
    expect(script).toContain('schemaVersion');
    expect(script).toContain('platformExecutable');
    expect(script).not.toContain('Get-CodexPlatformExecutable');
    expect(script).not.toContain('x86_64-pc-windows-msvc');
  });

  it('logs machine-readable contract failures', () => {
    expect(script).toContain('duplicate_tool_slug');
    expect(script).toContain('missing_required_tool');
    expect(script).toContain('unsupported_schema_version');
    expect(script).toContain('invalid_schema');
    expect(script).toContain('result=fail runtime=$RuntimeKey failures=$summary');
  });

  it('requires numeric schemaVersion without PowerShell string coercion', () => {
    expect(script).toContain("Test-NumberField $contract 'schemaVersion'");
    expect(script).not.toContain('if ($contract.schemaVersion -ne 1)');
  });

  it('routes schema-2 contracts to managed CLI verification', () => {
    expect(script).toContain('Test-ManagedCliResourcesContract');
    expect(script).toContain('if ([double]$contract.schemaVersion -eq 1)');
    expect(script).toContain('if ([double]$contract.schemaVersion -eq 2)');
  });

  it('resolves reparse targets before checking filesystem containment', () => {
    expect(script).toContain('CreateFileW');
    expect(script).toContain('GetFinalPathNameByHandleW');
    expect(script).toContain('Resolve-FinalFileSystemPath');
    expect(script).not.toContain('Resolve-Path -LiteralPath $Root');
  });

  it('rejects unsupported final-path namespaces instead of making them relative', () => {
    expect(script).toContain('Unsupported final path namespace');
    expect(script).toContain('char.IsLetter(path[4])');
  });

  it('requires the managed-resources manifest itself to be a regular file', () => {
    expect(script).toContain('Test-RegularManagedManifest');
    expect(script).toContain('[System.IO.FileAttributes]::ReparsePoint');
    expect(script).toContain("'invalid_file_type'");
  });

  it('reads contract manifests through the handles used to validate them', () => {
    expect(script).toContain('ReadRegularFile');
    expect(script).toContain('ReadContainedFile');
    expect(script).toContain('new FileStream(handle, FileAccess.Read)');
    expect(script).not.toContain('$contract = Read-JsonFile $ManifestPath');
    expect(script).not.toContain('$manifest = Read-JsonFile $manifestPath');
  });

  it('uses ordinal contract identifiers and case-sensitive duplicate sets', () => {
    expect(script).toContain('Test-OrdinalStringEqual');
    expect(script).toContain('[System.StringComparer]::Ordinal');
    expect(script).not.toContain('$contract.runtimeKey -ne $RuntimeKey');
    expect(script).not.toContain('$Cli.platformDirectory -ne $ContractRuntimeKey');
    expect(script).not.toContain('$Tool.platformDirectory -ne $RuntimeKey');
  });

  const runOnWindows = process.platform === 'win32' ? it : it.skip;

  runOnWindows('fails an old-version-only Codex ACP install directory', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aionui-install-verify-'));
    const installDir = join(tmp, 'install');
    const managedRoot = join(installDir, 'resources', 'bundled-aioncore', 'win32-x64', 'managed-resources');
    const logPath = join(tmp, 'verify.log');

    try {
      writeFile(join(installDir, 'resources', 'bundled-aioncore', 'win32-x64', 'aioncore.exe'), 'x');
      writeJson(join(installDir, 'resources', 'bundled-aioncore', 'win32-x64', 'manifest.json'), {
        platform: 'win32',
        arch: 'x64',
      });
      writeFile(join(managedRoot, 'node', 'node-v24.11.0-win-x64', 'node.exe'), 'x');
      writeJson(join(managedRoot, 'manifest.json'), {
        schemaVersion: 1,
        runtimeKey: 'win32-x64',
        node: {
          version: '24.11.0',
          root: 'node/node-v24.11.0-win-x64',
          executable: 'node.exe',
        },
        acpTools: [
          {
            slug: 'codex-acp',
            version: '1.1.2',
            packageName: '@agentclientprotocol/codex-acp',
            root: 'acp/codex-acp/1.1.2/win32-x64',
            platformDirectory: 'win32-x64',
            manifest: 'manifest.json',
            entrypoint: 'node_modules/@agentclientprotocol/codex-acp/dist/index.js',
            pathEntries: ['node_modules/.bin'],
            requiredFiles: ['package.json', 'package-lock.json'],
            requiredDirectories: ['node_modules'],
            platformExecutable: 'node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe',
          },
          {
            slug: 'claude-agent-acp',
            version: '0.58.1',
            packageName: '@agentclientprotocol/claude-agent-acp',
            root: 'acp/claude-agent-acp/0.58.1/win32-x64',
            platformDirectory: 'win32-x64',
            manifest: 'manifest.json',
            entrypoint: 'node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js',
            pathEntries: ['node_modules/.bin'],
            requiredFiles: ['package.json', 'package-lock.json'],
            requiredDirectories: ['node_modules'],
            platformExecutable: 'node_modules/@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe',
          },
        ],
      });

      const oldRoot = join(managedRoot, 'acp', 'codex-acp', '0.16.0', 'win32-x64');
      writeJson(join(oldRoot, 'manifest.json'), {
        entrypoint: 'node_modules/@agentclientprotocol/codex-acp/dist/index.js',
        path_entries: ['node_modules/.bin'],
      });
      writeFile(join(oldRoot, 'node_modules', '@agentclientprotocol', 'codex-acp', 'dist', 'index.js'), 'x');
      writeJson(join(oldRoot, 'package.json'), {});
      writeJson(join(oldRoot, 'package-lock.json'), {});
      mkdirSync(join(oldRoot, 'node_modules'), { recursive: true });

      const result = spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          scriptPath,
          '-InstallDir',
          installDir,
          '-RuntimeKey',
          'win32-x64',
          '-LogPath',
          logPath,
        ],
        { encoding: 'utf8' }
      );

      expect(result.status).not.toBe(0);
      const log = readFileSync(logPath, 'utf8');
      expect(log).toContain('codex-acp/1.1.2');
      expect(log).toContain('result=fail');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  runOnWindows('accepts a schema-2 managed CLI install directory', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aionui-install-verify-v2-'));

    try {
      const { installDir, logPath } = createSchema2Install(tmp);
      const result = runVerifier(installDir, logPath);

      expect(result.status).toBe(0);
      expect(readFileSync(logPath, 'utf8')).toContain('result=ok');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  runOnWindows('rejects a managed-resources junction that targets outside the bundle', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aionui-install-verify-root-junction-'));

    try {
      const { installDir, managedRoot, logPath } = createSchema2Install(tmp);
      const externalRoot = join(tmp, 'external-managed-resources');
      renameSync(managedRoot, externalRoot);
      symlinkSync(externalRoot, managedRoot, 'junction');

      const result = runVerifier(installDir, logPath);

      expect(result.status).not.toBe(0);
      expect(readFileSync(logPath, 'utf8')).toContain('escaped_path');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  runOnWindows('rejects an intermediate junction that targets outside managed resources', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aionui-install-verify-resource-junction-'));

    try {
      const { installDir, managedRoot, logPath } = createSchema2Install(tmp);
      const codexRoot = join(managedRoot, 'cli', 'codex');
      const externalRoot = join(tmp, 'external-codex');
      renameSync(codexRoot, externalRoot);
      symlinkSync(externalRoot, codexRoot, 'junction');

      const result = runVerifier(installDir, logPath);

      expect(result.status).not.toBe(0);
      expect(readFileSync(logPath, 'utf8')).toContain('escaped_path');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  runOnWindows('allows an intermediate junction whose target remains inside managed resources', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aionui-install-verify-internal-junction-'));

    try {
      const { installDir, managedRoot, logPath } = createSchema2Install(tmp);
      const codexRoot = join(managedRoot, 'cli', 'codex');
      const internalRoot = join(managedRoot, 'internal-codex');
      renameSync(codexRoot, internalRoot);
      symlinkSync(internalRoot, codexRoot, 'junction');

      const result = runVerifier(installDir, logPath);

      expect(result.status).toBe(0);
      expect(readFileSync(logPath, 'utf8')).toContain('result=ok');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  runOnWindows('rejects a non-regular managed-resources manifest', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aionui-install-verify-manifest-type-'));

    try {
      const { installDir, managedRoot, logPath } = createSchema2Install(tmp);
      const manifestPath = join(managedRoot, 'manifest.json');
      rmSync(manifestPath);
      mkdirSync(manifestPath);

      const result = runVerifier(installDir, logPath);

      expect(result.status).not.toBe(0);
      expect(readFileSync(logPath, 'utf8')).toContain('invalid_file_type');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  runOnWindows('rejects an internally targeted file-symlink managed-resources manifest', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aionui-install-verify-manifest-symlink-'));

    try {
      const { installDir, managedRoot, logPath } = createSchema2Install(tmp);
      const manifestPath = join(managedRoot, 'manifest.json');
      const manifestTarget = join(managedRoot, 'internal-manifest.json');
      renameSync(manifestPath, manifestTarget);
      symlinkSync(manifestTarget, manifestPath, 'file');

      const result = runVerifier(installDir, logPath);

      expect(result.status).not.toBe(0);
      expect(readFileSync(logPath, 'utf8')).toContain('invalid_file_type');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  runOnWindows('requires exact case for contract runtimeKey', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aionui-install-verify-runtime-case-'));

    try {
      const { installDir, managedRoot, logPath, contract } = createSchema2Install(tmp);
      contract.runtimeKey = 'WIN32-X64';
      writeJson(join(managedRoot, 'manifest.json'), contract);

      const result = runVerifier(installDir, logPath);

      expect(result.status).not.toBe(0);
      expect(readFileSync(logPath, 'utf8')).toContain('runtime_key_mismatch');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  runOnWindows('requires exact case for CLI platformDirectory', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aionui-install-verify-platform-case-'));

    try {
      const { installDir, managedRoot, logPath, contract } = createSchema2Install(tmp);
      contract.clis[0].platformDirectory = 'WIN32-X64';
      writeJson(join(managedRoot, 'manifest.json'), contract);

      const result = runVerifier(installDir, logPath);

      expect(result.status).not.toBe(0);
      expect(readFileSync(logPath, 'utf8')).toContain('runtime_key_mismatch');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  runOnWindows('requires exact case for required CLI names', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aionui-install-verify-cli-case-'));

    try {
      const { installDir, managedRoot, logPath, contract } = createSchema2Install(tmp);
      contract.clis[0].name = 'Claude';
      writeJson(join(managedRoot, 'manifest.json'), contract);

      const result = runVerifier(installDir, logPath);

      expect(result.status).not.toBe(0);
      expect(readFileSync(logPath, 'utf8')).toContain('missing_required_cli');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  runOnWindows('does not treat case-distinct CLI names as duplicates', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aionui-install-verify-cli-duplicate-case-'));

    try {
      const { installDir, managedRoot, logPath, contract } = createSchema2Install(tmp);
      contract.clis.push({ ...contract.clis[0], name: 'CLAUDE' });
      writeJson(join(managedRoot, 'manifest.json'), contract);

      const result = runVerifier(installDir, logPath);

      expect(result.status).toBe(0);
      expect(readFileSync(logPath, 'utf8')).toContain('result=ok');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
