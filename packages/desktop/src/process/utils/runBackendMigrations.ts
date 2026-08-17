/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFile } from 'node:child_process';
import { migrateConfigStorage, migrateLegacyMcpConfigToDb, migrateProviders } from '@/common/config/configMigration';
import { httpRequest } from '@/common/adapter/httpBridge';
import { mcpService } from '@/common/adapter/ipcBridge';
import {
  BUILTIN_CAPABILITIES,
  buildBuiltinCapabilityServer,
  BUILTIN_CHROME_DEVTOOLS_NAME,
} from '@/common/config/builtinCapabilities';
import type { ImageGenerationModelSetting } from '@/common/config/clientSettings';
import {
  removeImageGenerationEnvKeys,
  resolveImageGenerationMcpEnv,
  type ImageGenerationMcpEnvResolveResult,
} from '@/common/config/imageGenerationMcpEnv';
import {
  GREENNODE_IDP_BASE_URL,
  GREENNODE_PROVIDER_NAME,
  getGreenNodeApiKey,
  MOONSHOT_BASE_URL,
  MOONSHOT_PROVIDER_NAME,
  MOONSHOT_VISION_MODEL,
} from '@/common/config/builtinSeed';
import {
  BUILTIN_IDP_NAME,
  BUILTIN_IMAGE_GEN_NAME,
  BUILTIN_VISION_NAME,
  type IMcpServer,
  type IProvider,
} from '@/common/config/storage';
import { getBuiltinMcpScriptPath, type ProcessConfig as ProcessConfigType } from './initStorage';
import { migrateAssistantsToBackend } from './migrateAssistants';
import {
  buildBuiltinHttpMcpServers,
  ensureOpenCodeAgentInstalled,
  seedGreenNodeProvider,
  seedOpenCodeGreenNodeConfig,
  seedOpenCodeMoonshotConfig,
  seedOpenCodeVisionMcp,
  seedTavilyWebSearch,
} from './seedBuiltinProviders';

type ConfigFile = typeof ProcessConfigType;
type MigrationStepResult = boolean;
type McpImportServer = Partial<IMcpServer> & Pick<IMcpServer, 'name' | 'transport'>;
type BackendClientPreferences = Record<string, unknown>;

const LEGACY_BACKEND_CLIENT_PREFERENCE_KEYS = [
  'assistants',
  'migration.assistantEnabledFixed',
  'migration.coworkDefaultSkillsAdded',
  'migration.builtinDefaultSkillsAdded_v2',
  'migration.promptsI18nAdded',
  'migration.assistantsSplitCustom',
] as const;

async function cleanupLegacyClientPreferences(): Promise<void> {
  const payloadEntries = LEGACY_BACKEND_CLIENT_PREFERENCE_KEYS.map((key): [string, null] => [key, null]);
  const payload = Object.fromEntries(payloadEntries);
  await httpRequest<void>('PUT', '/api/settings/client', payload);
}

const CLEANUP_STEPS: Array<{
  name: string;
  run: () => Promise<void>;
}> = [{ name: 'cleanupLegacyClientPreferences', run: async () => cleanupLegacyClientPreferences() }];

async function fetchBackendClientPreferences(): Promise<BackendClientPreferences> {
  try {
    return (await httpRequest<BackendClientPreferences>('GET', '/api/settings/client')) || {};
  } catch {
    return {};
  }
}

async function fetchProviders(): Promise<IProvider[]> {
  try {
    return (await httpRequest<IProvider[]>('GET', '/api/providers')) || [];
  } catch (error) {
    console.warn('[Migration] MCP bootstrap could not load providers for image generation env resolution', error);
    return [];
  }
}

export function resolveImageGenerationMigrationConfig(
  backendPrefs: BackendClientPreferences,
  fileConfig?: ImageGenerationModelSetting
): ImageGenerationModelSetting | undefined {
  const backendConfig = backendPrefs['tools.imageGenerationModel'];
  if (backendConfig && typeof backendConfig === 'object') {
    return backendConfig as ImageGenerationModelSetting;
  }
  return fileConfig;
}

