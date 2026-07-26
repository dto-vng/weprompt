/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Read-side of the knowledge base: load a project store, run hybrid
// BM25 + cosine retrieval fused with RRF, and format hits as MCP tool text.
// Node-side (fs via store.ts) — used by the knowledge MCP subprocess.

import { buildBm25Index, searchBm25, tokenize } from './bm25';
import { cosineSim } from './embedCore';
import { fuseRrf } from './rrf';
import { readBm25, readChunks, readManifest, readVectors, type KnowledgeVectors } from './store';
import type { Bm25Index, KnowledgeChunk, KnowledgeHit, KnowledgeManifest } from './types';

const CANDIDATES_PER_LIST = 30;
const DEFAULT_PAYLOAD_CAP = 12000;

export type KnowledgeStoreData = {
  manifest: KnowledgeManifest;
  chunks: Map<string, KnowledgeChunk>;
  bm25: Bm25Index;
  vectors: KnowledgeVectors | null;
  sourceNameById: Map<string, string>;
};

export const loadStore = async (storeDir: string): Promise<KnowledgeStoreData> => {
  const manifest = await readManifest(storeDir);
  if (!manifest || manifest.schemaVersion !== 1) {
    throw new Error(`Knowledge store missing or unsupported at ${storeDir}`);
  }
  const chunkList = await readChunks(storeDir);
  let bm25 = (await readBm25(storeDir)) ?? { totalDocs: 0, avgDocLen: 0, docLens: {}, postings: {} };
  if (bm25.totalDocs !== chunkList.length) {
    // chunks.json and bm25.json are written independently (see store.ts), so a
    // load that races a concurrent re-index can pair chunks from one
    // generation with a bm25 index built for another (or a stale one from
    // before the newest write lands). Rebuilding from the chunks we just read
    // guarantees a self-consistent view; cheap at this scale.
    bm25 = buildBm25Index(chunkList);
  }
  const vectors = await readVectors(storeDir);
  return {
    manifest,
    chunks: new Map(chunkList.map((c) => [c.chunkId, c])),
    bm25,
    vectors,
    sourceNameById: new Map(manifest.sources.map((s) => [s.id, s.fileName])),
  };
};

export type SearchOptions = {
  maxResults: number;
  /** Embeds the query; omit (or let it reject) for BM25-only. */
  embed?: (query: string) => Promise<number[]>;
};

export const searchKnowledge = async (
  store: KnowledgeStoreData,
  query: string,
  options: SearchOptions
): Promise<KnowledgeHit[]> => {
  const queryTokens = tokenize(query);
  // No lexical signal at all (blank, or punctuation/emoji-only) — nothing for
  // BM25 to match, and not worth firing a real (up to DEFAULT_TIMEOUT_MS) embed
  // call over. Short-circuit before either retrieval path runs.
  if (queryTokens.length === 0) return [];

  const bm25List = searchBm25(store.bm25, queryTokens, CANDIDATES_PER_LIST);

  let semanticList: Array<{ chunkId: string }> = [];
  const vectors = store.vectors;
  if (options.embed && vectors && vectors.rows.size > 0) {
    try {
      const queryVector = await options.embed(query);
      if (queryVector.length !== vectors.dim) {
        // The embed config has drifted from whatever the store was actually
        // indexed with. cosineSim degrades silently to 0 for every row in
        // that case, which would fill the semantic list with meaningless
        // zero-score "ties" whose RRF rank contributions can still outrank
        // genuine BM25 hits. Treat it the same as an embed failure so the
        // query degrades to BM25-only instead.
        throw new Error('Embedding dimension does not match the knowledge store.');
      }
      semanticList = [...vectors.rows.entries()]
        .map(([chunkId, vec]) => ({ chunkId, score: cosineSim(queryVector, vec) }))
        .toSorted((a, b) => b.score - a.score)
        .slice(0, CANDIDATES_PER_LIST);
    } catch {
      semanticList = []; // degrade cleanly to BM25-only (includes dimension mismatch above)
    }
  }

  return fuseRrf([bm25List, semanticList], options.maxResults)
    .map(({ chunkId, score }): KnowledgeHit | null => {
      const chunk = store.chunks.get(chunkId);
      if (!chunk) return null;
      return {
        sourceId: chunk.sourceId,
        sourceName: store.sourceNameById.get(chunk.sourceId) ?? chunk.sourceId,
        chunkIndex: chunk.chunkIndex,
        text: chunk.text,
        score,
        headingPath: chunk.headingPath,
      };
    })
    .filter((hit): hit is KnowledgeHit => hit !== null);
};

export const formatHitsAsText = (
  query: string,
  hits: KnowledgeHit[],
  options?: { payloadCapChars?: number }
): string => {
  if (hits.length === 0) {
    return `No relevant passages found in the project knowledge base for "${query}".`;
  }
  const cap = options?.payloadCapChars ?? DEFAULT_PAYLOAD_CAP;
  const parts: string[] = [`Found ${hits.length} passage(s) in the project knowledge base for "${query}":`];
  let used = parts[0].length;
  let rendered = 0;
  for (const [i, hit] of hits.entries()) {
    const header = hit.headingPath
      ? `[${i + 1}] ${hit.sourceName} — ${hit.headingPath}`
      : `[${i + 1}] ${hit.sourceName}`;
    const block = `\n\n${header}\n${hit.text}`;
    if (used + block.length > cap && rendered > 0) break;
    parts.push(block);
    used += block.length;
    rendered++;
  }
  if (rendered < hits.length) {
    parts.push(`\n\n(${hits.length - rendered} more passage(s) omitted.)`);
  }
  return parts.join('');
};
