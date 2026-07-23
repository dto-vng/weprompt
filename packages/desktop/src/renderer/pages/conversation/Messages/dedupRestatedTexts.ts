/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Collapse restated assistant replies and recover their reasoning.
 *
 * The backend persists each reply as a VISIBLE clean message plus a HIDDEN raw
 * copy that keeps the model's `<think>` reasoning (every tagged row is hidden).
 * Live, both copies can surface and duplicate the reply; on reload the hidden
 * copy is skipped by the renderer and the reasoning would be lost. Within each
 * turn this helper:
 *
 * 1. Collapses VISIBLE messages whose content is identical once reasoning and
 *    whitespace are ignored (the model restating its answer after a tool call),
 *    preferring the copy that carries reasoning; on a tie the later one wins.
 * 2. Grafts reasoning from a HIDDEN tagged twin onto its visible clean sibling,
 *    so the grey reasoning block survives conversation reloads.
 *
 * Hidden messages are never dropped (the render loop already skips them) and
 * never chosen over a visible message. Exact content equality only — distinct
 * segments (continuations) are never collapsed.
 *
 * Complements the compose-time `dedupeAssistantRepliesByTurn` in `hooks.ts`,
 * which normalizes whitespace only (not `<think>`) and excludes hidden
 * messages — so it cannot collapse a tagged-vs-clean pair, nor graft reasoning
 * from a hidden twin. This render-time pass covers exactly those two gaps and
 * composes after it; keep their turn-boundary handling in sync.
 */
import type { IMessageText, TMessage } from '@/common/chat/chatLib';
import { hasThinkTags, splitThinkContent, stripThinkTags } from '@/renderer/utils/chat/thinkTagFilter';
import { isHistoryGapMarker } from './hooks';

type VisibleText = {
  index: number;
  normalized: string;
  withReasoning: boolean;
};

type Change = { kind: 'drop' } | { kind: 'graft'; content: string };

const normalizeAnswer = (raw: string): string => {
  const stripped = hasThinkTags(raw) ? stripThinkTags(raw) : raw;
  return stripped.replace(/\s+/g, ' ').trim();
};

const textContentOf = (message: TMessage): string | null => {
  if (message.type !== 'text' || message.position !== 'left') return null;
  const raw = (message as IMessageText).content?.content;
  return typeof raw === 'string' ? raw : null;
};

export const dedupRestatedTextMessages = (list: TMessage[]): TMessage[] => {
  const changes = new Map<number, Change>();
  let visible: VisibleText[] = [];
  let donors: Array<{ normalized: string; reasoning: string }> = [];

  const flushTurn = () => {
    // Collapse visible restatements, tracking the surviving copy per answer.
    const kept: VisibleText[] = [];
    for (const candidate of visible) {
      const duplicate = kept.find((seen) => seen.normalized === candidate.normalized);
      if (!duplicate) {
        kept.push(candidate);
        continue;
      }
      if (candidate.withReasoning || !duplicate.withReasoning) {
        changes.set(duplicate.index, { kind: 'drop' });
        kept[kept.indexOf(duplicate)] = candidate;
      } else {
        changes.set(candidate.index, { kind: 'drop' });
      }
    }

    // Graft reasoning from hidden raw copies onto their clean visible twin.
    for (const donor of donors) {
      if (!donor.reasoning) continue;
      const twin = kept.find((seen) => !seen.withReasoning && seen.normalized === donor.normalized);
      if (!twin) continue;
      const raw = textContentOf(list[twin.index]);
      if (raw === null) continue;
      changes.set(twin.index, { kind: 'graft', content: `<think>${donor.reasoning}</think>\n${raw}` });
      twin.withReasoning = true;
    }

    visible = [];
    donors = [];
  };

  for (let index = 0; index < list.length; index++) {
    const message = list[index];
    // A user message or a history gap (pagination boundary) ends the turn window,
    // so restatements are never matched across it.
    if (message.position === 'right' || isHistoryGapMarker(message)) {
      flushTurn();
      continue;
    }
    const raw = textContentOf(message);
    if (raw === null) continue;
    const normalized = normalizeAnswer(raw);
    if (!normalized) continue;

    if (message.hidden) {
      if (hasThinkTags(raw)) {
        donors.push({ normalized, reasoning: splitThinkContent(raw).reasoning });
      }
      continue;
    }
    visible.push({ index, normalized, withReasoning: hasThinkTags(raw) });
  }
  flushTurn();

  if (!changes.size) return list;

  const result: TMessage[] = [];
  for (let index = 0; index < list.length; index++) {
    const change = changes.get(index);
    if (!change) {
      result.push(list[index]);
      continue;
    }
    if (change.kind === 'drop') continue;
    const message = list[index] as IMessageText;
    result.push({ ...message, content: { ...message.content, content: change.content } });
  }
  return result;
};
