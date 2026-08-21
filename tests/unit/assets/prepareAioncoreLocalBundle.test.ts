import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const { acceptedMigrationLineage } = require('../../../packages/shared-scripts/src/verify-bundled-aioncore-resources');
const { prepareAioncore } = require('../../../packages/shared-scripts/src/prepare-aioncore');

function writeFixtureFile(filePath: string, contents = '') {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
}

function createCompleteLocalBundle(root: string, platform: 'darwin' | 'win32', arch: 'arm64' | 'x64') {
  const runtimeKey = `${platform}-${arch}`;
  const binaryName = platform === 'win32' ? 'aioncore.exe' : 'aioncore';
  const executableSuffix = platform === 'win32' ? '.exe' : '';
  const targetTriple =
    platform === 'darwin'
      ? arch === 'arm64'
        ? 'aarch64-apple-darwin'
        : 'x86_64-apple-darwin'
      : arch === 'arm64'
        ? 'aarch64-pc-windows-msvc'
        : 'x86_64-pc-windows-msvc';
  const managedRoot = join(root, 'managed-resources');
  const nodeRoot = `node/node-v24.11.0-${runtimeKey}`;
  const nodeExecutable = platform === 'win32' ? 'node.exe' : 'bin/node';
  const claudeRoot = `cli/claude/2.1.215/${runtimeKey}`;
  const codexRoot = `cli/codex/0.144.6/${runtimeKey}`;

  writeFixtureFile(join(root, binaryName));
  writeFixtureFile(join(root, 'migration-lineage.json'), `${JSON.stringify(acceptedMigrationLineage, null, 2)}\n`);
  writeFixtureFile(join(managedRoot, nodeRoot, nodeExecutable));
  writeFixtureFile(join(managedRoot, claudeRoot, `claude${executableSuffix}`));
  writeFixtureFile(join(managedRoot, codexRoot, 'vendor', targetTriple, 'bin', `codex${executableSuffix}`));
  mkdirSync(join(managedRoot, codexRoot, 'vendor', targetTriple, 'codex-resources'), { recursive: true });
  writeFixtureFile(
    join(managedRoot, 'manifest.json'),
    `${JSON.stringify(
      {
        schemaVersion: 2,
        runtimeKey,
        node: { version: '24.11.0', root: nodeRoot, executable: nodeExecutable },
        clis: [
          {
            name: 'claude',
            version: '2.1.215',
            root: claudeRoot,
            platformDirectory: runtimeKey,
            executable: `claude${executableSuffix}`,
            requiredFiles: [],
            requiredDirectories: [],
          },
          {
            name: 'codex',
            version: '0.144.6',
            root: codexRoot,
            platformDirectory: runtimeKey,
            executable: `vendor/${targetTriple}/bin/codex${executableSuffix}`,
            requiredFiles: [],
            requiredDirectories: [`vendor/${targetTriple}/codex-resources`],
          },
        ],
      },
      null,
      2
    )}\n`
  );
}

