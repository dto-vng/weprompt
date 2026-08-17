import { describe, expect, it, vi } from 'vitest';
import { runSsoGate, type SsoGateDeps, type SsoGateService, type SsoGateUi } from '@process/auth/ssoGateCore';
import type { SsoConfig } from '@process/auth/ssoConfig';

function makeConfig(overrides: Partial<SsoConfig> = {}): SsoConfig {
  return {
    enabled: true,
    tenantId: 'tenant',
    clientId: 'client',
    redirectUri: 'http://localhost',
    scopes: ['User.Read'],
    allowedEmailDomains: [],
    ...overrides,
  };
}

function makeUi(overrides: Partial<SsoGateUi> = {}): { ui: SsoGateUi; close: ReturnType<typeof vi.fn> } {
  const close = vi.fn();
  return {
    close,
    ui: {
      showSigningIn: vi.fn(() => ({ close })),
      askRetryOrQuit: vi.fn(() => 'quit'),
      ...overrides,
    },
  };
}

const account = { username: 'user@vng.com.vn', name: 'User', homeAccountId: 'home-1' };

function makeDeps(service: Partial<SsoGateService>, config: SsoConfig, ui: SsoGateUi): SsoGateDeps {
  return {
    config,
    createService: () => ({
      acquireSilent: vi.fn(async () => null),
      loginInteractive: vi.fn(async () => null),
      logout: vi.fn(async () => {}),
      ...service,
    }),
    ui,
  };
}

describe('runSsoGate', () => {
  it('skips entirely when SSO is not configured', async () => {
    const createService = vi.fn();
    const { ui } = makeUi();
    const outcome = await runSsoGate({ config: makeConfig({ enabled: false }), createService, ui });
    expect(outcome).toEqual({ proceed: true, account: null, skipped: true });
    expect(createService).not.toHaveBeenCalled();
  });

  it('proceeds silently for a returning, allowed user without prompting', async () => {
    const loginInteractive = vi.fn(async () => null);
    const { ui } = makeUi();
    const outcome = await runSsoGate(
      makeDeps({ acquireSilent: async () => account, loginInteractive }, makeConfig(), ui)
    );
    expect(outcome.proceed).toBe(true);
    expect(outcome.account).toEqual(account);
    expect(loginInteractive).not.toHaveBeenCalled();
    expect(ui.showSigningIn).not.toHaveBeenCalled();
  });

  it('falls back to interactive sign-in when there is no cached session', async () => {
    const { ui, close } = makeUi();
    const outcome = await runSsoGate(
      makeDeps({ acquireSilent: async () => null, loginInteractive: async () => account }, makeConfig(), ui)
    );
    expect(outcome.proceed).toBe(true);
    expect(outcome.account).toEqual(account);
    expect(ui.showSigningIn).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('retries interactive sign-in until it succeeds', async () => {
    const loginInteractive = vi.fn().mockRejectedValueOnce(new Error('cancelled')).mockResolvedValueOnce(account);
    const askRetryOrQuit = vi.fn(() => 'retry' as const);
    const { ui, close } = makeUi({ askRetryOrQuit });
    const outcome = await runSsoGate(makeDeps({ loginInteractive }, makeConfig(), ui));
    expect(outcome.proceed).toBe(true);
    expect(loginInteractive).toHaveBeenCalledTimes(2);
    expect(askRetryOrQuit).toHaveBeenCalledWith('failed');
    expect(close).toHaveBeenCalledTimes(2);
  });

  it('does not proceed when the user quits after a failed sign-in', async () => {
    const askRetryOrQuit = vi.fn(() => 'quit' as const);
    const { ui } = makeUi({ askRetryOrQuit });
    const outcome = await runSsoGate(makeDeps({ loginInteractive: async () => null }, makeConfig(), ui));
    expect(outcome.proceed).toBe(false);
    expect(askRetryOrQuit).toHaveBeenCalledWith('failed');
  });

  it('rejects an account outside the allowed domain and clears it from the cache', async () => {
    const logout = vi.fn(async () => {});
    const askRetryOrQuit = vi.fn(() => 'quit' as const);
    const { ui } = makeUi({ askRetryOrQuit });
    const config = makeConfig({ allowedEmailDomains: ['vng.com.vn'] });
    const outsider = { username: 'someone@gmail.com', homeAccountId: 'home-2' };
    const outcome = await runSsoGate(makeDeps({ loginInteractive: async () => outsider, logout }, config, ui));
    expect(outcome.proceed).toBe(false);
    expect(logout).toHaveBeenCalledTimes(1);
    expect(askRetryOrQuit).toHaveBeenCalledWith('domainNotAllowed');
  });
});
