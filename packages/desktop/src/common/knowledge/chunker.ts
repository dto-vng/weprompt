/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Split markdown into retrieval chunks. Pure — no Node APIs.
// Heuristic sizing: ~4 chars/token, so 3,200 chars ≈ the spec's ~800-token
// target with a 400-char (~100-token) overlap between adjacent chunks.

export type ChunkerOptions = { maxChars?: number; overlapChars?: number };
export type RawChunk = { text: string; headingPath?: string };

const HEADING_RE = /^(#{1,6})\s+(.+)$/;

export const chunkMarkdown = (markdown: string, options: ChunkerOptions = {}): RawChunk[] => {
  const maxChars = options.maxChars ?? 3200;
  // Clamp so overlapChars can never reach maxChars — otherwise the hard-split
  // stride below would hit zero (or negative) and blow up the chunk count.
  const overlapChars = Math.min(options.overlapChars ?? 400, Math.max(0, maxChars - 1));

  // Blocks = heading lines or blank-line-separated paragraphs, in order.
  type Block = { text: string; heading?: { level: number; title: string } };
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flushParagraph = () => {
    const text = paragraph.join('\n').trim();
    if (text) blocks.push({ text });
    paragraph = [];
  };
  for (const line of markdown.split(/\r?\n/)) {
    const heading = HEADING_RE.exec(line);
    if (heading) {
      flushParagraph();
      blocks.push({ text: line.trim(), heading: { level: heading[1].length, title: heading[2].trim() } });
    } else if (line.trim() === '') {
      flushParagraph();
    } else {
      paragraph.push(line);
    }
  }
  flushParagraph();
  if (blocks.length === 0) return [];

  const chunks: RawChunk[] = [];
  const headingStack: Array<{ level: number; title: string }> = [];
  const currentPath = () => (headingStack.length ? headingStack.map((h) => h.title).join(' > ') : undefined);

  let buffer = '';
  let bufferPath: string | undefined;
  const flushChunk = () => {
    const text = buffer.trim();
    if (text) chunks.push({ text, headingPath: bufferPath });
    buffer = '';
  };
  const startNewBuffer = (withOverlapFrom?: string) => {
    buffer = withOverlapFrom && overlapChars > 0 ? `${withOverlapFrom.slice(-overlapChars)}\n` : '';
    bufferPath = currentPath();
  };

  startNewBuffer();
  for (const block of blocks) {
    if (block.heading) {
      while (headingStack.length && headingStack[headingStack.length - 1].level >= block.heading.level) {
        headingStack.pop();
      }
      headingStack.push(block.heading);
    }
    // Hard-split blocks that alone exceed the cap.
    const pieces: string[] = [];
    if (block.text.length > maxChars) {
      const stride = Math.max(1, maxChars - overlapChars);
      for (let i = 0; i < block.text.length; i += stride) {
        pieces.push(block.text.slice(i, i + maxChars));
      }
    } else {
      pieces.push(block.text);
    }
    for (let pieceIndex = 0; pieceIndex < pieces.length; pieceIndex++) {
      const piece = pieces[pieceIndex];
      if (buffer && buffer.length + piece.length + 1 > maxChars) {
        const prevText = buffer;
        flushChunk();
        // A non-first piece of a hard-split block already begins with the
        // previous piece's tail (baked in via the hard-split stride above),
        // so re-prepending the overlap here would duplicate it verbatim.
        // Only a flush before piece 0 — a real block boundary — needs it.
        if (pieceIndex > 0) {
          startNewBuffer();
        } else {
          startNewBuffer(prevText);
        }
      }
      // Covers the first block overall and the zero-overlap flush case,
      // where buffer starts empty and bufferPath must still reflect the
      // current heading stack.
      if (!buffer) bufferPath = currentPath();
      buffer = buffer ? `${buffer}\n${piece}` : piece;
      // A chunk that absorbs a heading is labeled by that (deepest) heading —
      // more useful for citations than the path where the buffer started.
      if (block.heading) bufferPath = currentPath();
      // A hard-split piece may still overflow with the overlap prefix attached.
      if (buffer.length > maxChars) {
        buffer = buffer.slice(-maxChars);
      }
    }
  }
  flushChunk();
  return chunks;
};