function resolveImageGenerationMigrationConfigSource(
  backendPrefs: BackendClientPreferences,
  fileConfig?: ImageGenerationModelSetting
): 'backend' | 'file' | 'none' {
  const backendConfig = backendPrefs['tools.imageGenerationModel'];
  if (backendConfig && typeof backendConfig === 'object') {
    return 'backend';
  }
  return fileConfig ? 'file' : 'none';
}

function logImageGenerationEnvResolution(
  result: ImageGenerationMcpEnvResolveResult,
  context: 'bootstrap' | 'update'
): void {
  if (result.ok === true) {
    console.info(
      '[Migration] image MCP env resolved via %s during %s, provider id: %s, platform: %s, model: %s, api key present: %s',
      result.source,
      context,
      result.provider.id,
      result.provider.platform,
      result.model,
      result.provider.api_key ? 'yes' : 'no'
    );
    return;
  }

  console.warn(
    '[Migration] image MCP env resolution failed during %s, reason: %s, message: %s, candidates: %s',
    context,
    result.reason,
    result.message,
    result.candidates?.join(',') || 'none'
  );
}

function buildBuiltinImageGenerationServer(
  resolution: ImageGenerationMcpEnvResolveResult,
  config?: ImageGenerationModelSetting
): McpImportServer {
  const scriptPath = getBuiltinMcpScriptPath('builtin-mcp-image-gen');
  const env = resolution.ok ? resolution.env : {};
  const serverConfig = {
    command: 'node',
    args: [scriptPath],
    env,
  };

  return {
    name: BUILTIN_IMAGE_GEN_NAME,
    description: 'Built-in image generation tool powered by AI models. Configure the model in Settings > Tools.',
    enabled: config?.switch === true && resolution.ok,
    builtin: true,
    transport: {
      type: 'stdio',
      command: 'node',
      args: [scriptPath],
      env,
    },
    original_json: JSON.stringify({ mcpServers: { [BUILTIN_IMAGE_GEN_NAME]: serverConfig } }, null, 2),
  };
}

// Prefer the API key from the seeded GreenNode provider record (persisted in the
// backend DB), falling back to the build-time FORGE_GREENNODE_API_KEY. In dev the
// build-time env is often absent while the provider still holds a valid key.
function resolveGreenNodeApiKey(providers: IProvider[]): string {
  const provider = providers.find(
    (p) => p.name === GREENNODE_PROVIDER_NAME || (p.base_url ?? '').includes('vngcloud.vn')
  );
  return (provider?.api_key ?? '').trim() || getGreenNodeApiKey();
}

function buildBuiltinIdpServer(apiKey: string): McpImportServer {
  const scriptPath = getBuiltinMcpScriptPath('builtin-mcp-idp');
  const env = { AIONUI_IDP_BASE_URL: GREENNODE_IDP_BASE_URL, AIONUI_IDP_API_KEY: apiKey };
  const serverConfig = {
    command: 'node',
    args: [scriptPath],
    env,
  };

  return {
    name: BUILTIN_IDP_NAME,
    description: 'GreenNode IDP: OCR + GenAI document understanding for IDs, invoices, receipts, and KYC docs.',
    enabled: apiKey.length > 0,
    builtin: true,
    transport: {
      type: 'stdio',
      command: 'node',
      args: [scriptPath],
      env,
    },
    original_json: JSON.stringify({ mcpServers: { [BUILTIN_IDP_NAME]: serverConfig } }, null, 2),
  };
}

// Prefer the API key from the seeded Moonshot provider record (persisted in the
// backend DB), matched by provider name or base_url, mirroring resolveGreenNodeApiKey.
function resolveMoonshotApiKey(providers: IProvider[]): string {
  const provider = providers.find(
    (p) => p.name === MOONSHOT_PROVIDER_NAME || (p.base_url ?? '').includes('moonshot.ai')
  );
  return (provider?.api_key ?? '').trim();
}

