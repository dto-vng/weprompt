/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// CLI entry point for the knowledge-base retrieval evaluation.
//
//   bun run eval:kb                          # hybrid if a model is reachable, else BM25-only
//   bun run eval:kb -- --bm25-only           # deterministic, no network
//   bun run eval:kb -- --overlap=0           # sweep a knob
//   bun run eval:kb -- --update-baseline     # re-record the committed baseline
//
// Deliberately not part of `bun run test`: it wants the network and takes real
// time. The deterministic BM25 half is guarded in CI by
// tests/regression/kbRetrievalBaseline.test.ts instead.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { compareToBaseline, readBaseline, toBaseline, writeBaseline } from './harness/baseline';
import { loadFixture } from './harness/fixture';
import { renderReport } from './harness/report';
import { runEvaluation } from './harness/runHarness';
import type { EvalKnobs } from './harness/types';

// Defaults mirror the shipping configuration: chunkMarkdown()'s maxChars /
// overlapChars defaults (common/knowledge/chunker.ts) and the knowledge MCP
// server's `max_results ?? 6` (builtinMcp/knowledgeServer.ts). The chunker pair
// is pinned by an assertion in tests/regression/kbRetrievalBaseline.test.ts, so
// a drift there fails the suite rather than quietly changing what we measure.
const DEFAULT_KNOBS: EvalKnobs = { chunkChars: 3200, overlapChars: 400, topK: 6 };

const USAGE = `
Usage: bun run eval:kb [-- <options>]

  --chunk=<n>         chunk size in characters   (default ${DEFAULT_KNOBS.chunkChars})
  --overlap=<n>       chunk overlap in characters (default ${DEFAULT_KNOBS.overlapChars})
  --topk=<n>          passages requested per query (default ${DEFAULT_KNOBS.topK})
  --bm25-only         skip embeddings entirely; deterministic and offline
  --update-baseline   overwrite tests/eval/baseline.json with this run
  --json=<path>       also write the full run as JSON
  --help

Embedding config is taken from KB_EVAL_EMBED_BASE_URL / _API_KEY / _MODEL, or
from the running dev app's provider list. Neither available means a BM25-only
run, reported as such.

Note: candidates-per-list (30) and the RRF k (60) are compile-time constants in
common/knowledge/searchCore.ts and rrf.ts, which this stream does not own, so
they are not sweepable here. See tests/eval/README.md.
`;

type Options = {
  knobs: EvalKnobs;
  hybrid: boolean;
  updateBaseline: boolean;
  jsonPath: string | null;
};

const parseArgs = (argv: string[]): Options | 'help' => {
  const options: Options = { knobs: { ...DEFAULT_KNOBS }, hybrid: true, updateBaseline: false, jsonPath: null };
  for (const arg of argv) {
    const [flag, rawValue] = arg.includes('=')
      ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)]
      : [arg, ''];
    const numeric = (label: string): number => {
      const value = Number(rawValue);
      if (!Number.isInteger(value) || value <= 0)
        throw new Error(`${label} needs a positive integer, got "${rawValue}"`);
      return value;
    };
    switch (flag) {
      case '--help':
      case '-h':
        return 'help';
      case '--chunk':
        options.knobs.chunkChars = numeric('--chunk');
        break;
      case '--overlap':
        // Zero is meaningful here — it is how you show the overlap earning its keep.
        if (!Number.isInteger(Number(rawValue)) || Number(rawValue) < 0) {
          throw new Error(`--overlap needs a non-negative integer, got "${rawValue}"`);
        }
        options.knobs.overlapChars = Number(rawValue);
        break;
      case '--topk':
        options.knobs.topK = numeric('--topk');
        break;
      case '--bm25-only':
        options.hybrid = false;
        break;
      case '--update-baseline':
        options.updateBaseline = true;
        break;
      case '--json':
        if (!rawValue) throw new Error('--json needs a path');
        options.jsonPath = rawValue;
        break;
      default:
        throw new Error(`Unknown option "${arg}"${USAGE}`);
    }
  }
  return options;
};

const main = async (): Promise<number> => {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed === 'help') {
    console.log(USAGE);
    return 0;
  }

  const run = await runEvaluation({ knobs: parsed.knobs, hybrid: parsed.hybrid });
  const fixture = loadFixture();

  if (parsed.updateBaseline) {
    if (!parsed.hybrid || !run.embedding) {
      console.warn(
        '\n  WARNING: recording a baseline without the hybrid half. The semantic side will be left unguarded.\n'
      );
    }
    const generatedOn = new Date().toISOString().slice(0, 10);
    await writeBaseline(toBaseline(run, generatedOn));
  }

  const baseline = await readBaseline();
  const comparison = compareToBaseline(run, baseline);
  console.log(renderReport(run, comparison, fixture.nfdFileNames));

  if (parsed.jsonPath) {
    const target = path.resolve(parsed.jsonPath);
    await fs.writeFile(target, `${JSON.stringify(run, null, 2)}\n`, 'utf8');
    console.log(`  wrote ${target}\n`);
  }

  return comparison.failures.length > 0 ? 1 : 0;
};

main().then(
  (code: number) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(`\nkb eval failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
);
