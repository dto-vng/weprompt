/**
 * Desktop Microsoft SSO login gate (Hướng B / WP 24045) — Electron wiring.
 *
 * Runs at startup, before the main window is shown: if SSO is configured, the user
 * must sign in with their Microsoft account first. When SSO is not configured the
 * gate is skipped and the app opens exactly as before. The decision logic lives in
 * `ssoGateCore` (unit-tested); this module supplies the real MSAL service and the
 * window/dialog UI, then exposes `runSsoGateForApp` for `index.ts`.
 */
import { app, BrowserWindow, dialog } from 'electron';
import i18n from '@process/services/i18n';
import { loadSsoConfig, type SsoConfig } from './ssoConfig';
import { MsalAuthService } from './msalAuthService';
import { runSsoGate, type SsoGateDeps, type SsoGateOutcome } from './ssoGateCore';

export type { SsoGateOutcome } from './ssoGateCore';

const esc = (value: string) => value.replace(/[<>&]/g, (c) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'));

function buildStatusHtml(): string {
  const title = i18n.t('login.sso.signingIn');
  const hint = i18n.t('login.sso.signingInHint');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;font-family:-apple-system,Segoe UI,sans-serif;background:#1f2430;color:#e7ecf3;
      display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;text-align:center;padding:0 28px}
    .spinner{width:34px;height:34px;border:3px solid #39415a;border-top-color:#4c8bf5;border-radius:50%;
      animation:spin 0.9s linear infinite;margin-bottom:20px}
    @keyframes spin{to{transform:rotate(360deg)}}
    h1{font-size:16px;font-weight:600;margin:0 0 8px}p{font-size:13px;color:#9aa4b8;margin:0;line-height:1.5}
  </style></head><body><div class="spinner"></div><h1>${esc(title)}</h1><p>${esc(hint)}</p></body></html>`;
}

export function createElectronSsoGateDeps(config: SsoConfig, userDataDir: string): SsoGateDeps {
  return {
    config,
    createService: () => new MsalAuthService(config, userDataDir),
    ui: {
      showSigningIn: () => {
        const win = new BrowserWindow({
          width: 440,
          height: 240,
          resizable: false,
          minimizable: false,
          maximizable: false,
          fullscreenable: false,
          center: true,
          title: 'WePrompt',
          webPreferences: { nodeIntegration: false, contextIsolation: true },
        });
        void win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(buildStatusHtml()));
        return {
          close: () => {
            if (!win.isDestroyed()) win.close();
          },
        };
      },
      askRetryOrQuit: (reason) => {
        const message =
          reason === 'domainNotAllowed' ? i18n.t('login.sso.domainNotAllowed') : i18n.t('login.sso.failedMessage');
        const choice = dialog.showMessageBoxSync({
          type: 'error',
          title: i18n.t('login.sso.failedTitle'),
          message,
          buttons: [i18n.t('login.sso.retry'), i18n.t('login.sso.quit')],
          defaultId: 0,
          cancelId: 1,
          noLink: true,
        });
        return choice === 1 ? 'quit' : 'retry';
      },
    },
  };
}

/**
 * Convenience entry point for the main process. Loads the SSO config for this
 * install, and — only when SSO is configured — runs the interactive gate.
 */
export async function runSsoGateForApp(options?: {
  userDataDir?: string;
  env?: NodeJS.ProcessEnv;
  bundledConfigDir?: string;
}): Promise<SsoGateOutcome> {
  const userDataDir = options?.userDataDir ?? app.getPath('userData');
  // In a packaged build, a baked `sso-config.json` shipped via extraResources lands
  // in process.resourcesPath; it enables the gate out-of-the-box. In dev there is no
  // such file, so the gate stays dormant unless env / userData configure it.
  const bundledConfigDir = options?.bundledConfigDir ?? (app.isPackaged ? process.resourcesPath : undefined);
  const config = loadSsoConfig(userDataDir, options?.env, bundledConfigDir);
  if (!config.enabled) return { proceed: true, account: null, skipped: true };
  return runSsoGate(createElectronSsoGateDeps(config, userDataDir));
}