function buildBuiltinVisionServer(apiKey: string): McpImportServer {
  const scriptPath = getBuiltinMcpScriptPath('builtin-mcp-vision');
  const env = {
    AIONUI_VISION_BASE_URL: MOONSHOT_BASE_URL,
    AIONUI_VISION_API_KEY: apiKey,
    AIONUI_VISION_MODEL: MOONSHOT_VISION_MODEL,
  };
  const serverConfig = {
    command: 'node',
    args: [scriptPath],
    env,
  };

  return {
    name: BUILTIN_VISION_NAME,
    description:
      'Analyze images (screenshots, photos, UI, charts) with a multimodal model — usable from any chat model.',
    enabled: apiKey.length > 0,
    builtin: true,
    transport: {
      type: 'stdio',
      command: 'node',
      args: [scriptPath],
      env,
    },
    original_json: JSON.stringify({ mcpServers: { [BUILTIN_VISION_NAME]: serverConfig } }, null, 2),
  };
}

function areStringArraysEqual(left?: string[], right?: string[]): boolean {
  const leftValue = left || [];
  const rightValue = right || [];
  return leftValue.length === rightValue.length && leftValue.every((item, index) => item === rightValue[index]);
}

function areStringRecordsEqual(left?: Record<string, string>, right?: Record<string, string>): boolean {
  const leftValue = left || {};
  const rightValue = right || {};
  const leftKeys = Object.keys(leftValue).toSorted();
  const rightKeys = Object.keys(rightValue).toSorted();
  return areStringArraysEqual(leftKeys, rightKeys) && leftKeys.every((key) => leftValue[key] === rightValue[key]);
}

function isSameStdioTransport(left: IMcpServer['transport'], right: IMcpServer['transport']): boolean {
  return (
    left.type === 'stdio' &&
    right.type === 'stdio' &&
    left.command === right.command &&
    areStringArraysEqual(left.args, right.args) &&
    areStringRecordsEqual(left.env, right.env)
  );
}

/**
 * Pre-configured ("fixed") MCP servers requested by VNG IT (WP 24111): Atlassian,
 * Microsoft 365 Outlook (VNG), and TSE Datahub. Shipped enabled by default so they
 * are pre-installed for everyone, and seeded as NON-builtin so users keep the edit
 * and delete controls (the ticket asks for these to stay editable). They are
 * OAuth-protected — people sign in on first use; no credentials are baked in.
 */
function buildFixedMcpServers(): McpImportServer[] {
  const fixed: Array<Pick<IMcpServer, 'name' | 'description' | 'transport'>> = [
    {
      name: 'atlassian',
      description: 'Atlassian (Jira & Confluence). Sign in on first use.',
      transport: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', 'mcp-remote@latest', 'https://mcp.atlassian.com/v1/mcp', '--transport', 'http-only'],
      },
    },
    {
      name: 'Outlook VNG',
      description: 'Microsoft 365 Outlook (VNG). Sign in on first use.',
      transport: {
        type: 'http',
        url: 'https://endpoint-925cccd9-2872-47a0-9641-c044d071dab9.agentbase-runtime.aiplatform.vngcloud.vn/mcp',
      },
    },
    {
      name: 'fdl-datahub',
      description: 'TSE Datahub. Sign in on first use.',
      transport: {
        type: 'stdio',
        command: 'npx',
        args: [
          '-y',
          'mcp-remote@latest',
          'https://aigw.vng.vn/mcp-connect/default-tse-datahub-mcp-3fa296edm25h4',
          '--transport',
          'http-only',
          '--silent',
        ],
      },
    },
  ];

  return fixed.map((server) => ({
    name: server.name,
    description: server.description,
    enabled: true,
    builtin: false,
    transport: server.transport,
    original_json: buildOriginalJsonFromTransport(server),
  }));
}