describe('prepare-aioncore local bundle input', () => {
  it('fails closed when an explicit local bundle has no migration lineage document', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aionui-local-bundle-lineage-'));
    const projectRoot = join(tmp, 'project');
    const localBundle = join(tmp, 'bundle');
    mkdirSync(join(localBundle, 'managed-resources'), { recursive: true });
    writeFileSync(join(localBundle, 'aioncore'), '');

    const previous = process.env.AIONUI_BACKEND_LOCAL_BUNDLE_DIR;
    process.env.AIONUI_BACKEND_LOCAL_BUNDLE_DIR = localBundle;
    try {
      expect(() =>
        prepareAioncore({
          projectRoot,
          platform: 'darwin',
          arch: 'arm64',
          version: 'v0.1.50',
        })
      ).toThrow(/missing a valid migration-lineage\.json/);
    } finally {
      if (previous === undefined) delete process.env.AIONUI_BACKEND_LOCAL_BUNDLE_DIR;
      else process.env.AIONUI_BACKEND_LOCAL_BUNDLE_DIR = previous;
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('preserves relative links when copying a complete local bundle', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aionui-local-bundle-links-'));
    const projectRoot = join(tmp, 'project');
    const localBundle = join(tmp, 'bundle');
    const managedResources = join(localBundle, 'managed-resources');
    const nodeRoot = join(managedResources, 'node', 'node-v24.11.0-darwin-arm64');
    const nodeBin = join(nodeRoot, 'bin');
    const npmBin = join(nodeRoot, 'lib', 'node_modules', 'npm', 'bin');
    const claudeRoot = join(managedResources, 'cli', 'claude', '2.1.215', 'darwin-arm64');
    const codexRoot = join(managedResources, 'cli', 'codex', '0.144.6', 'darwin-arm64');

    mkdirSync(nodeBin, { recursive: true });
    mkdirSync(npmBin, { recursive: true });
    mkdirSync(claudeRoot, { recursive: true });
    mkdirSync(join(codexRoot, 'vendor', 'aarch64-apple-darwin', 'bin'), { recursive: true });
    mkdirSync(join(codexRoot, 'vendor', 'aarch64-apple-darwin', 'codex-resources'), { recursive: true });
    writeFileSync(join(localBundle, 'aioncore'), '');
    writeFileSync(
      join(localBundle, 'migration-lineage.json'),
      `${JSON.stringify(acceptedMigrationLineage, null, 2)}\n`
    );
    writeFileSync(join(nodeBin, 'node'), '');
    writeFileSync(join(npmBin, 'npm-cli.js'), '');
    writeFileSync(join(claudeRoot, 'claude'), '');
    writeFileSync(join(codexRoot, 'vendor', 'aarch64-apple-darwin', 'bin', 'codex'), '');
    symlinkSync('../lib/node_modules/npm/bin/npm-cli.js', join(nodeBin, 'npm'));
    writeFileSync(
      join(managedResources, 'manifest.json'),
      `${JSON.stringify(
        {
          schemaVersion: 2,
          runtimeKey: 'darwin-arm64',
          node: {
            version: '24.11.0',
            root: 'node/node-v24.11.0-darwin-arm64',
            executable: 'bin/node',
          },
          clis: [
            {
              name: 'claude',
              version: '2.1.215',
              root: 'cli/claude/2.1.215/darwin-arm64',
              platformDirectory: 'darwin-arm64',
              executable: 'claude',
              requiredFiles: [],
              requiredDirectories: [],
            },
            {
              name: 'codex',
              version: '0.144.6',
              root: 'cli/codex/0.144.6/darwin-arm64',
              platformDirectory: 'darwin-arm64',
              executable: 'vendor/aarch64-apple-darwin/bin/codex',
              requiredFiles: [],
              requiredDirectories: ['vendor/aarch64-apple-darwin/codex-resources'],
            },
          ],
        },
        null,
        2
      )}\n`
    );

    const previous = process.env.AIONUI_BACKEND_LOCAL_BUNDLE_DIR;
    process.env.AIONUI_BACKEND_LOCAL_BUNDLE_DIR = localBundle;
    try {
      prepareAioncore({
        projectRoot,
        platform: 'darwin',
        arch: 'arm64',
        version: 'v0.1.55-appops-e582874c',
      });

      expect(
        readlinkSync(
          join(
            projectRoot,
            'resources',
            'bundled-aioncore',
            'darwin-arm64',
            'managed-resources',
            'node',
            'node-v24.11.0-darwin-arm64',
            'bin',
            'npm'
          )
        )
      ).toBe('../lib/node_modules/npm/bin/npm-cli.js');
    } finally {
      if (previous === undefined) delete process.env.AIONUI_BACKEND_LOCAL_BUNDLE_DIR;
      else process.env.AIONUI_BACKEND_LOCAL_BUNDLE_DIR = previous;
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('hard fails local bundle input that lacks managed-resources manifest', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aionui-local-bundle-'));
    const projectRoot = join(tmp, 'project');
    const localBundle = join(tmp, 'bundle');
    mkdirSync(join(localBundle, 'managed-resources'), { recursive: true });
    writeFileSync(join(localBundle, 'aioncore.exe'), '');
    writeFileSync(
      join(localBundle, 'migration-lineage.json'),
      `${JSON.stringify(acceptedMigrationLineage, null, 2)}\n`
    );

    const previous = process.env.AIONUI_BACKEND_LOCAL_BUNDLE_DIR;
    process.env.AIONUI_BACKEND_LOCAL_BUNDLE_DIR = localBundle;
    try {
      expect(() =>
        prepareAioncore({
          projectRoot,
          platform: 'win32',
          arch: 'x64',
          version: 'v0.1.46',
        })
      ).toThrow(/managed-resources\/manifest\.json/);
    } finally {
      if (previous === undefined) delete process.env.AIONUI_BACKEND_LOCAL_BUNDLE_DIR;
      else process.env.AIONUI_BACKEND_LOCAL_BUNDLE_DIR = previous;
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('prepares macOS ARM, macOS Intel, Windows Intel, and Windows ARM with the exact accepted lineage', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aionui-lineage-targets-'));
    const targets = [
      ['darwin', 'arm64'],
      ['darwin', 'x64'],
      ['win32', 'x64'],
      ['win32', 'arm64'],
    ] as const;
    const previous = process.env.AIONUI_BACKEND_LOCAL_BUNDLE_DIR;

    try {
      const lineages = targets.map(([platform, arch]) => {
        const runtimeKey = `${platform}-${arch}`;
        const localBundle = join(tmp, runtimeKey, 'bundle');
        const projectRoot = join(tmp, runtimeKey, 'project');
        createCompleteLocalBundle(localBundle, platform, arch);
        process.env.AIONUI_BACKEND_LOCAL_BUNDLE_DIR = localBundle;
        prepareAioncore({
          projectRoot,
          platform,
          arch,
          version: 'v0.1.50',
        });
        const preparedRoot = join(projectRoot, 'resources', 'bundled-aioncore', runtimeKey);
        const manifest = JSON.parse(readFileSync(join(preparedRoot, 'manifest.json'), 'utf8'));
        const document = JSON.parse(readFileSync(join(preparedRoot, 'migration-lineage.json'), 'utf8'));
        expect(document).toEqual(acceptedMigrationLineage);
        expect(manifest.migrationLineage.entries).toEqual(acceptedMigrationLineage.entries);
        return manifest.migrationLineage;
      });

      expect(lineages[0]).toEqual(lineages[1]);
      expect(lineages[1]).toEqual(lineages[2]);
      expect(lineages[2]).toEqual(lineages[3]);
      expect(lineages[0].fingerprint).toBe(acceptedMigrationLineage.fingerprint);
      expect(lineages[0].minimumSupportedVersion).toBe(acceptedMigrationLineage.minimumSupportedVersion);
    } finally {
      if (previous === undefined) delete process.env.AIONUI_BACKEND_LOCAL_BUNDLE_DIR;
      else process.env.AIONUI_BACKEND_LOCAL_BUNDLE_DIR = previous;
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('refuses to fall back to a remote download when the local bundle lacks managed-resources', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aionui-local-bundle-incomplete-'));
    const projectRoot = join(tmp, 'project');
    const localBundle = join(tmp, 'bundle');
    mkdirSync(localBundle, { recursive: true });
    // Binary present, managed-resources/ deliberately absent.
    writeFileSync(join(localBundle, 'aioncore.exe'), '');

    const previous = process.env.AIONUI_BACKEND_LOCAL_BUNDLE_DIR;
    process.env.AIONUI_BACKEND_LOCAL_BUNDLE_DIR = localBundle;
    try {
      expect(() =>
        prepareAioncore({
          projectRoot,
          platform: 'win32',
          arch: 'x64',
          version: 'v0.1.50',
        })
      ).toThrow(/Refusing to fall back to a remote download/);
    } finally {
      if (previous === undefined) delete process.env.AIONUI_BACKEND_LOCAL_BUNDLE_DIR;
      else process.env.AIONUI_BACKEND_LOCAL_BUNDLE_DIR = previous;
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
