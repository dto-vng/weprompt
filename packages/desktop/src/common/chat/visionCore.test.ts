/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { executeVision, toImageDataUrl } from './visionCore';

const cfg = { baseUrl: 'https://api.moonshot.ai/v1', apiKey: 'k-1', model: 'kimi-k2.6' };

describe('toImageDataUrl', () => {
  it('builds a data URL with the mime derived from the extension', () => {
    expect(toImageDataUrl(new Uint8Array([1]), 'a.png')).toMatch(/^data:image\/png;base64,/);
    expect(toImageDataUrl(new Uint8Array([1]), 'b.jpg')).toMatch(/^data:image\/jpeg;base64,/);
    expect(toImageDataUrl(new Uint8Array([1]), 'c.webp')).toMatch(/^data:image\/webp;base64,/);
  });
});

describe('executeVision', () => {
  it('POSTs chat/completions with an image_url part and returns the model content', async () => {
    const readFile = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ choices: [{ message: { content: 'A red apple on a table.' } }] }),
    });
    const res = await executeVision({ filePath: '/w/pic.png', question: 'What is this?' }, cfg, {
      readFile,
      fetchImpl,
    });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.moonshot.ai/v1/chat/completions');
    const body = JSON.parse((init as { body: string }).body);
    expect(body.model).toBe('kimi-k2.6');
    expect((init as { headers: Record<string, string> }).headers.Authorization).toBe('Bearer k-1');
    const parts = body.messages[0].content;
    expect(parts.some((p: { type: string }) => p.type === 'image_url')).toBe(true);
    expect(parts.some((p: { type: string; text?: string }) => p.type === 'text' && p.text === 'What is this?')).toBe(
      true
    );
    expect(res.success).toBe(true);
    expect(res.text).toBe('A red apple on a table.');
  });

  it('defaults the question when none is given', async () => {
    const readFile = vi.fn().mockResolvedValue(new Uint8Array([1]));
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
    });
    await executeVision({ filePath: '/w/x.png' }, cfg, { readFile, fetchImpl });
    const parts = JSON.parse(fetchImpl.mock.calls[0][1].body).messages[0].content;
    expect(parts.find((p: { type: string }) => p.type === 'text').text.length).toBeGreaterThan(0);
  });

  it('returns an error result on non-ok HTTP', async () => {
    const readFile = vi.fn().mockResolvedValue(new Uint8Array([1]));
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'unauthorized' });
    const res = await executeVision({ filePath: '/w/x.png' }, cfg, { readFile, fetchImpl });
    expect(res.success).toBe(false);
    expect(res.text).toContain('401');
  });

  it('returns an error result when config is incomplete', async () => {
    const res = await executeVision({ filePath: '/w/x.png' }, { baseUrl: '', apiKey: '', model: '' });
    expect(res.success).toBe(false);
  });

  it('returns an error result when the file cannot be read', async () => {
    const readFile = vi.fn().mockRejectedValue(new Error('nope'));
    const res = await executeVision({ filePath: '/w/missing.png' }, cfg, { readFile });
    expect(res.success).toBe(false);
  });
});
