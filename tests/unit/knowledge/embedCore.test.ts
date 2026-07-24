/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { cosineSim, embedTexts } from '@/common/knowledge/embedCore';

const CONFIG = { baseUrl: 'https://api.example.com/v1', apiKey: 'sk-test', model: 'text-embedding-3-small' };

const okResponse = (embeddings: number[][]) => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify({ data: embeddings.map((e, index) => ({ index, embedding: e })) }),
});

describe('embedTexts', () => {
  it('POSTs to /embeddings with auth and returns vectors in order', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      okResponse([
        [1, 0],
        [0, 1],
      ])
    );
    const result = await embedTexts(['a', 'b'], CONFIG, { fetchImpl: fetchImpl as never });
    expect(result).toEqual([
      [1, 0],
      [0, 1],
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.example.com/v1/embeddings');
    expect(init.headers.Authorization).toBe('Bearer sk-test');
    expect(JSON.parse(init.body)).toEqual({ model: CONFIG.model, input: ['a', 'b'] });
  });

  it('batches more than 32 inputs into sequential requests', async () => {
    const fetchImpl = vi.fn().mockImplementation(async (_url: string, init: { body: string }) => {
      const inputs = JSON.parse(init.body).input as string[];
      return okResponse(inputs.map(() => [1]));
    });
    const texts = Array.from({ length: 70 }, (_, i) => `t${i}`);
    const result = await embedTexts(texts, CONFIG, { fetchImpl: fetchImpl as never });
    expect(result).toHaveLength(70);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // 32 + 32 + 6
  });

  it('throws a descriptive error on HTTP failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'unauthorized' });
    await expect(embedTexts(['a'], CONFIG, { fetchImpl: fetchImpl as never })).rejects.toThrow(/401/);
  });

  it('strips a trailing slash from baseUrl', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse([[1]]));
    await embedTexts(['a'], { ...CONFIG, baseUrl: 'https://api.example.com/v1/' }, { fetchImpl: fetchImpl as never });
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.example.com/v1/embeddings');
  });

  it('reorders vectors by response index even when the API returns them out of order', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          data: [
            { index: 1, embedding: [0, 1] },
            { index: 0, embedding: [1, 0] },
          ],
        }),
    });
    const result = await embedTexts(['a', 'b'], CONFIG, { fetchImpl: fetchImpl as never });
    expect(result).toEqual([
      [1, 0],
      [0, 1],
    ]);
  });

  it('throws when the response vector count does not match the input count', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: [{ index: 0, embedding: [1, 0] }] }),
    });
    await expect(embedTexts(['a', 'b'], CONFIG, { fetchImpl: fetchImpl as never })).rejects.toThrow(
      /one vector per input/
    );
  });

  it('throws when a response vector contains a non-numeric entry', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: [{ index: 0, embedding: ['x'] }] }),
    });
    await expect(embedTexts(['a'], CONFIG, { fetchImpl: fetchImpl as never })).rejects.toThrow(/malformed/);
  });

  it('aborts and rejects when a request exceeds timeoutMs', async () => {
    const fetchImpl = vi.fn().mockImplementation((_url: string, init: { signal: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    });
    await expect(embedTexts(['a'], CONFIG, { fetchImpl: fetchImpl as never, timeoutMs: 10 })).rejects.toThrow();
  });
});

describe('cosineSim', () => {
  it('computes cosine similarity', () => {
    expect(cosineSim([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSim([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSim([1, 1], [1, 0])).toBeCloseTo(Math.SQRT1_2);
  });

  it('returns 0 for zero vectors or length mismatch', () => {
    expect(cosineSim([0, 0], [1, 0])).toBe(0);
    expect(cosineSim([1], [1, 0])).toBe(0);
  });

  it('accepts typed arrays such as Float32Array', () => {
    expect(cosineSim(new Float32Array([1, 0]), [1, 0])).toBeCloseTo(1);
  });
});
