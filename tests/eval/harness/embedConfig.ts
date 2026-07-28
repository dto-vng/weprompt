/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Finds an embedding config for the hybrid half of the evaluation.
//
// Two routes, in order:
//   1. KB_EVAL_EMBED_BASE_URL / _API_KEY / _MODEL — explicit, works headless.
//   2. The running dev app's provider list, run through the same
//      pickEmbeddingModel / resolveEmbedConfigForModel the service uses, so the
//      harness measures the model a real ingest would have picked.
//
// Neither available ⇒ null with a reason, and the caller reports BM25-only
// loudly rather than passing half a picture off as the whole thing.
//
// The provider list comes back with API keys in plaintext. Nothing in this file
// logs a config, and callers only ever receive the model name.

import type { IProvider } from '@/common/config/storage';
import type { EmbedConfig } from '@/common/knowledge/embedCore';
import { pickEmbeddingModel, resolveEmbedConfigForModel } from '@process/services/projectKnowledge/embedProviderPicker';

/** Mirrors httpBridge's fallback; the dev backend writes its real port at runtime. */
const DEFAULT_BACKEND_PORT = 13400;
const PROVIDER_FETCH_TIMEOUT_MS = 3000;

export type EmbedConfigSource = 'env' | 'running-app';

/**
 * One flat shape rather than a discriminated union: this repo compiles with
 * strictNullChecks off, so null is assignable everywhere and neither
 * `config === null` nor an `ok: true | false` literal narrows a union reliably.
 * `config` non-null means resolved; otherwise `reason` says why not.
 */
export type EmbedConfigResult = {
  config: EmbedConfig | null;
  source: EmbedConfigSource | null;
  reason: string | null;
};

const fromEnv = (env: NodeJS.ProcessEnv): EmbedConfigResult | null => {
  const baseUrl = env.KB_EVAL_EMBED_BASE_URL?.trim();
  const apiKey = env.KB_EVAL_EMBED_API_KEY?.trim();
  const model = env.KB_EVAL_EMBED_MODEL?.trim();
  if (!baseUrl || !apiKey || !model) return null;
  return { config: { baseUrl, apiKey, model }, source: 'env', reason: null };
};

const fetchProviders = async (env: NodeJS.ProcessEnv): Promise<IProvider[]> => {
  const port = Number(env.AIONUI_BACKEND_PORT) || DEFAULT_BACKEND_PORT;
  const response = await fetch(`http://127.0.0.1:${port}/api/providers`, {
    signal: AbortSignal.timeout(PROVIDER_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body: unknown = await response.json();
  // The endpoint has returned both a bare array and a { data } envelope across
  // versions; accept either rather than reporting "no providers" on a shape change.
  if (Array.isArray(body)) return body as IProvider[];
  if (body && typeof body === 'object' && Array.isArray((body as { data?: unknown }).data)) {
    return (body as { data: IProvider[] }).data;
  }
  throw new Error('unexpected /api/providers response shape');
};

export const resolveEvalEmbedConfig = async (env: NodeJS.ProcessEnv = process.env): Promise<EmbedConfigResult> => {
  const explicit = fromEnv(env);
  if (explicit) return explicit;

  let providers: IProvider[];
  try {
    providers = await fetchProviders(env);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      config: null,
      source: null,
      reason: `no KB_EVAL_EMBED_* env vars, and the running app's provider list was unreachable (${detail})`,
    };
  }

  const picked = pickEmbeddingModel(providers);
  if (!picked) {
    return {
      config: null,
      source: null,
      reason: `none of the ${providers.length} configured provider(s) expose an embedding model`,
    };
  }
  const config = resolveEmbedConfigForModel(providers, picked.model);
  if (!config) {
    return {
      config: null,
      source: null,
      reason: `embedding model "${picked.model}" could not be resolved to a usable provider`,
    };
  }
  return { config, source: 'running-app', reason: null };
};
