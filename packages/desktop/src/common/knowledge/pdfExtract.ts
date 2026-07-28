/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Text-layer extraction for PDFs, and the page -> markdown rendering the
// ingestion pipeline feeds to the chunker.
//
// `pdfjs-dist` is imported ONLY here, and only through a lazy dynamic import
// (the DocumentConverter pattern). Two reasons: the main-process bundle
// externalizes dependencies so the parser is never loaded until a PDF is
// actually ingested, and the esbuild-bundled knowledge MCP subprocess — which
// only reads the finished index — must not pull a PDF parser into its bundle.
// Keep this module out of the subprocess's import graph.

/** Minimal structural view of the pdfjs surface we use. */
type PdfTextItem = { str?: string; hasEOL?: boolean };
type PdfPage = {
  getTextContent: () => Promise<{ items: PdfTextItem[] }>;
  cleanup: () => void;
};
type PdfDocument = { numPages: number; getPage: (pageNumber: number) => Promise<PdfPage> };
type PdfLoadingTask = { promise: Promise<PdfDocument>; destroy: () => Promise<void> };
export type PdfjsLike = {
  getDocument: (params: { data: Uint8Array; useSystemFonts?: boolean; isEvalSupported?: boolean }) => PdfLoadingTask;
};

export type PdfExtraction = {
  /** Text of each page that was read, in order. Length <= maxPages. */
  pages: string[];
  /** Pages in the document, even when only the first maxPages were read. */
  pageCount: number;
  /** False when the document is effectively image-only, i.e. a scan. */
  hasTextLayer: boolean;
  /** True when pageCount exceeded maxPages, so `pages` is cut short. */
  truncated: boolean;
};

export type PdfExtractOptions = {
  /** Read at most this many pages. Defaults to every page — callers own the policy. */
  maxPages?: number;
  /** Called with (pagesRead, pagesToRead) as extraction advances. */
  onProgress?: (pagesRead: number, pagesToRead: number) => void;
  /** Throttle for onProgress; the final page always reports. */
  progressEveryPages?: number;
  /** Injectable for tests; defaults to the lazy pdfjs import. */
  loadPdfjs?: () => Promise<PdfjsLike>;
};

// A scan yields exactly 0 characters, a real text layer yields ~1,600/page
// (measured across the sample corpus), so these thresholds sit in a very wide
// empty band. Both must hold: a handful of stray characters on a 50-page scan
// clears the total but not the per-page average, and a near-empty one-pager
// clears the average but not the total.
const MIN_TEXT_LAYER_CHARS = 100;
const MIN_TEXT_LAYER_CHARS_PER_PAGE = 20;

const DEFAULT_PROGRESS_EVERY_PAGES = 5;

const loadPdfjsDefault = async (): Promise<PdfjsLike> =>
  // The legacy build is the one that runs under plain Node: no DOM, and it
  // falls back to an in-process fake worker instead of needing a worker file.
  (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfjsLike;

/** Join a page's text items, honouring pdfjs's end-of-line markers. */
const joinTextItems = (items: PdfTextItem[]): string => {
  let text = '';
  for (const item of items) {
    if (typeof item.str !== 'string') continue;
    text += item.str;
    if (item.hasEOL) text += '\n';
  }
  return text.trimEnd();
};

/**
 * Extract per-page text from a PDF buffer. Throws a descriptive error when the
 * bytes cannot be parsed; callers turn that into a failed source.
 */
export const extractPdfText = async (data: Uint8Array, options: PdfExtractOptions = {}): Promise<PdfExtraction> => {
  const pdfjs = await (options.loadPdfjs ?? loadPdfjsDefault)();
  const progressEvery = options.progressEveryPages ?? DEFAULT_PROGRESS_EVERY_PAGES;

  let task: PdfLoadingTask;
  let doc: PdfDocument;
  try {
    // pdfjs mutates the buffer it is handed, so pass a private copy — the
    // caller's Buffer is also what gets written to the source snapshot.
    task = pdfjs.getDocument({ data: new Uint8Array(data), useSystemFonts: false, isEvalSupported: false });
    doc = await task.promise;
  } catch (error) {
    throw new Error(`The file could not be read as a PDF: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }

  try {
    const pageCount = doc.numPages;
    const pagesToRead = Math.max(0, Math.min(pageCount, options.maxPages ?? pageCount));
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pagesToRead; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        pages.push(joinTextItems(content.items));
      } finally {
        page.cleanup();
      }
      if (pageNumber % progressEvery === 0 || pageNumber === pagesToRead) {
        options.onProgress?.(pageNumber, pagesToRead);
      }
    }

    const totalChars = pages.reduce((sum, page) => sum + page.trim().length, 0);
    const hasTextLayer =
      pages.length > 0 &&
      totalChars >= MIN_TEXT_LAYER_CHARS &&
      totalChars / pages.length >= MIN_TEXT_LAYER_CHARS_PER_PAGE;

    return { pages, pageCount, hasTextLayer, truncated: pagesToRead < pageCount };
  } finally {
    await task.destroy().catch((): undefined => undefined);
  }
};

/**
 * Render extracted pages as markdown. One `## Page N` heading per page, so the
 * chunker captures a page number as each chunk's heading path and citations
 * can point at a page. Pages with no text are dropped, keeping their original
 * numbering intact.
 */
export const renderPagesAsMarkdown = (pages: string[]): string =>
  pages
    .map((text, index) => ({ text: text.trim(), pageNumber: index + 1 }))
    .filter((page) => page.text.length > 0)
    .map((page) => `## Page ${page.pageNumber}\n\n${page.text}`)
    .join('\n\n');
