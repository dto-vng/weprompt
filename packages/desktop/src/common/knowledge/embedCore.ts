/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// OpenAI-compatible /embeddings client. Plain fetch with an injectable
// fetchImpl (the visionCore.ts pattern) so main-process ingestion and the
// bundled knowledge MCP subprocess share one embed path. Pure Node-free.

export type EmbedConfig = { baseUrl: string; apiKey: string; model: string };

const BATCH_SIZE = 32;

export const embedTexts = async (
  texts: string[],
  config: EmbedConfig,
  deps?: { fetchImpl?: typeof fetch }
): Promise<number[][]> => {
  const fetchImpl = deps?.fetchImpl ?? fetch;
  const url = `${config.baseUrl.replace(/\/+$/, '')}/embeddings`;
  const all: number[][] = [];
  for (let start = 0; start < texts.length; start += BATCH_SIZE) {
    const input = texts.slice(start, start + BATCH_SIZE);
    const resp = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, input }),
    });
    const body = await resp.text();
    if (!resp.ok) throw new Error(`Embedding request failed (HTTP ${resp.status}): ${body.slice(0, 300)}`);
    const parsed = JSON.parse(body) as { data?: Array<{ index: number; embedding: number[] }> };
    if (!parsed.data || parsed.data.length !== input.length) {
      throw new Error('Embedding response did not include one vector per input.');
    }
    const ordered = [...parsed.data].toSorted((a, b) => a.index - b.index);
    all.push(...ordered.map((d) => d.embedding));
  }
  return all;
};

export const cosineSim = (a: ArrayLike<number>, b: ArrayLike<number>): number => {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};
