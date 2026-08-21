/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const BRIDGE_PATH = resolve(__dirname, '../../../packages/desktop/src/common/adapter/ipcBridge.ts');
const BRIDGE = readFileSync(BRIDGE_PATH, 'utf8');

/**
 * Every interpolation that lands in a URL **path segment** — one written
 * directly after a `/` — must be escaped. A value carrying `/`, `?`, `#` or a
 * space otherwise reshapes the request rather than naming a resource.
 *
 * Query values are excluded deliberately: they follow `=` or `&`, and those
 * call sites already encode. Matching them here would demand double-encoding.
 */
const UNESCAPED_PATH_SEGMENT = /\/\$\{(?!encodeURIComponent\()([^{}]*)\}/g;
const ESCAPED_PATH_SEGMENT = /\/\$\{encodeURIComponent\(/g;

const lineOf = (index: number): number => BRIDGE.slice(0, index).split('\n').length;

describe('ipcBridge URL path segments', () => {
  /**
   * BUG-052: `conversation.get` built `/api/conversations/${p.id}` raw while its
   * sibling two definitions away escaped the same kind of value. It was not one
   * slip — 76 segments across the file were unescaped, and the row that would
   * have caught it had been retired during the BUG-046 payload-guard work. A UUID
   * payload guard had made it moot by accident; loosening that guard to
   * `identifierSchema` removed the accident without anyone noticing.
   */
  it('escapes every interpolated path segment', () => {
    const offenders = Array.from(BRIDGE.matchAll(UNESCAPED_PATH_SEGMENT)).map(
      (match) => `ipcBridge.ts:${lineOf(match.index)} -> \${${match[1]}}`
    );

    expect(offenders).toEqual([]);
  });

  it('still has the volume of encoded segments this file is expected to carry', () => {
    // Guards the guard: a refactor that changed how paths are written could make
    // the pattern above match nothing and pass vacuously forever.
    expect(BRIDGE.match(ESCAPED_PATH_SEGMENT)?.length ?? 0).toBeGreaterThanOrEqual(70);
  });
});
