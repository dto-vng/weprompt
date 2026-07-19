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
import { mcpService } from '@/common/adapter/ipcBridge';
import {
  BUILTIN_HTTP_MCP_SERVERS,
  GREENNODE_BASE_URL,
  GREENNODE_MODELS,
  GREENNODE_OPENCODE_DEFAULT_MODEL,
  GREENNODE_OPENCODE_PROVIDER_ID,
  GREENNODE_PROVIDER_NAME,
  getGreenNodeApiKey,
  getTavilyApiKey,
  MOONSHOT_BASE_URL,
  MOONSHOT_MODELS,
  MOONSHOT_OPENCODE_PROVIDER_ID,
  MOONSHOT_PROVIDER_NAME,
  MOONSHOT_VISION_MODEL,
} from '@/common/config/builtinSeed';
import {
  applyCapabilityCredential,
  buildCapabilityOriginalJson,
  BUILTIN_TAVILY_NAME,
  findCapabilityDescriptor,
  getCapabilityCredentialValue,
  hasCapabilityCredential,
} from '@/common/config/builtinCapabilities';
import type { IHubAgentItem } from '@/common/types/agent/hub';
import type { IMcpServer, IMcpServerTransportStdio, IProvider } from '@/common/config/storage';
import { getBuiltinMcpScriptPath, type ProcessConfig as ProcessConfigType } from './initStorage';

type ConfigFile = typeof ProcessConfigType;

const GREENNODE_PROVIDER_SEED_FLAG = 'migration.greennodeProviderSeeded_v1' as const;
const OPENCODE_SEED_FLAG = 'migration.opencodeGreenNodeSeeded_v1' as const;
const OPENCODE_AGENT_INSTALL_FLAG = 'migration.opencodeAgentInstalled_v1' as const;
const OPENCODE_MOONSHOT_SEED_FLAG = 'migration.opencodeMoonshotSeeded_v1' as const;
const OPENCODE_VISION_MCP_SEED_FLAG = 'migration.opencodeVisionMcpSeeded_v1' as const;
const TAVILY_SEED_FLAG = 'migration.tavilyWebSearchSeeded_v1' as const;

