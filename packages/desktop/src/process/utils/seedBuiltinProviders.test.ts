/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  BUILTIN_HTTP_MCP_SERVERS,
  GREENNODE_BASE_URL,
  GREENNODE_MODELS,
  GREENNODE_OPENCODE_DEFAULT_MODEL,
  GREENNODE_OPENCODE_PROVIDER_ID,
} from '@/common/config/builtinSeed';
import type { IHubAgentItem } from '@/common/types/agent/hub';
import {
  buildBuiltinHttpMcpServers,
  findOpenCodeHubExtension,
  mergeGreenNodeIntoOpenCodeConfig,
  type OpenCodeConfig,
} from './seedBuiltinProviders';

describe('mergeGreenNodeIntoOpenCodeConfig', () => {
  it('seeds an empty config with provider, both models, and default model', () => {
    const config: OpenCodeConfig = {};
    const changed = mergeGreenNodeIntoOpenCodeConfig(config);

    expect(changed).toBe(true);
    const provider = config.provider?.[GREENNODE_OPENCODE_PROVIDER_ID];
    expect(provider?.npm).toBe('@ai-sdk/openai-compatible');
    expect(provider?.options?.baseURL).toBe(GREENNODE_BASE_URL);
    expect(Object.keys(provider?.models ?? {})).toEqual([...GREENNODE_MODELS]);
    expect(config.model).toBe(GREENNODE_OPENCODE_DEFAULT_MODEL);
  });

  it('keeps existing user values and only fills gaps', () => {
    const config: OpenCodeConfig = {
      model: 'anthropic/claude-sonnet',
      shell: 'sh',
      provider: {
        [GREENNODE_OPENCODE_PROVIDER_ID]: {
          name: 'My Custom Name',
          options: { baseURL: 'https://my-proxy.example.com/v1' },
          models: { 'minimax/minimax-m2.5': { name: 'Custom Label' } },
        },
      },
    };
    const changed = mergeGreenNodeIntoOpenCodeConfig(config);

    expect(changed).toBe(true); // npm field + gpt-5 model were missing
    const provider = config.provider?.[GREENNODE_OPENCODE_PROVIDER_ID];
    expect(config.model).toBe('anthropic/claude-sonnet');
    expect(config.shell).toBe('sh');
    expect(provider?.name).toBe('My Custom Name');
    expect(provider?.options?.baseURL).toBe('https://my-proxy.example.com/v1');
    expect(provider?.models?.['minimax/minimax-m2.5']?.name).toBe('Custom Label');
    expect(provider?.models?.['openai/gpt-5']).toBeDefined();
  });

  it('is idempotent — a second merge reports no changes', () => {
    const config: OpenCodeConfig = {};
    mergeGreenNodeIntoOpenCodeConfig(config);
    const changedAgain = mergeGreenNodeIntoOpenCodeConfig(config);

    expect(changedAgain).toBe(false);
  });
});

const hubItem = (overrides: Partial<IHubAgentItem>): IHubAgentItem =>
  ({
    name: 'ext-something',
    display_name: 'Something',
    description: '',
    author: '',
    dist: { tarball: '', integrity: '', unpackedSize: 0 },
    engines: { aionui: '0.0.0' },
    hubs: ['acpAdapters'],
    status: 'not_installed',
    ...overrides,
  }) as IHubAgentItem;

describe('findOpenCodeHubExtension', () => {
  it('matches an extension by name regardless of prefix or case', () => {
    const extensions = [hubItem({ name: 'ext-claude-code' }), hubItem({ name: 'ext-OpenCode' })];
    expect(findOpenCodeHubExtension(extensions)?.name).toBe('ext-OpenCode');
  });

  it('matches an extension by contributed acp adapter id', () => {
    const extensions = [
      hubItem({ name: 'ext-claude-code' }),
      hubItem({ name: 'ext-sst-agent', contributes: { acpAdapters: ['opencode'] } }),
    ];
    expect(findOpenCodeHubExtension(extensions)?.name).toBe('ext-sst-agent');
  });

  it('returns undefined when no extension matches', () => {
    expect(findOpenCodeHubExtension([hubItem({ name: 'ext-codex' })])).toBeUndefined();
    expect(findOpenCodeHubExtension([])).toBeUndefined();
  });
});

describe('buildBuiltinHttpMcpServers', () => {
  it('builds one enabled builtin http server per seed entry', () => {
    const servers = buildBuiltinHttpMcpServers();

    expect(servers.map((server) => server.name)).toEqual(BUILTIN_HTTP_MCP_SERVERS.map((seed) => seed.name));
    for (const [index, server] of servers.entries()) {
      const seed = BUILTIN_HTTP_MCP_SERVERS[index];
      expect(server.enabled).toBe(true);
      expect(server.builtin).toBe(true);
      expect(server.description).toBe(seed.description);
      expect(server.transport).toEqual({ type: 'http', url: seed.url });
    }
  });

  it('emits original_json that round-trips to the transport config', () => {
    for (const server of buildBuiltinHttpMcpServers()) {
      const parsed = JSON.parse(server.original_json ?? '') as {
        mcpServers: Record<string, { type: string; url: string }>;
      };
      expect(parsed.mcpServers[server.name]).toEqual({
        type: 'http',
        url: server.transport.type === 'http' ? server.transport.url : '',
      });
    }
  });

  it('seeds the TSE Datahub and Outlook Advanced endpoints', () => {
    const urls = BUILTIN_HTTP_MCP_SERVERS.map((seed) => seed.url);
    expect(urls).toContain('https://aigw.vng.vn/mcp-connect/default-tse-datahub-mcp-3fa296edm25h4');
    expect(urls).toContain('https://send-email-mcp.thankfulhill-292d9583.southeastasia.azurecontainerapps.io/mcp');
  });
});
