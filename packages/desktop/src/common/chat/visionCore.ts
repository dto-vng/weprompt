/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Send an image to an OpenAI-compatible multimodal chat endpoint (Kimi/Moonshot)
// and return the model's description. Node-side; fs via injected dep for tests.

import { promises as fs } from 'node:fs';
import path from 'node:path';

export type VisionConfig = { baseUrl: string; apiKey: string; model: string };
export type VisionRequest = { filePath: string; question?: string; workspaceDir?: string };
export type VisionResult = { success: boolean; text: string };

const DEFAULT_QUESTION = 'Describe this image in detail, including any text, layout, colors, and notable elements.';

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
};

const getFileName = (p: string): string => p.split(/[/\\]/).pop() || 'image';

export const toImageDataUrl = (fileBytes: Uint8Array, fileName: string): string => {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const mime = MIME_BY_EXT[ext] ?? 'image/png';
  // Copy into an owned ArrayBuffer so Buffer typing is satisfied under strict TS.
  const base64 = Buffer.from(new Uint8Array(fileBytes).buffer as ArrayBuffer).toString('base64');
  return `data:${mime};base64,${base64}`;
};

const resolvePath = (filePath: string, workspaceDir?: string): string => {
  const cleaned = filePath.startsWith('@') ? filePath.slice(1) : filePath;
  if (path.isAbsolute(cleaned) || !workspaceDir) return cleaned;
  return path.join(workspaceDir, cleaned);
};

export const executeVision = async (
  req: VisionRequest,
  config: VisionConfig,
  deps?: { readFile?: (p: string) => Promise<Uint8Array>; fetchImpl?: typeof fetch }
): Promise<VisionResult> => {
  if (!config.baseUrl || !config.apiKey || !config.model) {
    return { success: false, text: 'Error: image analysis is not configured (missing base URL, key, or model).' };
  }
  const readFile = deps?.readFile ?? (async (p: string) => new Uint8Array(await fs.readFile(p)));
  const fetchImpl = deps?.fetchImpl ?? fetch;

  const absolute = resolvePath(req.filePath, req.workspaceDir);
  let bytes: Uint8Array;
  try {
    bytes = await readFile(absolute);
  } catch {
    return { success: false, text: `Error: could not read image at ${absolute}` };
  }

  const dataUrl = toImageDataUrl(bytes, getFileName(absolute));
  const body = {
    model: config.model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: req.question || DEFAULT_QUESTION },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
    thinking: { type: 'disabled' },
    max_tokens: 2048,
  };

  try {
    const resp = await fetchImpl(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    if (!resp.ok) return { success: false, text: `Image analysis failed (HTTP ${resp.status}): ${text}` };
    const parsed = JSON.parse(text) as { choices?: Array<{ message?: { content?: string } }> };
    const content = parsed.choices?.[0]?.message?.content;
    if (!content) return { success: false, text: `Image analysis returned no content: ${text}` };
    return { success: true, text: content };
  } catch (error) {
    return { success: false, text: `Image analysis error: ${error instanceof Error ? error.message : String(error)}` };
  }
};
