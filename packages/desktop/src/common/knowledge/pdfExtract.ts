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
/** What `page.objs.get` hands back for an image XObject. */
export type PdfImageObject = {
  /** pdfjs ImageKind: 1 = GRAYSCALE_1BPP (packed), 2 = RGB_24BPP, 3 = RGBA_32BPP. */
  kind?: number;
  width?: number;
  height?: number;
  data?: Uint8Array | Uint8ClampedArray;
};
type PdfObjects = { get: (objId: string, callback: (obj: PdfImageObject | null) => void) => void };
type PdfOperatorList = { fnArray: number[]; argsArray: unknown[] };
type PdfPage = {
  getTextContent: () => Promise<{ items: PdfTextItem[] }>;
  cleanup: () => void;
  /** Degrees of clockwise rotation a viewer applies when displaying the page. */
  rotate?: number;
  /** [x0, y0, x1, y1] of the effective page box, in the content stream's space. */
  view?: number[];
  getOperatorList?: () => Promise<PdfOperatorList>;
  objs?: PdfObjects;
  commonObjs?: PdfObjects;
};
type PdfDocument = { numPages: number; getPage: (pageNumber: number) => Promise<PdfPage> };
type PdfLoadingTask = { promise: Promise<PdfDocument>; destroy: () => Promise<void> };
export type PdfjsLike = {
  getDocument: (params: {
    data: Uint8Array;
    useSystemFonts?: boolean;
    isEvalSupported?: boolean;
    verbosity?: number;
  }) => PdfLoadingTask;
  /** Operator opcodes. Only the page-image path reads these. */
  OPS?: Record<string, number>;
};

/**
 * pdfjs VerbosityLevel.ERRORS. Without this every ingest logs warnings aimed
 * at renderers, notably a demand for `standardFontDataUrl`. That parameter
 * only affects glyph rendering: extracted text was byte-identical with and
 * without it across the sample corpus, so we take the silence, not the asset
 * path (which would have to resolve inside the packaged asar).
 */
const PDFJS_VERBOSITY_ERRORS = 0;

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
  /**
   * Called with (pagesRead, pagesToRead) as extraction advances. Awaited, so a
   * reporter that persists progress cannot interleave with the next page.
   */
  onProgress?: (pagesRead: number, pagesToRead: number) => void | Promise<void>;
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
 * Open a PDF buffer, normalising any parser failure into one descriptive error
 * that callers can surface as a failed source.
 */