type SeedFlag =
  | typeof GREENNODE_PROVIDER_SEED_FLAG
  | typeof OPENCODE_SEED_FLAG
  | typeof OPENCODE_AGENT_INSTALL_FLAG
  | typeof OPENCODE_MOONSHOT_SEED_FLAG
  | typeof OPENCODE_VISION_MCP_SEED_FLAG
  | typeof TAVILY_SEED_FLAG;

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
  mcp?: Record<
    string,
    {
      type?: string;
      command?: string[];
      environment?: Record<string, string>;
      enabled?: boolean;
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
 * Non-destructive merge of the Moonshot (Kimi) seed into an OpenCode config
 * object: existing user providers/models/settings are kept; only missing
 * pieces are added. Unlike the GreenNode merge, this never sets
 * `config.model` — GreenNode stays the default model. Pure — exported for
 * tests.
 */
export function mergeMoonshotIntoOpenCodeConfig(config: OpenCodeConfig): boolean {
  let configChanged = false;
  config.provider ??= {};
  const provider = (config.provider[MOONSHOT_OPENCODE_PROVIDER_ID] ??= {});
  if (!provider.npm) {
    provider.npm = '@ai-sdk/openai-compatible';
    configChanged = true;
  }
  if (!provider.name) {
    provider.name = MOONSHOT_PROVIDER_NAME;
    configChanged = true;
  }
  provider.options ??= {};
  if (!provider.options.baseURL) {
    provider.options.baseURL = MOONSHOT_BASE_URL;
    configChanged = true;
  }
  provider.models ??= {};
  for (const model of MOONSHOT_MODELS) {
    if (!provider.models[model]) {
      provider.models[model] = { name: model };
      configChanged = true;
    }
  }
  return configChanged;
}

/**
 * Mirror the Moonshot (Kimi) seed into the local OpenCode CLI config so the
 * OpenCode agent offers the same models. Unlike the GreenNode seed, the API
 * key is sourced from the backend Moonshot provider record (not a build-time
 * env var) — the step is retried on later launches until that provider
 * exists with a key. Rewriting opencode.jsonc drops comments — acceptable
 * for a one-shot seed.
 */
export async function seedOpenCodeMoonshotConfig(configFile: ConfigFile): Promise<boolean> {
  if (await readSeedFlag(configFile, OPENCODE_MOONSHOT_SEED_FLAG)) {
    return true;
  }

  const providers = (await httpRequest<IProvider[]>('GET', '/api/providers')) || [];
  const provider = providers.find(
    (p) => p.name === MOONSHOT_PROVIDER_NAME || (p.base_url ?? '').includes('moonshot.ai')
  );
  const apiKey = (provider?.api_key ?? '').trim();
  if (!apiKey) {
    // No Moonshot provider yet — try again next launch (flag not set).
    console.warn('[Seed] Moonshot provider/API key not available, skipping OpenCode Moonshot seed');
    return false;
  }

  const configPath = openCodeConfigPath();
  let config: OpenCodeConfig;
  try {
    config = (await readJsoncFile<OpenCodeConfig>(configPath)) ?? { $schema: 'https://opencode.ai/config.json' };
  } catch (error) {
    // Unparseable user config — leave it alone rather than clobber it.
    console.warn('[Seed] OpenCode config unreadable, skipping Moonshot seed', error);
    return false;
  }

  const configChanged = mergeMoonshotIntoOpenCodeConfig(config);

  if (configChanged) {
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  }

  const authPath = openCodeAuthPath();
  let auth: Record<string, unknown>;
  try {
    auth = (await readJsoncFile<Record<string, unknown>>(authPath)) ?? {};
  } catch (error) {
    console.warn('[Seed] OpenCode auth store unreadable, skipping Moonshot key', error);
    return false;
  }
  if (!auth[MOONSHOT_OPENCODE_PROVIDER_ID]) {
    auth[MOONSHOT_OPENCODE_PROVIDER_ID] = { type: 'api', key: apiKey };
    await mkdir(dirname(authPath), { recursive: true });
    await writeFile(authPath, JSON.stringify(auth, null, 2) + '\n', 'utf8');
    console.info('[Seed] OpenCode Moonshot API key installed');
  }

  await configFile.set(OPENCODE_MOONSHOT_SEED_FLAG, true);
  return true;
}

/**
 * Non-destructive merge of the built-in image-analysis (Kimi vision) MCP
 * tool into an OpenCode config object: existing `mcp` entries (including a
 * pre-existing `image-analysis` entry) are never touched. Pure — exported
 * for tests.
 */
export function mergeVisionMcpIntoOpenCodeConfig(config: OpenCodeConfig, scriptPath: string, apiKey: string): boolean {
  config.mcp ??= {};
  if (config.mcp['image-analysis']) {
    return false;
  }

  config.mcp['image-analysis'] = {
    type: 'local',
    command: ['node', scriptPath],
    environment: {
      AIONUI_VISION_BASE_URL: MOONSHOT_BASE_URL,
      AIONUI_VISION_API_KEY: apiKey,
      AIONUI_VISION_MODEL: MOONSHOT_VISION_MODEL,
    },
    enabled: true,
  };
  return true;
}

/**
 * Register the built-in image-analysis (Kimi vision) MCP tool in the local
 * OpenCode CLI config so OpenCode/WePromptCode agents can call
 * `analyze_image`. Mirrors {@link seedOpenCodeMoonshotConfig}: the API key is
 * sourced from the backend Moonshot provider record, so the step is retried
 * on later launches until that provider exists with a key. Rewriting
 * opencode.jsonc drops comments — acceptable for a one-shot seed.
 */
export async function seedOpenCodeVisionMcp(configFile: ConfigFile): Promise<boolean> {
  if (await readSeedFlag(configFile, OPENCODE_VISION_MCP_SEED_FLAG)) {
    return true;
  }

  const providers = (await httpRequest<IProvider[]>('GET', '/api/providers')) || [];
  const provider = providers.find(
    (p) => p.name === MOONSHOT_PROVIDER_NAME || (p.base_url ?? '').includes('moonshot.ai')
  );
  const apiKey = (provider?.api_key ?? '').trim();
  if (!apiKey) {
    // No Moonshot provider yet — try again next launch (flag not set).
    console.warn('[Seed] Moonshot provider/API key not available, skipping OpenCode vision MCP seed');
    return false;
  }

  const configPath = openCodeConfigPath();
  let config: OpenCodeConfig;
  try {
    config = (await readJsoncFile<OpenCodeConfig>(configPath)) ?? { $schema: 'https://opencode.ai/config.json' };
  } catch (error) {
    // Unparseable user config — leave it alone rather than clobber it.
    console.warn('[Seed] OpenCode config unreadable, skipping vision MCP seed', error);
    return false;
  }

  const scriptPath = getBuiltinMcpScriptPath('builtin-mcp-vision');
  const configChanged = mergeVisionMcpIntoOpenCodeConfig(config, scriptPath, apiKey);

  if (configChanged) {
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  }

  await configFile.set(OPENCODE_VISION_MCP_SEED_FLAG, true);
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

export type TavilyCredentialUpdate = { transport: IMcpServerTransportStdio; original_json: string };

/**
 * Build the transport/original_json update that installs the shared Tavily
 * key on the built-in web-search server. Returns null when there is nothing
 * to seed: the transport is not stdio (user rewired the server) or a
 * credential is already present (user configured their own key). Pure —
 * exported for tests.
 */
export function buildTavilyCredentialUpdate(server: IMcpServer, apiKey: string): TavilyCredentialUpdate | null {
  const descriptor = findCapabilityDescriptor(BUILTIN_TAVILY_NAME);
  if (!descriptor || server.transport.type !== 'stdio') {
    return null;
  }
  if (hasCapabilityCredential(descriptor, server.transport)) {
    return null;
  }
  const transport = applyCapabilityCredential(descriptor, server.transport, apiKey);
  return { transport, original_json: buildCapabilityOriginalJson(server.name, transport) };
}

/**
 * True when the web-search server's stored credential equals the build-time
 * key — i.e. it was installed by this seed (possibly by an earlier pass
 * whose enable toggle failed), not configured by the user. Pure — exported
 * for tests.
 */
export function hasSeededTavilyCredential(server: IMcpServer, apiKey: string): boolean {
  const descriptor = findCapabilityDescriptor(BUILTIN_TAVILY_NAME);
  if (!descriptor || server.transport.type !== 'stdio') {
    return false;
  }
  return getCapabilityCredentialValue(descriptor, server.transport) === apiKey;
}

/**
 * Install the build-time Tavily key on the built-in web-search server and
 * enable it, so a fresh install can search the web with zero setup.
 * One-shot: after a successful pass the flag is set, so a user who later
 * disables web search or replaces/removes the key keeps their choice.
 * Returns false (step incomplete, retried next launch) while the build has
 * no key or the MCP bootstrap has not created the builtin server yet.
 */
export async function seedTavilyWebSearch(configFile: ConfigFile): Promise<boolean> {
  if (await readSeedFlag(configFile, TAVILY_SEED_FLAG)) {
    return true;
  }

  const apiKey = getTavilyApiKey();
  if (!apiKey) {
    console.warn('[Seed] FORGE_TAVILY_API_KEY not available, skipping Tavily web-search seed');
    return false;
  }

  const servers = await mcpService.listServers.invoke();
  const server = servers.find((candidate) => candidate.name === BUILTIN_TAVILY_NAME);
  if (!server) {
    console.warn('[Seed] Builtin web-search server not bootstrapped yet, skipping Tavily seed');
    return false;
  }

  const update = buildTavilyCredentialUpdate(server, apiKey);
  if (update) {
    await mcpService.updateServer.invoke({ id: server.id, data: update });
  }

  // Enable when we installed the key this pass, or when an earlier partial
  // pass installed it but failed before the enable toggle. A foreign
  // (user-configured) credential means the whole setup is the user's —
  // leave it, including its enabled state, untouched.
  const shouldEnable = (update !== null || hasSeededTavilyCredential(server, apiKey)) && !server.enabled;
  if (shouldEnable) {
    // `enabled` isn't part of updateServer's payload; flip it via toggleServer.
    await mcpService.toggleServer.invoke({ id: server.id });
  }
  if (update || shouldEnable) {
    console.info('[Seed] Built-in Tavily web search enabled with shared key');
  }

  await configFile.set(TAVILY_SEED_FLAG, true);
  return true;
}
