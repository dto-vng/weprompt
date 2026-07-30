/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { extractPageImages, type PdfPageRaster } from '@/common/knowledge/pdfExtract';
import { OCR_PROMPT, ocrPdfPages, rasterToJpeg, transcribePageImage } from '@/common/knowledge/pdfOcr';

const CONFIG = { baseUrl: 'https://maas.example/v1', apiKey: 'sk-test', model: 'vendor/vision-model' };

const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(path.resolve(__dirname, '../../fixtures/knowledge', name)));

/** A chat-completions response carrying `content`. */
const completion = (content: string): Response =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

const rasterOf = async (name: string): Promise<PdfPageRaster> => {
  let raster: PdfPageRaster | null = null;
  await extractPageImages(fixture(name), {
    onPage: (result) => {
      if (result.outcome === 'image') raster = result.raster;
    },
  });
  if (!raster) throw new Error(`fixture ${name} yielded no raster`);
  return raster;
};

describe('rasterToJpeg', () => {
  it('encodes a page raster as a JPEG', async () => {
    const jpeg = await rasterToJpeg(await rasterOf('ocr-flatbed.pdf'));
    expect([...jpeg.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]); // JPEG SOI
  });

  it('turns a /Rotate 270 page upright, in the right direction', async () => {
    // The direction is the trap: applying the rotation the wrong way round is
    // just as "rotated" and still feeds the model a sideways contract.
    //
    // The fixture's embedded raster is a marker image (green left edge, red
    // top-left quadrant) turned 90 degrees clockwise, on a page carrying
    // /Rotate 270 — so a viewer shows it upright. The expectations below were
    // taken from an INDEPENDENT renderer's output for this same page (PyMuPDF,
    // which honours /Rotate), not derived on paper: green down the left edge,
    // white at top-right, red in the top-left quadrant, landscape 60x40.
    const sharp = (await import('sharp')).default;
    const jpeg = await rasterToJpeg(await rasterOf('ocr-flatbed-rotated.pdf'));
    const { data, info } = await sharp(jpeg).raw().toBuffer({ resolveWithObject: true });
    const at = (fx: number, fy: number): number[] => {
      const x = Math.min(info.width - 1, Math.floor(info.width * fx));
      const y = Math.min(info.height - 1, Math.floor(info.height * fy));
      const i = (y * info.width + x) * info.channels;
      return [data[i], data[i + 1], data[i + 2]];
    };
    const isGreen = ([r, g, b]: number[]): boolean => g > 150 && r < 100 && b < 100;
    const isRed = ([r, g, b]: number[]): boolean => r > 150 && g < 100 && b < 100;
    const isWhite = ([r, g, b]: number[]): boolean => r > 200 && g > 200 && b > 200;

    expect(info.width).toBeGreaterThan(info.height); // landscape, i.e. the turn happened
    expect(isGreen(at(0.01, 0.05))).toBe(true); // green edge runs down the LEFT
    expect(isGreen(at(0.01, 0.95))).toBe(true);
    expect(isWhite(at(0.98, 0.05))).toBe(true); // ...and not down the right
    expect(isRed(at(0.25, 0.25))).toBe(true); // red quadrant back at top-left
  });

  it('leaves an unrotated page alone', async () => {
    const rotate = vi.fn();
    const toBuffer = vi.fn(async () => Buffer.from([0xff, 0xd8]));
    const chain = {
      rotate,
      resize: () => chain,
      jpeg: () => chain,
      toBuffer,
    };
    rotate.mockReturnValue(chain);
    const loadSharp = async (): Promise<never> => (() => chain) as unknown as never;
    await rasterToJpeg(
      { pageNumber: 1, width: 2, height: 2, channels: 3, data: new Uint8Array(12), rotation: 0 },
      { loadSharp }
    );
    expect(rotate).not.toHaveBeenCalled();
    expect(toBuffer).toHaveBeenCalledTimes(1);
  });
});

