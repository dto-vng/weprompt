/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildBm25Index } from '@/common/knowledge/bm25';
import { formatHitsAsText, loadStore, searchKnowledge } from '@/common/knowledge/searchCore';
import { createEmptyManifest, writeBm25, writeChunks, writeManifest, writeVectors } from '@/common/knowledge/store';
import type { KnowledgeChunk, KnowledgeHit } from '@/common/knowledge/types';

const CHUNKS: KnowledgeChunk[] = [
  {
    chunkId: 's1#0',
    sourceId: 's1',
    chunkIndex: 0,
    text: 'visa letter process for business trips',
    headingPath: 'HR > Visa',
    hasVector: true,
  },
  { chunkId: 's1#1', sourceId: 's1', chunkIndex: 1, text: 'expense reports are due in thirty days', hasVector: true },
  { chunkId: 's2#0', sourceId: 's2', chunkIndex: 0, text: 'wifi password rotation schedule', hasVector: true },
];

const seedStore = async (dir: string, withVectors: boolean) => {
  const manifest = createEmptyManifest('proj-1');
  manifest.sources.push(
    {
      id: 's1',
      fileName: 'hr.md',
      contentHash: 'sha256:1',
      byteSize: 10,
      status: 'ready',
      chunkCount: 2,
      vectorCount: withVectors ? 2 : 0,
      addedAt: 1,
      error: null,
    },
    {
      id: 's2',
      fileName: 'it.md',
      contentHash: 'sha256:2',
      byteSize: 10,
      status: 'ready',
      chunkCount: 1,
      vectorCount: withVectors ? 1 : 0,
      addedAt: 1,
      error: null,
    }
  );
  if (withVectors) manifest.embedding = { model: 'test-embed', dim: 2 };
  await writeManifest(dir, manifest);
  await writeChunks(dir, CHUNKS);
  await writeBm25(dir, buildBm25Index(CHUNKS));
  if (withVectors) {
    await writeVectors(dir, 2, [
      ['s1#0', new Float32Array([1, 0])],
      ['s1#1', new Float32Array([0, 1])],
      ['s2#0', new Float32Array([0.7, 0.7])],
    ]);
  }
};

