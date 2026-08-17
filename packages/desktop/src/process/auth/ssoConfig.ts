/**
 * Microsoft (Entra / Azure AD) SSO configuration for the desktop login gate.
 *
 * Design: SSO is DORMANT unless a tenant id AND a client id are provided. With no
 * configuration the app behaves exactly as it does today (no login gate), so this
 * feature ships safely before the customer's IT has registered the Azure app —
 * dropping in the two ids (via file or env) turns the gate on with no rebuild.
 *
 * Configuration is read from, in priority order:
 *   1. Environment variables (WEPROMPT_SSO_*), useful for build-time baking.
 *   2. `sso-config.json` in the app's userData directory, for IT to fill in-place.
 *
 * This module deliberately avoids importing electron so it stays unit-testable; the
 * caller passes the resolved userData directory (e.g. `app.getPath('userData')`).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const SSO_CONFIG_FILENAME = 'sso-config.json';
const DEFAULT_REDIRECT_URI = 'http://localhost';
const DEFAULT_SCOPES = ['openid', 'profile', 'email', 'User.Read'];

export type SsoConfig = {
  /** True only when both tenantId and clientId are present. Gate is off otherwise. */
  enabled: boolean;
  tenantId?: string;
  clientId?: string;
  /** OAuth redirect URI registered in Azure (loopback by default). */
  redirectUri: string;
  scopes: string[];
  /**
   * Optional extra app-side allowlist of email domains (lower-cased). Empty by
   * default — the primary control is the Entra tenant restriction configured by IT.
   */
  allowedEmailDomains: string[];
};

type SsoConfigFile = Partial<
  Pick<SsoConfig, 'tenantId' | 'clientId' | 'redirectUri' | 'scopes' | 'allowedEmailDomains'>
>;

function readConfigFile(userDataDir: string): SsoConfigFile {
  try {
    const file = join(userDataDir, SSO_CONFIG_FILENAME);
    if (!existsSync(file)) return {};
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as SsoConfigFile;
  } catch {
    // A malformed config file must not crash startup — treat it as "no config"
    // so the app still opens (SSO simply stays dormant).
    return {};
  }
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

export function loadSsoConfig(userDataDir: string, env: NodeJS.ProcessEnv = process.env): SsoConfig {
  const file = readConfigFile(userDataDir);

  const tenantId = firstNonEmpty(env.WEPROMPT_SSO_TENANT_ID, file.tenantId);
  const clientId = firstNonEmpty(env.WEPROMPT_SSO_CLIENT_ID, file.clientId);
  const redirectUri = firstNonEmpty(env.WEPROMPT_SSO_REDIRECT_URI, file.redirectUri) ?? DEFAULT_REDIRECT_URI;
  const scopes = Array.isArray(file.scopes) && file.scopes.length > 0 ? file.scopes : DEFAULT_SCOPES;
  const allowedEmailDomains = Array.isArray(file.allowedEmailDomains)
    ? file.allowedEmailDomains.map((domain) => String(domain).trim().toLowerCase()).filter(Boolean)
    : [];

  return {
    enabled: Boolean(tenantId && clientId),
    tenantId,
    clientId,
    redirectUri,
    scopes,
    allowedEmailDomains,
  };
}

/**
 * Whether an authenticated account's email is allowed by the optional app-side
 * domain allowlist. When the allowlist is empty this returns true — access is then
 * governed solely by the Entra tenant restriction. Belt-and-suspenders only.
 */
export function isEmailDomainAllowed(
  email: string | undefined,
  config: Pick<SsoConfig, 'allowedEmailDomains'>
): boolean {
  if (config.allowedEmailDomains.length === 0) return true;
  const domain = email?.split('@')[1]?.trim().toLowerCase();
  return Boolean(domain && config.allowedEmailDomains.includes(domain));
}
