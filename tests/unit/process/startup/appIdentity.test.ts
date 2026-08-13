import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

type AppIdentity = {
  dataDirectoryName?: string;
  displayName?: string;
  e2eUserDataDir?: string;
  source: 'development' | 'e2e' | 'packaged';
};

type AppIdentityModule = {
  buildBenchmarkLogRelativePath: (date?: Date) => string;
  applyAppIdentity: (
    app: {
      getPath: (name: 'appData' | 'userData') => string;
      setName: (name: string) => void;
      setPath: (name: 'userData', value: string) => void;
    },
    options: {
      e2eUserDataDir?: string;
      isMultiInstance: boolean;
      isPackaged: boolean;
    },
    joinPath: (basePath: string, dataDirectoryName: string) => string,
    ensureDirectory: (directoryPath: string) => void
  ) => AppIdentity;
  resolveAppIdentity: (options: {
    e2eUserDataDir?: string;
    isMultiInstance: boolean;
    isPackaged: boolean;
  }) => AppIdentity;
  resolveMacLogDirectoryNames: () => string[];
  resolveUserDataPath: (
    appDataPath: string,
    identity: AppIdentity,
    joinPath: (basePath: string, dataDirectoryName: string) => string
  ) => string;
};

async function loadAppIdentity(): Promise<AppIdentityModule> {
  return (await import('@/common/platform/appIdentity')) as AppIdentityModule;
}

describe('application identity', () => {
  it('displays WePrompt while retaining the packaged Forge data root', async () => {
    const { resolveAppIdentity, resolveUserDataPath } = await loadAppIdentity();
    const identity = resolveAppIdentity({ isPackaged: true, isMultiInstance: false });

    expect(identity.displayName).toBe('WePrompt');
    expect(resolveUserDataPath('/Application Support', identity, path.join)).toBe(
      path.join('/Application Support', 'Forge')
    );
  });

  it('lets an explicit E2E sandbox override the compatibility data root', async () => {
    const { resolveAppIdentity, resolveUserDataPath } = await loadAppIdentity();
    const identity = resolveAppIdentity({
      isPackaged: true,
      isMultiInstance: false,
      e2eUserDataDir: ' /tmp/weprompt-e2e ',
    });

    expect(identity.source).toBe('e2e');
    expect(resolveUserDataPath('/Application Support', identity, path.join)).toBe('/tmp/weprompt-e2e');
  });

  it.each([
    { isMultiInstance: false, displayName: 'WePrompt-Dev', dataDirectoryName: 'Forge-Dev' },
    { isMultiInstance: true, displayName: 'WePrompt-Dev-2', dataDirectoryName: 'Forge-Dev-2' },
  ])('keeps the legacy data root for dev identity %#', async ({ isMultiInstance, displayName, dataDirectoryName }) => {
    const { resolveAppIdentity, resolveUserDataPath } = await loadAppIdentity();
    const identity = resolveAppIdentity({ isPackaged: false, isMultiInstance });

    expect(identity.displayName).toBe(displayName);
    expect(resolveUserDataPath('/Application Support', identity, path.join)).toBe(
      path.join('/Application Support', dataDirectoryName)
    );
  });

  it('ensures a fresh packaged profile before setting userData or initializing storage', async () => {
    const { applyAppIdentity } = await loadAppIdentity();
    const events: string[] = [];
    let userDataPath = '';
    const app = {
      getPath: (name: 'appData' | 'userData'): string => {
        events.push(`getPath:${name}`);
        return name === 'appData' ? '/Application Support' : userDataPath;
      },
      setName: (name: string): void => {
        events.push(`setName:${name}`);
      },
      setPath: (name: 'userData', value: string): void => {
        events.push(`setPath:${name}:${value}`);
        userDataPath = value;
      },
    };

    applyAppIdentity(app, { isPackaged: true, isMultiInstance: false }, path.join, (directoryPath) => {
      events.push(`ensureDirectory:${directoryPath}`);
    });
    app.getPath('userData');

    expect(events).toEqual([
      'setName:WePrompt',
      'getPath:appData',
      `ensureDirectory:${path.join('/Application Support', 'Forge')}`,
      `setPath:userData:${path.join('/Application Support', 'Forge')}`,
      'getPath:userData',
    ]);
  });

  it('ensures an explicit E2E sandbox exists before setting userData', async () => {
    const { applyAppIdentity } = await loadAppIdentity();
    const events: string[] = [];
    let sandboxExists = false;
    const app = {
      getPath: (_name: 'appData' | 'userData'): string => {
        throw new Error('E2E identity must not read an Electron path before overriding userData');
      },
      setName: (_name: string): void => {
        throw new Error('E2E identity must not replace the application display name');
      },
      setPath: (name: 'userData', value: string): void => {
        events.push(`setPath:${name}:${value}`);
        if (!sandboxExists) {
          throw new Error('userData directory does not exist');
        }
      },
    };

    applyAppIdentity(
      app,
      {
        isPackaged: true,
        isMultiInstance: false,
        e2eUserDataDir: '/tmp/weprompt-e2e',
      },
      path.join,
      (directoryPath) => {
        events.push(`ensureDirectory:${directoryPath}`);
        sandboxExists = true;
      }
    );

    expect(events).toEqual(['ensureDirectory:/tmp/weprompt-e2e', 'setPath:userData:/tmp/weprompt-e2e']);
  });

  it('prefers current WePrompt macOS log roots while retaining Forge fallbacks', async () => {
    const { resolveMacLogDirectoryNames } = await loadAppIdentity();

    expect(resolveMacLogDirectoryNames()).toEqual(['WePrompt-Dev', 'Forge-Dev', 'WePrompt', 'Forge']);
  });

  it('builds the nested benchmark log path from local calendar components', async () => {
    const { buildBenchmarkLogRelativePath } = await loadAppIdentity();
    const localBoundary = new Date(0);
    vi.spyOn(localBoundary, 'getFullYear').mockReturnValue(2026);
    vi.spyOn(localBoundary, 'getMonth').mockReturnValue(6);
    vi.spyOn(localBoundary, 'getDate').mockReturnValue(3);
    vi.spyOn(localBoundary, 'toISOString').mockReturnValue('2026-07-02T17:01:00.000Z');

    expect(buildBenchmarkLogRelativePath(localBoundary)).toBe('2026/07/03/2026-07-03.log');
  });
});
