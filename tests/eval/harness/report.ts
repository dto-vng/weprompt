/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Console rendering of an EvalRun.
//
// Aggregates say whether something regressed; the per-question detail says what.
// Both are printed, because a recall number on its own has never once been enough
// to act on.

import { RECALL_KS, isScored } from './metrics';
import type { ComparisonResult } from './baseline';
import type { EvalMode, EvalRun, ModeResult, QuestionResult } from './types';

const MODE_LABEL: Record<EvalMode, string> = { bm25: 'BM25-only', hybrid: 'Hybrid' };

const pct = (value: number | undefined): string => (value === undefined ? '   n/a' : value.toFixed(3).padStart(6));

const rankCell = (rank: number | null): string => (rank === null ? '-' : String(rank));

const metricsTable = (run: EvalRun): string[] => {
  const ks = RECALL_KS.filter((k) => k <= run.knobs.topK);
  const headers = [...ks.map((k) => `recall@${k}`), 'MRR', ...ks.map((k) => `answer@${k}`), 'answerMRR'];
  const lines = [
    '  which file was cited        |  which passage held the answer',
    `  ${'mode'.padEnd(12)}${headers.map((h) => h.padStart(11)).join('')}`,
  ];
  for (const mode of run.modes) {
    const cells = [
      ...ks.map((k) => pct(mode.metrics.recallAt[String(k)])),
      pct(mode.metrics.mrr),
      ...ks.map((k) => pct(mode.metrics.answerRecallAt[String(k)])),
      pct(mode.metrics.answerMrr),
    ];
    lines.push(`  ${MODE_LABEL[mode.mode].padEnd(12)}${cells.map((c) => c.padStart(11)).join('')}`);
  }
  return lines;
};

const perQuestionTable = (run: EvalRun): string[] => {
  const scored = run.modes[0].questions.filter(isScored);
  const byMode = new Map<EvalMode, Map<string, QuestionResult>>(
    run.modes.map((mode) => [mode.mode, new Map(mode.questions.map((q) => [q.id, q]))])
  );
  const modes = run.modes.map((mode) => mode.mode);

  const lines = [
    '',
    `  per-question rank of the expected source ("-" = not in top ${run.knobs.topK}; * = a returned passage held the answer text)`,
    `  ${'question'.padEnd(32)}${'kind'.padEnd(16)}${modes.map((m) => MODE_LABEL[m].padStart(11)).join('')}`,
  ];
  for (const question of scored) {
    const cells = modes.map((mode) => {
      const result = byMode.get(mode)?.get(question.id);
      if (!result) return 'n/a'.padStart(11);
      const marker = result.answerRank !== null ? '*' : ' ';
      return `${rankCell(result.sourceRank)}${marker}`.padStart(11);
    });
    lines.push(`  ${question.id.padEnd(32)}${question.kind.padEnd(16)}${cells.join('')}`);
  }
  return lines;
};

const failureDetail = (mode: ModeResult): string[] => {
  const misses = mode.questions.filter((question) => isScored(question) && question.sourceRank === null);
  const wrongPassage = mode.questions.filter(
    (question) =>
      isScored(question) && question.sourceRank !== null && question.answerHint && question.answerRank === null
  );
  if (misses.length === 0 && wrongPassage.length === 0) return [];

  const lines = ['', `  ${MODE_LABEL[mode.mode]} — what went wrong`];
  for (const question of misses) {
    const got =
      question.hits.length === 0
        ? 'nothing'
        : question.hits.map((hit) => `${hit.sourceName}#${hit.chunkIndex}`).join(', ');
    lines.push(`    [${question.id}] "${question.question}"`);
    lines.push(`        expected ${question.expectedSources.join(' | ')}`);
    lines.push(`        got      ${got}`);
  }
  for (const question of wrongPassage) {
    lines.push(
      `    [${question.id}] right file at rank ${question.sourceRank}, but no returned passage contained the answer`
    );
    lines.push(`        looking for ${JSON.stringify(question.answerHint)}`);
  }
  return lines;
};

const unanswerableSection = (run: EvalRun): string[] => {
  const ids = run.modes[0].questions.filter((question) => question.kind === 'unanswerable').map((q) => q.id);
  if (ids.length === 0) return [];
  const lines = [
    '',
    '  questions the corpus cannot answer (retrieval has no relevance floor, so passages are not a bug —',
    '  they are the measurement)',
  ];
  for (const id of ids) {
    for (const mode of run.modes) {
      const result = mode.questions.find((question) => question.id === id);
      if (!result) continue;
      const top = result.hits[0];
      const detail =
        result.hits.length === 0
          ? 'returned nothing'
          : `returned ${result.hits.length} passage(s), top = ${top.sourceName} (score ${top.score.toFixed(4)})`;
      lines.push(`    [${id}] ${MODE_LABEL[mode.mode].padEnd(10)} ${detail}`);
    }
  }
  return lines;
};

export const renderReport = (run: EvalRun, comparison: ComparisonResult, nfdFileNames: string[]): string => {
  const lines: string[] = ['', 'Knowledge-base retrieval evaluation', ''];
  const ocrNote = run.corpus.ocrDocumentCount > 0 ? ` (${run.corpus.ocrDocumentCount} OCR-derived)` : '';
  lines.push(`  corpus     ${run.corpus.documentCount} documents${ocrNote}, ${run.corpus.chunkCount} passages`);
  if (nfdFileNames.length > 0) lines.push(`             stored NFD on disk: ${nfdFileNames.join(', ')}`);
  lines.push(`  knobs      chunk=${run.knobs.chunkChars}  overlap=${run.knobs.overlapChars}  topK=${run.knobs.topK}`);

  if (run.embedding) {
    const embedding = run.embedding;
    lines.push(
      `  semantic   ON — ${embedding.model} (dim ${embedding.dim}) via ${embedding.source}, ` +
        `${embedding.vectorCount}/${embedding.chunkCount} passages vectorised ` +
        `[embed cache ${embedding.cacheHits} hit / ${embedding.cacheMisses} miss]`
    );
  } else {
    // Loud on purpose: a BM25-only report read as a full one is worse than no report.
    lines.push('  semantic   OFF — the numbers below are HALF THE PICTURE');
    lines.push(`             reason: ${run.hybridSkippedReason ?? 'unknown'}`);
  }

  lines.push('', ...metricsTable(run));
  lines.push(...perQuestionTable(run));
  for (const mode of run.modes) lines.push(...failureDetail(mode));
  lines.push(...unanswerableSection(run));

  lines.push('');
  if (comparison.compared) {
    lines.push(comparison.failures.length === 0 ? '  baseline   no regression' : '  baseline   REGRESSED');
  } else {
    lines.push('  baseline   not compared');
  }
  for (const note of comparison.notes) lines.push(`             note: ${note}`);
  for (const failure of comparison.failures) lines.push(`             FAIL: ${failure}`);
  lines.push('');
  return lines.join('\n');
};
