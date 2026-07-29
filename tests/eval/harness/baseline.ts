/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// The committed baseline turns "did that change help?" into a diff instead of a
// memory test.
//
// Two things it deliberately does not do. It does not assert fixed rankings —
// ranks move for legitimate reasons and a fixture that pins them becomes noise
// nobody trusts. And it does not compare across knob settings: a --chunk sweep
// is an experiment, not a regression, so the comparison is skipped outright
// rather than reported as a failure.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { foundIds } from './metrics';
import type { EvalKnobs, EvalMode, EvalRun, ModeMetrics, ModeResult } from './types';

export const BASELINE_FILE = path.resolve(__dirname, '..', 'baseline.json');

/** Float slack: metrics are rounded to 4dp, so anything at 1e-9 is noise, not a change. */
const EPSILON = 1e-9;

export type BaselineMode = {
  metrics: ModeMetrics;
  /** Questions whose expected source was retrieved at all. */
  foundIds: string[];
  /** Unanswerable questions that correctly returned nothing. */
  zeroHitIds: string[];
  /** Hybrid only: the vector space these numbers came from. */
  embeddingModel?: string;
};

export type Baseline = {
  $comment?: string;
  generatedOn?: string;
  knobs: EvalKnobs;
  corpus: { documentCount: number; chunkCount: number };
  bm25: BaselineMode;
  hybrid: BaselineMode | null;
};

const zeroHitIds = (mode: ModeResult): string[] =>
  mode.questions
    .filter((question) => question.kind === 'unanswerable' && question.hits.length === 0)
    .map((question) => question.id)
    .toSorted();

const modeOf = (run: EvalRun, mode: EvalMode): ModeResult | undefined => run.modes.find((m) => m.mode === mode);

const toBaselineMode = (mode: ModeResult, embeddingModel?: string): BaselineMode => ({
  metrics: mode.metrics,
  foundIds: foundIds(mode.questions),
  zeroHitIds: zeroHitIds(mode),
  ...(embeddingModel ? { embeddingModel } : {}),
});

export const toBaseline = (run: EvalRun, generatedOn: string): Baseline => {
  const bm25 = modeOf(run, 'bm25');
  if (!bm25) throw new Error('Cannot write a baseline from a run with no BM25 results.');
  const hybrid = modeOf(run, 'hybrid');
  return {
    $comment:
      'Committed baseline for the knowledge-base retrieval harness. Regenerate with `bun run eval:kb --update-baseline`. The hybrid block is pinned to one embedding model and is only compared when the current run uses the same one.',
    generatedOn,
    knobs: run.knobs,
    corpus: run.corpus,
    bm25: toBaselineMode(bm25),
    hybrid: hybrid ? toBaselineMode(hybrid, run.embedding?.model) : null,
  };
};

export const readBaseline = async (): Promise<Baseline | null> => {
  try {
    return JSON.parse(await fs.readFile(BASELINE_FILE, 'utf8')) as Baseline;
  } catch {
    return null;
  }
};

export const writeBaseline = async (baseline: Baseline): Promise<void> => {
  await fs.writeFile(BASELINE_FILE, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
};

export type ComparisonResult = {
  compared: boolean;
  /** Regressions. Empty means the gate passes. */
  failures: string[];
  /** Things worth saying that are not failures: improvements, skipped comparisons. */
  notes: string[];
};

const sameKnobs = (a: EvalKnobs, b: EvalKnobs): boolean =>
  a.chunkChars === b.chunkChars && a.overlapChars === b.overlapChars && a.topK === b.topK;

const compareMode = (label: string, current: ModeResult, baseline: BaselineMode, out: ComparisonResult): void => {
  const check = (metric: string, currentValue: number, baselineValue: number): void => {
    if (currentValue < baselineValue - EPSILON) {
      out.failures.push(
        `${label} ${metric} regressed: ${currentValue.toFixed(4)} < baseline ${baselineValue.toFixed(4)}`
      );
    } else if (currentValue > baselineValue + EPSILON) {
      out.notes.push(`${label} ${metric} improved: ${baselineValue.toFixed(4)} -> ${currentValue.toFixed(4)}`);
    }
  };

  for (const [k, baselineValue] of Object.entries(baseline.metrics.recallAt)) {
    const currentValue = current.metrics.recallAt[k];
    if (currentValue === undefined) {
      out.notes.push(`${label} recall@${k} not measured in this run (topK too low to compare)`);
      continue;
    }
    check(`recall@${k}`, currentValue, baselineValue);
  }
  for (const [k, baselineValue] of Object.entries(baseline.metrics.answerRecallAt)) {
    const currentValue = current.metrics.answerRecallAt[k];
    if (currentValue === undefined) continue;
    check(`answerRecall@${k}`, currentValue, baselineValue);
  }
  check('MRR', current.metrics.mrr, baseline.metrics.mrr);
  check('answerMRR', current.metrics.answerMrr, baseline.metrics.answerMrr);

  const currentFound = new Set(foundIds(current.questions));
  const lost = baseline.foundIds.filter((id) => !currentFound.has(id));
  if (lost.length > 0) {
    out.failures.push(`${label} stopped retrieving the expected source for: ${lost.join(', ')}`);
  }

  const currentZeroHit = new Set(zeroHitIds(current));
  const lostAbstentions = baseline.zeroHitIds.filter((id) => !currentZeroHit.has(id));
  if (lostAbstentions.length > 0) {
    out.failures.push(
      `${label} now returns passages for unanswerable question(s) that previously returned none: ${lostAbstentions.join(', ')}`
    );
  }
};

export const compareToBaseline = (run: EvalRun, baseline: Baseline | null): ComparisonResult => {
  const out: ComparisonResult = { compared: false, failures: [], notes: [] };
  if (!baseline) {
    out.notes.push('no committed baseline found — run with --update-baseline to create one');
    return out;
  }
  if (!sameKnobs(run.knobs, baseline.knobs)) {
    out.notes.push(
      `knobs differ from the baseline (chunk=${baseline.knobs.chunkChars} overlap=${baseline.knobs.overlapChars} topK=${baseline.knobs.topK}) — this is a sweep, not a regression check`
    );
    return out;
  }
  if (run.corpus.chunkCount !== baseline.corpus.chunkCount) {
    out.notes.push(
      `corpus changed: ${baseline.corpus.chunkCount} -> ${run.corpus.chunkCount} chunks. Metrics are not comparable across fixture edits; regenerate the baseline once the change is intended.`
    );
    return out;
  }

  out.compared = true;
  const bm25 = modeOf(run, 'bm25');
  if (bm25) compareMode('BM25-only', bm25, baseline.bm25, out);

  const hybrid = modeOf(run, 'hybrid');
  if (!baseline.hybrid) {
    out.notes.push('baseline has no hybrid block — the semantic half is unguarded');
  } else if (!hybrid) {
    out.notes.push('hybrid not run, so the baseline hybrid numbers were not checked');
  } else if (baseline.hybrid.embeddingModel !== run.embedding?.model) {
    out.notes.push(
      `hybrid baseline was recorded with "${baseline.hybrid.embeddingModel}" but this run used "${run.embedding?.model}" — different vector space, not compared`
    );
  } else {
    compareMode('Hybrid', hybrid, baseline.hybrid, out);
  }
  return out;
};
