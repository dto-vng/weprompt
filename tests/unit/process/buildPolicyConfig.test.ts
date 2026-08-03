import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sentryVitePluginMock = vi.hoisted(() => vi.fn(() => ({ name: 'test-sentry-plugin' })));

vi.mock('@sentry/vite-plugin', () => ({
  sentryVitePlugin: sentryVitePluginMock,
}));

const POLICY_ENV_KEYS = [
  'WEPROMPT_INTERNAL_RELEASE',
  'WEPROMPT_UPDATE_BASE_URL',
  'SENTRY_DSN',
  'SENTRY_AUTH_TOKEN',
  'SENTRY_UPLOAD_SOURCE_MAPS',
  'SENTRY_ORG',
  'SENTRY_PROJECT',
  'SENTRY_RELEASE',
] as const;

const originalValues = new Map(POLICY_ENV_KEYS.map((key) => [key, process.env[key]]));

async function resolveProductionConfig() {
  vi.resetModules();
  const { default: configExport } = await import('../../../packages/desktop/electron.vite.config');
  if (typeof configExport !== 'function') {
    throw new Error('Expected electron-vite config to be a function');
  }
  return configExport({ command: 'build', mode: 'production' });
}

describe('electron-vite internal release policy', () => {
  beforeEach(() => {
    sentryVitePluginMock.mockClear();
    for (const key of POLICY_ENV_KEYS) delete process.env[key];
  });

  afterEach(() => {
    for (const key of POLICY_ENV_KEYS) {
      const original = originalValues.get(key);
      if (original === undefined) delete process.env[key];
      else process.env[key] = original;
    }
  });

  it('does not construct a Sentry plugin from an ambient auth token alone', async () => {
    process.env.SENTRY_AUTH_TOKEN = 'ambient-token';

    const config = await resolveProductionConfig();

    expect(sentryVitePluginMock).not.toHaveBeenCalled();
    expect(config.main?.build?.sourcemap).toBe(false);
    expect(config.renderer?.build?.sourcemap).toBe(false);
  });

  it('rejects an ambient Sentry token before plugin construction in an internal release', async () => {
    process.env.WEPROMPT_INTERNAL_RELEASE = '1';
    process.env.SENTRY_AUTH_TOKEN = 'ambient-token';

    await expect(resolveProductionConfig()).rejects.toThrow(/SENTRY_AUTH_TOKEN/);
    expect(sentryVitePluginMock).not.toHaveBeenCalled();
  });
});
