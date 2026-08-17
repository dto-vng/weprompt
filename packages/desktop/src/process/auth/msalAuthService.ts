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

const CACHE_FILENAME = 'sso-token-cache.bin';

const SUCCESS_TEMPLATE =
  '<html><body style="font-family:sans-serif;text-align:center;padding-top:80px">You are signed in. You can close this window and return to WePrompt.</body></html>';
const ERROR_TEMPLATE =
  '<html><body style="font-family:sans-serif;text-align:center;padding-top:80px">Sign-in failed. Please return to WePrompt and try again.</body></html>';

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
      cache: { cachePlugin: createEncryptedCachePlugin(join(userDataDir, CACHE_FILENAME)) },
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
