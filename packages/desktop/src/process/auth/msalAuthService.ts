/**
 * Microsoft (Entra) authentication for the desktop login gate, Hướng B / WP 24045.
 *
 * Uses MSAL Node's public-client / PKCE flow: `acquireTokenInteractive` opens the
 * system browser on a loopback redirect (matching the "Mobile and desktop
 * applications" platform registered in Azure — `http://localhost`, no client secret).
 * Tokens are cached on disk, encrypted with Electron `safeStorage`, so a returning
 * user is signed in silently.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { safeStorage, shell } from 'electron';
import { LogLevel, PublicClientApplication } from '@azure/msal-node';
import type { AuthenticationResult, Configuration, ICachePlugin, TokenCacheContext } from '@azure/msal-node';
import type { SsoConfig } from './ssoConfig';

export const SSO_TOKEN_CACHE_FILENAME = 'sso-token-cache.bin';

/** Loopback browser page shown after sign-in completes. Matches the in-app SSO
 *  status window style (dark card, WePrompt brand). */
function buildLoopbackPage(variant: 'success' | 'error'): string {
  const ok = variant === 'success';
  const accent = ok ? '#3fb950' : '#f85149';
  const icon = ok ? '<path d="M20 6 9 17l-5-5"/>' : '<path d="M18 6 6 18"/><path d="M6 6l12 12"/>';
  const title = ok ? 'You’re signed in' : 'Sign-in failed';
  const message = ok ? 'You can close this window and return to WePrompt.' : 'Please return to WePrompt and try again.';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WePrompt</title><style>
    *{box-sizing:border-box}
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
      background:#1f2430;color:#e7ecf3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
    .card{max-width:420px;text-align:center;animation:rise .45s ease both}
    @keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
    .badge{width:76px;height:76px;border-radius:50%;margin:0 auto 24px;display:flex;align-items:center;justify-content:center;
      background:${accent}26;border:1px solid ${accent}59}
    .badge svg{width:36px;height:36px}
    h1{font-size:21px;font-weight:600;margin:0 0 10px;letter-spacing:-.01em}
    p{font-size:14px;color:#9aa4b8;margin:0;line-height:1.6}
    .brand{margin-top:36px;font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#5b6478}
  </style></head><body><div class="card">
    <div class="badge"><svg viewBox="0 0 24 24" fill="none" stroke="${accent}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${icon}</svg></div>
    <h1>${title}</h1><p>${message}</p><div class="brand">WePrompt</div>
  </div></body></html>`;
}

const SUCCESS_TEMPLATE = buildLoopbackPage('success');
const ERROR_TEMPLATE = buildLoopbackPage('error');

/** Persist the MSAL token cache to disk, encrypted with the OS keychain via safeStorage. */
function createEncryptedCachePlugin(cacheFile: string): ICachePlugin {
  return {
    beforeCacheAccess: async (context: TokenCacheContext) => {
      try {
        if (!existsSync(cacheFile)) return;
        const raw = readFileSync(cacheFile);
        const data = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString('utf8');
        context.tokenCache.deserialize(data);
      } catch {
        // A corrupt or undecryptable cache (e.g. keychain reset) must not block
        // startup — treat it as an empty cache; the user simply signs in again.
      }
    },
    afterCacheAccess: async (context: TokenCacheContext) => {
      if (!context.cacheHasChanged) return;
      try {
        const data = context.tokenCache.serialize();
        const buffer = safeStorage.isEncryptionAvailable()
          ? safeStorage.encryptString(data)
          : Buffer.from(data, 'utf8');
        mkdirSync(dirname(cacheFile), { recursive: true });
        writeFileSync(cacheFile, buffer);
      } catch {
        // Best-effort persistence: failing to save just means re-authenticating
        // on the next launch, which is safe.
      }
    },
  };
}

export type SsoAccount = {
  username: string;
  name?: string;
  homeAccountId: string;
};

function toAccount(result: AuthenticationResult | null): SsoAccount | null {
  const account = result?.account;
  if (!account) return null;
  return { username: account.username, name: account.name, homeAccountId: account.homeAccountId };
}

export class MsalAuthService {
  private readonly pca: PublicClientApplication;
  private readonly scopes: string[];

  constructor(config: SsoConfig, userDataDir: string) {
    if (!config.tenantId || !config.clientId) {
      throw new Error('MsalAuthService requires a configured tenantId and clientId');
    }
    this.scopes = config.scopes;
    const msalConfig: Configuration = {
      auth: {
        clientId: config.clientId,
        authority: `https://login.microsoftonline.com/${config.tenantId}`,
      },
      cache: { cachePlugin: createEncryptedCachePlugin(join(userDataDir, SSO_TOKEN_CACHE_FILENAME)) },
      system: {
        loggerOptions: {
          loggerCallback: () => {},
          piiLoggingEnabled: false,
          logLevel: LogLevel.Error,
        },
      },
    };
    this.pca = new PublicClientApplication(msalConfig);
  }

  /** Return a cached account signed in silently, or null if none/expired. */
  async acquireSilent(): Promise<SsoAccount | null> {
    const accounts = await this.pca.getTokenCache().getAllAccounts();
    const account = accounts[0];
    if (!account) return null;
    try {
      const result = await this.pca.acquireTokenSilent({ account, scopes: this.scopes });
      return toAccount(result);
    } catch {
      return null;
    }
  }

  /** Open the system browser and complete an interactive Microsoft sign-in. */
  async loginInteractive(): Promise<SsoAccount | null> {
    const result = await this.pca.acquireTokenInteractive({
      scopes: this.scopes,
      openBrowser: async (url: string) => {
        await shell.openExternal(url);
      },
      successTemplate: SUCCESS_TEMPLATE,
      errorTemplate: ERROR_TEMPLATE,
    });
    return toAccount(result);
  }

  /** Remove every cached account so the next launch requires a fresh sign-in. */
  async logout(): Promise<void> {
    const cache = this.pca.getTokenCache();
    const accounts = await cache.getAllAccounts();
    await Promise.all(accounts.map((account) => cache.removeAccount(account)));
  }
}
