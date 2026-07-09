/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Built-in seeds Forge ships enabled by default: the GreenNode (VNG Cloud)
 * LLM provider and, further down, the default HTTP MCP servers.
 *
 * Forge ships with the GreenNode MaaS provider preconfigured so a fresh
 * install is chat-ready without manual provider setup. The same seed is
 * mirrored into the local OpenCode CLI config so the OpenCode agent exposes
 * the identical model set.
 *
 * SECURITY: no credential lives in this repository. The shared team API key
 * is injected at packaging time from the FORGE_GREENNODE_API_KEY environment
 * variable (electron-vite `define`). Builds without it seed no key.
 */

export const GREENNODE_PROVIDER_NAME = 'GreenNode';

export const GREENNODE_BASE_URL = 'https://maas-llm-aiplatform-hcm.api.vngcloud.vn/v1';

/** Exactly the models Forge ships with — keep this list to the approved set. */
export const GREENNODE_MODELS = ['minimax/minimax-m2.5', 'openai/gpt-5'] as const;

/** Model OpenCode should default to for new sessions. */
export const GREENNODE_OPENCODE_DEFAULT_MODEL = 'vngcloud/minimax/minimax-m2.5';

/** Provider id OpenCode uses for this endpoint (namespaces its model ids). */
export const GREENNODE_OPENCODE_PROVIDER_ID = 'vngcloud';

/**
 * GreenNode API key, injected at build time from FORGE_GREENNODE_API_KEY via
 * electron-vite `define` (in dev and tests this reads the real process env).
 * Empty string when the build/environment provides no key.
 */
export function getGreenNodeApiKey(): string {
  return process.env.FORGE_GREENNODE_API_KEY || '';
}
