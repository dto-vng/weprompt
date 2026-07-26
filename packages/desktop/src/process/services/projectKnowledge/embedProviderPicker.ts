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
  const apiKey = provider.api_key.split(/[,\n]/)[0].trim();
  if (!apiKey) return null;
  return { baseUrl: provider.base_url, apiKey, model };
};
