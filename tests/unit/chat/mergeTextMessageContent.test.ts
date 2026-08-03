/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { mergeTextMessageContent } from '@/common/chat/chatLib';

/**
 * At turn finish the backend emits per-message `replace: true` snapshots of the
 * persisted text. Observed live (aioncore, reasoning models): the snapshot can
 * be think-stripped — or entirely empty — while the streamed content the user
 * is reading still holds the reasoning. The merge must not let a finalize
 * snapshot destroy content the user can see.
 */
describe('mergeTextMessageContent', () => {
  it('appends chunks when the incoming content is not replace-marked', () => {
    const merged = mergeTextMessageContent({ content: 'Hello ' }, { content: 'world' });
    expect(merged.content).toBe('Hello world');
    expect(merged.replace).toBeUndefined();
  });

  it('lets a normal replace snapshot win (no reasoning involved)', () => {
    const merged = mergeTextMessageContent({ content: 'streamed partial' }, { content: 'final text', replace: true });
    expect(merged.content).toBe('final text');
    expect(merged.replace).toBe(true);
  });

  it('ignores an empty replace snapshot so it cannot wipe visible content', () => {
    const merged = mergeTextMessageContent(
      { content: '<think>why</think>The verdict is good.' },
      { content: '', replace: true }
    );
    expect(merged.content).toBe('<think>why</think>The verdict is good.');
  });

  it('ignores a whitespace-only replace snapshot', () => {
    const merged = mergeTextMessageContent({ content: 'visible reply' }, { content: '  \n ', replace: true });
    expect(merged.content).toBe('visible reply');
  });

  it('still allows an empty replace when there is nothing to lose', () => {
    const merged = mergeTextMessageContent({ content: '   ' }, { content: '', replace: true });
    expect(merged.content).toBe('');
  });

  it('carries streamed reasoning over a think-stripped replace snapshot', () => {
    const merged = mergeTextMessageContent(
      { content: '<think>planning the answer</think>The answer.' },
      { content: 'The answer.', replace: true }
    );
    expect(merged.content).toBe('<think>planning the answer</think>\nThe answer.');
  });

  it('preserves MiniMax-style reasoning (orphaned closing tag) over a stripped replace', () => {
    const merged = mergeTextMessageContent(
      { content: 'reasoning without opening tag\n</think>\nThe answer.' },
      { content: 'The answer.', replace: true }
    );
    expect(merged.content).toBe('reasoning without opening tag\n</think>\nThe answer.');
  });

  it('closes an unterminated think block before prepending it to the replace snapshot', () => {
    const merged = mergeTextMessageContent(
      { content: '<think>still reasoning when finish arrived' },
      { content: 'The answer.', replace: true }
    );
    expect(merged.content).toBe('<think>still reasoning when finish arrived</think>\nThe answer.');
  });

  it('does not duplicate reasoning when the replace snapshot already contains think tags', () => {
    const tagged = '<think>why</think>The final answer.';
    const merged = mergeTextMessageContent(
      { content: '<think>why</think>The final' },
      { content: tagged, replace: true }
    );
    expect(merged.content).toBe(tagged);
  });

  it('does not inject reasoning when the existing content had none', () => {
    const merged = mergeTextMessageContent(
      { content: 'plain streamed text' },
      { content: 'final text', replace: true }
    );
    expect(merged.content).toBe('final text');
  });
});
