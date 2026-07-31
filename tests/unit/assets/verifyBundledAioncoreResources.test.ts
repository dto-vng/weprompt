import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const {
  verifyBundledAioncoreResources,
} = require('../../../packages/shared-scripts/src/verify-bundled-aioncore-resources');

function writeFile(filePath: string) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, '', { flush: true });
}

function writeJson(filePath: string, value: unknown) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value), { flush: true });
}

function createManagedAcpToolFixture({
  managedResourcesDir,
  toolId,
  version,
  runtimeKey,
  entrypoint,
  platformExecutableParts = [],
}: {
  managedResourcesDir: string;
  toolId: string;
  version: string;
  runtimeKey: string;
  entrypoint: string;
  platformExecutableParts?: string[];
}) {
  const platformRoot = join(managedResourcesDir, 'acp', toolId, version, runtimeKey);

  writeJson(join(platformRoot, 'manifest.json'), { entrypoint, path_entries: [] });
  writeFile(join(platformRoot, entrypoint));
  writeJson(join(platformRoot, 'package.json'), {});
  writeJson(join(platformRoot, 'package-lock.json'), {});
  mkdirSync(join(platformRoot, 'node_modules'), { recursive: true });

  if (platformExecutableParts.length > 0) {
    writeFile(join(platformRoot, ...platformExecutableParts));
  }

  return platformRoot;
}