describe('transcribePageImage', () => {
  it('posts the page as an image with temperature 0 and returns the markdown', async () => {
    const fetchImpl = vi.fn(async () => completion('## Hợp đồng\n\n| Điều | Nội dung |\n| --- | --- |'));
    const text = await transcribePageImage(new Uint8Array([1, 2, 3]), CONFIG, { fetchImpl: fetchImpl as never });
    expect(text).toContain('Hợp đồng');

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://maas.example/v1/chat/completions');
    const body = JSON.parse(init.body as string);
    // temperature 0 is a hallucination control, not a style preference.
    expect(body).toMatchObject({ model: 'vendor/vision-model', temperature: 0 });
    expect(body.messages[0].content[0]).toEqual({ type: 'text', text: OCR_PROMPT });
    expect(body.messages[0].content[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('returns an empty string when the model reports nothing legible', async () => {
    const fetchImpl = vi.fn(async () => completion('   \n  '));
    expect(await transcribePageImage(new Uint8Array([1]), CONFIG, { fetchImpl: fetchImpl as never })).toBe('');
  });

  it('unwraps a fence the model wrapped the whole page in', async () => {
    const fetchImpl = vi.fn(async () => completion('```markdown\n# Policy\n\nbody text\n```'));
    expect(await transcribePageImage(new Uint8Array([1]), CONFIG, { fetchImpl: fetchImpl as never })).toBe(
      '# Policy\n\nbody text'
    );
  });

  it('keeps a fence that is only part of the answer', async () => {
    const fetchImpl = vi.fn(async () => completion('# Appendix\n\n```\nliteral block\n```\n\ntrailing note'));
    const text = await transcribePageImage(new Uint8Array([1]), CONFIG, { fetchImpl: fetchImpl as never });
    expect(text).toContain('```');
    expect(text).toContain('trailing note');
  });

  it('throws on an HTTP failure, so it is distinguishable from an illegible page', async () => {
    const fetchImpl = vi.fn(async () => new Response('model not entitled', { status: 404 }));
    await expect(transcribePageImage(new Uint8Array([1]), CONFIG, { fetchImpl: fetchImpl as never })).rejects.toThrow(
      /HTTP 404/
    );
  });

  it('aborts a request that never answers, instead of wedging ingestion', async () => {
    // Ingestion is serialized per project, so one unanswered call would hold the
    // queue forever: every other file waits behind it and the source stays
    // `indexing` with no user-facing escape. The bound turns that into one
    // skipped page.
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('The operation was aborted.')));
        })
    );
    await expect(
      transcribePageImage(new Uint8Array([1]), CONFIG, { fetchImpl: fetchImpl as never, timeoutMs: 20 })
    ).rejects.toThrow(/abort/i);
    // The signal must actually be handed to fetch, or the ceiling is decorative.
    expect((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].signal).toBeDefined();
  });

  it('throws when the response body is not JSON', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>gateway</html>', { status: 200 }));
    await expect(transcribePageImage(new Uint8Array([1]), CONFIG, { fetchImpl: fetchImpl as never })).rejects.toThrow(
      /not JSON/
    );
  });
});

