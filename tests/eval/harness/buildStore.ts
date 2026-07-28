/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Builds a real on-disk knowledge store from the fixture corpus, using the
// shipping chunker, BM25 builder and store writers. Retrieval is then measured
// through loadStore() + searchKnowledge() — the same code the knowledge MCP
// subprocess runs.
//
// What this deliberately does NOT reuse is projectKnowledgeService's ingestion
// bookkeeping (file snapshots, content-hash dedupe, the per-project queue).
// Two reasons: that layer calls chunkMarkdown() with no options, so routing
// through it would make chunk size and overlap unsweepable — the main thing the
// harness exists to vary; and it is Stream A's file. Its behaviour is covered by
// projectKnowledgeService.test.ts. Nothing below affects ranking: retrieval
// reads manifest.json and index/*, which is exactly what this writes.

import { buildBm25Index } from '@/common/knowledge/bm25';
import { chunkMarkdown } from '@/common/knowledge/chunker';
import { createEmptyManifest, writeBm25, writeChunks, writeManifest, writeVectors } from '@/common/knowledge/store';
import type { KnowledgeChunk, KnowledgeManifestSource } from '@/common/knowledge/types';
import type { EvalDocument, EvalKnobs } from './types';

const sourceIdOf = (fileName: string): string => fileName.replace(/\.md$/, '');

export type BuiltStore = {
  chunkCount: number;
  /** Rows actually written to vectors.bin; 0 for a BM25-only store. */
  vectorCount: number;
  embeddingDim: number | null;
};

export type BuildStoreParams = {
  storeDir: string;
  documents: EvalDocument[];
  knobs: EvalKnobs;
  /** Omit for a BM25-only store. Must return one vector per input text. */
  embedChunks?: (texts: string[]) => Promise<number[][]>;
  embeddingModel?: string;
};

export const buildEvalStore = async (params: BuildStoreParams): Promise<BuiltStore> => {
  const { storeDir, documents, knobs } = params;
  const manifest = createEmptyManifest('kb-eval');
  const chunks: KnowledgeChunk[] = [];

  for (const doc of documents) {
    const sourceId = sourceIdOf(doc.fileName);
    // Chunk the bytes as stored: an NFD document must reach the chunker and the
    // tokenizer decomposed, or the fixture's whole point is lost.
    const raw = chunkMarkdown(doc.text, { maxChars: knobs.chunkChars, overlapChars: knobs.overlapChars });
    raw.forEach((chunk, index) => {
      chunks.push({
        chunkId: `${sourceId}#${index}`,
        sourceId,
        chunkIndex: index,
        text: chunk.text,
        headingPath: chunk.headingPath,
        hasVector: false,
      });
    });
    const source: KnowledgeManifestSource = {
      id: sourceId,
      fileName: doc.fileName,
      contentHash: `sha256:eval-${sourceId}`,
      byteSize: Buffer.byteLength(doc.text, 'utf8'),
      status: 'ready',
      chunkCount: raw.length,
      vectorCount: 0,
      addedAt: 0,
      error: null,
    };
    manifest.sources.push(source);
  }

  let vectorCount = 0;
  let embeddingDim: number | null = null;
  if (params.embedChunks && params.embeddingModel && chunks.length > 0) {
    const vectors = await params.embedChunks(chunks.map((chunk) => chunk.text));
    const dim = vectors[0]?.length ?? 0;
    if (dim === 0) throw new Error('Embedding returned no dimensions for the fixture corpus.');
    if (vectors.some((vector) => vector.length !== dim)) {
      throw new Error('Embedding returned inconsistent dimensions across the fixture corpus.');
    }
    await writeVectors(
      storeDir,
      dim,
      chunks.map((chunk, i): [string, Float32Array] => [chunk.chunkId, Float32Array.from(vectors[i])])
    );
    for (const chunk of chunks) chunk.hasVector = true;
    for (const source of manifest.sources) source.vectorCount = source.chunkCount;
    manifest.embedding = { model: params.embeddingModel, dim };
    vectorCount = chunks.length;
    embeddingDim = dim;
  }

  await writeChunks(storeDir, chunks);
  await writeBm25(storeDir, buildBm25Index(chunks));
  await writeManifest(storeDir, manifest);

  return { chunkCount: chunks.length, vectorCount, embeddingDim };
};
