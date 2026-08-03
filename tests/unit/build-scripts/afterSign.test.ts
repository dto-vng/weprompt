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

function createAdHocExecSyncMock(signatureDetails = 'Signature=adhoc\nTeamIdentifier=not set\n') {
  return vi.fn((command: string) => {
    if (command.startsWith('codesign -dv ')) {
      return Buffer.from(signatureDetails);
    }
    return Buffer.from('');
  });
}

describe('internal macOS afterSign policy', () => {
  it('forces an ad-hoc signature and never loads the notarizer', async () => {
    expect(afterSignModule.afterSign).toBeTypeOf('function');
    const execSync = createAdHocExecSyncMock();
    const loadNotarize = vi.fn(async () => ({ notarize: vi.fn(async () => {}) }));

    await afterSignModule.afterSign?.(context, {
      env: { WEPROMPT_INTERNAL_RELEASE: '1', CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
      execSync,
      loadNotarize,
    });

    expect(execSync).toHaveBeenCalledTimes(3);
    expect(execSync).toHaveBeenNthCalledWith(
      1,
      'codesign --force --deep --sign - "/tmp/weprompt-after-sign/WePrompt.app"',
      {
        stdio: 'inherit',
      }
    );
    expect(execSync).toHaveBeenNthCalledWith(
      2,
      'codesign --verify --deep --strict "/tmp/weprompt-after-sign/WePrompt.app"',
      {
        stdio: 'inherit',
      }
    );
    expect(execSync).toHaveBeenNthCalledWith(
      3,
      'codesign -dv --verbose=4 "/tmp/weprompt-after-sign/WePrompt.app" 2>&1',
      { encoding: 'utf8', stdio: 'pipe' }
    );
    expect(loadNotarize).not.toHaveBeenCalled();
  });

  it('accepts only the explicit disabled auto-discovery sentinel in an internal release', async () => {
    const execSync = createAdHocExecSyncMock();
    const loadNotarize = vi.fn(async () => ({ notarize: vi.fn(async () => {}) }));

    await afterSignModule.afterSign?.(context, {
      env: {
        WEPROMPT_INTERNAL_RELEASE: '1',
        CSC_IDENTITY_AUTO_DISCOVERY: 'false',
      },
      execSync,
      loadNotarize,
    });

    expect(execSync).toHaveBeenCalledTimes(3);
    expect(loadNotarize).not.toHaveBeenCalled();
  });

  it('rejects a final bundle that still carries production signing identity', async () => {
    const execSync = createAdHocExecSyncMock(
      'Signature=adhoc\nAuthority=Developer ID Application: Example Corp\nTeamIdentifier=ABCDE12345\n'
    );
    const loadNotarize = vi.fn(async () => ({ notarize: vi.fn(async () => {}) }));

    await expect(
      afterSignModule.afterSign?.(context, {
        env: {
          WEPROMPT_INTERNAL_RELEASE: '1',
          CSC_IDENTITY_AUTO_DISCOVERY: 'false',
        },
        execSync,
        loadNotarize,
      })
    ).rejects.toThrow(/production signing identity/);

    expect(loadNotarize).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', {}],
    ['empty', { CSC_IDENTITY_AUTO_DISCOVERY: '' }],
    ['whitespace padded', { CSC_IDENTITY_AUTO_DISCOVERY: ' false ' }],
    ['enabled', { CSC_IDENTITY_AUTO_DISCOVERY: 'true' }],
  ])('rejects a %s auto-discovery sentinel in an internal release', async (_label, env) => {
    const execSync = vi.fn();
    const loadNotarize = vi.fn(async () => ({ notarize: vi.fn(async () => {}) }));

    await expect(
      afterSignModule.afterSign?.(context, {
        env: {
          WEPROMPT_INTERNAL_RELEASE: '1',
          ...env,
        },
        execSync,
        loadNotarize,
      })
    ).rejects.toThrow(/CSC_IDENTITY_AUTO_DISCOVERY/);

    expect(execSync).not.toHaveBeenCalled();
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
          CSC_IDENTITY_AUTO_DISCOVERY: 'false',
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
