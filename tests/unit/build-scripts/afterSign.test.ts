import { createRequire } from 'node:module';
import { resolve } from 'node:path';
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
  artifactBuildStarted?: (
    event: { arch: number | null; file: string; targetPresentableName: string },
    dependencies?: { env: NodeJS.ProcessEnv }
  ) => void;
};

const afterSignModule = require('../../../scripts/afterSign.js') as AfterSignModule;
const repoRoot = resolve(__dirname, '../../..');

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

describe('macOS DMG retry authorization hook', () => {
  it('resolves the named artifactBuildStarted export through electron-builder', async () => {
    const electronBuilderRequire = createRequire(require.resolve('electron-builder'));
    const { resolveFunction } = electronBuilderRequire('app-builder-lib/out/util/resolve') as {
      resolveFunction: (
        type: string,
        executor: string,
        name: string,
        rootSearchDir: string
      ) => Promise<AfterSignModule['artifactBuildStarted']>;
    };

    const resolvedHook = await resolveFunction('commonjs', 'scripts/afterSign.js', 'artifactBuildStarted', repoRoot);

    expect(resolvedHook).toBe(afterSignModule.artifactBuildStarted);
  });

  it('ignores non-DMG artifacts even when retry environment is malformed', () => {
    expect(() =>
      afterSignModule.artifactBuildStarted?.(
        { arch: 1, file: '/tmp/WePrompt.zip', targetPresentableName: 'macOS zip' },
        {
          env: {
            WEPROMPT_MAC_DMG_RETRY_MARKER: '/tmp/outside-marker',
            WEPROMPT_MAC_DMG_RETRY_NONCE: 'invalid',
          },
        }
      )
    ).not.toThrow();
  });

  it('rejects malformed or externally located DMG retry authorization', () => {
    const event = { arch: 1, file: '/tmp/WePrompt.dmg', targetPresentableName: 'DMG' };

    expect(() =>
      afterSignModule.artifactBuildStarted?.(event, {
        env: {
          WEPROMPT_MAC_DMG_RETRY_MARKER: '/tmp/outside-marker',
          WEPROMPT_MAC_DMG_RETRY_NONCE: 'invalid',
        },
      })
    ).toThrow(/authorization environment/);
    expect(() =>
      afterSignModule.artifactBuildStarted?.(event, {
        env: {
          WEPROMPT_MAC_DMG_RETRY_MARKER: '/tmp/outside-marker',
          WEPROMPT_MAC_DMG_RETRY_NONCE: 'a'.repeat(64),
        },
      })
    ).toThrow(/authorization path/);
  });
});