const openDocument = async (
  pdfjs: PdfjsLike,
  data: Uint8Array
): Promise<{ task: PdfLoadingTask; doc: PdfDocument }> => {
  try {
    // pdfjs mutates the buffer it is handed, so pass a private copy — the
    // caller's Buffer is also what the rest of ingestion reads.
    const task = pdfjs.getDocument({
      data: new Uint8Array(data),
      useSystemFonts: false,
      isEvalSupported: false,
      verbosity: PDFJS_VERBOSITY_ERRORS,
    });
    return { task, doc: await task.promise };
  } catch (error) {
    throw new Error(`The file could not be read as a PDF: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
};

/**
 * Extract per-page text from a PDF buffer. Throws a descriptive error when the
 * bytes cannot be parsed; callers turn that into a failed source.
 */
export const extractPdfText = async (data: Uint8Array, options: PdfExtractOptions = {}): Promise<PdfExtraction> => {
  const pdfjs = await (options.loadPdfjs ?? loadPdfjsDefault)();
  const progressEvery = options.progressEveryPages ?? DEFAULT_PROGRESS_EVERY_PAGES;
  const { task, doc } = await openDocument(pdfjs, data);

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
        await options.onProgress?.(pageNumber, pagesToRead);
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

// ---------------------------------------------------------------------------
// Page images, for the scanned-PDF (OCR) path.
//
// A flatbed scan page IS one image: exactly one raster drawn across the whole
// page box. pdfjs will hand us those decoded bytes without any canvas, so a
// scan can be turned back into a picture in plain Node. Print-composites (a
// deck exported to PDF: logos, strips, diagrams — 3 to 9 images, none of them
// the page) cannot be reassembled without real rasterization, so they are
// reported as skips rather than guessed at.
// ---------------------------------------------------------------------------

/** Why a page yielded no usable image. Diagnostic; callers only count them. */
export type PdfPageImageSkipReason =
  /** No image operator at all — a vector-drawn or blank page. */
  | 'no-image'
  /** Images present, but none covers the page: a print-composite. */
  | 'partial-page'
  /** More than one page-sized image (an overlay); picking one would lose content. */
  | 'composite'
  /** A mask, inline, or tiled image rather than a plain image XObject. */
  | 'unsupported-image'
  /**
   * pdfjs ImageKind.GRAYSCALE_1BPP: width x height / 8 bytes of PACKED bits,
   * which is what CCITT/fax scans decode to. Handing it to an image encoder as
   * one byte per pixel renders noise, so v1 skips it rather than corrupting it.
   */
  | 'packed-1bpp'
  /** A kind we do not have a channel mapping for, or a byte length that disagrees. */
  | 'unsupported-kind'
  /** `objs.get` never called back within the timeout — observed on real files. */
  | 'unresolvable';

/** One page's full-page raster, ready to be encoded and transcribed. */
export type PdfPageRaster = {
  pageNumber: number;
  width: number;
  height: number;
  /** 3 for RGB, 4 for RGBA. Matches `data`'s interleaving. */
  channels: 3 | 4;
  data: Uint8Array;
  /**
   * Degrees clockwise a viewer rotates the page by (`/Rotate`). The raster is
   * the UNROTATED content, so a consumer must apply this or feed the model a
   * sideways page — one real sample document is `rotate=270` throughout.
   */
  rotation: number;
};

/**
 * Discriminated by a STRING rather than an `ok: boolean`, deliberately: this
 * repo's tsconfig leaves `strictNullChecks` off, and without it TypeScript will
 * not narrow the false side of a boolean discriminant — `if (!result.ok)` still
 * sees the success member and `result.reason` fails to compile. A string
 * discriminant narrows both ways in either mode. Do not "simplify" it.
 */
export type PdfPageImageResult =
  | { pageNumber: number; outcome: 'image'; raster: PdfPageRaster }
  | { pageNumber: number; outcome: 'skip'; reason: PdfPageImageSkipReason };

export type PdfPageImageOptions = {
  maxPages?: number;
  /**
   * Called once, after the document opens and before the first page. This is
   * the only point at which a consumer learns how many pages it is about to be
   * given, which is what a per-page progress total needs.
   */
  onStart?: (info: { pageCount: number; pagesToRead: number }) => void;
  /**
   * Called once per page, in order, and AWAITED — which is what bounds memory:
   * a 2416x3404 RGB page is ~24 MB, so the consumer must finish with one page
   * before the next is decoded. Never buffer these.
   */
  onPage: (result: PdfPageImageResult) => void | Promise<void>;
  loadPdfjs?: () => Promise<PdfjsLike>;
  /** Give up on one image object after this long. */
  objectTimeoutMs?: number;
};

/**
 * Minimum share of the page box a single image must cover to count as "this
 * page is a scan of a document". The sample corpus is bimodal — flatbed pages
 * are at ~1.0 and composite images at well under 0.1 — so the exact cut is not
 * delicate. Slightly over 1.0 (a scan with bleed) is fine and still passes.
 */
const MIN_PAGE_IMAGE_COVERAGE = 0.9;

const DEFAULT_OBJECT_TIMEOUT_MS = 3000;

/** pdfjs ImageKind -> bytes per pixel in `data`. 1BPP is packed, so unmapped. */
const CHANNELS_BY_IMAGE_KIND: Record<number, 3 | 4> = { 2: 3, 3: 4 };
const IMAGE_KIND_GRAYSCALE_1BPP = 1;

/**
 * Ask pdfjs for an image object, giving up after `timeoutMs`.
 *
 * `objs.get(id, cb)` registers a callback that fires when the worker's `obj`
 * message arrives and NEVER rejects or throws — for an id that never arrives it
 * simply stays silent, which is exactly the failure seen on one real document.
 * `objs.has()` is not a usable pre-check: it is still false right after
 * `getOperatorList()` resolves, because the image data travels separately.
 *
 * An image can be sent to either the page-local or the document-wide store
 * (pdfjs decides, via `cacheGlobally`), so both are raced.
 */
const getImageObject = (page: PdfPage, objId: string, timeoutMs: number): Promise<PdfImageObject | null> =>
  new Promise((resolve) => {
    let settled = false;
    const finish = (obj: PdfImageObject | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(obj);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    for (const store of [page.objs, page.commonObjs]) {
      try {
        store?.get(objId, (obj) => {
          if (obj) finish(obj);
        });
      } catch {
        // A store that rejects the lookup outright just cannot answer; the
        // other one, or the timeout, decides.
      }
    }
  });

/**
 * Classify a page's image operators and return the id of the one image that IS
 * the page, if there is exactly one.
 *
 * Coverage is measured from the current transformation matrix rather than the
 * image's own pixel dimensions: a 2416x3404 scan drawn onto an A4 page is
 * placed by a `cm` of roughly [595, 0, 0, 842, 0, 0]. Only |det| is tracked,
 * because the area of the transformed unit square is |ad - bc| and
 * |det(A x B)| = |det A| x |det B| — so the matrices never have to be
 * multiplied out, and the multiplication order cannot be got wrong.
 */
const findFullPageImage = (
  ops: PdfOperatorList,
  opsCodes: Record<string, number>,
  pageArea: number
): { objId: string } | { reason: PdfPageImageSkipReason } => {
  const imageOps = new Set(
    [
      'paintImageXObject',
      'paintImageXObjectRepeat',
      'paintInlineImageXObject',
      'paintInlineImageXObjectGroup',
      'paintImageMaskXObject',
      'paintImageMaskXObjectGroup',
      'paintImageMaskXObjectRepeat',
      'paintSolidColorImageMask',
    ]
      .map((name) => opsCodes[name])
      .filter((code): code is number => typeof code === 'number')
  );
  const stack: number[] = [];
  let area = 1; // |det| of the accumulated CTM, i.e. the drawn area of a unit square
  let imageCount = 0;
  const fullPage: Array<{ objId: string | null }> = [];

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    if (fn === opsCodes.save) {
      stack.push(area);
    } else if (fn === opsCodes.restore) {
      // A content stream with unbalanced q/Q would otherwise underflow.
      area = stack.pop() ?? area;
    } else if (fn === opsCodes.transform) {
      const m = ops.argsArray[i] as number[] | undefined;
      if (m && m.length >= 4) area *= Math.abs(m[0] * m[3] - m[1] * m[2]);
    } else if (fn === opsCodes.paintFormXObjectBegin) {
      // pdfjs inlines form XObjects and brackets them with Begin/End, carrying
      // the form's own matrix in args[0]. No surrounding save/restore is
      // emitted, so this pair maintains its own scope.
      stack.push(area);
      const m = (ops.argsArray[i] as unknown[] | undefined)?.[0] as number[] | undefined;
      if (m && m.length >= 4) area *= Math.abs(m[0] * m[3] - m[1] * m[2]);
    } else if (fn === opsCodes.paintFormXObjectEnd) {
      area = stack.pop() ?? area;
    } else if (imageOps.has(fn)) {
      imageCount++;
      if (pageArea > 0 && area / pageArea >= MIN_PAGE_IMAGE_COVERAGE) {
        const args = ops.argsArray[i] as unknown[] | undefined;
        const objId = fn === opsCodes.paintImageXObject && typeof args?.[0] === 'string' ? args[0] : null;
        fullPage.push({ objId });
      }
    }
  }

  if (fullPage.length === 0) return { reason: imageCount === 0 ? 'no-image' : 'partial-page' };
  // Two page-sized images means a background plus an overlay; transcribing
  // only one of them would silently drop content, so decline the page.
  if (fullPage.length > 1) return { reason: 'composite' };
  const objId = fullPage[0].objId;
  return objId === null ? { reason: 'unsupported-image' } : { objId };
};

/**
 * Walk a PDF's pages and hand each one's full-page raster to `onPage`, or a
 * skip with the reason it could not be produced.
 *
 * Failure is deliberately per-page and additive: a 20-page contract with 2
 * print-composite pages transcribes 18 pages and says so, which is far more
 * useful than refusing the document. Throws only when the bytes are not a PDF
 * at all.
 */
export const extractPageImages = async (
  data: Uint8Array,
  options: PdfPageImageOptions
): Promise<{ pageCount: number; pagesRead: number }> => {
  const pdfjs = await (options.loadPdfjs ?? loadPdfjsDefault)();
  const opsCodes = pdfjs.OPS ?? {};
  const timeoutMs = options.objectTimeoutMs ?? DEFAULT_OBJECT_TIMEOUT_MS;
  const { task, doc } = await openDocument(pdfjs, data);

  try {
    const pageCount = doc.numPages;
    const pagesToRead = Math.max(0, Math.min(pageCount, options.maxPages ?? pageCount));
    options.onStart?.({ pageCount, pagesToRead });
    for (let pageNumber = 1; pageNumber <= pagesToRead; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      try {
        await options.onPage(await readPageImage(page, pageNumber, opsCodes, timeoutMs));
      } finally {
        // After onPage: cleanup() clears the object store the raster came from,
        // and the consumer has finished with it by now.
        page.cleanup();
      }
    }
    return { pageCount, pagesRead: pagesToRead };
  } finally {
    await task.destroy().catch((): undefined => undefined);
  }
};

/** One page's worth of the work above. Never throws; every failure is a skip. */
const readPageImage = async (
  page: PdfPage,
  pageNumber: number,
  opsCodes: Record<string, number>,
  timeoutMs: number
): Promise<PdfPageImageResult> => {
  const skip = (reason: PdfPageImageSkipReason): PdfPageImageResult => ({ pageNumber, outcome: 'skip', reason });
  if (!page.getOperatorList) return skip('no-image');

  let ops: PdfOperatorList;
  try {
    ops = await page.getOperatorList();
  } catch {
    return skip('unresolvable');
  }

  // `view` is the effective page box in the same unrotated space the content
  // stream's matrices live in, which is what makes the coverage ratio valid.
  const view = page.view ?? [];
  const pageArea = view.length >= 4 ? Math.abs((view[2] - view[0]) * (view[3] - view[1])) : 0;
  const found = findFullPageImage(ops, opsCodes, pageArea);
  if ('reason' in found) return skip(found.reason);

  const image = await getImageObject(page, found.objId, timeoutMs);
  if (!image || !image.data || !image.width || !image.height) return skip('unresolvable');
  if (image.kind === IMAGE_KIND_GRAYSCALE_1BPP) return skip('packed-1bpp');
  const channels = CHANNELS_BY_IMAGE_KIND[image.kind ?? -1];
  if (!channels) return skip('unsupported-kind');
  // Belt and braces against a kind whose packing we have misjudged: an encoder
  // fed the wrong stride produces a plausible-looking picture of noise, and a
  // model asked to transcribe noise is exactly where invention starts.
  if (image.data.length < image.width * image.height * channels) return skip('unsupported-kind');

  const rotation = (((Math.round((page.rotate ?? 0) / 90) * 90) % 360) + 360) % 360;
  return {
    pageNumber,
    outcome: 'image',
    raster: {
      pageNumber,
      width: image.width,
      height: image.height,
      channels,
      data: image.data instanceof Uint8Array ? image.data : new Uint8Array(image.data),
      rotation,
    },
  };
};

/** The page-marker heading. Written by renderPagesAsMarkdown, read by pageSpanLabel. */
const pageHeading = (pageNumber: number): string => `## Page ${pageNumber}`;
const PAGE_HEADING_PATTERN = String.raw`^## Page (\d+)$`;

/**
 * Derive a chunk's citation label from the page markers inside it.
 *
 * The chunker labels a chunk with the DEEPEST heading it absorbed, which for
 * page markers means the last one — so a chunk covering pages 1-3 came out
 * labelled `Page 3`, pointing past most of the text being cited. Reading the
 * markers back gives the true span instead.
 *
 * Returns undefined when the chunk holds no marker at all (a page whose body
 * outgrew one chunk leaves continuations with no heading); callers should keep
 * the chunker's inherited path in that case, which is the correct page.
 */
export const pageSpanLabel = (chunkText: string): string | undefined => {
  // Built per call: a shared /g regex carries lastIndex between calls.
  const matches = [...chunkText.matchAll(new RegExp(PAGE_HEADING_PATTERN, 'gm'))];
  if (matches.length === 0) return undefined;
  const pageNumbers = matches.map((match) => Number(match[1]));
  const first = Math.min(...pageNumbers);
  const last = Math.max(...pageNumbers);
  // En dash: this is a range, and the label is display-only — heading paths are
  // never tokenized for BM25 (only chunk text is).
  return first === last ? `Page ${first}` : `Pages ${first}–${last}`;
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
    .map((page) => `${pageHeading(page.pageNumber)}\n\n${page.text}`)
    .join('\n\n');