describe('searchCore', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'kb-search-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('loadStore throws when the store is missing', async () => {
    await expect(loadStore(path.join(dir, 'missing'))).rejects.toThrow();
  });

  it('rebuilds the bm25 index from chunks when it is stale relative to chunks.json (torn pair)', async () => {
    await seedStore(dir, false);
    await writeBm25(dir, buildBm25Index(CHUNKS.slice(0, 1))); // stale: indexed only 1 of 3 chunks
    const store = await loadStore(dir);
    const hits = await searchKnowledge(store, 'wifi password', { maxResults: 2 });
    expect(hits.some((h) => h.text.includes('wifi password rotation'))).toBe(true);
  });

  it('finds passages by keyword (BM25-only store)', async () => {
    await seedStore(dir, false);
    const store = await loadStore(dir);
    const hits = await searchKnowledge(store, 'visa letter', { maxResults: 3 });
    expect(hits[0].sourceName).toBe('hr.md');
    expect(hits[0].text).toContain('visa letter process');
    expect(hits[0].headingPath).toBe('HR > Visa');
  });

  it('fuses semantic results when an embed function is provided', async () => {
    await seedStore(dir, true);
    const store = await loadStore(dir);
    const embed = vi.fn().mockResolvedValue([1, 0]); // nearest to s1#0
    const hits = await searchKnowledge(store, 'travel authorization document', { maxResults: 2, embed });
    expect(embed).toHaveBeenCalledWith('travel authorization document');
    expect(hits.map((h) => h.sourceId)).toContain('s1');
  });

  it('degrades to BM25 when the embed function rejects', async () => {
    await seedStore(dir, true);
    const store = await loadStore(dir);
    const embed = vi.fn().mockRejectedValue(new Error('boom'));
    const hits = await searchKnowledge(store, 'visa letter', { maxResults: 3, embed });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].text).toContain('visa letter');
  });

  it('returns empty for a blank query', async () => {
    await seedStore(dir, false);
    const store = await loadStore(dir);
    expect(await searchKnowledge(store, '   ', { maxResults: 3 })).toEqual([]);
  });

  it('skips punctuation-only queries without calling embed (no lexical signal)', async () => {
    await seedStore(dir, true);
    const store = await loadStore(dir);
    const embed = vi.fn().mockResolvedValue([1, 0]);
    const hits = await searchKnowledge(store, '???', { maxResults: 3, embed });
    expect(hits).toEqual([]);
    expect(embed).not.toHaveBeenCalled();
  });

  it('degrades to BM25 when the embed vector dimension does not match the stored vectors', async () => {
    await seedStore(dir, true); // vectors are dim 2
    const store = await loadStore(dir);
    const embed = vi.fn().mockResolvedValue([1, 0, 0]); // dim 3 — drifted from the store
    const hits = await searchKnowledge(store, 'visa letter', { maxResults: 3, embed });
    expect(hits[0].text).toContain('visa letter process');
    const bm25Only = await searchKnowledge(store, 'visa letter', { maxResults: 3 });
    expect(hits.map((h) => h.text)).toEqual(bm25Only.map((h) => h.text));
  });

  it('drops hits whose chunk no longer exists in the store (defensive)', async () => {
    await seedStore(dir, false);
    const store = await loadStore(dir);
    store.chunks.delete('s1#1');
    const hits = await searchKnowledge(store, 'expense reports thirty days', { maxResults: 3 });
    expect(hits.some((h) => h.text.includes('expense reports'))).toBe(false);
  });

  it('falls back to the sourceId when the manifest is missing a source name', async () => {
    await seedStore(dir, false);
    const store = await loadStore(dir);
    store.sourceNameById.delete('s2');
    const hits = await searchKnowledge(store, 'wifi password rotation', { maxResults: 1 });
    expect(hits[0].sourceName).toBe('s2');
  });

  it('changes the fused ranking vs BM25-only when both signals are non-empty (order-sensitive)', async () => {
    await seedStore(dir, true);
    const store = await loadStore(dir);
    const idOf = (h: KnowledgeHit) => `${h.sourceId}#${h.chunkIndex}`;

    const bm25Only = await searchKnowledge(store, 'visa expense', { maxResults: 3 });
    const embed = vi.fn().mockResolvedValue([0.7, 0.7]); // parallel to s2#0's vector; no lexical overlap with the query
    const fused = await searchKnowledge(store, 'visa expense', { maxResults: 3, embed });

    expect(bm25Only.map(idOf)).toEqual(['s1#0', 's1#1']); // s2#0 has zero lexical overlap with 'visa expense'
    expect(fused.map(idOf)).toContain('s2#0'); // the semantic list pulls it into the fused results
    expect(fused.map(idOf)).not.toEqual(bm25Only.map(idOf));
  });
});

describe('formatHitsAsText', () => {
  const hit = (i: number, text: string): KnowledgeHit => ({
    sourceId: 's1',
    sourceName: 'hr.md',
    chunkIndex: i,
    text,
    score: 1 / (i + 1),
    headingPath: i === 0 ? 'HR > Visa' : undefined,
  });

  it('renders numbered citations with heading paths', () => {
    const text = formatHitsAsText('visa', [hit(0, 'alpha'), hit(1, 'beta')]);
    expect(text).toContain('Found 2 passage(s)');
    expect(text).toContain('[1] hr.md — HR > Visa');
    expect(text).toContain('alpha');
    expect(text).toContain('[2] hr.md');
    expect(text).toContain('beta');
  });

  it('renders the empty message', () => {
    expect(formatHitsAsText('nada', [])).toBe('No relevant passages found in the project knowledge base for "nada".');
  });

  it('caps the payload and reports omissions', () => {
    const hits = Array.from({ length: 6 }, (_, i) => hit(i, 'x'.repeat(5000)));
    const text = formatHitsAsText('big', hits, { payloadCapChars: 12000 });
    expect(text.length).toBeLessThanOrEqual(12200); // cap + trailing note
    expect(text).toMatch(/\d+ more passage\(s\) omitted\./);
  });
});
