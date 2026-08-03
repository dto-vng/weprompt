/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Frontend think tag filter
 * Filters think tags from message content before rendering
 * This handles historical messages that were saved before the filter was implemented
 */

/**
 * Strip think tags from content
 * @param content - The content to filter
 * @returns Filtered content without think tags
 */
export function stripThinkTags(content: string): string {
  if (!content || typeof content !== 'string') {
    return content;
  }

  if (!hasThinkTags(content)) {
    return content;
  }

  return (
    content
      // Step 1: Remove complete <think>...</think> blocks (with optional spaces in tags)
      .replace(/<\s*think\s*>([\s\S]*?)<\s*\/\s*think\s*>/gi, '')
      // Step 2: Remove complete <thinking>...</thinking> blocks (with optional spaces in tags)
      .replace(/<\s*thinking\s*>([\s\S]*?)<\s*\/\s*thinking\s*>/gi, '')
      // Step 3: Handle MiniMax-style format: content before the FIRST orphaned </think>
      // Models like MiniMax M2.5 omit the opening tag: "thinking content...\n</think>\nresponse"
      .replace(/^[\s\S]*?<\s*\/\s*think(?:ing)?\s*>/i, '')
      // Step 4: Remove any remaining orphaned closing tags (just the tags, preserve surrounding content)
      // When text gets concatenated across tool calls, there may be additional </think> tags
      .replace(/<\s*\/\s*think(?:ing)?\s*>/gi, '')
      // Step 5: Remove any remaining orphaned opening tags
      .replace(/<\s*think(?:ing)?\s*>/gi, '')
      // Step 6: Collapse multiple newlines
      .replace(/\n{3,}/g, '\n\n')
  );
}

/**
 * Split content into the model's reasoning and its visible answer, instead of
 * discarding the reasoning like {@link stripThinkTags}. Handles complete
 * `<think>…</think>` / `<thinking>…</thinking>` blocks, MiniMax-style orphaned
 * closing tags (opening omitted), and the streaming partials in between:
 *   - opening tag, no close yet  → everything after it is reasoning-in-progress
 *   - no tags yet                → treated as answer (a reasoning model that omits
 *     the opening tag is indistinguishable from a normal reply until `</think>`)
 *
 * @returns `{ reasoning, answer }` — either may be empty.
 */
export function splitThinkContent(content: string): { reasoning: string; answer: string } {
  if (!content || typeof content !== 'string' || !hasThinkTags(content)) {
    return { reasoning: '', answer: content ?? '' };
  }

  const reasoningParts: string[] = [];
  let answer = content;

  // Complete blocks anywhere in the text.
  answer = answer.replace(/<\s*think(?:ing)?\s*>([\s\S]*?)<\s*\/\s*think(?:ing)?\s*>/gi, (_match, inner: string) => {
    reasoningParts.push(inner);
    return '';
  });

  // Orphaned closing tag (opening omitted): everything before it is reasoning.
  const beforeClose = answer.match(/^([\s\S]*?)<\s*\/\s*think(?:ing)?\s*>/i);
  if (beforeClose) {
    reasoningParts.push(beforeClose[1]);
    answer = answer.slice(beforeClose[0].length);
  }

  // Orphaned opening tag, still streaming (no close yet): the rest is reasoning.
  const afterOpen = answer.match(/<\s*think(?:ing)?\s*>([\s\S]*)$/i);
  if (afterOpen && afterOpen.index !== undefined) {
    reasoningParts.push(afterOpen[1]);
    answer = answer.slice(0, afterOpen.index);
  }

  // Strip any remaining stray tags.
  answer = answer.replace(/<\s*\/?\s*think(?:ing)?\s*>/gi, '');

  return {
    reasoning: reasoningParts
      .join('\n\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
    answer: answer.replace(/\n{3,}/g, '\n\n'),
  };
}

/**
 * Detect content that disappears entirely once think tags are stripped —
 * the model produced only internal reasoning and no visible reply.
 * Whitespace-only and tag-free content both return false, so callers can
 * distinguish "empty turn" from "reasoning-only turn".
 * @param content - The raw accumulated assistant text for a turn
 * @returns True when the content is non-empty but strips to nothing
 */
export function isThinkOnlyContent(content: string): boolean {
  if (!content || typeof content !== 'string' || !content.trim()) {
    return false;
  }
  if (!hasThinkTags(content)) {
    return false;
  }
  return stripThinkTags(content).trim().length === 0;
}

/**
 * Check if content contains think tags (opening or closing)
 * Also detects orphaned closing tags like </think> without opening <think>
 * @param content - The content to check
 * @returns True if think tags are present
 */
export function hasThinkTags(content: string): boolean {
  if (!content || typeof content !== 'string') {
    return false;
  }
  return /<\s*\/?\s*think(?:ing)?\s*>/i.test(content);
}

/**
 * Filter think tags from message content object
 * Handles various message content structures
 * @param content - The message content (string or object)
 * @returns Filtered content
 */
export function filterMessageContent(content: any): any {
  // Handle string content
  if (typeof content === 'string') {
    return hasThinkTags(content) ? stripThinkTags(content) : content;
  }

  // Handle object with content property
  if (content && typeof content === 'object' && 'content' in content) {
    const innerContent = content.content;
    if (typeof innerContent === 'string' && hasThinkTags(innerContent)) {
      return {
        ...content,
        content: stripThinkTags(innerContent),
      };
    }
  }

  return content;
}
