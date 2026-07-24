// tests/unit/knowledge/store.test.ts
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { KnowledgeChunk, KnowledgeManifest } from '@/common/knowledge/types';
import {
  createEmptyManifest,
  readBm25,
  readChunks,
  readManifest,
  readVectors,
  writeBm25,
  writeChunks,
  writeManifest,
  writeVectors,
} from '@/common/knowledge/store';

describe('knowledge store', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'kb-store-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null when the store does not exist', async () => {
    expect(await readManifest(path.join(dir, 'nope'))).toBeNull();
    expect(await readChunks(path.join(dir, 'nope'))).toEqual([]);
    expect(await readVectors(path.join(dir, 'nope'))).toBeNull();
  });

  it('round-trips the manifest', async () => {
    const manifest: KnowledgeManifest = createEmptyManifest('proj-1');
    manifest.embedding = { model: 'text-embedding-3-small', dim: 4 };
    manifest.sources.push({
      id: 'abc123',
      fileName: 'notes.md',
      contentHash: 'sha256:deadbeef',
      byteSize: 42,
      status: 'ready',
      chunkCount: 2,
      vectorCount: 2,
      addedAt: 1700000000000,
      error: null,
    });
    await writeManifest(dir, manifest);
    expect(await readManifest(dir)).toEqual(manifest);
  });

  it('round-trips chunks and bm25 index', async () => {
    const chunks: KnowledgeChunk[] = [
      { chunkId: 'abc123#0', sourceId: 'abc123', chunkIndex: 0, text: 'hello world', hasVector: false },
      { chunkId: 'abc123#1', sourceId: 'abc123', chunkIndex: 1, text: 'goodbye', headingPath: 'A > B', hasVector: true },
    ];
    await writeChunks(dir, chunks);
    expect(await readChunks(dir)).toEqual(chunks);

    const bm25 = { totalDocs: 2, avgDocLen: 1.5, docLens: { 'abc123#0': 2, 'abc123#1': 1 }, postings: { hello: [['abc123#0', 1]] } };
    await writeBm25(dir, bm25 as never);
    expect(await readBm25(dir)).toEqual(bm25);
  });

  it('round-trips vectors as Float32 rows keyed by chunkId', async () => {
    const rows: Array<[string, Float32Array]> = [
      ['abc123#0', new Float32Array([0.1, 0.2, 0.3, 0.4])],
      ['abc123#1', new Float32Array([1, 0, 0, 0])],
    ];
    await writeVectors(dir, 4, rows);
    const loaded = await readVectors(dir);
    expect(loaded).not.toBeNull();
    expect(loaded!.dim).toBe(4);
    expect([...loaded!.rows.keys()]).toEqual(['abc123#0', 'abc123#1']);
    expect(Array.from(loaded!.rows.get('abc123#0')!)).toEqual([0.10000000149011612, 0.20000000298023224, 0.30000001192092896, 0.4000000059604645]);
  });
});
