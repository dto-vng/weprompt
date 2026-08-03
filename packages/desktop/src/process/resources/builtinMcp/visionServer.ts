/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Built-in MCP server for image analysis via a multimodal chat model (Kimi).
// Standalone stdio process; reads AIONUI_VISION_* env vars set by seeding.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { BUILTIN_VISION_NAME } from './constants';
import { executeVision } from '@/common/chat/visionCore';

function getConfigFromEnv(): { baseUrl: string; apiKey: string; model: string } | null {
  const baseUrl = process.env.AIONUI_VISION_BASE_URL;
  const apiKey = process.env.AIONUI_VISION_API_KEY;
  const model = process.env.AIONUI_VISION_MODEL;
  if (!baseUrl || !apiKey || !model) return null;
  return { baseUrl, apiKey, model };
}

async function main() {
  const server = new McpServer({ name: BUILTIN_VISION_NAME, version: '1.0.0' });

  server.tool(
    'analyze_image',
    `Look at an image file and answer questions about it (visual/semantic understanding via a multimodal model). Use this whenever the user attaches or references (@filename) an image — a screenshot, photo, UI mockup, chart, diagram — and asks what it shows, to describe it, match its style, read text in it, or reason about it. You (the base model) may not be able to see images directly; this tool can.

Input:
- file_path: local path (absolute or relative to workspace_dir) to the image.
- question: what to ask about the image (e.g. "Describe the UI style", "What does this chart show?"). Optional.

Output: the model's textual answer about the image.`,
    {
      file_path: z.string().describe('Local path to the image (absolute or relative to workspace_dir).'),
      question: z.string().optional().describe('What to ask about the image. Defaults to a full description.'),
      workspace_dir: z.string().optional().describe('Working directory for resolving relative paths.'),
    },
    async ({ file_path, question, workspace_dir }) => {
      const config = getConfigFromEnv();
      if (!config) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Error: image analysis is not configured (missing API key/base URL/model).',
            },
          ],
          isError: true,
        };
      }
      const result = await executeVision(
        { filePath: file_path, question, workspaceDir: workspace_dir || process.cwd() },
        config
      );
      return { content: [{ type: 'text' as const, text: result.text }], isError: !result.success };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('[VisionMCP] Fatal error:', error);
  process.exit(1);
});
