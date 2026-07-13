/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Forge is desktop-only (D1): startDesktopWebUI is the single chokepoint every
 * caller funnels through — the webui.start IPC bridge, index.ts WebUI mode, and
 * the boot-time restoreDesktopWebUIFromPreferences() auto-restore path. It must
 * force the WebUI to bind loopback-only, ignoring any caller-supplied or
 * persisted allowRemote. This test specifically guards the boot-restore bypass:
 * a stale persisted `allowRemote: true` must NOT reach startWebHost.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const startWebHostMock = vi.hoisted(() => vi.fn());

vi.mock('@aionui/web-host', () => ({
  startWebHost: startWebHostMock,
}));

vi.mock('electron', () => ({
  app: {
    getVersion: () => '0.0.0-test',
    isPackaged: false,
    getAppPath: () => '/tmp/aionui-test-app',
  },
}));

vi.mock('@process/utils/initStorage', () => ({
  getSystemDir: () => ({
    cacheDir: '/tmp/aionui-test/cache',
    workDir: '/tmp/aionui-test/work',
    logDir: '/tmp/aionui-test/logs',
  }),
}));

vi.mock('@process/utils/utils', () => ({
  getDataPath: () => '/tmp/aionui-test/data',
}));

// httpBridge is imported by webuiConfig but not exercised by startDesktopWebUI.
vi.mock('@/common/adapter/httpBridge', () => ({
  httpRequest: vi.fn(),
}));

describe('startDesktopWebUI — Forge desktop-only chokepoint (D1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as typeof globalThis & { __backendPort?: number }).__backendPort = 4123;
    startWebHostMock.mockResolvedValue({
      port: 25808,
      localUrl: 'http://localhost:25808',
      stop: vi.fn().mockResolvedValue(undefined),
    });
  });

  afterEach(() => {
    delete (globalThis as typeof globalThis & { __backendPort?: number }).__backendPort;
  });

  it('forces allowRemote:false into startWebHost even when the caller asks for remote (boot-restore bypass)', async () => {
    const { startDesktopWebUI } = await import('@process/utils/webuiConfig');

    // Simulate restoreDesktopWebUIFromPreferences() replaying a stale persisted
    // `webui.desktop.allowRemote: true` into the shared chokepoint.
    const handle = await startDesktopWebUI({ port: 25808, allowRemote: true });

    expect(startWebHostMock).toHaveBeenCalledTimes(1);
    const hostOpts = startWebHostMock.mock.calls[0][0] as { allowRemote?: boolean };
    expect(hostOpts.allowRemote).toBe(false);

    // The recorded/handle value must stay consistent with the effective bind.
    expect(handle.allowRemote).toBe(false);
    expect(handle.networkUrl).toBeUndefined();
  });

  it('forces allowRemote:false into startWebHost when the caller omits the flag', async () => {
    const { startDesktopWebUI } = await import('@process/utils/webuiConfig');

    await startDesktopWebUI({ port: 25808 });

    const hostOpts = startWebHostMock.mock.calls[0][0] as { allowRemote?: boolean };
    expect(hostOpts.allowRemote).toBe(false);
  });
});
