/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// The env-var contract between the main process (which builds the session-MCP
// descriptor) and the knowledge MCP subprocess (which reads it). Both sides
// import these so a rename can never silently desync the two ends.

export const KB_ENV = {
  projectId: 'AIONUI_KB_PROJECT_ID',
  storeDir: 'AIONUI_KB_STORE_DIR',
  embedBaseUrl: 'AIONUI_KB_EMBED_BASE_URL',
  embedApiKey: 'AIONUI_KB_EMBED_API_KEY',
  embedModel: 'AIONUI_KB_EMBED_MODEL',
} as const;
