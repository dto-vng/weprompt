/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { isBoundedConversationId, MAX_CONVERSATION_ID_LENGTH } from '@/common/types/office/conversationId';
import { uuid } from '@/common/utils/utils';

/**
 * BUG-046 fixed three guards that demanded a uuid-shaped conversation id; BUG-048
 * recorded that the same assumption was still live across the runs and sources
 * features. Reachability was established rather than assumed: the managed
 * presentation handoff (`useGuidSend.runManagedHandoff`) binds a draft to a
 * just-created conversation and passes that id straight into
 * `presentation-sources.bind-draft`, whose schema required a uuid.
 */
describe('isBoundedConversationId', () => {
  it('accepts the ids the generator actually mints, at both of its lengths', () => {
    // Generated, not hand-written: a hand-written fixture is what agreed with the
    // schema instead of the wire and let this survive BUG-046.
    expect(isBoundedConversationId(uuid())).toBe(true);
    expect(isBoundedConversationId(uuid(36))).toBe(true);
  });

  it.each([
    ['the live route id', '1af97a0d'],
    ['the live turn-completed session id', '8f165203'],
    ['a full uuid, still legitimate', 'd9b6195d-bab0-4662-b88c-1675772bb24d'],
    ['a prefixed id', 'conversation-1'],
  ])('accepts %s', (_case, value) => {
    expect(isBoundedConversationId(value)).toBe(true);
  });

  /**
   * Loosening these guards to "any bounded string" would have accepted every one
   * of these. An existing schema case rejects `../foreign` by name, and the id
   * reaches a `sessionStorage` key — so the fix is a shape, not an absence.
   */
  it.each([
    ['a path escape', '../foreign'],
    ['an absolute path', '/private/source'],
    ['a windows path', 'a\\b'],
    ['empty', ''],
    ['whitespace-bearing', 'has space'],
    // Escaped, not a raw NUL byte in the source. Load-bearing rather than
    // decorative: confirmation keys join their segments with NUL, so a
    // NUL-bearing id could forge another candidate's key.
    ['NUL-bearing', 'f90e8348\u0000forged'],
    ['a newline', 'a\nb'],
  ])('rejects %s', (_case, value) => {
    expect(isBoundedConversationId(value)).toBe(false);
  });

  it('rejects a non-string', () => {
    expect(isBoundedConversationId(undefined)).toBe(false);
    expect(isBoundedConversationId(42)).toBe(false);
  });

  it('bounds the length, since the id crosses a wire that should not carry a payload', () => {
    expect(isBoundedConversationId('a'.repeat(MAX_CONVERSATION_ID_LENGTH))).toBe(true);
    expect(isBoundedConversationId('a'.repeat(MAX_CONVERSATION_ID_LENGTH + 1))).toBe(false);
  });
});
