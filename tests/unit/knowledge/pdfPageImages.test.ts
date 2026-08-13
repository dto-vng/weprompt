/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { extractPageImages, type PdfPageImageResult, type PdfjsLike } from '@/common/knowledge/pdfExtract';

const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(path.resolve(__dirname, '../../fixtures/knowledge', name)));

/** Collect every per-page result, which is what the OCR pass consumes. */
const collect = async (
  name: string,
  options: Partial<Parameters<typeof extractPageImages>[1]> = {}
): Promise<PdfPageImageResult[]> => {
  const results: PdfPageImageResult[] = [];
  await extractPageImages(fixture(name), { ...options, onPage: (result) => void results.push(result) });
  return results;
};

describe('extractPageImages', () => {
  it('yields the full-page raster of a flatbed scan page', async () => {
    const [page] = await collect('ocr-flatbed.pdf');
    expect(page.outcome).toBe('image');
    if (page.outcome !== 'image') return;
    // The fixture is a 60x40 marker image drawn across the whole 300x200 page:
    // the raster is the image's own pixels, not the page box.
    expect(page.raster).toMatchObject({ pageNumber: 1, width: 60, height: 40, channels: 3, rotation: 0 });
    expect(page.raster.data.length).toBe(60 * 40 * 3);
  });

  it('reports the page rotation rather than silently returning sideways pixels', async () => {
    const [page] = await collect('ocr-flatbed-rotated.pdf');
    expect(page.outcome).toBe('image');
    if (page.outcome !== 'image') return;
    // Every page of one real sample document is /Rotate 270. The raster is the
    // UNROTATED content, so losing this number feeds the model a sideways page.
    expect(page.raster.rotation).toBe(270);
    expect(page.raster).toMatchObject({ width: 40, height: 60 });
  });

  it('skips a print-composite page instead of transcribing a fragment of it', async () => {
    // Two small images, neither of them the page. Reassembling those needs real
    // rasterization (v2), so the honest answer is a per-page skip.
    const [page] = await collect('ocr-composite.pdf');
    expect(page).toMatchObject({ pageNumber: 1, outcome: 'skip', reason: 'partial-page' });
  });

  it('skips a packed 1-bit page rather than corrupting it', async () => {
    // pdfjs kind=1 is GRAYSCALE_1BPP: width*height/8 bytes of packed bits, which
    // is what CCITT/fax scans decode to. Treating it as one byte per pixel
    // renders noise, and noise is what a model starts inventing text from.
    const [page] = await collect('ocr-mono.pdf');
    expect(page).toMatchObject({ outcome: 'skip', reason: 'packed-1bpp' });
  });

  it('skips a page whose only image is a small stamp on a text page', async () => {
    // image-only.pdf draws an 80x40 image at 200x100 on a 595x842 page — 4% of
    // it. Not a scan, whatever the filename suggests.
    const [page] = await collect('image-only.pdf');
    expect(page).toMatchObject({ outcome: 'skip', reason: 'partial-page' });
  });

  it('skips a page that draws no image at all', async () => {
    const pages = await collect('text-layer.pdf');
    expect(pages).toHaveLength(2);
    expect(pages.every((p) => p.outcome === 'skip' && p.reason === 'no-image')).toBe(true);
  });

  it('honours maxPages and still reports the true page count', async () => {
    const results: PdfPageImageResult[] = [];
    const summary = await extractPageImages(fixture('text-layer.pdf'), {
      maxPages: 1,
      onPage: (result) => void results.push(result),
    });
    expect(summary).toEqual({ pageCount: 2, pagesRead: 1 });
    expect(results).toHaveLength(1);
  });

  it('awaits onPage before decoding the next page, so only one raster is live', async () => {
    // Memory bound, not a nicety: a 2416x3404 RGB page is ~24 MB, so a 50-page
    // scan buffered whole would be over a gigabyte.
    const order: string[] = [];
    await extractPageImages(fixture('text-layer.pdf'), {
      onPage: async (result) => {
        order.push(`enter-${result.pageNumber}`);
        await Promise.resolve();
        order.push(`leave-${result.pageNumber}`);
      },
    });
    expect(order).toEqual(['enter-1', 'leave-1', 'enter-2', 'leave-2']);
  });

  it('throws a descriptive error for bytes that are not a PDF', async () => {
    await expect(
      extractPageImages(new TextEncoder().encode('not a pdf at all'), { onPage: () => undefined })
    ).rejects.toThrow(/could not be read as a PDF/i);
  });
});

