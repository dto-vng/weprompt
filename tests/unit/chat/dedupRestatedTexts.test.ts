/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { TMessage } from '@/common/chat/chatLib';
import { dedupRestatedTextMessages } from '@/renderer/pages/conversation/Messages/dedupRestatedTexts';

let seq = 0;
const text = (content: string, opts?: { position?: 'left' | 'right'; hidden?: boolean }): TMessage =>
  ({
    id: `id-${++seq}`,
    msg_id: `msg-${seq}`,
    type: 'text',
    position: opts?.position ?? 'left',
    conversation_id: 'c1',
    created_at: seq,
    ...(opts?.hidden ? { hidden: true } : {}),
    content: { content },
  }) as TMessage;

const toolGroup = (): TMessage =>
  ({
    id: `id-${++seq}`,
    msg_id: `msg-${seq}`,
    type: 'tool_group',
    conversation_id: 'c1',
    created_at: seq,
    content: [],
  }) as unknown as TMessage;

// Mirrors the hidden `HISTORY_GAP_MARKER_CODE` tip that hooks.ts inserts at a
// pagination boundary (matched by the exported isHistoryGapMarker).
const historyGap = (): TMessage =>
  ({
    id: `gap-${++seq}`,
    type: 'tips',
    position: 'center',
    conversation_id: 'c1',
    created_at: seq,
    hidden: true,
    content: { content: '', type: 'info', code: '__aionui_renderer_history_gap__' },
  }) as unknown as TMessage;

const contentOf = (m: TMessage): string => (m as { content: { content: string } }).content.content;

/**
 * The backend persists each reply as a VISIBLE clean message plus a HIDDEN raw
 * copy that keeps the model's <think> reasoning (all tagged rows are hidden).
 * Live, both copies can surface and duplicate the reply; on reload the hidden
 * copy is skipped and the reasoning would be lost. This helper collapses
 * restatements among visible messages and grafts reasoning from the hidden
 * twin onto its visible sibling.
 */
describe('dedupRestatedTextMessages', () => {
  describe('visible restatements (live duplication)', () => {
    it('drops the earlier copy when a later tagged segment restates the same answer', () => {
      const early = text('The full review.');
      const late = text('<think>because</think>The full review.');
      const result = dedupRestatedTextMessages([early, toolGroup(), late]);
      expect(result).toHaveLength(2);
      expect(result.find((m) => m.id === early.id)).toBeUndefined();
      expect(result.find((m) => m.id === late.id)).toBeDefined();
    });

    it('keeps the earlier copy when only it carries reasoning', () => {
      const early = text('<think>because</think>The full review.');
      const late = text('The full review.');
      const result = dedupRestatedTextMessages([early, toolGroup(), late]);
      expect(result.find((m) => m.id === early.id)).toBeDefined();
      expect(result.find((m) => m.id === late.id)).toBeUndefined();
    });

    it('keeps the later copy on a tie (both tagged)', () => {
      const early = text('<think>a</think>Same answer.');
      const late = text('<think>b</think>Same answer.');
      const result = dedupRestatedTextMessages([early, late]);
      expect(result.map((m) => m.id)).toEqual([late.id]);
    });

    it('treats whitespace differences as the same restatement', () => {
      const early = text('Same  answer.\n');
      const late = text('<think>r</think>\nSame answer.');
      const result = dedupRestatedTextMessages([early, late]);
      expect(result.map((m) => m.id)).toEqual([late.id]);
    });

    it('keeps distinct segments (continuations) untouched', () => {
      const part1 = text('First half of the reply.');
      const part2 = text('<think>r</think>Second half with the verdict.');
      const result = dedupRestatedTextMessages([part1, toolGroup(), part2]);
      expect(result).toHaveLength(3);
    });

    it('does not dedup across turns (user message resets the window)', () => {
      const turn1 = text('Same answer.');
      const user = text('again please', { position: 'right' });
      const turn2 = text('Same answer.');
      const result = dedupRestatedTextMessages([turn1, user, turn2]);
      expect(result).toHaveLength(3);
    });

    it('does not dedup across a history-gap marker (pagination boundary)', () => {
      const older = text('Same answer.');
      const gap = historyGap();
      const newer = text('Same answer.');
      const result = dedupRestatedTextMessages([older, gap, newer]);
      expect(result).toHaveLength(3);
    });

    it('ignores reasoning-only and empty texts', () => {
      const reasoningOnly = text('<think>just thinking</think>');
      const empty = text('   ');
      const answer = text('Real answer.');
      const result = dedupRestatedTextMessages([reasoningOnly, empty, answer]);
      expect(result).toHaveLength(3);
    });
  });

  describe('hidden raw copies (reload shape)', () => {
    it('never drops a visible message in favor of a hidden twin', () => {
      // Regression: the hidden copy is skipped at render time, so preferring it
      // over the visible one blanks the whole reply.
      const visibleClean = text('The full review.');
      const hiddenTagged = text('<think>because</think>The full review.', { hidden: true });
      const result = dedupRestatedTextMessages([visibleClean, toolGroup(), hiddenTagged]);
      expect(result.find((m) => m.id === visibleClean.id)).toBeDefined();
    });

    it('grafts reasoning from the hidden twin onto its visible clean sibling', () => {
      const visibleClean = text('The full review.');
      const hiddenTagged = text('<think>because</think>The full review.', { hidden: true });
      const result = dedupRestatedTextMessages([visibleClean, toolGroup(), hiddenTagged]);
      const grafted = result.find((m) => m.id === visibleClean.id);
      expect(contentOf(grafted!)).toBe('<think>because</think>\nThe full review.');
    });

    it('grafts when the hidden twin precedes the visible message', () => {
      const hiddenTagged = text('<think>why</think>Answer text.', { hidden: true });
      const visibleClean = text('Answer text.');
      const result = dedupRestatedTextMessages([hiddenTagged, visibleClean]);
      const grafted = result.find((m) => m.id === visibleClean.id);
      expect(contentOf(grafted!)).toBe('<think>why</think>\nAnswer text.');
    });

    it('does not graft when the visible message already carries reasoning', () => {
      const visibleTagged = text('<think>live</think>The answer.');
      const hiddenTagged = text('<think>persisted</think>The answer.', { hidden: true });
      const result = dedupRestatedTextMessages([visibleTagged, hiddenTagged]);
      const kept = result.find((m) => m.id === visibleTagged.id);
      expect(contentOf(kept!)).toBe('<think>live</think>The answer.');
    });

    it('does not graft from a hidden message with different content', () => {
      const visibleClean = text('Part one of the reply.');
      const hiddenDistinct = text('<think>r</think>Part two: the verdict.', { hidden: true });
      const result = dedupRestatedTextMessages([visibleClean, hiddenDistinct]);
      expect(contentOf(result.find((m) => m.id === visibleClean.id)!)).toBe('Part one of the reply.');
    });

    it('does not graft across turns', () => {
      const hiddenTagged = text('<think>r</think>Same answer.', { hidden: true });
      const user = text('next question', { position: 'right' });
      const visibleClean = text('Same answer.');
      const result = dedupRestatedTextMessages([hiddenTagged, user, visibleClean]);
      expect(contentOf(result.find((m) => m.id === visibleClean.id)!)).toBe('Same answer.');
    });
  });

  it('returns the same array instance when nothing changes', () => {
    const list = [text('One.'), text('Two.'), text('<think>r</think>Other.', { hidden: true })];
    expect(dedupRestatedTextMessages(list)).toBe(list);
  });
});
