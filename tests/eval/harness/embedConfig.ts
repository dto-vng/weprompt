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

/**
 * The header the desktop app presents on every local backend call, carrying a
 * per-launch secret (see `common/adapter/httpBridge.ts`, which mirrors AionCore's
 * `LOCAL_TOKEN_HEADER`).
 *
 * This harness cannot present it, and that is not an oversight to fix here: the
 * secret is minted on each spawn and **never persisted** — it exists only in the
 * app process's globals — so a separate headless process has nowhere to read it
 * from. The name is duplicated rather than imported because it is used only to
 * explain a 401, never to authenticate, and importing the app's adapter layer
 * into a CLI would be a real dependency for a string.
 */
const LOCAL_TOKEN_HEADER = 'X-AionUI-Local-Token';

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

/**
 * Separated so a transport failure can be named for what it is. Everything here
 * ends up in the report's one-line `reason:`, and that line is the only thing a
 * reader gets to explain why half the numbers are missing — "fetch failed" reads
 * as a mystery, "nothing answered on 127.0.0.1:13400" reads as an instruction.
 */
const getProviders = async (url: string, port: number): Promise<Response> => {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(PROVIDER_FETCH_TIMEOUT_MS) });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`nothing answered on 127.0.0.1:${port} — is the dev app running? (${detail})`, { cause: error });
  }
};

const fetchProviders = async (env: NodeJS.ProcessEnv): Promise<IProvider[]> => {
  const port = Number(env.AIONUI_BACKEND_PORT) || DEFAULT_BACKEND_PORT;
  const response = await getProviders(`http://127.0.0.1:${port}/api/providers`, port);
  // A refusal is not an outage, and treating it as one sends the reader looking
  // for a backend that is running fine. See LOCAL_TOKEN_HEADER: this route is
  // simply closed to a headless caller, so say so and point at the way in.
  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `the backend refused an unauthenticated request (HTTP ${response.status}). It requires the per-launch ${LOCAL_TOKEN_HEADER}, which is never persisted, so a headless run cannot present it`
    );
  }
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
      reason: `no KB_EVAL_EMBED_* env vars, and the app's provider list could not be read: ${detail}. Set KB_EVAL_EMBED_BASE_URL / _API_KEY / _MODEL to measure the hybrid half.`,
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
