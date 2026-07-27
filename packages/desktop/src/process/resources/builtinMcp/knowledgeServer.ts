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
import { KB_ENV } from '@/common/knowledge/envKeys';
import { formatHitsAsText, loadStore, searchKnowledge, type KnowledgeStoreData } from '@/common/knowledge/searchCore';
import { BUILTIN_KNOWLEDGE_NAME } from './constants';

export type KnowledgeServerEnv = {
  projectId: string;
  storeDir: string;
  embed: EmbedConfig | null;
};

export function parseKnowledgeServerEnv(env: Record<string, string | undefined>): KnowledgeServerEnv | null {
  const storeDir = env[KB_ENV.storeDir];
  if (!storeDir) return null;
  const baseUrl = env[KB_ENV.embedBaseUrl];
  const apiKey = env[KB_ENV.embedApiKey];
  const model = env[KB_ENV.embedModel];
  return {
    projectId: env[KB_ENV.projectId] ?? '',
    storeDir,
    embed: baseUrl && apiKey && model ? { baseUrl, apiKey, model } : null,
  };
}

const TOOL_DESCRIPTION = `Search this project's curated knowledge base — documents the user deliberately added to the project — for passages relevant to a question. Call this whenever the request may depend on project-specific facts, files, specs, policies, or prior decisions you don't already know. Returns the most relevant passages with their source filenames so you can cite them.

Input:
- query: natural-language question or keywords.
- max_results: optional, defaults to 6 (max 20).

Output: the most relevant passages, each cited with its source filename.`;

export type KnowledgeToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

type SearchToolInput = { query: string; max_results?: number };

export type SearchHandlerDeps = {
  loadStoreImpl?: typeof loadStore;
  embedTextsImpl?: typeof embedTexts;
  searchKnowledgeImpl?: typeof searchKnowledge;
};

/**
 * Builds the `search_project_knowledge` tool handler for one resolved env (or
 * a null env, when nothing is configured for this conversation). Split out
 * from `main()` so the store-load cache, maxResults clamp, and embed-gating
 * logic are unit-testable without booting an MCP server. `deps` lets tests
 * substitute the store/embed/search plumbing; production always omits it.
 */
export function createSearchHandler(
  config: KnowledgeServerEnv | null,
  deps?: SearchHandlerDeps
): (input: SearchToolInput) => Promise<KnowledgeToolResult> {
  const loadStoreFn = deps?.loadStoreImpl ?? loadStore;
  const embedTextsFn = deps?.embedTextsImpl ?? embedTexts;
  const searchKnowledgeFn = deps?.searchKnowledgeImpl ?? searchKnowledge;

  // Loaded once and never refreshed for this subprocess's lifetime: the MCP
  // config (and thus this env) is frozen at session-creation time, so
  // knowledge added mid-conversation only appears once a NEW chat starts.
  let storePromise: Promise<KnowledgeStoreData> | null = null;

  return async ({ query, max_results }) => {
    if (!config) {
      return { content: [{ type: 'text', text: 'Project knowledge base is unavailable.' }], isError: true };
    }
    let store: KnowledgeStoreData;
    try {
      store = await (storePromise ??= loadStoreFn(config.storeDir));
    } catch (error) {
      storePromise = null; // allow retry on a later call
      return {
        content: [
          {
            type: 'text',
            text: `Project knowledge base is unavailable: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
    // zod (see the schema in main()) already enforces [1, 20] at the protocol
    // layer; this clamp stays as defense in depth and covers the `?? 6` default.
    const maxResults = Math.min(20, Math.max(1, max_results ?? 6));
    const embedConfig = config.embed;
    const embed =
      embedConfig && store.manifest.embedding
        ? async (q: string) => (await embedTextsFn([q], embedConfig))[0]
        : undefined;
    const hits = await searchKnowledgeFn(store, query, { maxResults, embed });
    return { content: [{ type: 'text', text: formatHitsAsText(query, hits) }] };
  };
}

async function main() {
  const config = parseKnowledgeServerEnv(process.env);
  const server = new McpServer({ name: BUILTIN_KNOWLEDGE_NAME, version: '1.0.0' });

  server.tool(
    'search_project_knowledge',
    TOOL_DESCRIPTION,
    {
      query: z.string().describe('Natural-language question or keywords to search for.'),
      max_results: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe('Maximum passages to return (default 6, max 20).'),
    },
    createSearchHandler(config)
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Only start the stdio loop when executed as the bundle entry, so importing
// parseKnowledgeServerEnv / createSearchHandler from tests does not boot a
// server. The typeof guard matters: under vitest's ESM transform a bare
// `require` reference throws (same pattern as getBuiltinMcpBaseDir in
// initStorage.ts).
if (typeof require !== 'undefined' && require.main === module) {
  main().catch((error) => {
    console.error('[KnowledgeMCP] Fatal error:', error);
    process.exit(1);
  });
}
