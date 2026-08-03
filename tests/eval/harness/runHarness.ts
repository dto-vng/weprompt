/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Orchestration: build a real store from the fixture, then run every golden
// question through the shipping searchKnowledge() twice — once BM25-only, once
// hybrid — and collect per-question detail.
//
// One store serves both modes. searchKnowledge only consults vectors when an
// embed function is passed, so withholding it reproduces the BM25-only
// deployment exactly, without rebuilding the index.

import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildBm25Index } from '@/common/knowledge/bm25';
import { embedTexts } from '@/common/knowledge/embedCore';
import { loadStore, searchKnowledge, type KnowledgeStoreData } from '@/common/knowledge/searchCore';
import { buildEvalStore } from './buildStore';
import { createEmbedCache, type EmbedCache } from './embedCache';
import { resolveEvalEmbedConfig } from './embedConfig';
import { loadFixture, nfc, queryTextOf } from './fixture';
import { answerRankOf, computeMetrics, sourceRankOf } from './metrics';
import type { EmbeddingInfo, EvalKnobs, EvalRun, GoldenQuestion, HitRecord, ModeResult, QuestionResult } from './types';

export type RunEvaluationOptions = {
  knobs: EvalKnobs;
  /** false runs BM25-only and never touches the network. */
  hybrid: boolean;
  env?: NodeJS.ProcessEnv;
  /** Overrides the embedding cache location; tests point this at a temp dir. */
  cacheDir?: string;
};

const containsHint = (text: string, hint: string | undefined): boolean =>
  hint === undefined ? false : nfc(text).toLowerCase().includes(nfc(hint).toLowerCase());

const runQuestions = async (
  store: KnowledgeStoreData,
  questions: GoldenQuestion[],
  topK: number,
  embed?: (query: string) => Promise<number[]>
): Promise<QuestionResult[]> => {
  const results: QuestionResult[] = [];
  // Sequential on purpose. Each hybrid question embeds its query, so fanning the
  // whole set out at once would both risk provider rate limits and race the
  // embedding cache, where two concurrent misses for the same text each fetch.
  for (const question of questions) {
    const hits = await searchKnowledge(store, queryTextOf(question), { maxResults: topK, embed });
    const records: HitRecord[] = hits.map((hit) => ({
      sourceName: hit.sourceName,
      chunkIndex: hit.chunkIndex,
      score: hit.score,
      headingPath: hit.headingPath,
      containsHint: containsHint(hit.text, question.answerHint),
    }));
    results.push({
      id: question.id,
      kind: question.kind,
      question: question.question,
      expectedSources: question.expectedSources,
      answerHint: question.answerHint,
      hits: records,
      sourceRank: sourceRankOf(records, question.expectedSources),
      answerRank: answerRankOf(records, question.expectedSources),
    });
  }
  return results;
};

/**
 * The store as the semantic half alone sees it.
 *
 * `searchKnowledge` does not expose its two retrieval lists separately, so the
 * only way to isolate the semantic one WITHOUT reimplementing ranking here — the
 * thing this harness exists not to do — is to make the other list empty.
 * `searchBm25` returns `[]` the moment `totalDocs === 0`, so an index built from
 * no chunks silently removes the lexical contribution and leaves RRF fusing a
 * single list, which is order-preserving. Cosine, the candidate cap and the
 * chunk mapping all remain the shipping code.
 *
 * Note the query still has to tokenise to something: `searchKnowledge`
 * short-circuits on an empty token list before either path runs, so this is not
 * a perfectly pure semantic probe for a query with no word characters. No golden
 * question is in that shape.
 */
const withoutLexicalHalf = (store: KnowledgeStoreData): KnowledgeStoreData => ({
  ...store,
  bm25: buildBm25Index([]),
});

/**
 * Re-score a deep ranking as if it had been cut at `topK`, keeping the true rank.
 *
 * Without this the vector row would not be comparable to the other two: a
 * passage found at rank 9 contributes 1/9 to MRR here but 0 in a mode truncated
 * at 6, so the diagnostic would look better purely for being measured deeper.
 */
