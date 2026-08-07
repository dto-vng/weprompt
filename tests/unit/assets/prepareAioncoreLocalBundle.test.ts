import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { acceptedMigrationLineage } = require('../../../packages/shared-scripts/src/verify-bundled-aioncore-resources');
const { buildBundleManifest, prepareAioncore } = require('../../../packages/shared-scripts/src/prepare-aioncore');

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

  it('binds macOS ARM, macOS Intel, and Windows manifests to the exact same accepted lineage', () => {
    const targets = [
      ['darwin', 'arm64'],
      ['darwin', 'x64'],
      ['win32', 'x64'],
    ] as const;
    const lineages = targets.map(
      ([platform, arch]) =>
        buildBundleManifest({
          platform,
          arch,
          version: 'v0.1.50',
          sourceType: 'test',
          source: { fixture: true },
          generatedAt: '2026-08-07T00:00:00.000Z',
        }).migrationLineage
    );

    expect(lineages[0]).toEqual(lineages[1]);
    expect(lineages[1]).toEqual(lineages[2]);
    expect(lineages[0].fingerprint).toBe(acceptedMigrationLineage.fingerprint);
    expect(lineages[0].minimumSupportedVersion).toBe(acceptedMigrationLineage.minimumSupportedVersion);
  });
});
