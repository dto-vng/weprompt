/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Auto-detect which configured provider/model to use for knowledge-base
// embeddings, and resolve the pinned model back to a live EmbedConfig.

import type { IProvider } from '@/common/config/storage';
import { hasSpecificModelCapability } from '@/common/utils/modelCapabilities';
import type { EmbedConfig } from '@/common/knowledge/embedCore';

const isUsable = (provider: IProvider): boolean => Boolean(provider.base_url?.trim() && provider.api_key?.trim());

/** First embedding-capable model across usable providers, or null. */
export const pickEmbeddingModel = (providers: IProvider[]): { providerId: string; model: string } | null => {
  for (const provider of providers) {
    if (!isUsable(provider)) continue;
    for (const model of provider.models ?? []) {
      if (hasSpecificModelCapability(provider, model, 'embedding') === true) {
        return { providerId: provider.id, model };
      }
    }
  }
  return null;
};

/** Resolve a pinned embedding model to a fetchable config (first API key only). */
export const resolveEmbedConfigForModel = (providers: IProvider[], model: string): EmbedConfig | null => {
  const provider = providers.find((p) => isUsable(p) && (p.models ?? []).includes(model));
  if (!provider) return null;
  // Mirrors ApiKeyManager.parseKeys / RotatingApiClient.parseMultipleKeys: split on
  // comma/newline, trim each segment, drop blanks, then take the first. Trimming
  // before selecting (rather than trimming only the first raw segment) keeps this
  // in lockstep with the rest of the app's multi-key parsing, so the picker never
  // hands out a key the rotating client itself would have skipped.
  const apiKey = provider.api_key
    .split(/[,\n]/)
    .map((key) => key.trim())
    .find((key) => key.length > 0);
  if (!apiKey) return null;
  return { baseUrl: provider.base_url, apiKey, model };
};
