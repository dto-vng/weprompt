/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Transcribe a scanned PDF into markdown with a multimodal chat model.
//
// A flatbed scan page is one image, and pdfjs decodes that image in plain Node
// (see pdfExtract's extractPageImages), so the whole chain is: raw pixels ->
// `sharp` -> JPEG -> one chat completion -> markdown. There is no OCR service
// and no field-extraction payload to flatten: a multimodal model returns
// markdown natively, which is directly indexable.
//
// `sharp` is imported ONLY here, and only through a lazy dynamic import, for
// the same two reasons pdfjs is: the main-process bundle externalizes
// dependencies so the native image library is not loaded until a scan is
// actually ingested, and the esbuild-bundled knowledge MCP subprocess — which
// only reads the finished index — must never pull it in. Keep this module out
// of the subprocess's import graph.

import {
  extractPageImages as defaultExtractPageImages,
  type PdfPageImageSkipReason,
  type PdfPageRaster,
} from './pdfExtract';

export type OcrConfig = { baseUrl: string; apiKey: string; model: string };

/**
 * The transcription instruction. A named constant because every clause is load
 * bearing against invention, which is the dangerous failure here: a model that
 * fabricates a plausible clause produces text that reads MORE confidently than
 * garbled OCR would, and nothing downstream can tell the difference.
 *
 * "Output nothing" is the escape hatch that makes an empty answer meaningful:
 * the caller treats it as a skipped page and never writes a placeholder.
 */
export const OCR_PROMPT =
  'Transcribe ALL text on this scanned document page into markdown. ' +
  'Preserve headings, lists and tables. ' +
  'Output only the transcription — no commentary. ' +
  'If the page has no legible text, output nothing.';

/**
 * Long edge handed to the model. 1600 px is what the proven run used: a
 * 2416x3404 Vietnamese contract page resized to this encoded to ~350 KB in
 * ~30 ms and transcribed with diacritics and tables intact.
 */
export const OCR_IMAGE_WIDTH = 1600;
const OCR_JPEG_QUALITY = 80;

/**
 * Room for a dense page of markdown. A full A4 page of Vietnamese contract text
 * lands around 3k tokens once tables are included.
 */
const OCR_MAX_TOKENS = 4096;

/**
 * Per-page ceiling on the model call. Measured pages came back in 5-18 s, so
 * this is wide headroom rather than a tight budget — its job is to stop a hung
 * request from wedging ingestion. Without it a single unanswered call would
 * hold the project's serialized queue forever: every other file waits behind
 * it, the source stays `indexing`, and there is no user-facing escape.
 * A timeout aborts one PAGE, which the caller records as a skip and moves on.
 */
const OCR_REQUEST_TIMEOUT_MS = 120_000;

/**
 * Bound one fetch, letting the AbortError propagate — the same shape as
 * embedCore's helper, which is the pattern this codebase settled on. (Note
 * `visionCore` predates it and has no timeout; do not copy that part of it.)
 */
const fetchWithTimeout = async (
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
};

/** Minimal structural view of the `sharp` surface used here. */
type SharpImage = {
  rotate: (angle: number) => SharpImage;
  resize: (options: { width: number; withoutEnlargement: boolean }) => SharpImage;
  jpeg: (options: { quality: number }) => SharpImage;
  toBuffer: () => Promise<Buffer>;
};
export type SharpLike = (
  input: Uint8Array,
  options: { raw: { width: number; height: number; channels: 3 | 4 } }
) => SharpImage;

const loadSharpDefault = async (): Promise<SharpLike> =>
  ((await import('sharp')) as unknown as { default: SharpLike }).default;

export type PdfOcrDeps = {
  fetchImpl?: typeof fetch;
  loadSharp?: () => Promise<SharpLike>;
  extractPageImagesImpl?: typeof defaultExtractPageImages;
  /** Per-page request ceiling; tests use a tiny value. */
  timeoutMs?: number;
};

/**
 * Encode one page's raster as a JPEG the model can read.
 *
 * Rotation is applied FIRST and deliberately: `/Rotate` is display-only
 * metadata, so the raster pdfjs hands back is the unrotated content, and one
 * real sample document is `rotate=270` on every page — feeding it straight
 * through gives the model a sideways contract. The direction (sharp rotates
 * clockwise, and `/Rotate` is the clockwise display rotation, so they compose
 * to upright) was verified against the rotated fixture by comparing the output
 * against an independent renderer, not derived on paper.
 *
 * `resize` runs after `rotate` — sharp honours that ordering — so the width cap
 * applies to the upright image, not the sideways one.
 */
export const rasterToJpeg = async (raster: PdfPageRaster, deps?: PdfOcrDeps): Promise<Buffer> => {
  const sharp = await (deps?.loadSharp ?? loadSharpDefault)();
  let image = sharp(raster.data, {
    raw: { width: raster.width, height: raster.height, channels: raster.channels },
  });
  if (raster.rotation !== 0) image = image.rotate(raster.rotation);
  return image
    .resize({ width: OCR_IMAGE_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: OCR_JPEG_QUALITY })
    .toBuffer();
};

/**
 * A model asked for "only the transcription" still sometimes wraps the whole
 * page in a fence. Left in place it would put ``` markers into every chunk, so
 * a fence that encloses the entire answer is unwrapped. A fence around only
 * part of the answer is real content and is kept.
 */
const stripEnclosingCodeFence = (text: string): string => {
  const match = /^```[\w-]*\n([\s\S]*?)\n?```$/.exec(text.trim());
  return match ? match[1].trim() : text.trim();
};