export function buildDefaultMcpServers(): McpImportServer[] {
  const chromeConfig = {
    command: 'npx',
    args: ['-y', 'chrome-devtools-mcp@latest'],
  };

  const capabilityServers: McpImportServer[] = BUILTIN_CAPABILITIES.map(
    (descriptor) => buildBuiltinCapabilityServer(descriptor) as McpImportServer
  );

  return [
    {
      name: BUILTIN_CHROME_DEVTOOLS_NAME,
      description: 'Default MCP server: chrome-devtools',
      // Tier-1 web browse: enabled by default on fresh installs. Existing installs
      // already have this server and keep their prior choice (add-if-missing seeding).
      enabled: true,
      builtin: true,
      transport: {
        type: 'stdio',
        command: chromeConfig.command,
        args: chromeConfig.args,
      },
      original_json: JSON.stringify({ mcpServers: { [BUILTIN_CHROME_DEVTOOLS_NAME]: chromeConfig } }, null, 2),
    },
    ...capabilityServers,
    ...buildBuiltinHttpMcpServers(),
    ...buildFixedMcpServers(),
  ];
}

async function isCommandAvailable(command: string): Promise<boolean> {
  return await new Promise((resolve) => {
    execFile(command, ['--version'], { timeout: 3000 }, (error) => {
      if (!error) {
        resolve(true);
        return;
      }

      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        resolve(false);
        return;
      }

      resolve(true);
    });
  });
}

async function ensureBuiltinNpxServerAvailability(server?: IMcpServer): Promise<void> {
  if (!server || !server.enabled || server.transport.type !== 'stdio' || server.transport.command !== 'npx') {
    return;
  }

  const hasNpx = await isCommandAvailable(server.transport.command);
  if (hasNpx) {
    return;
  }

  try {
    await mcpService.testMcpConnection.invoke(server);
  } catch (error) {
    console.warn(`[Migration] ${server.name} MCP preflight failed`, error);
  }
}

function buildOriginalJsonFromTransport(server: Pick<IMcpServer, 'name' | 'description' | 'transport'>): string {
  const transport_config =
    server.transport.type === 'stdio'
      ? {
          command: server.transport.command,
          args: server.transport.args || [],
          env: server.transport.env || {},
        }
      : {
          type: server.transport.type,
          url: server.transport.url,
          ...(server.transport.headers ? { headers: server.transport.headers } : {}),
        };

  return JSON.stringify(
    {
      mcpServers: {
        [server.name]: {
          ...(server.description ? { description: server.description } : {}),
          ...transport_config,
        },
      },
    },
    null,
    2
  );
}

