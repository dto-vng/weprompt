/**
 * Electron-free orchestration for the desktop Microsoft SSO gate (WP 24045).
 *
 * Kept separate from `ssoGate.ts` (which pulls in electron, i18n and MSAL) so this
 * decision logic — skip / silent / interactive-with-retry / domain check — can be
 * unit-tested with plain mocks. The `import type` below is erased at compile time,
 * so importing this module does not load electron.
 */
import { isEmailDomainAllowed, type SsoConfig } from './ssoConfig';
import type { SsoAccount } from './msalAuthService';

export type SsoGateOutcome = {
  /** Whether the app may proceed to open its main window. */
  proceed: boolean;
  account: SsoAccount | null;
  /** True when SSO was not configured and the gate did nothing. */
  skipped: boolean;
};

export type SsoGateService = {
  acquireSilent: () => Promise<SsoAccount | null>;
  loginInteractive: () => Promise<SsoAccount | null>;
  logout: () => Promise<void>;
};

export type SsoGateUi = {
  /** Show a "signing in…" status surface; returns a handle to close it. */
  showSigningIn: () => { close: () => void };
  /** Ask the user whether to retry sign-in or quit the app. */
  askRetryOrQuit: (reason: 'failed' | 'domainNotAllowed') => 'retry' | 'quit';
};

export type SsoGateDeps = {
  config: SsoConfig;
  createService: () => SsoGateService;
  ui: SsoGateUi;
};

export async function runSsoGate(deps: SsoGateDeps): Promise<SsoGateOutcome> {
  const { config } = deps;
  if (!config.enabled) return { proceed: true, account: null, skipped: true };

  const service = deps.createService();

  // Returning user: sign in silently from the encrypted token cache.
  const silent = await service.acquireSilent();
  if (silent && isEmailDomainAllowed(silent.username, config)) {
    return { proceed: true, account: silent, skipped: false };
  }

  // Interactive sign-in, retrying until the user succeeds or chooses to quit.
  for (;;) {
    const status = deps.ui.showSigningIn();
    let account: SsoAccount | null = null;
    try {
      account = await service.loginInteractive();
    } catch {
      account = null;
    } finally {
      status.close();
    }

    if (account && isEmailDomainAllowed(account.username, config)) {
      return { proceed: true, account, skipped: false };
    }

    // A signed-in-but-not-allowed account must not stay cached, or the next launch
    // would silently sign back in as the wrong user.
    const reason: 'failed' | 'domainNotAllowed' = account ? 'domainNotAllowed' : 'failed';
    if (account) await service.logout();

    if (deps.ui.askRetryOrQuit(reason) === 'quit') {
      return { proceed: false, account: null, skipped: false };
    }
  }
}
