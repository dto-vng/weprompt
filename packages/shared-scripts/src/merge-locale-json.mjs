/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Three-way key-level merge for nested locale JSON.
// Registered as a git merge driver (see `just git-setup`):
//   git config merge.locale-json.driver "node packages/shared-scripts/src/merge-locale-json.mjs %O %A %B %P"
// Git calls it with the ancestor (%O), ours (%A), theirs (%B) and the display
// path (%P); the merged result must be written back to %A. Exit 0 = clean,
// exit 1 = true same-key conflicts (listed on stderr, ours kept in the file so
// the working tree stays parseable while the path is marked unmerged),
// exit 2 = unparseable input (fail closed: %A is left untouched).
import { readFileSync, writeFileSync } from 'node:fs';

const [, , basePath, oursPath, theirsPath, displayPath = '(locale file)'] = process.argv;

const bail = (what, error) => {
  console.error(
    `[merge-locale-json] ${displayPath}: cannot ${what} (${error instanceof Error ? error.message : error}); leaving the file for manual merge`
  );
  process.exit(2);
};

// The ANCESTOR may be EMPTY — git hands an empty temp file for %O when the
// file was added on both sides. A malformed ancestor is different: without it
// we cannot tell deletions from additions (guessing resurrects deleted keys),
// so bail without touching ours.
const parseAncestor = (file) => {
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (error) {
    bail('read ancestor', error);
  }

  if (raw.length === 0) return {};

  try {
    return JSON.parse(raw);
  } catch (error) {
    bail('parse ancestor', error);
  }
};

// OURS/THEIRS are live content: if either cannot be parsed, overwriting %A
// with reconstructed data would destroy it. Report and bail without writing.
const parseSideOrExit = (file, side) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    bail(`parse ${side}`, error);
  }
};

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// Semantic deep equality — key order must not count as a change (JSON.stringify
// would flag a reordered-but-identical subtree as edited).
const same = (a, b) => {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => same(item, b[index]));
  }
  if (isObject(a) && isObject(b)) {
    const aKeys = Object.keys(a);
    return (
      aKeys.length === Object.keys(b).length && aKeys.every((key) => Object.hasOwn(b, key) && same(a[key], b[key]))
    );
  }
  return false;
};

const conflicts = [];

const merge = (base, ours, theirs, keyPath) => {
  if (isObject(ours) && isObject(theirs)) {
    // Both sides replaced a non-object base (scalar/array/null) with
    // structures: recursing would silently interleave two unrelated
    // restructurings, so this conflicts unless the replacements are identical.
    if (base !== undefined && !isObject(base)) {
      if (same(ours, theirs)) return ours;
      conflicts.push(`${keyPath} (both sides replaced a value with different structures)`);
      return ours;
    }

    const baseObject = isObject(base) ? base : {};
    // Null prototype + Object.hasOwn throughout: locale keys are arbitrary
    // strings, and `in` / plain `{}` mishandle names like "toString" or
    // "__proto__" (prototype-chain hits and setter side effects drop keys).
    const output = Object.create(null);
    // ours ordering first, theirs-only keys appended in theirs' order —
    // keeps human-grouped en-US files stable across merges.
    const keys = [...Object.keys(ours), ...Object.keys(theirs).filter((key) => !Object.hasOwn(ours, key))];

    for (const key of keys) {
      const childPath = keyPath ? `${keyPath}.${key}` : key;
      const inBase = Object.hasOwn(baseObject, key);
      const baseValue = inBase ? baseObject[key] : undefined;

      if (Object.hasOwn(ours, key) && Object.hasOwn(theirs, key)) {
        output[key] = merge(baseValue, ours[key], theirs[key], childPath);
      } else if (Object.hasOwn(ours, key)) {
        if (!inBase) output[key] = ours[key];
        else if (same(baseValue, ours[key])) {
          // they deleted it and we never touched it — accept the deletion
        } else {
          conflicts.push(`${childPath} (deleted in theirs, edited in ours)`);
          output[key] = ours[key];
        }
      } else if (!inBase) {
        output[key] = theirs[key];
      } else if (same(baseValue, theirs[key])) {
        // we deleted it and they never touched it — accept the deletion
      } else {
        conflicts.push(`${childPath} (deleted in ours, edited in theirs)`);
        // Keep our deletion while git leaves the path unmerged for resolution.
      }
    }

    return output;
  }

  if (same(ours, theirs)) return ours;
  if (same(base, theirs)) return ours;
  if (same(base, ours)) return theirs;
  conflicts.push(`${keyPath} (edited differently on both sides)`);
  return ours;
};

const merged = merge(
  parseAncestor(basePath),
  parseSideOrExit(oursPath, 'ours'),
  parseSideOrExit(theirsPath, 'theirs'),
  ''
);
writeFileSync(oursPath, JSON.stringify(merged, null, 2) + '\n');

if (conflicts.length > 0) {
  console.error(`[merge-locale-json] ${displayPath}: ${conflicts.length} key conflict(s):`);
  for (const conflict of conflicts) console.error(`  - ${conflict}`);
  process.exit(1);
}
