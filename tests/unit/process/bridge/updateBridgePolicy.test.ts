import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  autoUpdaterModuleLoaded: vi.fn(),
  consumeInstallerLastFailure: vi.fn(),
}));

const originalEnvironment = {
  WEPROMPT_UPDATE_BASE_URL: process.env.WEPROMPT_UPDATE_BASE_URL,
  AIONUI_DISABLE_AUTO_UPDATE: process.env.AIONUI_DISABLE_AUTO_UPDATE,
  AIONUI_E2E_TEST: process.env.AIONUI_E2E_TEST,
  CI: process.env.CI,
  GITHUB_ACTIONS: process.env.GITHUB_ACTIONS,
};

const restoreEnvironment = () => {
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
};

vi.mock('@/common/platform/bridge', () => ({
  bridge: {
    buildProvider: vi.fn(() => ({
      provider: vi.fn(),
      invoke: vi.fn(),
    })),
    buildRendererQuery: vi.fn(() => ({
      provider: vi.fn(),
      invoke: vi.fn(),
    })),
    buildEmitter: vi.fn(() => ({
      emit: vi.fn(),
      on: vi.fn(),
    })),
  },
}));

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/weprompt-update-policy-test'),
    getVersion: vi.fn(() => '2.1.39'),
    exit: vi.fn(),
  },
}));

vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/process/services/update/installerLastFailure', () => ({
  consumeInstallerLastFailure: mocks.consumeInstallerLastFailure,
}));

vi.mock('@/process/services/update/autoUpdaterService', () => {
  mocks.autoUpdaterModuleLoaded();
  return {
    autoUpdaterService: {
      setAllowPrerelease: vi.fn(),
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
      restoreDownloadedUpdateIfAvailable: vi.fn(),
      cancelDownload: vi.fn(),
      quitAndInstall: vi.fn(),
    },
  };
});

describe('disabled update bridge', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.WEPROMPT_UPDATE_BASE_URL;
    delete process.env.AIONUI_DISABLE_AUTO_UPDATE;
    delete process.env.AIONUI_E2E_TEST;
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
    mocks.consumeInstallerLastFailure.mockResolvedValue(null);
  });

  afterEach(() => {
    restoreEnvironment();
  });

  it('keeps local installer diagnostics but does not load the network updater service', async () => {
    const { initUpdateBridge } = await import('@/process/bridge/updateBridge');
    const { ipcBridge } = await import('@/common');

    expect(mocks.autoUpdaterModuleLoaded).not.toHaveBeenCalled();
    initUpdateBridge();

    const consumeHandler = vi.mocked(ipcBridge.update.consumeInstallerLastFailure.provider).mock.calls.at(-1)?.[0];
    const checkHandler = vi.mocked(ipcBridge.update.check.provider).mock.calls.at(-1)?.[0];
    const autoCheckHandler = vi.mocked(ipcBridge.autoUpdate.check.provider).mock.calls.at(-1)?.[0];
    const quitHandler = vi.mocked(ipcBridge.autoUpdate.quitAndInstall.provider).mock.calls.at(-1)?.[0];

    if (!consumeHandler || !checkHandler || !autoCheckHandler || !quitHandler) {
      throw new Error('Expected all update bridge handlers to be registered');
    }

    await expect(consumeHandler()).resolves.toEqual({ success: true, data: null });
    expect(mocks.consumeInstallerLastFailure).toHaveBeenCalledOnce();

    const disabledResult = {
      success: false,
      code: 'updates-disabled',
      msg: 'updates-disabled',
    };
    await expect(checkHandler({})).resolves.toEqual(disabledResult);
    await expect(autoCheckHandler({})).resolves.toEqual(disabledResult);
    await expect(quitHandler()).resolves.toEqual(disabledResult);
    expect(mocks.autoUpdaterModuleLoaded).not.toHaveBeenCalled();
  });

  it.each([
    ['AIONUI_DISABLE_AUTO_UPDATE', '1'],
    ['AIONUI_E2E_TEST', '1'],
    ['CI', '1'],
    ['CI', 'true'],
    ['GITHUB_ACTIONS', 'true'],
  ] as const)('registers disabled providers when %s=%s even with a configured feed', async (key, value) => {
    process.env.WEPROMPT_UPDATE_BASE_URL = 'https://updates.weprompt.test/releases';
    process.env[key] = value;

    const { initUpdateBridge } = await import('@/process/bridge/updateBridge');
    const { ipcBridge } = await import('@/common');
    initUpdateBridge();

    const checkHandler = vi.mocked(ipcBridge.update.check.provider).mock.calls.at(-1)?.[0];
    if (!checkHandler) throw new Error('Expected update check handler to be registered');

    await expect(checkHandler({})).resolves.toEqual({
      success: false,
      code: 'updates-disabled',
      msg: 'updates-disabled',
    });
    expect(mocks.autoUpdaterModuleLoaded).not.toHaveBeenCalled();
  });
});
