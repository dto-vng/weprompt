import { describe, expect, it } from 'vitest';

const {
  resolvePackageBinEntry,
  MCP_REMOTE_VERSION,
  MCP_BUNDLE_MANIFEST_NAME,
} = require('../../../scripts/prepareMcpBundle');

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
});