function createSchema2ManagedResourcesFixture(managedResourcesDir: string) {
  rmSync(managedResourcesDir, { recursive: true, force: true });

  const manifestPath = join(managedResourcesDir, 'manifest.json');
  const nodeRoot = join(managedResourcesDir, 'node', 'node-v24.11.0-win-x64');
  const claudeRoot = join(managedResourcesDir, 'cli', 'claude', '2.1.215', 'win32-x64');
  const codexRoot = join(managedResourcesDir, 'cli', 'codex', '0.144.6', 'win32-x64');
  const codexPlatformRoot = join(codexRoot, 'vendor', 'x86_64-pc-windows-msvc');
  const codexRequiredFile = join(codexPlatformRoot, 'codex-path', 'rg.exe');
  const codexRequiredDirectory = join(codexPlatformRoot, 'codex-resources');
  const manifest = {
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
        requiredFiles: [],
        requiredDirectories: [],
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

  writeFile(join(nodeRoot, 'node.exe'));
  writeFile(join(claudeRoot, 'claude.exe'));
  writeFile(join(codexPlatformRoot, 'bin', 'codex.exe'));
  writeFile(codexRequiredFile);
  mkdirSync(codexRequiredDirectory, { recursive: true });
  writeJson(manifestPath, manifest);

  return {
    manifest,
    manifestPath,
    nodeExecutable: join(nodeRoot, 'node.exe'),
    claudeExecutable: join(claudeRoot, 'claude.exe'),
    codexRequiredFile,
    codexRequiredDirectory,
  };
}

describe('verifyBundledAioncoreResources', () => {
  let tmp: string;
  let resourcesDir: string;
  let managedResourcesDir: string;
  let codexRoot: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'aionui-bundled-resources-'));
    resourcesDir = join(tmp, 'resources');
    managedResourcesDir = join(resourcesDir, 'bundled-aioncore', 'win32-x64', 'managed-resources');

    mkdirSync(join(resourcesDir, 'bundled-aioncore', 'win32-x64'), { recursive: true });
    writeFile(join(resourcesDir, 'bundled-aioncore', 'win32-x64', 'aioncore.exe'));
    writeJson(join(resourcesDir, 'bundled-aioncore', 'win32-x64', 'manifest.json'), {
      platform: 'win32',
      arch: 'x64',
    });

    const nodeRoot = join(managedResourcesDir, 'node', 'node-v24.11.0-win-x64');
    mkdirSync(nodeRoot, { recursive: true });
    writeFile(join(nodeRoot, 'node.exe'));

    codexRoot = createManagedAcpToolFixture({
      managedResourcesDir,
      toolId: 'codex-acp',
      version: '0.14.0',
      runtimeKey: 'win32-x64',
      entrypoint: 'node_modules/@zed-industries/codex-acp-win32-x64/bin/codex-acp.exe',
      platformExecutableParts: ['node_modules', '@zed-industries', 'codex-acp-win32-x64', 'bin', 'codex-acp.exe'],
    });

    createManagedAcpToolFixture({
      managedResourcesDir,
      toolId: 'claude-agent-acp',
      version: '0.13.0',
      runtimeKey: 'win32-x64',
      entrypoint: 'node_modules/@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe',
      platformExecutableParts: ['node_modules', '@anthropic-ai', 'claude-agent-sdk-win32-x64', 'claude.exe'],
    });
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('passes when node and managed ACP entrypoints exist', () => {
    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.runtimeKey).toBe('win32-x64');
    expect(result.missing).toEqual([]);
  });

  it('reports missing managed node runtime executable', () => {
    rmSync(join(managedResourcesDir, 'node', 'node-v24.11.0-win-x64', 'node.exe'));

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.missing).toContain(
      'bundled-aioncore/win32-x64/managed-resources/node/node-v24.11.0-win-x64/node.exe'
    );
  });

  it('reports bundle manifest platform and architecture mismatches', () => {
    writeJson(join(resourcesDir, 'bundled-aioncore', 'win32-x64', 'manifest.json'), {
      platform: 'darwin',
      arch: 'arm64',
    });

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.missing).toContain('bundled-aioncore/win32-x64/manifest.json<platform:win32>');
    expect(result.missing).toContain('bundled-aioncore/win32-x64/manifest.json<arch:x64>');
  });

  it('passes for non-Windows node runtime layout', () => {
    const darwinResourcesDir = join(tmp, 'darwin-resources');
    const darwinManagedResourcesDir = join(darwinResourcesDir, 'bundled-aioncore', 'darwin-arm64', 'managed-resources');

    mkdirSync(join(darwinResourcesDir, 'bundled-aioncore', 'darwin-arm64'), { recursive: true });
    writeFile(join(darwinResourcesDir, 'bundled-aioncore', 'darwin-arm64', 'aioncore'));
    writeJson(join(darwinResourcesDir, 'bundled-aioncore', 'darwin-arm64', 'manifest.json'), {
      platform: 'darwin',
      arch: 'arm64',
    });
    mkdirSync(join(darwinManagedResourcesDir, 'node', 'node-v24.11.0-darwin-arm64', 'bin'), { recursive: true });
    writeFile(join(darwinManagedResourcesDir, 'node', 'node-v24.11.0-darwin-arm64', 'bin', 'node'));

    createManagedAcpToolFixture({
      managedResourcesDir: darwinManagedResourcesDir,
      toolId: 'codex-acp',
      version: '0.14.0',
      runtimeKey: 'darwin-arm64',
      entrypoint: 'codex-acp',
    });

    createManagedAcpToolFixture({
      managedResourcesDir: darwinManagedResourcesDir,
      toolId: 'claude-agent-acp',
      version: '0.13.0',
      runtimeKey: 'darwin-arm64',
      entrypoint: 'claude-agent-acp',
    });

    const result = verifyBundledAioncoreResources({
      resourcesDir: darwinResourcesDir,
      electronPlatformName: 'darwin',
      targetArch: 'arm64',
    });

    expect(result.missing).toEqual([]);
    expect(result.checked).toContain(
      'bundled-aioncore/darwin-arm64/managed-resources/node/node-v24.11.0-darwin-arm64/bin/node'
    );
  });

  it('reports missing non-Windows managed node runtime executable', () => {
    const linuxResourcesDir = join(tmp, 'linux-resources');
    const linuxManagedResourcesDir = join(linuxResourcesDir, 'bundled-aioncore', 'linux-x64', 'managed-resources');

    mkdirSync(join(linuxResourcesDir, 'bundled-aioncore', 'linux-x64'), { recursive: true });
    writeFile(join(linuxResourcesDir, 'bundled-aioncore', 'linux-x64', 'aioncore'));
    writeJson(join(linuxResourcesDir, 'bundled-aioncore', 'linux-x64', 'manifest.json'), {
      platform: 'linux',
      arch: 'x64',
    });
    mkdirSync(join(linuxManagedResourcesDir, 'node', 'node-v24.11.0-linux-x64'), { recursive: true });

    const result = verifyBundledAioncoreResources({
      resourcesDir: linuxResourcesDir,
      electronPlatformName: 'linux',
      targetArch: 'x64',
    });

    expect(result.missing).toContain(
      'bundled-aioncore/linux-x64/managed-resources/node/node-v24.11.0-linux-x64/bin/node'
    );
  });

  it('reports missing managed ACP manifest', () => {
    rmSync(join(codexRoot, 'manifest.json'));

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.missing).toContain(
      'bundled-aioncore/win32-x64/managed-resources/acp/codex-acp/0.14.0/win32-x64/manifest.json'
    );
  });

  it('reports missing managed ACP entrypoint declared by manifest', () => {
    rmSync(join(codexRoot, 'node_modules', '@zed-industries', 'codex-acp-win32-x64', 'bin', 'codex-acp.exe'));

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.missing).toContain(
      'bundled-aioncore/win32-x64/managed-resources/acp/codex-acp/0.14.0/win32-x64/node_modules/@zed-industries/codex-acp-win32-x64/bin/codex-acp.exe'
    );
  });

  it('passes when a schema-2 manifest declares the bundled node and CLIs', () => {
    createSchema2ManagedResourcesFixture(managedResourcesDir);

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.missing).toEqual([]);
    expect(result.checked).toContain('bundled-aioncore/win32-x64/managed-resources/manifest.json');
    expect(result.checked).toContain(
      'bundled-aioncore/win32-x64/managed-resources/cli/codex/0.144.6/win32-x64/vendor/x86_64-pc-windows-msvc/codex-path/rg.exe'
    );
  });

  it('reports a missing node executable declared by a schema-2 manifest', () => {
    const fixture = createSchema2ManagedResourcesFixture(managedResourcesDir);
    rmSync(fixture.nodeExecutable);

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.missing).toContain(
      'bundled-aioncore/win32-x64/managed-resources/node/node-v24.11.0-win-x64/node.exe'
    );
  });

  it('reports a missing CLI executable declared by a schema-2 manifest', () => {
    const fixture = createSchema2ManagedResourcesFixture(managedResourcesDir);
    rmSync(fixture.claudeExecutable);

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.missing).toContain(
      'bundled-aioncore/win32-x64/managed-resources/cli/claude/2.1.215/win32-x64/claude.exe'
    );
  });

  it('reports a missing required CLI file declared by a schema-2 manifest', () => {
    const fixture = createSchema2ManagedResourcesFixture(managedResourcesDir);
    rmSync(fixture.codexRequiredFile);

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.missing).toContain(
      'bundled-aioncore/win32-x64/managed-resources/cli/codex/0.144.6/win32-x64/vendor/x86_64-pc-windows-msvc/codex-path/rg.exe'
    );
  });

  it('reports a missing required CLI directory declared by a schema-2 manifest', () => {
    const fixture = createSchema2ManagedResourcesFixture(managedResourcesDir);
    rmSync(fixture.codexRequiredDirectory, { recursive: true });

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.missing).toContain(
      'bundled-aioncore/win32-x64/managed-resources/cli/codex/0.144.6/win32-x64/vendor/x86_64-pc-windows-msvc/codex-resources'
    );
  });

  it('reports schema-2 runtime and CLI platform mismatches', () => {
    const fixture = createSchema2ManagedResourcesFixture(managedResourcesDir);
    fixture.manifest.runtimeKey = 'linux-x64';
    fixture.manifest.clis[0].platformDirectory = 'linux-x64';
    writeJson(fixture.manifestPath, fixture.manifest);

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.missing).toContain(
      'bundled-aioncore/win32-x64/managed-resources/manifest.json<runtimeKey:win32-x64>'
    );
    expect(result.missing).toContain(
      'bundled-aioncore/win32-x64/managed-resources/manifest.json<clis[claude].platformDirectory:win32-x64>'
    );
  });

  it('reports a required CLI omitted from a schema-2 manifest', () => {
    const fixture = createSchema2ManagedResourcesFixture(managedResourcesDir);
    fixture.manifest.clis = fixture.manifest.clis.filter((cli) => cli.name !== 'claude');
    writeJson(fixture.manifestPath, fixture.manifest);

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.missing).toContain('bundled-aioncore/win32-x64/managed-resources/manifest.json<clis[claude]>');
  });

  it.each(['../escape', '/absolute/path', 'C:/absolute/path'])(
    'rejects unsafe schema-2 paths without checking outside the bundle: %s',
    (unsafeRoot) => {
      const fixture = createSchema2ManagedResourcesFixture(managedResourcesDir);
      fixture.manifest.clis[0].root = unsafeRoot;
      writeJson(fixture.manifestPath, fixture.manifest);

      const result = verifyBundledAioncoreResources({
        resourcesDir,
        electronPlatformName: 'win32',
        targetArch: 'x64',
      });

      expect(result.missing).toContain(
        'bundled-aioncore/win32-x64/managed-resources/manifest.json<invalid-path:clis[claude].root>'
      );
    }
  );
});