describe('extractPageImages classification, via an injected pdfjs', () => {
  const OPS = {
    save: 10,
    restore: 11,
    transform: 12,
    paintFormXObjectBegin: 74,
    paintFormXObjectEnd: 75,
    paintImageXObject: 85,
    paintImageMaskXObject: 83,
  };

  /** A one-page document whose operator list and image object are dictated. */
  const stubPdfjs = (
    ops: { fnArray: number[]; argsArray: unknown[] },
    image: unknown,
    pageProps: Record<string, unknown> = {}
  ): (() => Promise<PdfjsLike>) => {
    const page = {
      view: [0, 0, 300, 200],
      rotate: 0,
      ...pageProps,
      getTextContent: () => Promise.resolve({ items: [] }),
      getOperatorList: () => Promise.resolve(ops),
      objs: {
        get: (_id: string, cb: (obj: unknown) => void) => {
          if (image !== undefined) cb(image);
        },
      },
      cleanup: () => undefined,
    };
    return () =>
      Promise.resolve({
        OPS,
        getDocument: () => ({
          promise: Promise.resolve({ numPages: 1, getPage: () => Promise.resolve(page) }),
          destroy: () => Promise.resolve(),
        }),
      } as unknown as PdfjsLike);
  };

  const runOne = async (loadPdfjs: () => Promise<PdfjsLike>, objectTimeoutMs = 20): Promise<PdfPageImageResult> => {
    let out: PdfPageImageResult | null = null;
    await extractPageImages(new Uint8Array([1]), {
      loadPdfjs,
      objectTimeoutMs,
      onPage: (result) => void (out = result),
    });
    return out!;
  };

  const fullPageImageOps = {
    fnArray: [OPS.save, OPS.transform, OPS.paintImageXObject, OPS.restore],
    argsArray: [null, [300, 0, 0, 200, 0, 0], ['img_1', 4, 4], null],
  };

  it('skips a page whose image object never resolves, instead of hanging', async () => {
    // Observed on a real document: `objs.get` registers the callback and it is
    // simply never called back. pdfjs never rejects, so only a timeout escapes.
    const result = await runOne(stubPdfjs(fullPageImageOps, undefined));
    expect(result).toMatchObject({ outcome: 'skip', reason: 'unresolvable' });
  });

  it('rejects an image whose byte length disagrees with its declared size', async () => {
    const result = await runOne(
      stubPdfjs(fullPageImageOps, { kind: 2, width: 4, height: 4, data: new Uint8Array(10) })
    );
    expect(result).toMatchObject({ outcome: 'skip', reason: 'unsupported-kind' });
  });

  it('maps RGBA (kind 3) to four channels', async () => {
    const result = await runOne(
      stubPdfjs(fullPageImageOps, { kind: 3, width: 4, height: 4, data: new Uint8Array(4 * 4 * 4) })
    );
    expect(result.outcome).toBe('image');
    if (result.outcome === 'image') expect(result.raster.channels).toBe(4);
  });

  it('accounts for a form XObject matrix when measuring coverage', async () => {
    // A scan wrapped in a form XObject: the form is placed at page size and the
    // image is drawn into the form's unit square. Missing the Begin/End matrix
    // would score this page at 1/60000 of itself and skip a real scan.
    const ops = {
      fnArray: [
        OPS.paintFormXObjectBegin,
        OPS.save,
        OPS.transform,
        OPS.paintImageXObject,
        OPS.restore,
        OPS.paintFormXObjectEnd,
      ],
      argsArray: [
        [
          [300, 0, 0, 200, 0, 0],
          [0, 0, 1, 1],
        ],
        null,
        [1, 0, 0, 1, 0, 0],
        ['img_1', 4, 4],
        null,
        null,
      ],
    };
    const result = await runOne(stubPdfjs(ops, { kind: 2, width: 4, height: 4, data: new Uint8Array(48) }));
    expect(result.outcome).toBe('image');
  });

  it('restores the matrix on Q, so a later small image is not scored as full-page', async () => {
    const ops = {
      fnArray: [OPS.save, OPS.transform, OPS.restore, OPS.paintImageXObject],
      argsArray: [null, [300, 0, 0, 200, 0, 0], null, ['img_1', 4, 4]],
    };
    // After the restore the CTM is identity, so the image covers 1/60000 of the
    // page. Leaking the pushed matrix would have made this look like a scan.
    const result = await runOne(stubPdfjs(ops, { kind: 2, width: 4, height: 4, data: new Uint8Array(48) }));
    expect(result).toMatchObject({ outcome: 'skip', reason: 'partial-page' });
  });

  it('declines a page with two page-sized images rather than dropping one', async () => {
    const ops = {
      fnArray: [OPS.transform, OPS.paintImageXObject, OPS.paintImageXObject],
      argsArray: [
        [300, 0, 0, 200, 0, 0],
        ['img_1', 4, 4],
        ['img_2', 4, 4],
      ],
    };
    const result = await runOne(stubPdfjs(ops, { kind: 2, width: 4, height: 4, data: new Uint8Array(48) }));
    expect(result).toMatchObject({ outcome: 'skip', reason: 'composite' });
  });

  it('ignores a small stamp alongside a genuine full-page scan', async () => {
    // The realistic mixed case: a scanned page with a logo stamped on top. The
    // page IS a scan, so a strict one-image-only rule would lose it.
    const ops = {
      fnArray: [OPS.save, OPS.transform, OPS.paintImageXObject, OPS.restore, OPS.transform, OPS.paintImageXObject],
      argsArray: [null, [300, 0, 0, 200, 0, 0], ['img_1', 4, 4], null, [20, 0, 0, 20, 0, 0], ['img_logo', 2, 2]],
    };
    const result = await runOne(stubPdfjs(ops, { kind: 2, width: 4, height: 4, data: new Uint8Array(48) }));
    expect(result.outcome).toBe('image');
  });

  it('declines a full-page stencil mask, which is not a plain image XObject', async () => {
    const ops = {
      fnArray: [OPS.transform, OPS.paintImageMaskXObject],
      argsArray: [[300, 0, 0, 200, 0, 0], [{ width: 4, height: 4 }]],
    };
    const result = await runOne(stubPdfjs(ops, { kind: 2, width: 4, height: 4, data: new Uint8Array(48) }));
    expect(result).toMatchObject({ outcome: 'skip', reason: 'unsupported-image' });
  });

  it('normalises an odd rotation value to a quarter turn', async () => {
    const result = await runOne(
      stubPdfjs(fullPageImageOps, { kind: 2, width: 4, height: 4, data: new Uint8Array(48) }, { rotate: -90 })
    );
    expect(result.outcome).toBe('image');
    if (result.outcome === 'image') expect(result.raster.rotation).toBe(270);
  });

  it('loads pdfjs through the injected loader exactly once', async () => {
    const loadPdfjs = vi.fn(stubPdfjs(fullPageImageOps, { kind: 2, width: 4, height: 4, data: new Uint8Array(48) }));
    await runOne(loadPdfjs);
    expect(loadPdfjs).toHaveBeenCalledTimes(1);
  });
});
