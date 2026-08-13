import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { prepareAioncore } = require('../../../packages/shared-scripts/src/prepare-aioncore');

describe('prepare-aioncore local bundle input', () => {
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