async function ensureBootstrapMcpServersInDb(configFile: ConfigFile): Promise<void> {
  const [backendPrefs, fileImageConfig, providers] = await Promise.all([
    fetchBackendClientPreferences(),
    configFile.get('tools.imageGenerationModel').catch((): undefined => undefined),
    fetchProviders(),
  ]);
  const imageConfig = resolveImageGenerationMigrationConfig(backendPrefs, fileImageConfig);
  const imageConfigSource = resolveImageGenerationMigrationConfigSource(backendPrefs, fileImageConfig);
  const existing = await mcpService.listServers.invoke();
  const existingByName = new Map((existing ?? []).map((server) => [server.name, server]));
  const existingImageServer = existingByName.get(BUILTIN_IMAGE_GEN_NAME);
  const existingImageEnv =
    existingImageServer?.transport.type === 'stdio' ? existingImageServer.transport.env : undefined;
  const imageEnvResolution = resolveImageGenerationMcpEnv(imageConfig, providers, existingImageEnv);
  logImageGenerationEnvResolution(imageEnvResolution, 'bootstrap');
  const imageServer = buildBuiltinImageGenerationServer(imageEnvResolution, imageConfig);
  const existingIdpServer = existingByName.get(BUILTIN_IDP_NAME);
  const idpServer = buildBuiltinIdpServer(resolveGreenNodeApiKey(providers));
  const existingVisionServer = existingByName.get(BUILTIN_VISION_NAME);
  const visionServer = buildBuiltinVisionServer(resolveMoonshotApiKey(providers));
  const defaultServers = buildDefaultMcpServers();
  const missing = [...defaultServers, imageServer, idpServer, visionServer].filter(
    (server) => !existingByName.has(server.name)
  );
  let imageServerUpdated = false;
  let idpServerUpdated = false;
  let visionServerUpdated = false;

  if (missing.length > 0) {
    await mcpService.batchImportServers.invoke({ servers: missing });
  }

  const existingChromeDevtools = existingByName.get(BUILTIN_CHROME_DEVTOOLS_NAME);
  if (
    existingChromeDevtools &&
    (existingChromeDevtools.builtin !== true ||
      !existingChromeDevtools.original_json ||
      existingChromeDevtools.original_json.trim() === '' ||
      existingChromeDevtools.original_json.trim() === '{}')
  ) {
    await mcpService.updateServer.invoke({
      id: existingChromeDevtools.id,
      data: {
        builtin: true,
        original_json: buildOriginalJsonFromTransport(existingChromeDevtools),
      },
    });
  }

  const refreshedServers = await mcpService.listServers.invoke();
  const npxBuiltinNames = new Set<string>([
    BUILTIN_CHROME_DEVTOOLS_NAME,
    ...BUILTIN_CAPABILITIES.map((descriptor) => descriptor.name),
  ]);
  await Promise.all(
    refreshedServers
      .filter((server) => server.builtin === true && npxBuiltinNames.has(server.name))
      .map((server) => ensureBuiltinNpxServerAvailability(server))
  );

  if (
    imageEnvResolution.ok === true &&
    existingImageServer &&
    existingImageServer.transport.type === 'stdio' &&
    imageServer.transport.type === 'stdio'
  ) {
    const mergedEnv = {
      ...removeImageGenerationEnvKeys(existingImageServer.transport.env || {}),
      ...imageEnvResolution.env,
    };
    const updatedTransport = {
      ...imageServer.transport,
      env: mergedEnv,
    };
    const original_json = JSON.stringify(
      {
        mcpServers: {
          [BUILTIN_IMAGE_GEN_NAME]: {
            command: updatedTransport.command,
            args: updatedTransport.args || [],
            env: mergedEnv,
          },
        },
      },
      null,
      2
    );
    const imageTransportChanged = !isSameStdioTransport(existingImageServer.transport, updatedTransport);
    const imageOriginalJsonChanged = existingImageServer.original_json !== original_json;
    const imageServerChanged = imageTransportChanged || imageOriginalJsonChanged;
    console.info(
      '[Migration] image MCP bootstrap decision, server id: %s, transport changed: %s, json changed: %s, will update: %s',
      existingImageServer.id,
      imageTransportChanged ? 'yes' : 'no',
      imageOriginalJsonChanged ? 'yes' : 'no',
      imageServerChanged ? 'yes' : 'no'
    );
    if (imageServerChanged) {
      await mcpService.updateServer.invoke({
        id: existingImageServer.id,
        data: {
          transport: updatedTransport,
          original_json,
        },
      });
      imageServerUpdated = true;
    }
  } else if (existingImageServer && imageEnvResolution.ok === false) {
    console.warn(
      '[Migration] skipped image MCP env update because provider could not be resolved, server id: %s, reason: %s',
      existingImageServer.id,
      imageEnvResolution.reason
    );
  }

  if (existingIdpServer && existingIdpServer.transport.type === 'stdio' && idpServer.transport.type === 'stdio') {
    const updatedTransport = idpServer.transport;
    const idpTransportChanged = !isSameStdioTransport(existingIdpServer.transport, updatedTransport);
    const idpOriginalJsonChanged = existingIdpServer.original_json !== idpServer.original_json;
    // IDP has no user-facing toggle (hidden from all UI lists), so `enabled` is
    // derived purely from key presence — reconcile it here so a keyless→keyed
    // upgrade can re-enable it (otherwise it would be stuck disabled forever).
    const idpEnabledChanged = existingIdpServer.enabled !== idpServer.enabled;
    const idpServerChanged = idpTransportChanged || idpOriginalJsonChanged || idpEnabledChanged;
    console.info(
      '[Migration] idp MCP bootstrap decision, server id: %s, transport changed: %s, json changed: %s, will update: %s',
      existingIdpServer.id,
      idpTransportChanged ? 'yes' : 'no',
      idpOriginalJsonChanged ? 'yes' : 'no',
      idpServerChanged ? 'yes' : 'no'
    );
    if (idpTransportChanged || idpOriginalJsonChanged) {
      await mcpService.updateServer.invoke({
        id: existingIdpServer.id,
        data: {
          transport: updatedTransport,
          original_json: idpServer.original_json,
        },
      });
    }
    // `enabled` isn't part of updateServer's payload; flip it via toggleServer
    // when the key-derived desired state differs from what's stored.
    if (idpEnabledChanged) {
      await mcpService.toggleServer.invoke({ id: existingIdpServer.id });
    }
    if (idpServerChanged) {
      idpServerUpdated = true;
    }
  }

  if (
    existingVisionServer &&
    existingVisionServer.transport.type === 'stdio' &&
    visionServer.transport.type === 'stdio'
  ) {
    const updatedTransport = visionServer.transport;
    const visionTransportChanged = !isSameStdioTransport(existingVisionServer.transport, updatedTransport);
    const visionOriginalJsonChanged = existingVisionServer.original_json !== visionServer.original_json;
    // Vision has no user-facing toggle (hidden from all UI lists), so `enabled` is
    // derived purely from key presence — reconcile it here so a keyless→keyed
    // upgrade can re-enable it (otherwise it would be stuck disabled forever).
    const visionEnabledChanged = existingVisionServer.enabled !== visionServer.enabled;
    const visionServerChanged = visionTransportChanged || visionOriginalJsonChanged || visionEnabledChanged;
    console.info(
      '[Migration] vision MCP bootstrap decision, server id: %s, transport changed: %s, json changed: %s, will update: %s',
      existingVisionServer.id,
      visionTransportChanged ? 'yes' : 'no',
      visionOriginalJsonChanged ? 'yes' : 'no',
      visionServerChanged ? 'yes' : 'no'
    );
    if (visionTransportChanged || visionOriginalJsonChanged) {
      await mcpService.updateServer.invoke({
        id: existingVisionServer.id,
        data: {
          transport: updatedTransport,
          original_json: visionServer.original_json,
        },
      });
    }
    // `enabled` isn't part of updateServer's payload; flip it via toggleServer
    // when the key-derived desired state differs from what's stored.
    if (visionEnabledChanged) {
      await mcpService.toggleServer.invoke({ id: existingVisionServer.id });
    }
    if (visionServerChanged) {
      visionServerUpdated = true;
    }
  }

  console.info(
    '[Migration] MCP bootstrap completed, imported %d missing defaults, updated image server: %s, image config source: %s, image enabled: %s, updated idp server: %s, updated vision server: %s',
    missing.length,
    imageServerUpdated ? 'yes' : 'no',
    imageConfigSource,
    imageConfig?.switch === true ? 'yes' : 'no',
    idpServerUpdated ? 'yes' : 'no',
    visionServerUpdated ? 'yes' : 'no'
  );
}

