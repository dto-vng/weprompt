#!/usr/bin/env node
/**
 * Generates the built-in DOCX reference documents via officecli.
 * Usage: node scripts/generate-document-references.mjs [documentName ...]
 * With no args, builds every registered document. Design contracts live in each
 * template's THEME.md; helpers in scripts/document-references/lib.mjs.
 * Output files are committed; re-run only when a document's design changes,
 * and bump that pack's manifest `version` so syncBuiltins reinstalls it.
 */
import { buildDocument } from './document-references/lib.mjs';
import businessReport from './document-references/business-report.mjs';
import decisionMemo from './document-references/decision-memo.mjs';
import operationsGuide from './document-references/operations-guide.mjs';

const DOCUMENTS = [businessReport, decisionMemo, operationsGuide];

const requested = process.argv.slice(2);
const unknown = requested.filter((name) => !DOCUMENTS.some((doc) => doc.name === name));
if (unknown.length) {
  console.error(`Unknown document(s): ${unknown.join(', ')}. Known: ${DOCUMENTS.map((d) => d.name).join(', ')}`);
  process.exit(1);
}
const selected = requested.length ? DOCUMENTS.filter((doc) => requested.includes(doc.name)) : DOCUMENTS;
for (const doc of selected) buildDocument(doc);
console.log(`Reference documents regenerated: ${selected.map((d) => d.name).join(', ')}`);
