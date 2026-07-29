/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// CI half of the knowledge-base retrieval evaluation (tests/eval).
//
// The full harness (`bun run eval:kb`) needs an embedding provider and is not
// part of the default suite. Its BM25-only path needs neither network nor
// randomness, so it runs here and guards the two things most likely to break
// quietly: Vietnamese tokenisation (the NFD bug) and RRF fusion. A regression in
// either shows up as a metric below the committed baseline rather than as a
// vague report of worse answers weeks later.

import { createServer, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tokenize } from '@/common/knowledge/bm25';
import { chunkMarkdown } from '@/common/knowledge/chunker';
import { compareToBaseline, readBaseline, type Baseline } from '../eval/harness/baseline';
import { loadFixture, validateFixture } from '../eval/harness/fixture';
import { runEvaluation } from '../eval/harness/runHarness';
import type { EvalFixture, EvalRun, ModeResult } from '../eval/harness/types';

const BASELINE_KNOBS = { chunkChars: 3200, overlapChars: 400, topK: 6 };

/** What tokenize() would produce without its NFC step — i.e. the NFD bug. */
const unnormalised = (text: string): string[] => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

const modeOf = (run: EvalRun, mode: 'bm25' | 'hybrid'): ModeResult => {
  const found = run.modes.find((m) => m.mode === mode);
  if (!found) throw new Error(`run has no ${mode} mode`);
  return found;
};

describe('knowledge-base evaluation fixture', () => {
  it('loads with every answer hint still present in the document it points at', () => {
    const fixture = loadFixture();
    expect(fixture.questions.length).toBeGreaterThanOrEqual(15);
    expect(fixture.documents.length).toBeGreaterThan(0);
  });

  it('rejects a fixture whose answer hint has drifted away from its document', () => {
    const fixture = loadFixture();
    const broken: EvalFixture = {
      ...fixture,
      questions: fixture.questions.map((question, i) =>
        i === fixture.questions.findIndex((q) => q.answerHint)
          ? { ...question, answerHint: 'this sentence is nowhere in the corpus' }
          : question
      ),
    };
    expect(() => validateFixture(broken)).toThrow(/answerHint is not present/);
  });

  it('rejects a fixture that no longer stores any document in decomposed form', () => {
    const fixture = loadFixture();
    const allComposed: EvalFixture = {
      ...fixture,
      documents: fixture.documents.map((doc) => ({ ...doc, text: doc.text.normalize('NFC') })),
    };
    expect(() => validateFixture(allComposed)).toThrow(/stored NFD/);
  });

  it('ships at least one document in each normalisation form', () => {
    const fixture = loadFixture();
    expect(fixture.nfdFileNames.length).toBeGreaterThan(0);
    expect(fixture.nfdFileNames.length).toBeLessThan(fixture.documents.length);
  });

  it('keeps the decomposed document load-bearing: its tokens collapse without normalisation', () => {
    // Proves the NFD fixture still discriminates the bug it exists for, rather
    // than merely being stored decomposed. Swapping it for ASCII-only content
    // would leave every other check passing while the coverage silently went.
    const fixture = loadFixture();
    const decomposed = fixture.documents.filter((doc) => fixture.nfdFileNames.includes(doc.fileName));
    for (const doc of decomposed) {
      // Dropping the NFC step shatters each accented word at every combining
      // mark, so the same text yields far more, far shorter tokens.
      expect(unnormalised(doc.text).length).toBeGreaterThan(tokenize(doc.text).length * 1.2);
    }
  });
});

describe('harness knobs track the shipping defaults', () => {
  it('measures the same chunk size and overlap the chunker uses by default', () => {
    // If someone retunes chunkMarkdown's defaults, the harness would keep
    // measuring the old values and report a false "no change".
    const fixture = loadFixture();
    const sample = fixture.documents.reduce((longest, doc) => (doc.text.length > longest.text.length ? doc : longest));
    expect(chunkMarkdown(sample.text)).toEqual(
      chunkMarkdown(sample.text, { maxChars: BASELINE_KNOBS.chunkChars, overlapChars: BASELINE_KNOBS.overlapChars })
    );
  });
});

