/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Loads the fixture corpus + golden questions and validates their integrity.
//
// The validation is not ceremony. Every metric this harness reports is
// meaningless if a hint has drifted from the document it points at, and a
// mistyped hint fails silently — it just reads as "retrieval got worse".
// So the fixture checks itself before any measurement runs.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { DocumentProvenance, EvalDocument, EvalFixture, GoldenQuestion } from './types';

export const FIXTURE_DIR = path.resolve(__dirname, '..', 'fixture');
const QUESTIONS_FILE = path.join(FIXTURE_DIR, 'questions.json');

/**
 * Two roots, one flat corpus. `corpus/` is hand-authored markdown; `corpus-ocr/`
 * holds model transcriptions of scanned documents, which are a different kind of
 * text and must not be edited into the same register — the whole point of an
 * OCR-derived case is that it reads the way real transcription output reads.
 *
 * Separate directories rather than an eleventh file in `corpus/`: the project
 * caps a directory at ten children, and the split records provenance in the tree
 * instead of only in prose.
 *
 * File names must be unique ACROSS roots — buildStore derives the source id from
 * the name, so a collision would silently merge two documents.
 */
const CORPUS_ROOTS: Array<{ dir: string; provenance: DocumentProvenance }> = [
  { dir: path.join(FIXTURE_DIR, 'corpus'), provenance: 'authored' },
  { dir: path.join(FIXTURE_DIR, 'corpus-ocr'), provenance: 'ocr' },
];

/** Compare text without letting normalisation form decide the answer. */
export const nfc = (text: string): string => text.normalize('NFC');

const isDecomposed = (text: string): boolean => text !== text.normalize('NFC');

/** Vietnamese/accented content, so "is this NFC or NFD" is a real question for it. */
const hasComposedDiacritics = (text: string): boolean => text.normalize('NFC') !== text.normalize('NFD');

const readCorpusRoot = (dir: string, provenance: DocumentProvenance): EvalDocument[] =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((fileName) => fileName.endsWith('.md'))
        .map((fileName) => ({ fileName, text: readFileSync(path.join(dir, fileName), 'utf8'), provenance }))
    : [];

export const loadFixture = (): EvalFixture => {
  // Sorted by code unit, exactly as a single readdir + toSorted() was, so merging
  // the roots does not reorder the store and quietly move tie-broken ranks.
  const documents: EvalDocument[] = CORPUS_ROOTS.flatMap((root) => readCorpusRoot(root.dir, root.provenance)).toSorted(
    (a, b) => (a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0)
  );

  const parsed = JSON.parse(readFileSync(QUESTIONS_FILE, 'utf8')) as { questions: GoldenQuestion[] };
  const fixture: EvalFixture = {
    documents,
    questions: parsed.questions,
    nfdFileNames: documents.filter((doc) => isDecomposed(doc.text)).map((doc) => doc.fileName),
  };
  validateFixture(fixture);
  return fixture;
};

/**
 * Throws on any fixture defect. Exported so the regression test can point it at
 * a deliberately broken fixture and confirm the check actually bites.
 */
export const validateFixture = (fixture: EvalFixture): void => {
  const problems: string[] = [];
  const byName = new Map(fixture.documents.map((doc) => [doc.fileName, doc]));

  if (fixture.documents.length === 0) problems.push('corpus is empty');
  if (fixture.questions.length === 0) problems.push('no golden questions');

  // A name collision across the two corpus roots would merge two documents into
  // one source id and read as a retrieval mystery, not as a fixture defect.
  const duplicated = fixture.documents.filter((doc, index) =>
    fixture.documents.some((other, otherIndex) => otherIndex < index && other.fileName === doc.fileName)
  );
  for (const doc of duplicated) problems.push(`corpus file name appears in more than one root: ${doc.fileName}`);

  // The OCR-derived half is the only coverage of transcribed text — page markers
  // in place of section headings, a table the model rebuilt rather than an author
  // typed. Losing it would leave every other check passing.
  if (!fixture.documents.some((doc) => doc.provenance === 'ocr')) {
    problems.push('no corpus file is OCR-derived — the transcribed-scan case is no longer covered');
  }

  // Both normalisation forms must be represented, or the fixture has quietly
  // stopped covering the NFD tokenisation bug it exists to catch. Editors and
  // format hooks are the realistic way this regresses.
  const accented = fixture.documents.filter((doc) => hasComposedDiacritics(doc.text));
  if (!accented.some((doc) => isDecomposed(doc.text))) {
    problems.push('no corpus file is stored NFD — the decomposed-diacritics case is no longer covered');
  }
  if (!accented.some((doc) => !isDecomposed(doc.text))) {
    problems.push('no accented corpus file is stored NFC');
  }

  const seenIds = new Set<string>();
  for (const question of fixture.questions) {
    if (seenIds.has(question.id)) problems.push(`duplicate question id: ${question.id}`);
    seenIds.add(question.id);

    if (question.expectedSources.length === 0) {
      if (question.kind !== 'unanswerable') {
        problems.push(`[${question.id}] has no expected source but is not kind 'unanswerable'`);
      }
      continue;
    }
    for (const sourceName of question.expectedSources) {
      const doc = byName.get(sourceName);
      if (!doc) {
        problems.push(`[${question.id}] expects missing corpus file: ${sourceName}`);
        continue;
      }
      if (question.answerHint && !nfc(doc.text).includes(nfc(question.answerHint))) {
        problems.push(
          `[${question.id}] answerHint is not present in ${sourceName}: ${JSON.stringify(question.answerHint)}`
        );
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(`Fixture is invalid:\n  - ${problems.join('\n  - ')}`);
  }
};

/** The query text as retrieval should see it, honouring queryForm. */
export const queryTextOf = (question: GoldenQuestion): string =>
  question.queryForm === 'NFD' ? question.question.normalize('NFD') : nfc(question.question);
