/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { IProvider } from '@/common/config/storage';
import {
  getApiKeyCount,
  summarizeProviderHealth,
} from '@/renderer/components/settings/SettingsModal/contents/ModelModalContent/providerRowSummary';

const providerWith = (overrides: Partial<IProvider>): IProvider => ({
  id: 'provider-a',
  platform: 'openai',
  name: 'Provider A',
  base_url: 'https://example.test/v1',
  api_key: 'secret',
  models: [],
  ...overrides,
});

describe('getApiKeyCount', () => {
  it('counts nothing for an empty key string', () => {
    expect(getApiKeyCount('')).toBe(0);
  });

  it('counts comma-separated keys', () => {
    expect(getApiKeyCount('a,b')).toBe(2);
  });

  it('ignores blank segments produced by stray separators and whitespace', () => {
    expect(getApiKeyCount('a\n\nb ')).toBe(2);
  });
});

describe('summarizeProviderHealth', () => {
  it('renders no summary for a provider with zero models', () => {
    expect(summarizeProviderHealth(providerWith({ models: [] }))).toBeUndefined();
  });

  it('reports unchecked when no health has ever been recorded', () => {
    expect(summarizeProviderHealth(providerWith({ models: ['model-a', 'model-b'] }))).toEqual({ kind: 'unchecked' });
  });

  it('reports unchecked when every recorded status is still unknown', () => {
    const summary = summarizeProviderHealth(
      providerWith({
        models: ['model-a'],
        model_health: { 'model-a': { status: 'unknown' } },
      })
    );

    expect(summary).toEqual({ kind: 'unchecked' });
  });

  it('reports the checked fraction when part of the catalog has been measured', () => {
    const summary = summarizeProviderHealth(
      providerWith({
        models: ['model-a', 'model-b'],
        model_health: { 'model-a': { status: 'healthy' } },
      })
    );

    expect(summary).toEqual({ kind: 'checked', checked: 1, total: 2 });
  });

  it('lets a failure outrank a partial check so the row leads with the problem', () => {
    const summary = summarizeProviderHealth(
      providerWith({
        models: ['model-a', 'model-b'],
        model_health: {
          'model-a': { status: 'healthy' },
          'model-b': { status: 'unhealthy' },
        },
      })
    );

    expect(summary).toEqual({ kind: 'failing', failing: 1 });
  });

  it('counts every failing model, not just the first', () => {
    const summary = summarizeProviderHealth(
      providerWith({
        models: ['model-a', 'model-b'],
        model_health: {
          'model-a': { status: 'unhealthy' },
          'model-b': { status: 'unhealthy' },
        },
      })
    );

    expect(summary).toEqual({ kind: 'failing', failing: 2 });
  });

  it('ignores health recorded for a model the provider no longer lists', () => {
    const summary = summarizeProviderHealth(
      providerWith({
        models: ['model-a'],
        model_health: {
          'model-a': { status: 'healthy' },
          'model-removed': { status: 'unhealthy' },
        },
      })
    );

    expect(summary).toEqual({ kind: 'checked', checked: 1, total: 1 });
  });
});
