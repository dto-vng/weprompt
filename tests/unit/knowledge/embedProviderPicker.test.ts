/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { IProvider } from '@/common/config/storage';
import {
  pickEmbeddingModel,
  resolveEmbedConfigForModel,
} from '@/process/services/projectKnowledge/embedProviderPicker';

const provider = (over: Partial<IProvider>): IProvider =>
  ({
    id: 'p1',
    platform: 'openai',
    name: 'P',
    base_url: 'https://api.x.com/v1',
    api_key: 'sk-1',
    models: [],
    ...over,
  }) as IProvider;

describe('pickEmbeddingModel', () => {
  it('picks the first embedding-capable model across providers', () => {
    const providers = [
      provider({ id: 'chat', models: ['gpt-4o'] }),
      provider({ id: 'embed', models: ['gpt-4o-mini', 'text-embedding-3-small'] }),
    ];
    expect(pickEmbeddingModel(providers)).toEqual({ providerId: 'embed', model: 'text-embedding-3-small' });
  });

  it('returns null when no provider has an embedding model', () => {
    expect(pickEmbeddingModel([provider({ models: ['gpt-4o', 'claude-3-haiku'] })])).toBeNull();
  });

  it('skips providers missing base_url or api_key', () => {
    const providers = [
      provider({ id: 'nokey', api_key: '', models: ['text-embedding-3-small'] }),
      provider({ id: 'ok', models: ['bge-large-zh'] }),
    ];
    expect(pickEmbeddingModel(providers)).toEqual({ providerId: 'ok', model: 'bge-large-zh' });
  });

  it('skips providers with a whitespace-only base_url', () => {
    const providers = [
      provider({ id: 'blank-url', base_url: '   ', models: ['text-embedding-3-small'] }),
      provider({ id: 'ok', models: ['bge-large-zh'] }),
    ];
    expect(pickEmbeddingModel(providers)).toEqual({ providerId: 'ok', model: 'bge-large-zh' });
  });
});

describe('resolveEmbedConfigForModel', () => {
  it('builds an EmbedConfig from the provider owning the pinned model', () => {
    const providers = [provider({ id: 'e', models: ['text-embedding-3-small'], api_key: 'sk-a,sk-b' })];
    expect(resolveEmbedConfigForModel(providers, 'text-embedding-3-small')).toEqual({
      baseUrl: 'https://api.x.com/v1',
      apiKey: 'sk-a', // first key only — the subprocess has no rotation
      model: 'text-embedding-3-small',
    });
  });

  it('returns null when the pinned model is no longer configured', () => {
    expect(resolveEmbedConfigForModel([provider({ models: ['gpt-4o'] })], 'text-embedding-3-small')).toBeNull();
  });

  it('skips a leading blank segment and takes the first non-blank key', () => {
    const providers = [provider({ id: 'e', models: ['text-embedding-3-small'], api_key: ',sk-a' })];
    expect(resolveEmbedConfigForModel(providers, 'text-embedding-3-small')).toEqual({
      baseUrl: 'https://api.x.com/v1',
      apiKey: 'sk-a',
      model: 'text-embedding-3-small',
    });
  });

  it('trims stray \\r from CRLF-separated keys and takes the first non-blank one', () => {
    const providers = [provider({ id: 'e', models: ['text-embedding-3-small'], api_key: '\r\nsk-a\r\nsk-b' })];
    expect(resolveEmbedConfigForModel(providers, 'text-embedding-3-small')).toEqual({
      baseUrl: 'https://api.x.com/v1',
      apiKey: 'sk-a',
      model: 'text-embedding-3-small',
    });
  });

  it('returns null when api_key is only separators', () => {
    const providers = [provider({ id: 'e', models: ['text-embedding-3-small'], api_key: ',,' })];
    expect(resolveEmbedConfigForModel(providers, 'text-embedding-3-small')).toBeNull();
  });
});
