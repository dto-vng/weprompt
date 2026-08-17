import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { isEmailDomainAllowed, loadSsoConfig, SSO_CONFIG_FILENAME } from '@process/auth/ssoConfig';

const tempDirs: string[] = [];

function makeUserDataDir(configFile?: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'weprompt-sso-'));
  tempDirs.push(dir);
  if (configFile !== undefined) {
    const contents = typeof configFile === 'string' ? configFile : JSON.stringify(configFile);
    writeFileSync(join(dir, SSO_CONFIG_FILENAME), contents);
  }
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe('loadSsoConfig', () => {
  it('is dormant (disabled) when nothing is configured', () => {
    const config = loadSsoConfig(makeUserDataDir(), {});
    expect(config.enabled).toBe(false);
    expect(config.tenantId).toBeUndefined();
    expect(config.clientId).toBeUndefined();
    expect(config.redirectUri).toBe('http://localhost');
    expect(config.scopes).toContain('User.Read');
  });

  it('enables SSO when a config file provides both ids', () => {
    const dir = makeUserDataDir({ tenantId: 'tenant-1', clientId: 'client-1' });
    const config = loadSsoConfig(dir, {});
    expect(config.enabled).toBe(true);
    expect(config.tenantId).toBe('tenant-1');
    expect(config.clientId).toBe('client-1');
  });

  it('stays dormant when only one id is present', () => {
    const dir = makeUserDataDir({ tenantId: 'tenant-only' });
    expect(loadSsoConfig(dir, {}).enabled).toBe(false);
  });

  it('lets environment variables override the config file', () => {
    const dir = makeUserDataDir({ tenantId: 'file-tenant', clientId: 'file-client', redirectUri: 'http://file' });
    const config = loadSsoConfig(dir, {
      WEPROMPT_SSO_TENANT_ID: 'env-tenant',
      WEPROMPT_SSO_CLIENT_ID: 'env-client',
      WEPROMPT_SSO_REDIRECT_URI: 'http://env',
    });
    expect(config.tenantId).toBe('env-tenant');
    expect(config.clientId).toBe('env-client');
    expect(config.redirectUri).toBe('http://env');
  });

  it('treats a malformed config file as no config (never throws)', () => {
    const dir = makeUserDataDir('{ this is not valid json');
    const config = loadSsoConfig(dir, {});
    expect(config.enabled).toBe(false);
  });

  it('normalizes the optional email-domain allowlist to lower-case', () => {
    const dir = makeUserDataDir({ tenantId: 't', clientId: 'c', allowedEmailDomains: ['Company.COM', ' vng.com.vn '] });
    const config = loadSsoConfig(dir, {});
    expect(config.allowedEmailDomains).toEqual(['company.com', 'vng.com.vn']);
  });
});

describe('isEmailDomainAllowed', () => {
  it('allows everything when the allowlist is empty (Entra is the real gate)', () => {
    expect(isEmailDomainAllowed('anyone@anywhere.com', { allowedEmailDomains: [] })).toBe(true);
  });

  it('allows a matching domain and rejects a non-matching one', () => {
    const cfg = { allowedEmailDomains: ['vng.com.vn'] };
    expect(isEmailDomainAllowed('nhanvien@vng.com.vn', cfg)).toBe(true);
    expect(isEmailDomainAllowed('outsider@gmail.com', cfg)).toBe(false);
    expect(isEmailDomainAllowed(undefined, cfg)).toBe(false);
  });
});
