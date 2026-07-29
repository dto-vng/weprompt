/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// OpenAI-compatible /embeddings client. Plain fetch with an injectable
// fetchImpl (the visionCore.ts pattern) so main-process ingestion and the
// bundled knowledge MCP subprocess share one embed path. Pure Node-free.

export type EmbedConfig = { baseUrl: string; apiKey: string; model: string };

/**
 * Inputs per /embeddings request. Exported so callers that need incremental
 * durability can slice their work the same way and persist between calls —
 * this function itself keeps nothing when a batch throws.
 */
export const EMBED_BATCH_SIZE = 32;
const BATCH_SIZE = EMBED_BATCH_SIZE;
const DEFAULT_TIMEOUT_MS = 30_000;

// Bounds a single fetch to timeoutMs so a hung /embeddings call can't hang a
// caller (e.g. an agent's search tool call) forever. Lets the resulting
// AbortError propagate — callers already treat rejection as degrade/retry.
const fetchWithTimeout = async (
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
};

const isFiniteVector = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((v) => typeof v === 'number' && Number.isFinite(v));

export const embedTexts = async (
  texts: string[],
  config: EmbedConfig,
  deps?: { fetchImpl?: typeof fetch; timeoutMs?: number }
): Promise<number[][]> => {
  const fetchImpl = deps?.fetchImpl ?? fetch;
  const timeoutMs = deps?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const url = `${config.baseUrl.replace(/\/+$/, '')}/embeddings`;
  const all: number[][] = [];
  for (let start = 0; start < texts.length; start += BATCH_SIZE) {
    const input = texts.slice(start, start + BATCH_SIZE);
    const resp = await fetchWithTimeout(
      fetchImpl,
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({ model: config.model, input }),
      },
      timeoutMs
    );
    const body = await resp.text();
    if (!resp.ok) throw new Error(`Embedding request failed (HTTP ${resp.status}): ${body.slice(0, 300)}`);
    let parsed: { data?: Array<{ index: number; embedding: number[] }> };
    try {
      parsed = JSON.parse(body) as { data?: Array<{ index: number; embedding: number[] }> };
    } catch {
      throw new Error(`Embedding response was not valid JSON (HTTP ${resp.status}).`);
    }
    if (!parsed.data || parsed.data.length !== input.length) {
      throw new Error('Embedding response did not include one vector per input.');
    }
    const ordered = [...parsed.data]
      .toSorted((a, b) => a.index - b.index)
      .map((d) => {
        if (!isFiniteVector(d.embedding)) throw new Error('Embedding response contained a malformed vector.');
        return d.embedding;
      });
    all.push(...ordered);
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
