import { describe, expect, it } from 'vitest';
import { buildDefaultMcpServers } from '@/process/utils/runBackendMigrations';
import {
  BUILTIN_MEMORY_NAME,
  BUILTIN_TAVILY_NAME,
  BUILTIN_GITHUB_NAME,
  BUILTIN_POSTGRES_NAME,
} from '@/common/config/builtinCapabilities';

describe('buildDefaultMcpServers', () => {
  const servers = buildDefaultMcpServers();
  const byName = new Map(servers.map((s) => [s.name, s]));

  it('seeds memory enabled by default', () => {
    const memory = byName.get(BUILTIN_MEMORY_NAME);
    expect(memory).toBeDefined();
    expect(memory?.enabled).toBe(true);
    expect(memory?.builtin).toBe(true);
  });

  it('seeds web-search (tavily) enabled by default (WP24178)', () => {
    const tavily = byName.get(BUILTIN_TAVILY_NAME);
    expect(tavily).toBeDefined();
    expect(tavily?.enabled).toBe(true);
    expect(tavily?.builtin).toBe(true);
  });

  it('seeds the remaining tier2 servers (github, postgres) disabled by default', () => {
    for (const name of [BUILTIN_GITHUB_NAME, BUILTIN_POSTGRES_NAME]) {
      const s = byName.get(name);
      expect(s, name).toBeDefined();
      expect(s?.enabled, name).toBe(false);
      expect(s?.builtin, name).toBe(true);
    }
  });

  it('enables the bundled chrome-devtools server by default', () => {
    const chrome = byName.get('chrome-devtools');
    expect(chrome).toBeDefined();
    expect(chrome?.enabled).toBe(true);
  });

  it('seeds the fixed VNG MCP servers enabled and editable (WP 24111)', () => {
    for (const name of ['atlassian', 'Outlook VNG', 'fdl-datahub']) {
      const s = byName.get(name);
      expect(s, name).toBeDefined();
      expect(s?.enabled, name).toBe(true);
      // Non-builtin so the edit/delete controls stay available to users.
      expect(s?.builtin, name).toBe(false);
    }
  });

  it('uses an http transport for Outlook VNG and mcp-remote stdio for atlassian/fdl-datahub', () => {
    const outlook = byName.get('Outlook VNG');
    expect(outlook?.transport.type).toBe('http');
    expect(outlook?.transport.type === 'http' && outlook.transport.url).toContain('agentbase-runtime');

    const atlassian = byName.get('atlassian');
    expect(atlassian?.transport.type).toBe('stdio');
    expect(atlassian?.transport.type === 'stdio' && atlassian.transport.args).toContain('mcp-remote@latest');

    const datahub = byName.get('fdl-datahub');
    expect(datahub?.transport.type).toBe('stdio');
    expect(datahub?.transport.type === 'stdio' && datahub.transport.args).toContain('--silent');
  });
});
