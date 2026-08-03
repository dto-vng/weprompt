/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import type { KnowledgeStoreData } from '@/common/knowledge/searchCore';
import { createEmptyManifest } from '@/common/knowledge/store';
import {
  buildToolDescription,
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

describe('buildToolDescription', () => {
  it('steers the model to search before reaching for file tools', () => {
    const d = buildToolDescription([]);
    expect(d).toMatch(/USE THIS FIRST/);
    expect(d).toMatch(/before file listing, glob, or grep/);
  });

  // The documents now live in the workspace, so the old "they are not on
  // disk" claim would actively mislead: whole-document questions are answered
  // by reading the file, which the model only does if told the path.
  it('tells the model whole documents are readable at Knowledge Base/<fileName>', () => {
    const d = buildToolDescription([]);
    expect(d).toContain('Knowledge Base/');
    expect(d).toMatch(/file tools/);
    expect(d).not.toMatch(/do NOT live in the working directory/);
    expect(d).not.toMatch(/cannot be found with file listing/);
  });

  it('names the attached documents so the tool is discoverable by topic', () => {
    const d = buildToolDescription(['PROBLEM_STATEMENT.md', 'policy.docx']);
    expect(d).toContain('Documents currently attached to this project:');
    expect(d).toContain('- PROBLEM_STATEMENT.md');
    expect(d).toContain('- policy.docx');
  });

  it('caps the listing and reports the remainder', () => {
    const many = Array.from({ length: 25 }, (_, i) => `doc-${i}.md`);
    const d = buildToolDescription(many);
    expect(d).toContain('- doc-0.md');
    expect(d).toContain('- doc-19.md');
    expect(d).not.toContain('- doc-20.md');
    expect(d).toContain('…and 5 more');
  });

  it('points the model at the citation header as the source of the fileName', () => {
    const d = buildToolDescription([]);
    expect(d).toContain('[n] <fileName> — <section>');
    expect(d).toMatch(/CITE BY fileName/);
  });

  // Prose citations only linkify on an exact fileName (see
  // linkifyKnownSources.ts). Observed in acceptance: the model cited a document
  // by the title printed inside the passage text, so the answer carried no
  // clickable source at all. The old passive "each cited with its source
  // filename" line never told it to do otherwise, so its absence is asserted
  // too — the rule must replace that line, not sit alongside it.
  it('forbids citing by document title instead of fileName', () => {
    const d = buildToolDescription([]);
    expect(d).toContain("never the document's title");
    expect(d).not.toMatch(/each cited with its source filename/);
  });

  it('keeps the citation rule when documents are attached', () => {
    expect(buildToolDescription(['policy.docx'])).toMatch(/CITE BY fileName/);
  });
});
