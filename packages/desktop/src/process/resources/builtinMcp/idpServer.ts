/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Built-in MCP server for GreenNode IDP document OCR. Standalone stdio process.
// Reads config from AIONUI_IDP_* env vars set by the seeding migration.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { BUILTIN_IDP_NAME } from './constants';
import { executeIdp } from '@/common/chat/idpCore';

function getConfigFromEnv(): { ingestUrl: string; apiKey: string } | null {
  const ingestUrl = process.env.AIONUI_IDP_BASE_URL; // full …/v1/ocr/ingest URL
  const apiKey = process.env.AIONUI_IDP_API_KEY;
  if (!ingestUrl || !apiKey) return null;
  return { ingestUrl, apiKey };
}

async function main() {
  const server = new McpServer({ name: BUILTIN_IDP_NAME, version: '1.0.0' });

  server.tool(
    'greennode_idp_read_document',
    `Read and semantically understand a DOCUMENT image or PDF using GreenNode IDP (Intelligent Document Processing: OCR + GenAI + LLM). Use this for structured documents — ID cards, passports, invoices, receipts, bank statements, tax forms, KYC/utility documents — to extract fields, totals, and classify the document. NOT for general photo/scene description.

When to use:
- User attaches or references (@filename) a document image/PDF and asks to read, extract, parse, verify, or classify it.

Input:
- file_path: local path (absolute, or relative to workspace_dir) to the document image or PDF.
- doc_type: the document category (e.g. "ID", "INVOICE", "BANK_STATEMENT"). Default "ID".
- file_type: "IMAGE" or "PDF". Default "IMAGE".

Output: the raw IDP extraction JSON. Summarize the extracted fields for the user.`,
    {
      file_path: z.string().describe('Local path to the document image/PDF (absolute or relative to workspace_dir).'),
      doc_type: z.string().optional().describe('Document category, e.g. "ID", "INVOICE". Defaults to "ID".'),
      file_type: z.enum(['IMAGE', 'PDF']).optional().describe('File kind. Defaults to "IMAGE".'),
      workspace_dir: z.string().optional().describe('Working directory for resolving relative paths.'),
    },
    async ({ file_path, doc_type, file_type, workspace_dir }) => {
      const config = getConfigFromEnv();
      if (!config) {
        return {
          content: [
            { type: 'text' as const, text: 'Error: GreenNode IDP is not configured (missing API key/base URL).' },
          ],
          isError: true,
        };
      }
      const result = await executeIdp(
        { filePath: file_path, docType: doc_type, fileType: file_type, workspaceDir: workspace_dir || process.cwd() },
        config
      );
      return { content: [{ type: 'text' as const, text: result.text }], isError: !result.success };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('[IdpMCP] Fatal error:', error);
  process.exit(1);
});
