import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const {
  resolvePackageBinEntry,
  prepareMcpBundle,
  MCP_REMOTE_VERSION,
  MCP_BUNDLE_MANIFEST_NAME,
} = require('../../../scripts/prepareMcpBundle');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const BUNDLE_DIR = path.join(PROJECT_ROOT, 'resources', 'mcp-bundled');

describe('prepareMcpBundle', () => {
  it('pins the mcp-remote version and names the manifest', () => {
    expect(MCP_REMOTE_VERSION).toBe('0.1.38');
    expect(MCP_BUNDLE_MANIFEST_NAME).toBe('manifest.json');
  });

  it('resolves a string bin field', () => {
    expect(resolvePackageBinEntry({ name: 'mcp-remote', bin: 'dist/proxy.js' }, 'mcp-remote')).toBe('dist/proxy.js');
  });

  it('resolves an object bin field by package name', () => {
    const pkg = { name: 'mcp-remote', bin: { 'mcp-remote': 'dist/proxy.js', 'mcp-remote-client': 'dist/client.js' } };
    expect(resolvePackageBinEntry(pkg, 'mcp-remote')).toBe('dist/proxy.js');
  });

  it('falls back to the single entry of an object bin field with a different key', () => {
    const pkg = { name: 'mcp-remote', bin: { proxy: 'dist/proxy.js' } };
    expect(resolvePackageBinEntry(pkg, 'mcp-remote')).toBe('dist/proxy.js');
  });

  it('throws when no bin field is declared', () => {
    expect(() => resolvePackageBinEntry({ name: 'mcp-remote' }, 'mcp-remote')).toThrow(/declares no "bin"/);
  });

  describe('when AIONUI_MCP_BUNDLE_SKIP=1', () => {
    const originalEnv = process.env.AIONUI_MCP_BUNDLE_SKIP;

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.AIONUI_MCP_BUNDLE_SKIP;
      } else {
        process.env.AIONUI_MCP_BUNDLE_SKIP = originalEnv;
      }
      fs.rmSync(BUNDLE_DIR, { recursive: true, force: true });
    });

    it('still creates resources/mcp-bundled with a manifest recording no vendored bridge', () => {
      fs.rmSync(BUNDLE_DIR, { recursive: true, force: true });
      process.env.AIONUI_MCP_BUNDLE_SKIP = '1';

      const result = prepareMcpBundle();

      expect(result.prepared).toBe(false);
      expect(fs.existsSync(BUNDLE_DIR)).toBe(true);

      const manifestPath = path.join(BUNDLE_DIR, MCP_BUNDLE_MANIFEST_NAME);
      expect(fs.existsSync(manifestPath)).toBe(true);
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      expect(manifest).toEqual({ mcpRemote: null });
    });
  });
});