const cappedAt = (result: QuestionResult, topK: number): QuestionResult => {
  const hits = result.hits.slice(0, topK);
  return {
    ...result,
    hits,
    sourceRank: sourceRankOf(hits, result.expectedSources),
    answerRank: answerRankOf(hits, result.expectedSources),
    deepSourceRank: result.sourceRank,
  };
};

export const runEvaluation = async (options: RunEvaluationOptions): Promise<EvalRun> => {
  const { knobs } = options;
  const fixture = loadFixture();
  const env = options.env ?? process.env;

  let cache: EmbedCache | null = null;
  let embeddingModel: string | null = null;
  let embedSource: EmbeddingInfo['source'] | null = null;
  let hybridSkippedReason: string | null = null;

  if (options.hybrid) {
    const resolved = await resolveEvalEmbedConfig(env);
    const config = resolved.config;
    if (!config) {
      hybridSkippedReason = resolved.reason;
    } else {
      embeddingModel = config.model;
      embedSource = resolved.source ?? 'env';
      cache = await createEmbedCache(config.model, (texts) => embedTexts(texts, config), options.cacheDir);
    }
  } else {
    hybridSkippedReason = 'hybrid disabled for this run (--bm25-only)';
  }

  const storeDir = await fs.mkdtemp(path.join(tmpdir(), 'kb-eval-'));
  try {
    let built;
    try {
      built = await buildEvalStore({
        storeDir,
        documents: fixture.documents,
        knobs,
        embedChunks: cache && embeddingModel ? (texts) => cache.embedMany(texts) : undefined,
        embeddingModel: embeddingModel ?? undefined,
      });
    } catch (error) {
      // Embedding the corpus is the one step that talks to a network. Losing it
      // must degrade to a BM25-only report, not abort the whole run — the BM25
      // half is the part that gates regressions.
      if (!cache) throw error;
      hybridSkippedReason = `embedding the corpus failed: ${error instanceof Error ? error.message : String(error)}`;
      cache = null;
      embeddingModel = null;
      built = await buildEvalStore({ storeDir, documents: fixture.documents, knobs });
    } finally {
      await cache?.flush();
    }

    const store = await loadStore(storeDir);
    const modes: ModeResult[] = [];

    const bm25Questions = await runQuestions(store, fixture.questions, knobs.topK);
    modes.push({ mode: 'bm25', metrics: computeMetrics(bm25Questions, knobs.topK), questions: bm25Questions });

    let embedding: EmbeddingInfo | null = null;
    if (cache && embeddingModel && built.vectorCount > 0) {
      const activeCache = cache;
      const hybridQuestions = await runQuestions(store, fixture.questions, knobs.topK, (query) =>
        activeCache.embedOne(query)
      );
      modes.push({
        mode: 'hybrid',
        metrics: computeMetrics(hybridQuestions, knobs.topK),
        questions: hybridQuestions,
      });

      // Semantic-only, run to full corpus depth so a miss reports where the
      // passage actually sat rather than repeating "not in the top k". Costs no
      // embeddings: every query vector is already in the cache from the hybrid
      // pass above.
      const deep = await runQuestions(
        withoutLexicalHalf(store),
        fixture.questions,
        Math.max(knobs.topK, built.chunkCount),
        (query) => activeCache.embedOne(query)
      );
      const vectorQuestions = deep.map((question) => cappedAt(question, knobs.topK));
      modes.push({
        mode: 'vector',
        metrics: computeMetrics(vectorQuestions, knobs.topK),
        questions: vectorQuestions,
      });

      await activeCache.flush();
      embedding = {
        model: embeddingModel,
        dim: built.embeddingDim ?? 0,
        vectorCount: built.vectorCount,
        chunkCount: built.chunkCount,
        source: embedSource ?? 'env',
        cacheHits: activeCache.hits,
        cacheMisses: activeCache.misses,
      };
    }

    return {
      knobs,
      corpus: {
        documentCount: fixture.documents.length,
        ocrDocumentCount: fixture.documents.filter((doc) => doc.provenance === 'ocr').length,
        chunkCount: built.chunkCount,
      },
      embedding,
      hybridSkippedReason: embedding ? null : (hybridSkippedReason ?? 'no embedding model available'),
      modes,
    };
  } finally {
    await fs.rm(storeDir, { recursive: true, force: true });
  }
};