describe('BM25-only retrieval against the committed baseline', () => {
  let run: EvalRun;
  let baseline: Baseline | null;

  beforeAll(async () => {
    run = await runEvaluation({ knobs: BASELINE_KNOBS, hybrid: false });
    baseline = await readBaseline();
  });

  it('has a committed baseline recorded at the shipping knobs', () => {
    expect(baseline).not.toBeNull();
    expect(baseline?.knobs).toEqual(BASELINE_KNOBS);
  });

  it('does not regress on any aggregate metric or previously retrieved source', () => {
    const comparison = compareToBaseline(run, baseline);
    expect(comparison.failures).toEqual([]);
    expect(comparison.compared).toBe(true);
  });

  it('finds the decomposed Vietnamese source from a composed query, and the reverse', () => {
    // The NFD normalisation bug this fixture exists for: decomposed diacritics
    // shattered tokens and silently destroyed recall in both directions.
    const nfdQuestions = modeOf(run, 'bm25').questions.filter(
      (question) => question.kind === 'nfd-corpus' || question.kind === 'nfd-query'
    );
    expect(nfdQuestions.length).toBeGreaterThanOrEqual(2);
    expect(nfdQuestions.filter((question) => question.sourceRank === null)).toEqual([]);
  });

  it('returns nothing for a question whose every token is absent from the corpus', () => {
    const question = modeOf(run, 'bm25').questions.find((q) => q.id === 'unanswerable-no-overlap');
    expect(question?.hits).toEqual([]);
  });

  it('runs BM25-only without producing embedding information', () => {
    expect(run.embedding).toBeNull();
    expect(run.modes.map((mode) => mode.mode)).toEqual(['bm25']);
  });

  it('reports a failure when a question stops retrieving its expected source', () => {
    // Without this, a comparison that could never fail would read exactly like a
    // passing gate. Degrade one question and confirm the gate notices.
    const degraded: EvalRun = {
      ...run,
      modes: run.modes.map((mode) => ({
        ...mode,
        questions: mode.questions.map((question) =>
          question.id === 'vn-per-diem-danang'
            ? { ...question, hits: [], sourceRank: null, answerRank: null }
            : question
        ),
      })),
    };
    const comparison = compareToBaseline(degraded, baseline);
    expect(comparison.failures.join('\n')).toMatch(/vn-per-diem-danang/);
  });

  it('skips the comparison instead of failing it when the knobs differ from the baseline', () => {
    // A sweep is an experiment, not a regression.
    const swept: EvalRun = { ...run, knobs: { ...run.knobs, overlapChars: 0 } };
    const comparison = compareToBaseline(swept, baseline);
    expect(comparison.compared).toBe(false);
    expect(comparison.failures).toEqual([]);
  });
});

describe('hybrid retrieval wiring', () => {
  // A stub /embeddings endpoint. The vectors are deterministic nonsense, so the
  // rankings they produce are meaningless and are not asserted on — this covers
  // the plumbing (config -> cache -> vectors.bin -> the semantic branch of
  // searchKnowledge), which would otherwise be code no test ever executes.
  let server: Server;
  let baseUrl: string;
  let cacheDir: string;
  let requestCount = 0;

  const DIM = 8;
  const stubVector = (text: string): number[] =>
    Array.from({ length: DIM }, (_, i) => {
      const digest = createHash('sha256').update(`${i}:${text}`).digest();
      return digest[0] / 255;
    });

  beforeAll(async () => {
    cacheDir = mkdtempSync(path.join(tmpdir(), 'kb-eval-cache-'));
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString('utf8');
      });
      req.on('end', () => {
        requestCount++;
        const input = (JSON.parse(body) as { input: string[] }).input;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: input.map((text, index) => ({ index, embedding: stubVector(text) })) }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('stub server has no port');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    rmSync(cacheDir, { recursive: true, force: true });
  });

  const runHybrid = (): Promise<EvalRun> =>
    runEvaluation({
      knobs: BASELINE_KNOBS,
      hybrid: true,
      cacheDir,
      env: {
        KB_EVAL_EMBED_BASE_URL: baseUrl,
        KB_EVAL_EMBED_API_KEY: 'stub-key-not-a-secret',
        KB_EVAL_EMBED_MODEL: 'stub-embed-8d',
      },
    });

  it('vectorises every passage and reports the model and dimension it used', async () => {
    const run = await runHybrid();
    expect(run.embedding).toMatchObject({ model: 'stub-embed-8d', dim: DIM, source: 'env' });
    expect(run.embedding?.vectorCount).toBe(run.corpus.chunkCount);
  });

  it('produces a hybrid mode alongside the BM25 mode', async () => {
    const run = await runHybrid();
    expect(run.modes.map((mode) => mode.mode)).toEqual(['bm25', 'hybrid']);
    expect(run.hybridSkippedReason).toBeNull();
  });

  it('serves a repeat run from the embedding cache instead of re-embedding', async () => {
    await runHybrid();
    const callsBefore = requestCount;
    const run = await runHybrid();
    expect(requestCount).toBe(callsBefore);
    expect(run.embedding?.cacheMisses).toBe(0);
  });

  it('degrades to a BM25-only report when the embedding endpoint is unreachable', async () => {
    const run = await runEvaluation({
      knobs: BASELINE_KNOBS,
      hybrid: true,
      cacheDir: mkdtempSync(path.join(tmpdir(), 'kb-eval-cold-')),
      env: {
        KB_EVAL_EMBED_BASE_URL: 'http://127.0.0.1:1/v1',
        KB_EVAL_EMBED_API_KEY: 'stub-key-not-a-secret',
        KB_EVAL_EMBED_MODEL: 'stub-embed-8d',
      },
    });
    expect(run.modes.map((mode) => mode.mode)).toEqual(['bm25']);
    expect(run.hybridSkippedReason).toMatch(/embedding the corpus failed/);
  });
});
