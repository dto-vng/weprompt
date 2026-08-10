import type { Session, WebContents } from 'electron';
import { localTokenAuthHeaders } from '@/common/adapter/httpBridge';

/**
 * Inject local-backend Bearer auth only for requests issued by the app shell.
 */
export function installLocalBackendAuth(
  targetSession: Session,
  appShell: WebContents,
  backendPort: number,
  localToken: string
): void {
  const allowedOrigins = new Set([`http://127.0.0.1:${backendPort}`, `ws://127.0.0.1:${backendPort}`]);

  targetSession.webRequest.onBeforeSendHeaders(
    {
      urls: [`http://127.0.0.1:${backendPort}/*`, `ws://127.0.0.1:${backendPort}/*`],
    },
    (details, callback) => {
      let targetsBackend = false;
      try {
        targetsBackend = allowedOrigins.has(new URL(details.url).origin);
      } catch {
        // Electron already applies the URL filter; keep malformed URLs unauthenticated.
      }

      const isAppShell = !appShell.isDestroyed() && details.webContentsId === appShell.id;
      callback({
        requestHeaders:
          targetsBackend && isAppShell
            ? { ...details.requestHeaders, ...localTokenAuthHeaders(localToken) }
            : details.requestHeaders,
      });
    }
  );
}
