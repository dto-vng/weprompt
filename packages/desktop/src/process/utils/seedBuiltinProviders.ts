/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import stripJsonComments from 'strip-json-comments';
import { httpRequest } from '@/common/adapter/httpBridge';
import {
  BUILTIN_HTTP_MCP_SERVERS,
  GREENNODE_BASE_URL,
  GREENNODE_MODELS,
  GREENNODE_OPENCODE_DEFAULT_MODEL,
  GREENNODE_OPENCODE_PROVIDER_ID,
  GREENNODE_PROVIDER_NAME,
  getGreenNodeApiKey,
} from '@/common/config/builtinSeed';
import type { IHubAgentItem } from '@/common/types/agent/hub';
import type { IMcpServer, IProvider } from '@/common/config/storage';
import type { ProcessConfig as ProcessConfigType } from './initStorage';

type ConfigFile = typeof ProcessConfigType;

const GREENNODE_PROVIDER_SEED_FLAG = 'migration.greennodeProviderSeeded_v1' as const;
const OPENCODE_SEED_FLAG = 'migration.opencodeGreenNodeSeeded_v1' as const;
const OPENCODE_AGENT_INSTALL_FLAG = 'migration.opencodeAgentInstalled_v1' as const;

type SeedFlag = typeof GREENNODE_PROVIDER_SEED_FLAG | typeof OPENCODE_SEED_FLAG | typeof OPENCODE_AGENT_INSTALL_FLAG;

async function readSeedFlag(configFile: ConfigFile, flag: SeedFlag): Promise<boolean> {
  try {
    return Boolean(await configFile.get(flag));
  } catch {
    return false;
  }
}

/**
 * Ensure the built-in GreenNode provider exists in the backend on first run.
 * One-shot: after a successful pass the flag is set so user deletions or
 * edits of the provider are never replayed on later launches.
 */
export async function seedGreenNodeProvider(configFile: ConfigFile): Promise<boolean> {
  if (await readSeedFlag(configFile, GREENNODE_PROVIDER_SEED_FLAG)) {
    return true;
  }

  const apiKey = getGreenNodeApiKey();
  if (!apiKey) {
    // No key in this build/environment — retry on a later launch.
    console.warn('[Seed] FORGE_GREENNODE_API_KEY not available, skipping GreenNode provider seed');
    return false;
  }

  const providers = (await httpRequest<IProvider[]>('GET', '/api/providers')) || [];
  const exists = providers.some(
    (provider) => provider.name === GREENNODE_PROVIDER_NAME || provider.base_url === GREENNODE_BASE_URL
  );

  if (!exists) {
    await httpRequest('POST', '/api/providers', {
      platform: 'custom',
      name: GREENNODE_PROVIDER_NAME,
      base_url: GREENNODE_BASE_URL,
      api_key: apiKey,
      models: [...GREENNODE_MODELS],
      enabled: true,
    });
    console.info('[Seed] Built-in GreenNode provider created (%d models)', GREENNODE_MODELS.length);
  }

  await configFile.set(GREENNODE_PROVIDER_SEED_FLAG, true);
  return true;
}

export type OpenCodeConfig = {
  $schema?: string;
  model?: string;
  provider?: Record<
    string,
    {
      npm?: string;
      name?: string;
      options?: Record<string, unknown>;
      models?: Record<string, { name?: string }>;
    }
  >;
  [key: string]: unknown;
};

function openCodeConfigPath(): string {
  return join(homedir(), '.config', 'opencode', 'opencode.jsonc');
}

function openCodeAuthPath(): string {
  return join(homedir(), '.local', 'share', 'opencode', 'auth.json');
}

async function readJsoncFile<T>(path: string): Promise<T | null> {
  if (!existsSync(path)) return null;
  const raw = await readFile(path, 'utf8');
  return JSON.parse(stripJsonComments(raw)) as T;
}

/**
 * Non-destructive merge of the GreenNode seed into an OpenCode config object:
 * existing user providers/models/settings are kept; only missing pieces are
 * added. Pure — exported for tests.
 */
export function mergeGreenNodeIntoOpenCodeConfig(config: OpenCodeConfig): boolean {
  let configChanged = false;
  config.provider ??= {};
  const provider = (config.provider[GREENNODE_OPENCODE_PROVIDER_ID] ??= {});
  if (!provider.npm) {
    provider.npm = '@ai-sdk/openai-compatible';
    configChanged = true;
  }
  if (!provider.name) {
    provider.name = GREENNODE_PROVIDER_NAME;
    configChanged = true;
  }
  provider.options ??= {};
  if (!provider.options.baseURL) {
    provider.options.baseURL = GREENNODE_BASE_URL;
    configChanged = true;
  }
  provider.models ??= {};
  for (const model of GREENNODE_MODELS) {
    if (!provider.models[model]) {
      provider.models[model] = { name: model };
      configChanged = true;
    }
  }
  if (!config.model) {
    config.model = GREENNODE_OPENCODE_DEFAULT_MODEL;
    configChanged = true;
  }
  return configChanged;
}

