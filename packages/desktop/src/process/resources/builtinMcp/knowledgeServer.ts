/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Built-in MCP server exposing search over one project's knowledge base.
// Standalone stdio process; reads AIONUI_KB_* env vars set per conversation
// by the project-knowledge session-server descriptor (main process).

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { embedTexts, type EmbedConfig } from '@/common/knowledge/embedCore';
import { formatHitsAsText, loadStore, searchKnowledge, type KnowledgeStoreData } from '@/common/knowledge/searchCore';
import { BUILTIN_KNOWLEDGE_NAME } from './constants';

export type KnowledgeServerEnv = {
  projectId: string;
  storeDir: string;
  embed: EmbedConfig | null;
};

export function parseKnowledgeServerEnv(env: Record<string, string | undefined>): KnowledgeServerEnv | null {
  const storeDir = env.AIONUI_KB_STORE_DIR;
  if (!storeDir) return null;
  const baseUrl = env.AIONUI_KB_EMBED_BASE_URL;
  const apiKey = env.AIONUI_KB_EMBED_API_KEY;
  const model = env.AIONUI_KB_EMBED_MODEL;
  return {
    projectId: env.AIONUI_KB_PROJECT_ID ?? '',
    storeDir,
    embed: baseUrl && apiKey && model ? { baseUrl, apiKey, model } : null,
  };
}

const TOOL_DESCRIPTION = `Search this project's curated knowledge base — documents the user deliberately added to the project — for passages relevant to a question. Call this whenever the request may depend on project-specific facts, files, specs, policies, or prior decisions you don't already know. Returns the most relevant passages with their source filenames so you can cite them.

Input:
- query: natural-language question or keywords.
- max_results: optional, defaults to 6 (max 20).

Output: the most relevant passages, each cited with its source filename.`;

async function main() {
  const config = parseKnowledgeServerEnv(process.env);
  const server = new McpServer({ name: BUILTIN_KNOWLEDGE_NAME, version: '1.0.0' });

  let storePromise: Promise<KnowledgeStoreData> | null = null;
  const getStore = () => (storePromise ??= loadStore(config!.storeDir));

  server.tool(
    'search_project_knowledge',
    TOOL_DESCRIPTION,
    {
      query: z.string().describe('Natural-language question or keywords to search for.'),
      max_results: z.number().int().optional().describe('Maximum passages to return (default 6, max 20).'),
    },
    async ({ query, max_results }) => {
      if (!config) {
        return { content: [{ type: 'text' as const, text: 'Project knowledge base is unavailable.' }], isError: true };
      }
      let store: KnowledgeStoreData;
      try {
        store = await getStore();
      } catch {
        storePromise = null; // allow retry on a later call
        return { content: [{ type: 'text' as const, text: 'Project knowledge base is unavailable.' }], isError: true };
      }
      const maxResults = Math.min(20, Math.max(1, max_results ?? 6));
      const embedConfig = config.embed;
      const embed =
        embedConfig && store.manifest.embedding
          ? async (q: string) => (await embedTexts([q], embedConfig))[0]
          : undefined;
      const hits = await searchKnowledge(store, query, { maxResults, embed });
      return { content: [{ type: 'text' as const, text: formatHitsAsText(query, hits) }] };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Only start the stdio loop when executed as the bundle entry, so importing
// parseKnowledgeServerEnv from tests does not boot a server. The typeof guard
// matters: under vitest's ESM transform a bare `require` reference throws
// (same pattern as getBuiltinMcpBaseDir in initStorage.ts).
if (typeof require !== 'undefined' && require.main === module) {
  main().catch((error) => {
    console.error('[KnowledgeMCP] Fatal error:', error);
    process.exit(1);
  });
}