const MIGRATION_STEPS: Array<{
  name: string;
  run: (configFile: ConfigFile) => Promise<MigrationStepResult>;
}> = [
  {
    name: 'migrateLegacyMcpConfigToDb',
    run: async (configFile) => (await migrateLegacyMcpConfigToDb(configFile), true),
  },
  { name: 'migrateConfigStorage', run: async (configFile) => (await migrateConfigStorage(configFile), true) },
  { name: 'migrateProviders', run: async (configFile) => (await migrateProviders(configFile), true) },
  {
    name: 'ensureBootstrapMcpServersInDb',
    run: async (configFile) => (await ensureBootstrapMcpServersInDb(configFile), true),
  },
  { name: 'migrateAssistantsToBackend', run: async (configFile) => migrateAssistantsToBackend(configFile) },
  { name: 'seedGreenNodeProvider', run: async (configFile) => seedGreenNodeProvider(configFile) },
  { name: 'seedOpenCodeGreenNodeConfig', run: async (configFile) => seedOpenCodeGreenNodeConfig(configFile) },
  { name: 'seedOpenCodeMoonshotConfig', run: async (configFile) => seedOpenCodeMoonshotConfig(configFile) },
  { name: 'seedOpenCodeVisionMcp', run: async (configFile) => seedOpenCodeVisionMcp(configFile) },
  { name: 'ensureOpenCodeAgentInstalled', run: async (configFile) => ensureOpenCodeAgentInstalled(configFile) },
  { name: 'seedTavilyWebSearch', run: async (configFile) => seedTavilyWebSearch(configFile) },
];