/**
 * Send one page image to the model and return its transcription, or '' when the
 * page yielded nothing usable.
 *
 * `temperature: 0` for the same reason as the prompt's wording. Any transport or
 * HTTP failure throws, so the caller can tell "the page is illegible" (empty
 * string) from "the model is unreachable" (an error) — those want different
 * words in front of the user.
 */
export const transcribePageImage = async (jpeg: Uint8Array, config: OcrConfig, deps?: PdfOcrDeps): Promise<string> => {
  const fetchImpl = deps?.fetchImpl ?? fetch;
  const dataUrl = `data:image/jpeg;base64,${Buffer.from(jpeg).toString('base64')}`;
  const response = await fetchWithTimeout(
    fetchImpl,
    `${config.baseUrl}/chat/completions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        max_tokens: OCR_MAX_TOKENS,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: OCR_PROMPT },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    },
    deps?.timeoutMs ?? OCR_REQUEST_TIMEOUT_MS
  );
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`the transcription model returned HTTP ${response.status}: ${body.slice(0, 300)}`);
  }
  let parsed: { choices?: Array<{ message?: { content?: string } }> };
  try {
    parsed = JSON.parse(body) as typeof parsed;
  } catch {
    throw new Error(`the transcription model returned a response that is not JSON: ${body.slice(0, 300)}`);
  }
  return stripEnclosingCodeFence(parsed.choices?.[0]?.message?.content ?? '');
};

export type PdfOcrResult = {
  /**
   * One entry per page read, in order: the page's markdown, or '' for a page
   * that produced nothing. Positions are preserved so renderPagesAsMarkdown
   * keeps the real page numbers in its `## Page N` markers.
   */
  pages: string[];
  /** 1-based numbers of the pages that produced no text, in order. */
  skippedPages: number[];
  /** Pages that produced text. Zero means the document could not be read. */
  transcribedCount: number;
  /** Pages in the document, even when only the first `maxPages` were read. */
  pageCount: number;
  truncated: boolean;
  /**
   * The last transport/HTTP failure, if any page hit one. Kept so a document
   * that transcribed nothing can say WHY — "the model is unreachable" and "the
   * pages are not flatbed scans" need different words in front of the user.
   */
  lastError?: string;
};

export type PdfOcrOptions = {
  maxPages?: number;
  /** Reported per page, as (pagesDone, pagesToRead). Awaited. */
  onProgress?: (done: number, total: number) => void | Promise<void>;
  deps?: PdfOcrDeps;
  objectTimeoutMs?: number;
};

/** Log line for a page nobody could transcribe. Kept short; one per page. */
const logSkip = (pageNumber: number, reason: PdfPageImageSkipReason | string): void => {
  console.info(`[projectKnowledge] OCR skipped page ${pageNumber}: ${reason}`);
};

/**
 * Transcribe a scanned PDF page by page.
 *
 * Serialized on purpose: this runs inside the per-project ingestion queue, and
 * one page at a time is also what bounds memory (a single decoded page can be
 * ~24 MB). A capped 50-page document is therefore ~50 model calls taking
 * minutes, which is precisely why per-page progress is reported.
 *
 * Never throws for a page-level problem. A page that cannot be classified,
 * encoded, transcribed, or that comes back blank is recorded in `skippedPages`
 * and the walk continues — a 20-page contract with 2 composite pages should
 * index 18 pages and say so, not fail outright.
 */
export const ocrPdfPages = async (
  data: Uint8Array,
  config: OcrConfig,
  options: PdfOcrOptions = {}
): Promise<PdfOcrResult> => {
  const extractPageImagesImpl = options.deps?.extractPageImagesImpl ?? defaultExtractPageImages;
  const pages: string[] = [];
  const skippedPages: number[] = [];
  let total = 0;
  let done = 0;
  let lastError: string | undefined;

  const summary = await extractPageImagesImpl(data, {
    maxPages: options.maxPages,
    objectTimeoutMs: options.objectTimeoutMs,
    onStart: (info) => {
      total = info.pagesToRead;
    },
    onPage: async (result) => {
      const index = result.pageNumber - 1;
      pages[index] = '';
      if (result.outcome === 'skip') {
        skippedPages.push(result.pageNumber);
        logSkip(result.pageNumber, result.reason);
      } else {
        try {
          const jpeg = await rasterToJpeg(result.raster, options.deps);
          const markdown = await transcribePageImage(jpeg, config, options.deps);
          if (markdown.trim().length === 0) {
            // The prompt tells the model to output nothing for an illegible
            // page, so an empty answer is a real signal. Inventing a
            // "[page N unreadable]" placeholder here would be indexed as
            // content and cited as if it came off the page.
            skippedPages.push(result.pageNumber);
            logSkip(result.pageNumber, 'the model returned no text');
          } else {
            pages[index] = markdown;
          }
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
          skippedPages.push(result.pageNumber);
          logSkip(result.pageNumber, lastError);
        }
      }
      done++;
      await options.onProgress?.(done, total || done);
    },
  });

  // Defensive: a page the walk never reported would otherwise leave a hole that
  // renderPagesAsMarkdown would read as `undefined`.
  for (let i = 0; i < summary.pagesRead; i++) pages[i] ??= '';

  return {
    pages,
    skippedPages,
    transcribedCount: pages.filter((page) => page.trim().length > 0).length,
    pageCount: summary.pageCount,
    truncated: summary.pagesRead < summary.pageCount,
    lastError,
  };
};