describe('ocrPdfPages', () => {
  /** Stand-in for the pdfjs page walk, so no real PDF is needed. */
  const fakePages =
    (pages: Array<{ ok: boolean; reason?: string }>, pageCount = pages.length): typeof extractPageImages =>
    async (_data, options) => {
      options.onStart?.({ pageCount, pagesToRead: pages.length });
      for (const [index, page] of pages.entries()) {
        await options.onPage(
          page.ok
            ? {
                pageNumber: index + 1,
                outcome: 'image',
                raster: {
                  pageNumber: index + 1,
                  width: 2,
                  height: 2,
                  channels: 3,
                  data: new Uint8Array(12),
                  rotation: 0,
                },
              }
            : { pageNumber: index + 1, outcome: 'skip', reason: (page.reason ?? 'partial-page') as never }
        );
      }
      return { pageCount, pagesRead: pages.length };
    };

  const stubSharp = async (): Promise<never> => {
    const chain = {
      rotate: () => chain,
      resize: () => chain,
      jpeg: () => chain,
      toBuffer: async () => Buffer.from([1]),
    };
    return (() => chain) as unknown as never;
  };

  it('transcribes every eligible page and keeps positions for the skipped ones', async () => {
    const fetchImpl = vi.fn(async () => completion('page text'));
    const result = await ocrPdfPages(new Uint8Array([1]), CONFIG, {
      deps: {
        fetchImpl: fetchImpl as never,
        loadSharp: stubSharp,
        extractPageImagesImpl: fakePages([{ ok: true }, { ok: false, reason: 'composite' }, { ok: true }]),
      },
    });
    // Position matters: renderPagesAsMarkdown numbers `## Page N` by index, so
    // a skipped page must leave a hole rather than shift page 3 up to 2.
    expect(result.pages).toEqual(['page text', '', 'page text']);
    expect(result.skippedPages).toEqual([2]);
    expect(result.transcribedCount).toBe(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2); // the skipped page costs nothing
  });

  it('never calls the model for a page it could not classify', async () => {
    const fetchImpl = vi.fn(async () => completion('should not happen'));
    const result = await ocrPdfPages(new Uint8Array([1]), CONFIG, {
      deps: {
        fetchImpl: fetchImpl as never,
        loadSharp: stubSharp,
        extractPageImagesImpl: fakePages([{ ok: false, reason: 'packed-1bpp' }]),
      },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result).toMatchObject({ transcribedCount: 0, skippedPages: [1] });
  });

  it('treats a blank answer as a skipped page, never as a placeholder', async () => {
    const fetchImpl = vi.fn(async () => completion(''));
    const result = await ocrPdfPages(new Uint8Array([1]), CONFIG, {
      deps: { fetchImpl: fetchImpl as never, loadSharp: stubSharp, extractPageImagesImpl: fakePages([{ ok: true }]) },
    });
    expect(result.pages).toEqual(['']);
    expect(result.skippedPages).toEqual([1]);
    expect(result.transcribedCount).toBe(0);
  });

  it('records a timed-out page as a skip and carries on to the next', async () => {
    let call = 0;
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => {
      call += 1;
      if (call === 1) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('The operation was aborted.')));
        });
      }
      return Promise.resolve(completion('second page text'));
    });
    const result = await ocrPdfPages(new Uint8Array([1]), CONFIG, {
      deps: {
        fetchImpl: fetchImpl as never,
        loadSharp: stubSharp,
        timeoutMs: 20,
        extractPageImagesImpl: fakePages([{ ok: true }, { ok: true }]),
      },
    });
    expect(result.skippedPages).toEqual([1]);
    expect(result.transcribedCount).toBe(1);
    expect(result.lastError).toMatch(/abort/i);
  });

  it('keeps going after one page fails and records the reason', async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      return call === 1 ? new Response('upstream timeout', { status: 503 }) : completion('second page text');
    });
    const result = await ocrPdfPages(new Uint8Array([1]), CONFIG, {
      deps: {
        fetchImpl: fetchImpl as never,
        loadSharp: stubSharp,
        extractPageImagesImpl: fakePages([{ ok: true }, { ok: true }]),
      },
    });
    expect(result.skippedPages).toEqual([1]);
    expect(result.transcribedCount).toBe(1);
    expect(result.lastError).toMatch(/HTTP 503/);
  });

  it('reports progress per page and the true page count when capped', async () => {
    const onProgress = vi.fn();
    const result = await ocrPdfPages(new Uint8Array([1]), CONFIG, {
      maxPages: 2,
      onProgress,
      deps: {
        fetchImpl: (async () => completion('text')) as never,
        loadSharp: stubSharp,
        extractPageImagesImpl: fakePages([{ ok: true }, { ok: true }], 9),
      },
    });
    expect(onProgress.mock.calls).toEqual([
      [1, 2],
      [2, 2],
    ]);
    expect(result).toMatchObject({ pageCount: 9, truncated: true });
  });
});
