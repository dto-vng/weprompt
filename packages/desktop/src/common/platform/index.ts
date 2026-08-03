import path from 'path';
import { applyAppIdentity } from './appIdentity';
import type { IPlatformServices } from './IPlatformServices';
import { NodePlatformServices } from './NodePlatformServices';

let _services: IPlatformServices | null = null;

/** Resolve the explicit per-run Electron profile used by isolated E2E launches. */
export function getIsolatedE2EUserDataPath(): string | null {
  if (process.env.AIONUI_E2E_TEST !== '1') return null;
  const candidate = process.env.AIONUI_E2E_USER_DATA_DIR?.trim();
  return candidate ? path.resolve(candidate) : null;
}

export function isIsolatedE2EUserDataPath(userDataPath: string): boolean {
  const isolatedPath = getIsolatedE2EUserDataPath();
  return isolatedPath !== null && path.resolve(userDataPath) === isolatedPath;
}

export function registerPlatformServices(services: IPlatformServices): void {
  _services = services;
}

export function getPlatformServices(): IPlatformServices {
  if (!_services) {
    // In Electron, module-level code in initStorage.ts may execute before the
    // explicit registerPlatformServices(new ElectronPlatformServices()) call
    // because Rollup places the shared chunk require() ahead of side-effect
    // imports in the bundled output. Auto-register an inline implementation using
    // electron.app directly so that all platform API callers work regardless of
    // call order. This will be replaced by the proper ElectronPlatformServices
    // once registerPlatformServices() is called.
    if (process.versions?.electron) {
      // In Electron utility processes process.type === 'utility' and app is not
      // accessible. Fall back to NodePlatformServices (DATA_DIR is injected by
      // ElectronPlatformServices.fork so paths still resolve correctly).
      const processType = (process as NodeJS.Process & { type?: string }).type;
      if (processType !== 'browser') {
        _services = new NodePlatformServices();
      } else {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { app, net } = require('electron') as typeof import('electron');
        // Identity must be set before any getPath('userData') call.
        // Rollup may load this chunk before configureChromium.ts runs, so we
        // must apply the resolved identity here as a safety net.
        applyAppIdentity(
          app,
          {
            isPackaged: app.isPackaged,
            isMultiInstance: process.env.AIONUI_MULTI_INSTANCE === '1',
            e2eUserDataDir: process.env.AIONUI_E2E_TEST === '1' ? process.env.AIONUI_E2E_USER_DATA_DIR : undefined,
          },
          path.join,
          (userDataPath) => {
            // Keep filesystem IO main-process-only even though this module is shared.
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const fs = require('fs') as typeof import('fs');
            fs.mkdirSync(userDataPath, { recursive: true });
          }
        );
        // Typed as IPlatformPaths so tsc enforces completeness: any new method
        // added to the interface will cause a compile error here if omitted below.
        const paths: import('./IPlatformServices').IPlatformPaths = {
          getDataDir: () => app.getPath('userData'),
          getTempDir: () => app.getPath('temp'),
          getHomeDir: () => app.getPath('home'),
          getLogsDir: () => {
            try {
              return app.getPath('logs');
            } catch {
              return path.join(app.getPath('userData'), 'logs');
            }
          },
          getAppPath: () => app.getAppPath(),
          isPackaged: () => app.isPackaged,
          getSystemPath: (name) => app.getPath(name),
          getName: () => app.getName(),
          getVersion: () => app.getVersion(),
          needsCliSafeSymlinks: () => process.platform === 'darwin',
        };
        _services = {
          paths,
          worker: {
            fork: () => {
              throw new Error('[Platform] Worker not available before registerPlatformServices()');
            },
          },
          power: { preventSleep: () => null, allowSleep: () => {}, preventDisplaySleep: () => null },
          notification: { send: () => {} },
          network: {
            fetch: (input: string | URL | Request, init?: RequestInit): Promise<Response> =>
              net.fetch(input instanceof URL ? input.toString() : input, init),
          },
        };
      }
    } else {
      throw new Error(
        '[Platform] Services not registered. Call registerPlatformServices() before using platform APIs.'
      );
    }
  }
  return _services;
}

export type {
  IPlatformServices,
  IPlatformPaths,
  IWorkerProcess,
  IWorkerProcessFactory,
  IPowerManager,
  INotificationService,
  INetworkService,
} from './IPlatformServices';
