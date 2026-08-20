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
 *   3. `sso-config.json` shipped inside the app bundle (packaged builds), so a
 *      release can enable the gate out-of-the-box while (1) and (2) still override.
 *
 * This module deliberately avoids importing electron so it stays unit-testable; the
 * caller passes the resolved userData directory (e.g. `app.getPath('userData')`) and,
 * optionally, the bundled-resource directory (e.g. `process.resourcesPath`).
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

export function loadSsoConfig(
  userDataDir: string,
  env: NodeJS.ProcessEnv = process.env,
  bundledConfigDir?: string
): SsoConfig {
  const file = readConfigFile(userDataDir);
  // Lowest-priority baked config shipped inside the packaged app bundle. Lets a
  // release turn the gate on out-of-the-box, while env vars and the userData file
  // still take precedence so an operator can override or disable per install.
  const bundled = bundledConfigDir ? readConfigFile(bundledConfigDir) : {};

  const tenantId = firstNonEmpty(env.WEPROMPT_SSO_TENANT_ID, file.tenantId, bundled.tenantId);
  const clientId = firstNonEmpty(env.WEPROMPT_SSO_CLIENT_ID, file.clientId, bundled.clientId);
  const redirectUri =
    firstNonEmpty(env.WEPROMPT_SSO_REDIRECT_URI, file.redirectUri, bundled.redirectUri) ?? DEFAULT_REDIRECT_URI;
  const scopesSource = [file.scopes, bundled.scopes].find((value) => Array.isArray(value) && value.length > 0);
  const scopes = scopesSource ?? DEFAULT_SCOPES;
  const domainsSource = [file.allowedEmailDomains, bundled.allowedEmailDomains].find((value) => Array.isArray(value));
  const allowedEmailDomains = domainsSource
    ? domainsSource.map((domain) => String(domain).trim().toLowerCase()).filter(Boolean)
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
