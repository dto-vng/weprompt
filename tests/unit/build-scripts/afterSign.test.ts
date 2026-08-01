import { describe, expect, it, vi } from 'vitest';

type AfterSignContext = {
  appOutDir: string;
  electronPlatformName: string;
  packager: {
    appInfo: {
      id: string;
      productFilename: string;
    };
  };
};

type AfterSignDependencies = {
  env: NodeJS.ProcessEnv;
  execSync: (command: string, options?: unknown) => unknown;
  loadNotarize: () => Promise<{ notarize: (options: unknown) => Promise<void> }>;
};

type AfterSignModule = {
  afterSign?: (context: AfterSignContext, dependencies?: AfterSignDependencies) => Promise<void>;
};

const afterSignModule = require('../../../scripts/afterSign.js') as AfterSignModule;

const context: AfterSignContext = {
  electronPlatformName: 'darwin',
  appOutDir: '/tmp/weprompt-after-sign',
  packager: {
    appInfo: {
      id: 'com.aionui.app',
      productFilename: 'WePrompt',
    },
  },
};

describe('internal macOS afterSign policy', () => {
  it('forces an ad-hoc signature and never loads the notarizer', async () => {
    expect(afterSignModule.afterSign).toBeTypeOf('function');
    const execSync = vi.fn();
    const loadNotarize = vi.fn(async () => ({ notarize: vi.fn(async () => {}) }));

    await afterSignModule.afterSign?.(context, {
      env: { WEPROMPT_INTERNAL_RELEASE: '1' },
      execSync,
      loadNotarize,
    });

    expect(execSync).toHaveBeenCalledOnce();
    expect(execSync).toHaveBeenCalledWith('codesign --force --deep --sign - "/tmp/weprompt-after-sign/WePrompt.app"', {
      stdio: 'inherit',
    });
    expect(loadNotarize).not.toHaveBeenCalled();
  });

  it('rejects inherited production-signing material before touching the app', async () => {
    expect(afterSignModule.afterSign).toBeTypeOf('function');
    const execSync = vi.fn();
    const loadNotarize = vi.fn(async () => ({ notarize: vi.fn(async () => {}) }));

    await expect(
      afterSignModule.afterSign?.(context, {
        env: {
          WEPROMPT_INTERNAL_RELEASE: '1',
          CSC_LINK: '/secrets/production-signing.p12',
        },
        execSync,
        loadNotarize,
      })
    ).rejects.toThrow(/CSC_LINK/);

    expect(execSync).not.toHaveBeenCalled();
    expect(loadNotarize).not.toHaveBeenCalled();
  });
});