async function syncBuiltinMcpConfig(configFile: ConfigFile): Promise<void> {
  const localMcpConfig = ((await configFile.get('mcp.config').catch((): IMcpServer[] => [])) || []) as IMcpServer[];
  const localBuiltinServers = localMcpConfig.filter((server) => server?.builtin === true);

  if (localBuiltinServers.length === 0) {
    return;
  }

  const backendSettings = (await httpRequest<Record<string, unknown>>('GET', '/api/settings/client')) || {};
  const backendMcpConfig = Array.isArray(backendSettings['mcp.config'])
    ? (backendSettings['mcp.config'] as IMcpServer[])
    : [];

  const mergedMcpConfig = [...backendMcpConfig.filter((server) => server?.builtin !== true), ...localBuiltinServers];

  if (JSON.stringify(backendMcpConfig) === JSON.stringify(mergedMcpConfig)) {
    return;
  }

  await httpRequest<void>('PUT', '/api/settings/client', { 'mcp.config': mergedMcpConfig });
  console.info(
    '[AionUi] Synced builtin MCP config to backend settings (%d builtin servers)',
    localBuiltinServers.length
  );
}

export async function runBackendMigrations(configFile: ConfigFile): Promise<void> {
  await CLEANUP_STEPS.reduce<Promise<void>>(async (previous, step) => {
    await previous;
    const start = Date.now();
    try {
      await step.run();
      console.info(`[AionUi] Backend migration step completed: ${step.name} (${Date.now() - start}ms)`);
    } catch (error) {
      console.error(`[AionUi] Backend migration step failed: ${step.name} (${Date.now() - start}ms)`, error);
    }
  }, Promise.resolve());

  await MIGRATION_STEPS.reduce<Promise<void>>(async (previous, step) => {
    await previous;
    const start = Date.now();
    try {
      const completed = await step.run(configFile);
      const elapsed = Date.now() - start;
      if (!completed) {
        console.warn(`[AionUi] Backend migration step incomplete: ${step.name} (${elapsed}ms)`);
        return;
      }
      console.info(`[AionUi] Backend migration step completed: ${step.name} (${elapsed}ms)`);
    } catch (error) {
      const elapsed = Date.now() - start;
      console.error(`[AionUi] Backend migration step failed: ${step.name} (${elapsed}ms)`, error);
    }
  }, Promise.resolve());

  const syncStart = Date.now();
  try {
    await syncBuiltinMcpConfig(configFile);
    console.info(`[AionUi] Backend migration step completed: syncBuiltinMcpConfig (${Date.now() - syncStart}ms)`);
  } catch (error) {
    console.error(`[AionUi] Backend migration step failed: syncBuiltinMcpConfig (${Date.now() - syncStart}ms)`, error);
  }
}