/**
 * Mirror the GreenNode seed into the local OpenCode CLI config so the
 * OpenCode agent offers the same two models.
 * Rewriting opencode.jsonc drops comments — acceptable for a one-shot seed.
 */
export async function seedOpenCodeGreenNodeConfig(configFile: ConfigFile): Promise<boolean> {
  if (await readSeedFlag(configFile, OPENCODE_SEED_FLAG)) {
    return true;
  }

  const apiKey = getGreenNodeApiKey();
  if (!apiKey) {
    console.warn('[Seed] FORGE_GREENNODE_API_KEY not available, skipping OpenCode GreenNode seed');
    return false;
  }

  const configPath = openCodeConfigPath();
  let config: OpenCodeConfig;
  try {
    config = (await readJsoncFile<OpenCodeConfig>(configPath)) ?? { $schema: 'https://opencode.ai/config.json' };
  } catch (error) {
    // Unparseable user config — leave it alone rather than clobber it.
    console.warn('[Seed] OpenCode config unreadable, skipping GreenNode seed', error);
    return false;
  }

  const configChanged = mergeGreenNodeIntoOpenCodeConfig(config);

  if (configChanged) {
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  }

  const authPath = openCodeAuthPath();
  let auth: Record<string, unknown>;
  try {
    auth = (await readJsoncFile<Record<string, unknown>>(authPath)) ?? {};
  } catch (error) {
    console.warn('[Seed] OpenCode auth store unreadable, skipping key seed', error);
    return false;
  }
  if (!auth[GREENNODE_OPENCODE_PROVIDER_ID]) {
    auth[GREENNODE_OPENCODE_PROVIDER_ID] = { type: 'api', key: apiKey };
    await mkdir(dirname(authPath), { recursive: true });
    await writeFile(authPath, JSON.stringify(auth, null, 2) + '\n', 'utf8');
    console.info('[Seed] OpenCode GreenNode API key installed');
  }

  await configFile.set(OPENCODE_SEED_FLAG, true);
  return true;
}

/**
 * Find the OpenCode agent extension in the Agent Hub index. The hub id is
 * owned by the backend index (e.g. 'opencode' or 'ext-opencode'), so match
 * by name or by contributed ACP adapter id. Pure — exported for tests.
 */
export function findOpenCodeHubExtension(extensions: IHubAgentItem[]): IHubAgentItem | undefined {
  return extensions.find(
    (ext) =>
      ext.name.toLowerCase().includes('opencode') ||
      (ext.contributes?.acpAdapters ?? []).some((id) => id.toLowerCase().includes('opencode'))
  );
}

/**
 * Request an Agent Hub install of the OpenCode agent on first launch — the
 * same call the Agent Hub UI's Install button makes. One-shot: once the
 * install has been requested, a later user uninstall is never replayed.
 * Returns false (step incomplete, retried next launch) while the hub index
 * has no OpenCode entry, e.g. offline first run.
 */
export async function ensureOpenCodeAgentInstalled(configFile: ConfigFile): Promise<boolean> {
  if (await readSeedFlag(configFile, OPENCODE_AGENT_INSTALL_FLAG)) {
    return true;
  }

  const extensions = (await httpRequest<IHubAgentItem[]>('GET', '/api/hub/extensions')) || [];
  const openCode = findOpenCodeHubExtension(extensions);
  if (!openCode) {
    console.warn('[Seed] OpenCode extension not found in Agent Hub index (%d extensions)', extensions.length);
    return false;
  }

  if (openCode.status === 'not_installed' || openCode.status === 'install_failed') {
    await httpRequest('POST', '/api/hub/install', { name: openCode.name });
    console.info('[Seed] OpenCode agent install requested via Agent Hub (%s)', openCode.name);
  }

  await configFile.set(OPENCODE_AGENT_INSTALL_FLAG, true);
  return true;
}

type BuiltinMcpImportServer = Partial<IMcpServer> & Pick<IMcpServer, 'name' | 'transport'>;

/**
 * Default HTTP MCP servers in the shape `mcpService.batchImportServers`
 * expects. Pure — exported for tests and for `buildDefaultMcpServers` in
 * runBackendMigrations.ts.
 */
export function buildBuiltinHttpMcpServers(): BuiltinMcpImportServer[] {
  return BUILTIN_HTTP_MCP_SERVERS.map((seed) => {
    const transport = { type: 'http' as const, url: seed.url };
    return {
      name: seed.name,
      description: seed.description,
      enabled: true,
      builtin: true,
      transport,
      original_json: JSON.stringify({ mcpServers: { [seed.name]: transport } }, null, 2),
    };
  });
}
