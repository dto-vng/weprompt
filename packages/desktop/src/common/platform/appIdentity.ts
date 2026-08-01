export type AppIdentity = Readonly<{
  dataDirectoryName?: string;
  displayName?: string;
  e2eUserDataDir?: string;
  source: 'development' | 'e2e' | 'packaged';
}>;

type AppIdentityOptions = Readonly<{
  e2eUserDataDir?: string;
  isMultiInstance: boolean;
  isPackaged: boolean;
}>;

type AppIdentityTarget = Readonly<{
  getPath: (name: 'appData' | 'userData') => string;
  setName: (name: string) => void;
  setPath: (name: 'userData', value: string) => void;
}>;

type PathJoin = (basePath: string, dataDirectoryName: string) => string;
type EnsureDirectory = (directoryPath: string) => void;

/**
 * Resolves visible application names without changing the established data roots.
 */
export function resolveAppIdentity(options: AppIdentityOptions): AppIdentity {
  const e2eUserDataDir = options.e2eUserDataDir?.trim();
  if (e2eUserDataDir) {
    return { source: 'e2e', e2eUserDataDir };
  }

  if (options.isPackaged) {
    return {
      source: 'packaged',
      displayName: 'WePrompt',
      dataDirectoryName: 'Forge',
    };
  }

  if (options.isMultiInstance) {
    return {
      source: 'development',
      displayName: 'WePrompt-Dev-2',
      dataDirectoryName: 'Forge-Dev-2',
    };
  }

  return {
    source: 'development',
    displayName: 'WePrompt-Dev',
    dataDirectoryName: 'Forge-Dev',
  };
}

/**
 * Resolves an explicit sandbox or a compatibility data path without filesystem access.
 */
export function resolveUserDataPath(appDataPath: string, identity: AppIdentity, joinPath: PathJoin): string {
  if (identity.e2eUserDataDir) {
    return identity.e2eUserDataDir;
  }

  if (!identity.dataDirectoryName) {
    throw new Error('Application identity has no user data directory');
  }

  return joinPath(appDataPath, identity.dataDirectoryName);
}

/**
 * Returns current macOS electron-log directory names before compatibility fallbacks.
 */
export function resolveMacLogDirectoryNames(): string[] {
  const development = resolveAppIdentity({ isPackaged: false, isMultiInstance: false });
  const packaged = resolveAppIdentity({ isPackaged: true, isMultiInstance: false });

  return [
    development.displayName,
    development.dataDirectoryName,
    packaged.displayName,
    packaged.dataDirectoryName,
  ].filter((directoryName): directoryName is string => Boolean(directoryName));
}

/**
 * Applies identity before any caller can read Electron's userData path.
 */
export function applyAppIdentity(
  app: AppIdentityTarget,
  options: AppIdentityOptions,
  joinPath: PathJoin,
  ensureDirectory: EnsureDirectory
): AppIdentity {
  const identity = resolveAppIdentity(options);

  if (identity.displayName) {
    app.setName(identity.displayName);
  }

  const appDataPath = identity.e2eUserDataDir ? '' : app.getPath('appData');
  const userDataPath = resolveUserDataPath(appDataPath, identity, joinPath);
  ensureDirectory(userDataPath);
  app.setPath('userData', userDataPath);

  return identity;
}
