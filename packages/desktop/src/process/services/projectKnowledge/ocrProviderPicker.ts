/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Pick the multimodal chat model that will transcribe scanned PDFs, from
// whatever the user has configured.
//
// Two measured facts shape this, and both rule out pinning a model id:
//
// 1. A provider's catalogue is not its entitlements. The reference deployment
//    lists 38 models on `/v1/models`, and most of them return 404 on the first
//    chat call for the same key. So a candidate is not trusted until it has
//    answered a real request — hence the probe.
// 2. The repo's own `vision` capability regex misses models that demonstrably
//    do OCR (it does not match `google/gemma-4-31b-it`, which transcribed a
//    Vietnamese contract cleanly). So capability tags are used where they
//    apply, backed by a pattern list, and never by naming one model.

import type { IProvider } from '@/common/config/storage';
import { hasSpecificModelCapability } from '@/common/utils/modelCapabilities';
import type { OcrConfig } from '@/common/knowledge/pdfOcr';
import { firstApiKey, isUsableProvider } from './embedProviderPicker';

/**
 * Model-id patterns known to accept an image in a chat completion, in
 * preference order. A LIST, deliberately — a single pinned id would be dead the
 * moment the deployment's entitlements shifted, which they do.
 *
 * `gemma-4` leads because it is the one verified end to end on the reference
 * deployment: a real scanned Vietnamese contract page in, clean markdown out,
 * diacritics and tables intact.
 */
export const OCR_MODEL_PATTERNS: RegExp[] = [
  /gemma-?[4-9]/i,
  /gpt-4o|gpt-4\.1|gpt-[5-9]/i,
  /gemini/i,
  /claude-(?:3|[4-9]|opus|sonnet|haiku)/i,
  /qwen[\w.-]*-(?:vl|omni)\b/i,
  /internvl|minicpm-?v|pixtral|llava|molmo|got-ocr/i,
  /kimi-[a-z]|moonshot[\w.-]*vision/i,
  /seed-1-[0-9]/i,
  // Generic last resort: an id that advertises the modality in its own name.
  /-vl\b|vision|multimodal/i,
];

export type OcrCandidate = { providerId: string; config: OcrConfig };

/**
 * Ceiling on one probe. Short on purpose: this asks a trivial question, and a
 * candidate slow enough to exceed this is not one to hand 50 page images to.
 */
const PROBE_TIMEOUT_MS = 20_000;

/**
 * Every plausible (provider, model) pair, best first.
 *
 * A model the capability system explicitly EXCLUDES from vision (embedding,
 * rerank, image generation) is vetoed no matter what the patterns say — that
 * veto is the repo's own list and there is no reason to second-guess it.
 */
export const pickOcrCandidates = (providers: IProvider[]): OcrCandidate[] => {
  const ranked: Array<{ rank: number; candidate: OcrCandidate }> = [];
  for (const provider of providers) {
    if (!isUsableProvider(provider)) continue;
    const apiKey = firstApiKey(provider);
    if (!apiKey) continue;
    for (const model of provider.models ?? []) {
      const capability = hasSpecificModelCapability(provider, model, 'vision');
      if (capability === false) continue;
      const patternRank = OCR_MODEL_PATTERNS.findIndex((pattern) => pattern.test(model));
      // A capability-tagged model with no pattern hit still qualifies; it sorts
      // after the patterns, which encode what has actually been observed to work.
      const rank = patternRank >= 0 ? patternRank : capability === true ? OCR_MODEL_PATTERNS.length : -1;
      if (rank < 0) continue;
      ranked.push({
        rank,
        candidate: { providerId: provider.id, config: { baseUrl: provider.base_url, apiKey, model } },
      });
    }
  }
  // Stable within a rank, so provider order and the user's model order both
  // survive as tie-breakers.
  return ranked
    .map((entry, index) => ({ ...entry, index }))
    .toSorted((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.candidate);
};

/**
 * String-discriminated on purpose: with `strictNullChecks` off (this repo's
 * tsconfig) TypeScript does not narrow the false side of an `ok: boolean`
 * discriminant, so `if (result.ok) return; result.detail` would not compile.
 */
export type OcrProbeResult = { status: 'ok' } | { status: 'rejected'; detail: string };

/**
 * Ask a candidate one trivial question to find out whether this key may
 * actually call it. Text-only and `max_tokens: 4`, so a rejected candidate
 * costs approximately nothing.
 *
 * This exists because the catalogue lies: without it, a 50-page scan would be
 * started against a model that 404s, and every page would fail identically.
 */
export const probeOcrModel = async (
  config: OcrConfig,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = PROBE_TIMEOUT_MS
): Promise<OcrProbeResult> => {
  // A candidate that never answers is a rejected candidate. Without the bound,
  // one unresponsive model would stall resolution — and with it the whole
  // per-project ingestion queue — before any page was even encoded.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 4,
        messages: [{ role: 'user', content: 'ping' }],
      }),
      signal: controller.signal,
    });
    if (response.ok) return { status: 'ok' };
    return { status: 'rejected', detail: `HTTP ${response.status}` };
  } catch (error) {
    return { status: 'rejected', detail: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeoutId);
  }
};

/** String-discriminated for the same reason as `OcrProbeResult`. */
export type OcrModelResolution =
  | { status: 'resolved'; config: OcrConfig }
  /** `reason` is a sentence naming what is missing, for the source's failure message. */
  | { status: 'unavailable'; reason: string };

export type ResolveOcrModelDeps = {
  fetchImpl?: typeof fetch;
  probeImpl?: (config: OcrConfig) => Promise<OcrProbeResult>;
};

/**
 * Resolve a model that can transcribe scans, probing candidates in order.
 *
 * The caller must cache the result for the duration of ONE ingest run and no
 * longer: probing per page would be wasteful, but persisting the choice would
 * outlive the entitlement that justified it.
 *
 * On failure the reason names what is actually wrong, in the same spirit as the
 * old "this PDF is a scan" message it replaces — "nothing worked" is not a
 * thing a user can act on.
 */
export const resolveOcrModel = async (
  providers: IProvider[],
  deps: ResolveOcrModelDeps = {}
): Promise<OcrModelResolution> => {
  const probe = deps.probeImpl ?? ((config: OcrConfig) => probeOcrModel(config, deps.fetchImpl ?? fetch));
  const usable = providers.filter(isUsableProvider);
  if (usable.length === 0) {
    return { status: 'unavailable', reason: 'no provider is configured with both a base URL and an API key' };
  }
  const candidates = pickOcrCandidates(providers);
  if (candidates.length === 0) {
    const modelCount = usable.reduce((sum, provider) => sum + (provider.models ?? []).length, 0);
    return {
      status: 'unavailable',
      reason: `none of the ${modelCount} model(s) on your configured provider(s) looks able to read images`,
    };
  }
  const failures: string[] = [];
  for (const candidate of candidates) {
    const result = await probe(candidate.config);
    if (result.status === 'ok') return { status: 'resolved', config: candidate.config };
    failures.push(`${candidate.config.model} (${result.detail})`);
  }
  return {
    status: 'unavailable',
    reason: `none of the image-capable models on your provider(s) would answer: ${failures.join(', ')}`,
  };
};
