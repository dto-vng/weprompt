#!/usr/bin/env node
/**
 * Generates the built-in PPTX reference decks via officecli.
 * Usage: node scripts/generate-presentation-references.mjs [deckName ...]
 * With no args, builds every registered deck. Deck design contracts live in
 * each template's THEME.md; helpers in scripts/presentation-references/lib.mjs.
 * Output files are committed; re-run only when a deck's design changes.
 */
import { buildDeck } from './presentation-references/lib.mjs';
import businessReview from './presentation-references/business-review.mjs';
import projectKickoff from './presentation-references/project-kickoff.mjs';

const DECKS = [businessReview, projectKickoff];

const requested = process.argv.slice(2);
const unknown = requested.filter((name) => !DECKS.some((deck) => deck.name === name));
if (unknown.length) {
  console.error(`Unknown deck(s): ${unknown.join(', ')}. Known: ${DECKS.map((d) => d.name).join(', ')}`);
  process.exit(1);
}
const selected = requested.length ? DECKS.filter((deck) => requested.includes(deck.name)) : DECKS;
for (const deck of selected) buildDeck(deck.file, deck.slides);
console.log(`Reference decks regenerated: ${selected.map((d) => d.name).join(', ')}`);
