/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Forge is desktop-only (D1): the webui.start IPC provider must never forward
 * a truthy allowRemote to startDesktopWebUI, regardless of what a caller
 * (renderer Settings UI, a stale persisted preference, etc.) requests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const startDesktopWebUIMock = vi.fn().mockResolvedValue({
  port: 25808,
  allowRemote: false,
  localUrl: 'http://localhost:25808',
});
const stopDesktopWebUIMock = vi.fn().mockResolvedValue(undefined);
const getDesktopWebUIStatusMock = vi.fn();
const setDesktopWebUIInitialPasswordMock = vi.fn();

vi.mock('@process/utils/webuiConfig', () => ({
  startDesktopWebUI: startDesktopWebUIMock,
  stopDesktopWebUI: stopDesktopWebUIMock,
  getDesktopWebUIStatus: getDesktopWebUIStatusMock,
  setDesktopWebUIInitialPassword: setDesktopWebUIInitialPasswordMock,
}));

// Capture whatever handler initWebuiBridge() registers for each provider key,
// instead of routing through the real @office-ai/platform IPC transport
// (which relies on BroadcastChannel/window messaging and never resolves in a
// plain Node test process).
const registeredProviders = new Map<string, (params?: unknown) => Promise<unknown>>();
const statusChangedEmitMock = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    webui: {
      getStatus: { provider: (fn: () => Promise<unknown>) => registeredProviders.set('getStatus', fn) },
      start: {
        provider: (fn: (params?: unknown) => Promise<unknown>) => registeredProviders.set('start', fn),
      },
      stop: { provider: (fn: () => Promise<unknown>) => registeredProviders.set('stop', fn) },
      statusChanged: { emit: statusChangedEmitMock },
    },
  },
}));

describe('webuiBridge — webui.start provider (Forge desktop-only, D1)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    registeredProviders.clear();
    (globalThis as typeof globalThis & { __backendPort?: number }).__backendPort = 4123;
    // maybeSeedInitialPassword() probes /api/auth/status before starting; report
    // needs_setup=false so the provider proceeds straight to startDesktopWebUI.
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ needs_setup: false }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete (globalThis as typeof globalThis & { __backendPort?: number }).__backendPort;
  });

  it('never forwards a truthy allowRemote to startDesktopWebUI, even when the caller requests it', async () => {
    const { initWebuiBridge } = await import('@process/bridge/webuiBridge');
    initWebuiBridge();

    const startProvider = registeredProviders.get('start');
    expect(startProvider).toBeDefined();

    await startProvider!({ port: 25808, allowRemote: true });

    expect(startDesktopWebUIMock).toHaveBeenCalledTimes(1);
    const forwardedOpts = startDesktopWebUIMock.mock.calls[0][0] as { port?: number; allowRemote?: boolean };
    expect(forwardedOpts.allowRemote).toBeFalsy();
    expect(forwardedOpts.allowRemote).toBe(false);
  });

  it('still forwards allowRemote: false as false when the caller omits the flag', async () => {
    const { initWebuiBridge } = await import('@process/bridge/webuiBridge');
    initWebuiBridge();

    const startProvider = registeredProviders.get('start');
    await startProvider!({ port: 25808 });

    const forwardedOpts = startDesktopWebUIMock.mock.calls[0][0] as { port?: number; allowRemote?: boolean };
    expect(forwardedOpts.allowRemote).toBe(false);
  });
});
