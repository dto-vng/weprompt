/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IProvider } from '@/common/config/storage';

/** API keys are stored as one comma/newline-joined string. */
export const getApiKeyCount = (api_key: string): number => {
  if (!api_key) return 0;
  return api_key.split(/[,\n]/).filter((k) => k.trim().length > 0).length;
};

/**
 * A provider header has no health field of its own — health is stored per model
 * as `platform.model_health[model]`. The row's one-line summary is folded here.
 */
export type ProviderHealthSummary =
  | { kind: 'unchecked' }
  | { kind: 'checked'; checked: number; total: number }
  | { kind: 'failing'; failing: number };

/**
 * Fold a provider's per-model health into the single phrase the collapsed row shows.
 *
 * Precedence is failing > partially checked > unchecked, so a row never buries a
 * failure behind a reassuring fraction. A provider with no models gets no summary
 * at all — its counts already say "0 models".
 *
 * Iteration is over `platform.models`, never over `Object.keys(model_health)`: a
 * health entry can outlive the model it describes when a provider is re-fetched
 * from the backend with stale keys.
 */
export const summarizeProviderHealth = (platform: IProvider): ProviderHealthSummary | undefined => {
  const models = platform.models ?? [];
  if (models.length === 0) return undefined;

  const health = platform.model_health ?? {};
  let checked = 0;
  let failing = 0;
  for (const model of models) {
    const status = health[model]?.status;
    if (status === 'healthy') {
      checked += 1;
    } else if (status === 'unhealthy') {
      checked += 1;
      failing += 1;
    }
  }

  if (failing > 0) return { kind: 'failing', failing };
  if (checked === 0) return { kind: 'unchecked' };
  return { kind: 'checked', checked, total: models.length };
};
