/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Bm25Index, KnowledgeChunk, KnowledgeManifest } from '@/common/knowledge/types';
import {
  createEmptyManifest,
  readBm25,
  readChunks,
  readManifest,
  readVectors,
  storePaths,
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
      {
        chunkId: 'abc123#1',
        sourceId: 'abc123',
        chunkIndex: 1,
        text: 'goodbye',
        headingPath: 'A > B',
        hasVector: true,
      },
    ];
    await writeChunks(dir, chunks);
    expect(await readChunks(dir)).toEqual(chunks);

    const bm25: Bm25Index = {
      totalDocs: 2,
      avgDocLen: 1.5,
      docLens: { 'abc123#0': 2, 'abc123#1': 1 },
      postings: { hello: [['abc123#0', 1]] },
    };
    await writeBm25(dir, bm25);
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
    expect(Array.from(loaded!.rows.get('abc123#0')!)).toEqual([
      0.10000000149011612, 0.20000000298023224, 0.30000001192092896, 0.4000000059604645,
    ]);
  });

  it('returns null when vectors.bin is missing but the meta file exists', async () => {
    const rows: Array<[string, Float32Array]> = [['abc123#0', new Float32Array([0.1, 0.2, 0.3, 0.4])]];
    await writeVectors(dir, 4, rows);
    rmSync(storePaths(dir).vectorsFile);
    expect(await readVectors(dir)).toBeNull();
  });

  it('returns null when vectors.bin is shorter than the meta declares (byte-length mismatch)', async () => {
    const rows: Array<[string, Float32Array]> = [['abc123#0', new Float32Array([0.1, 0.2, 0.3, 0.4])]];
    await writeVectors(dir, 4, rows);
    truncateSync(storePaths(dir).vectorsFile, 4); // expected length is 1 row * 4 dims * 4 bytes = 16
    expect(await readVectors(dir)).toBeNull();
  });

  it('returns null when vectors.bin content no longer matches the meta checksum (torn pair)', async () => {
    const rows: Array<[string, Float32Array]> = [['abc123#0', new Float32Array([0.1, 0.2, 0.3, 0.4])]];
    await writeVectors(dir, 4, rows);
    const vectorsFile = storePaths(dir).vectorsFile;
    const bytes = readFileSync(vectorsFile);
    bytes[0] = bytes[0] ^ 0xff; // flip a byte in place — same byte length, different content
    writeFileSync(vectorsFile, bytes);
    expect(await readVectors(dir)).toBeNull();
  });

  // sourceId is interpolated straight into a path whose directory is removed
  // recursively when a source is dropped (removeSourceRows in
  // projectKnowledgeService), so a traversing id must be rejected before it
  // reaches the filesystem. Defense in depth: the native IPC schema already
  // rejects such ids, but main-process callers need not come through it.
  describe('sourceDir traversal guard', () => {
    it('resolves an ordinary sourceId inside the store', () => {
      expect(storePaths(dir).sourceDir('abc123')).toBe(path.join(dir, 'sources', 'abc123'));
    });

    it('rejects a sourceId that resolves outside the store, without touching anything there', async () => {
      // Sentinel directory OUTSIDE the store. `dir` and this sentinel are both
      // direct children of tmpdir(), so '../../<sentinel-basename>' resolves
      // from `<dir>/sources` straight to it — simulating a traversing sourceId.
      // Unguarded, removeSourceRows' recursive rm is what deletes the sentinel.
      const outsideDir = mkdtempSync(path.join(tmpdir(), 'kb-store-outside-'));
      const markerFile = path.join(outsideDir, 'do-not-delete.txt');
      writeFileSync(markerFile, 'must survive');
      const traversingId = path.join('..', '..', path.basename(outsideDir));

      try {
        // Same call shape as removeSourceRows: the rm runs only if sourceDir
        // hands back a path at all.
        await expect(async () =>
          rm(storePaths(dir).sourceDir(traversingId), { recursive: true, force: true })
        ).rejects.toThrow(/Invalid source id/);
        expect(existsSync(markerFile)).toBe(true);
      } finally {
        rmSync(outsideDir, { recursive: true, force: true });
      }
    });

    it('rejects an absolute sourceId', () => {
      expect(() => storePaths(dir).sourceDir(path.resolve(dir, '..', 'elsewhere'))).toThrow(/Invalid source id/);
    });

    it('rejects a sourceId that resolves to the sources directory itself', () => {
      expect(() => storePaths(dir).sourceDir('.')).toThrow(/Invalid source id/);
    });
  });
});
