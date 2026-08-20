/**
 * Desktop Microsoft SSO login gate (Hướng B / WP 24045) — Electron wiring.
 *
 * Runs at startup, before the main window is shown: if SSO is configured, the user
 * must sign in with their Microsoft account first. When SSO is not configured the
 * gate is skipped and the app opens exactly as before. The decision logic lives in
 * `ssoGateCore` (unit-tested); this module supplies the real MSAL service and the
 * window/dialog UI, then exposes `runSsoGateForApp` for `index.ts`.
 */
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, dialog } from 'electron';
import i18n from '@process/services/i18n';
import { isEmailDomainAllowed, loadSsoConfig, type SsoConfig } from './ssoConfig';
import { MsalAuthService, SSO_TOKEN_CACHE_FILENAME, type SsoAccount } from './msalAuthService';
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

type SsoCallOptions = { userDataDir?: string; env?: NodeJS.ProcessEnv };

function resolveInstallSsoConfig(options?: SsoCallOptions): { config: SsoConfig; userDataDir: string } {
  const userDataDir = options?.userDataDir ?? app.getPath('userData');
  const bundledConfigDir = app.isPackaged ? process.resourcesPath : undefined;
  return { config: loadSsoConfig(userDataDir, options?.env, bundledConfigDir), userDataDir };
}

/** Whether Microsoft SSO is configured for this install, so the UI can offer sign-in. */
export function isSsoConfigured(options?: SsoCallOptions): boolean {
  return resolveInstallSsoConfig(options).config.enabled;
}

/**
 * Resolve an already–signed-in Microsoft account silently at startup, without ever
 * blocking the app or opening a browser. Returns null when SSO is not configured, no
 * cached account exists, or the account's email domain is not allowed.
 */
export async function resolveSsoAccountAtStartup(options?: SsoCallOptions): Promise<SsoAccount | null> {
  const { config, userDataDir } = resolveInstallSsoConfig(options);
  if (!config.enabled) return null;
  try {
    const account = await new MsalAuthService(config, userDataDir).acquireSilent();
    if (account && !isEmailDomainAllowed(account.username, config)) return null;
    return account;
  } catch (error) {
    console.error('[SSO] silent account resolve failed:', error);
    return null;
  }
}

/**
 * Run the interactive Microsoft sign-in when the user clicks the login button. Opens
 * the system browser and resolves to the signed-in account. Throws 'domainNotAllowed'
 * when the signed-in email is outside the optional app-side allowlist.
 */
export async function signInSso(options?: SsoCallOptions): Promise<SsoAccount | null> {
  const { config, userDataDir } = resolveInstallSsoConfig(options);
  if (!config.enabled) return null;
  const service = new MsalAuthService(config, userDataDir);
  const account = await service.loginInteractive();
  if (account && !isEmailDomainAllowed(account.username, config)) {
    await service.logout();
    throw new Error('domainNotAllowed');
  }
  return account;
}

/**
 * Sign the current user out of Microsoft SSO: drop the cached MSAL account and remove
 * the encrypted token cache from disk, so the next sign-in starts fresh. Safe to call
 * when SSO is disabled.
 */
export async function signOutSso(options?: SsoCallOptions): Promise<void> {
  const { config, userDataDir } = resolveInstallSsoConfig(options);
  if (config.enabled) {
    try {
      await new MsalAuthService(config, userDataDir).logout();
    } catch (error) {
      console.error('[SSO] logout failed:', error);
    }
  }
  // Belt-and-suspenders: delete the persisted cache even if MSAL kept a stale
  // file, so a fresh sign-in is guaranteed next time.
  try {
    rmSync(join(userDataDir, SSO_TOKEN_CACHE_FILENAME), { force: true });
  } catch {
    // Missing file / permission — nothing to clean up.
  }
}
