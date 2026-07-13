/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { buildIdpFormData, executeIdp } from './idpCore';

const INGEST = 'https://host/maas/user-1/greennode/idp/v1/ocr/ingest';
const cfg = { ingestUrl: INGEST, apiKey: 'k-123' };
const noSleep = async () => {};

describe('buildIdpFormData', () => {
  it('includes the required IDP fields and the file', () => {
    const fd = buildIdpFormData(new Uint8Array([1, 2, 3]), 'id.jpg', {
      filePath: 'id.jpg',
      docType: 'ID',
      fileType: 'IMAGE',
    });
    expect(fd.get('model')).toBe('idp');
    expect(fd.get('flow')).toBe('single');
    expect(fd.get('doc_type')).toBe('ID');
    expect(fd.get('file_type')).toBe('IMAGE');
    expect(fd.get('file')).toBeInstanceOf(Blob);
  });

  it('defaults doc_type to ID and file_type to IMAGE when omitted', () => {
    const fd = buildIdpFormData(new Uint8Array([1]), 'x.png', { filePath: 'x.png' });
    expect(fd.get('doc_type')).toBe('ID');
    expect(fd.get('file_type')).toBe('IMAGE');
  });
});

describe('executeIdp (ingest → poll)', () => {
  it('ingests with a bearer header then polls the result URL and returns the documents JSON', async () => {
    const readFile = vi.fn().mockResolvedValue(new Uint8Array([1, 2]));
    const fetchImpl = vi
      .fn()
      // 1) ingest
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () => JSON.stringify({ data: { request_id: 'req-1', file_ids: ['f.png'] } }),
      })
      // 2) first poll: not finished
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ data: { progress: { total_doc: 1, ignored: 0, finished: 0 }, documents: [] } }),
      })
      // 3) second poll: finished
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            data: {
              progress: { total_doc: 1, ignored: 0, finished: 1 },
              documents: [{ document_type: 'ID', ocr_data: [{ name: 'name', value: ['A'] }], status: 'SUCCESS' }],
            },
          }),
      });

    const res = await executeIdp({ filePath: '/w/id.jpg', docType: 'ID' }, cfg, {
      readFile,
      fetchImpl,
      sleep: noSleep,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    // ingest call
    expect(fetchImpl.mock.calls[0][0]).toBe(INGEST);
    expect((fetchImpl.mock.calls[0][1] as RequestInit).method).toBe('POST');
    expect((fetchImpl.mock.calls[0][1] as { headers: Record<string, string> }).headers.Authorization).toBe(
      'Bearer k-123'
    );
    // poll call hits ingestUrl/request_id with GET
    expect(fetchImpl.mock.calls[1][0]).toBe(`${INGEST}/req-1`);
    expect((fetchImpl.mock.calls[1][1] as RequestInit).method).toBe('GET');
    // result
    expect(res.success).toBe(true);
    expect(res.text).toContain('"document_type":"ID"');
    expect(res.text).toContain('"name":"name"');
  });

  it('reports a failed ingest (non-ok) as an error result, not a throw', async () => {
    const readFile = vi.fn().mockResolvedValue(new Uint8Array([1]));
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'bad doc_type' });
    const res = await executeIdp({ filePath: '/w/x.jpg' }, cfg, { readFile, fetchImpl, sleep: noSleep });
    expect(res.success).toBe(false);
    expect(res.text).toContain('400');
  });

  it('times out gracefully when polling never completes', async () => {
    const readFile = vi.fn().mockResolvedValue(new Uint8Array([1]));
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () => JSON.stringify({ data: { request_id: 'req-2' } }),
      })
      .mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ data: { progress: { total_doc: 1, ignored: 0, finished: 0 }, documents: [] } }),
      });
    const res = await executeIdp({ filePath: '/w/x.jpg' }, cfg, { readFile, fetchImpl, sleep: noSleep, maxPolls: 3 });
    expect(res.success).toBe(false);
    expect(res.text.toLowerCase()).toContain('timed out');
  });

  it('returns an error result when config is incomplete', async () => {
    const res = await executeIdp({ filePath: '/w/x.jpg' }, { ingestUrl: '', apiKey: '' });
    expect(res.success).toBe(false);
  });
});
