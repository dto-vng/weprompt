/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import type { KnowledgeStoreData } from '@/common/knowledge/searchCore';
import { createEmptyManifest } from '@/common/knowledge/store';
import {
  createSearchHandler,
  parseKnowledgeServerEnv,
  type KnowledgeServerEnv,
} from '@/process/resources/builtinMcp/knowledgeServer';

describe('parseKnowledgeServerEnv', () => {
  it('returns null without a store dir', () => {
    expect(parseKnowledgeServerEnv({})).toBeNull();
  });

  it('parses store config without embed config', () => {
    const parsed = parseKnowledgeServerEnv({ AIONUI_KB_PROJECT_ID: 'p1', AIONUI_KB_STORE_DIR: '/tmp/kb/p1' });
    expect(parsed).toEqual({ projectId: 'p1', storeDir: '/tmp/kb/p1', embed: null });
  });

  it('includes embed config only when all three embed vars are set', () => {
    const base = {
      AIONUI_KB_PROJECT_ID: 'p1',
      AIONUI_KB_STORE_DIR: '/tmp/kb/p1',
      AIONUI_KB_EMBED_BASE_URL: 'https://x/v1',
      AIONUI_KB_EMBED_API_KEY: 'k',
    };
    expect(parseKnowledgeServerEnv(base)!.embed).toBeNull();
    expect(parseKnowledgeServerEnv({ ...base, AIONUI_KB_EMBED_MODEL: 'm' })!.embed).toEqual({
      baseUrl: 'https://x/v1',
      apiKey: 'k',
      model: 'm',
    });
  });
});

describe('createSearchHandler', () => {
  const KB_CONFIG: KnowledgeServerEnv = { projectId: 'p1', storeDir: '/tmp/kb/p1', embed: null };

  // Minimal store double: `searchKnowledgeImpl` is always stubbed in these
  // tests, so the bm25/chunks/vectors internals never actually get read —
  // only `manifest.embedding` matters, for the embed-gating tests below.
  const buildStore = (embedding: { model: string; dim: number } | null = null): KnowledgeStoreData => {
    const manifest = createEmptyManifest('p1');
    manifest.embedding = embedding;
    return {
      manifest,
      chunks: new Map(),
      bm25: { totalDocs: 0, avgDocLen: 0, docLens: {}, postings: {} },
      vectors: null,
      sourceNameById: new Map(),
    };
  };

  it('returns the generic unavailable message and never touches the store when config is null', async () => {
    const loadStoreImpl = vi.fn();
    const handler = createSearchHandler(null, { loadStoreImpl: loadStoreImpl as never });

    const result = await handler({ query: 'anything' });

    expect(result).toEqual({
      content: [{ type: 'text', text: 'Project knowledge base is unavailable.' }],
      isError: true,
    });
    expect(loadStoreImpl).not.toHaveBeenCalled();
  });

  it('surfaces the load failure cause and retries (resets the cache) on the next call', async () => {
    const loadStoreImpl = vi.fn().mockRejectedValue(new Error('Knowledge store missing or unsupported at /tmp/kb/p1'));
    const handler = createSearchHandler(KB_CONFIG, { loadStoreImpl: loadStoreImpl as never });

    const first = await handler({ query: 'q' });
    expect(first.isError).toBe(true);
    expect(first.content[0].text).toContain('Knowledge store missing or unsupported at /tmp/kb/p1');

    const second = await handler({ query: 'q' });
    expect(second.isError).toBe(true);
    expect(loadStoreImpl).toHaveBeenCalledTimes(2);
  });

  it('caches a successful store load across calls', async () => {
    const loadStoreImpl = vi.fn().mockResolvedValue(buildStore());
    const searchKnowledgeImpl = vi.fn().mockResolvedValue([]);
    const handler = createSearchHandler(KB_CONFIG, {
      loadStoreImpl: loadStoreImpl as never,
      searchKnowledgeImpl: searchKnowledgeImpl as never,
    });

    await handler({ query: 'q1' });
    await handler({ query: 'q2' });

    expect(loadStoreImpl).toHaveBeenCalledTimes(1);
  });

  it('clamps max_results to [1, 20], defaulting to 6', async () => {
    const loadStoreImpl = vi.fn().mockResolvedValue(buildStore());
    const searchKnowledgeImpl = vi.fn().mockResolvedValue([]);
    const handler = createSearchHandler(KB_CONFIG, {
      loadStoreImpl: loadStoreImpl as never,
      searchKnowledgeImpl: searchKnowledgeImpl as never,
    });

    await handler({ query: 'q', max_results: 0 });
    await handler({ query: 'q', max_results: -5 });
    await handler({ query: 'q', max_results: 100 });
    await handler({ query: 'q', max_results: undefined });

    const seenMaxResults = searchKnowledgeImpl.mock.calls.map((call) => call[2].maxResults);
    expect(seenMaxResults).toEqual([1, 1, 20, 6]);
  });

  it('omits the embed callback when the store has no pinned embedding', async () => {
    const loadStoreImpl = vi.fn().mockResolvedValue(buildStore(null));
    const searchKnowledgeImpl = vi.fn().mockResolvedValue([]);
    const configWithEmbed: KnowledgeServerEnv = {
      ...KB_CONFIG,
      embed: { baseUrl: 'https://x/v1', apiKey: 'k', model: 'm' },
    };
    const handler = createSearchHandler(configWithEmbed, {
      loadStoreImpl: loadStoreImpl as never,
      searchKnowledgeImpl: searchKnowledgeImpl as never,
    });

    await handler({ query: 'q' });

    expect(searchKnowledgeImpl).toHaveBeenCalledTimes(1);
    expect(searchKnowledgeImpl.mock.calls[0][2].embed).toBeUndefined();
  });

  it('wires an embed callback through embedTextsImpl when both sides have embedding configured', async () => {
    const loadStoreImpl = vi.fn().mockResolvedValue(buildStore({ model: 'm', dim: 3 }));
    const searchKnowledgeImpl = vi.fn().mockResolvedValue([]);
    const embedTextsImpl = vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]);
    const configWithEmbed: KnowledgeServerEnv = {
      ...KB_CONFIG,
      embed: { baseUrl: 'https://x/v1', apiKey: 'k', model: 'm' },
    };
    const handler = createSearchHandler(configWithEmbed, {
      loadStoreImpl: loadStoreImpl as never,
      searchKnowledgeImpl: searchKnowledgeImpl as never,
      embedTextsImpl: embedTextsImpl as never,
    });

    await handler({ query: 'q' });

    const embedCallback = searchKnowledgeImpl.mock.calls[0][2].embed;
    expect(embedCallback).toBeTypeOf('function');

    const vector = await embedCallback('hello');
    expect(embedTextsImpl).toHaveBeenCalledTimes(1);
    expect(embedTextsImpl).toHaveBeenCalledWith(['hello'], configWithEmbed.embed);
    expect(vector).toEqual([0.1, 0.2, 0.3]);
  });
});
