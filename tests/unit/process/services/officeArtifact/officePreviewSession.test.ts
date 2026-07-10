/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OFFICE_PREVIEW_PARTITION } from '@/common/types/office/artifactEditor';

type BeforeRequestListener = (details: { url: string }, callback: (response: { cancel: boolean }) => void) => void;

const electronMocks = vi.hoisted(() => {
  const onBeforeRequest = vi.fn<(listener: BeforeRequestListener) => void>();
  const fromPartition = vi.fn(() => ({ webRequest: { onBeforeRequest } }));
  return { fromPartition, onBeforeRequest };
});

vi.mock('electron', () => ({
  session: { fromPartition: electronMocks.fromPartition },
}));

let officePreviewSession: typeof import('@/process/services/office-artifact/officePreviewSession');

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  officePreviewSession = await import('@/process/services/office-artifact/officePreviewSession');
});

describe('isAllowedOfficePreviewRequest', () => {
  it.each([
    ['file:///workspace/report.docx', true],
    ['data:text/css,body{}', true],
    ['blob:http://127.0.0.1/id', true],
    ['http://127.0.0.1:18791/', true],
    ['https://localhost:18888/app.js', true],
    ['ws://127.0.0.1:18791/live', true],
    ['wss://[::1]:18791/live', true],
    ['https://fonts.googleapis.com/css2', false],
    ['wss://cdn.example.com/live', false],
    ['https://localhost.evil.example/app.js', false],
    ['not a url', false],
  ])('classifies %s', (url, allowed) => {
    expect(officePreviewSession.isAllowedOfficePreviewRequest(url)).toBe(allowed);
  });
});

describe('installOfficePreviewSession', () => {
  it('installs the request filter on the dedicated partition only once', () => {
    officePreviewSession.installOfficePreviewSession();
    officePreviewSession.installOfficePreviewSession();

    expect(electronMocks.fromPartition).toHaveBeenCalledOnce();
    expect(electronMocks.fromPartition).toHaveBeenCalledWith(OFFICE_PREVIEW_PARTITION);
    expect(electronMocks.onBeforeRequest).toHaveBeenCalledOnce();
  });

  it('cancels requests rejected by the offline policy', () => {
    officePreviewSession.installOfficePreviewSession();
    const listener = electronMocks.onBeforeRequest.mock.calls[0]?.[0];
    if (!listener) throw new Error('Office preview request listener was not installed');
    const callback = vi.fn<(response: { cancel: boolean }) => void>();

    listener({ url: 'https://cdn.jsdelivr.net/npm/katex' }, callback);

    expect(callback).toHaveBeenCalledWith({ cancel: true });
  });

  it('keeps requests accepted by the offline policy', () => {
    officePreviewSession.installOfficePreviewSession();
    const listener = electronMocks.onBeforeRequest.mock.calls[0]?.[0];
    if (!listener) throw new Error('Office preview request listener was not installed');
    const callback = vi.fn<(response: { cancel: boolean }) => void>();

    listener({ url: 'http://localhost:18791/app.js' }, callback);

    expect(callback).toHaveBeenCalledWith({ cancel: false });
  });
});
