const SENTRY_BUILD_VARIABLES = [
  'SENTRY_DSN',
  'SENTRY_AUTH_TOKEN',
  'SENTRY_UPLOAD_SOURCE_MAPS',
  'SENTRY_ORG',
  'SENTRY_PROJECT',
  'SENTRY_RELEASE',
] as const;

type SentryBuildVariable = (typeof SENTRY_BUILD_VARIABLES)[number];

export type DesktopReleaseBuildEnvironment = Partial<
  Record<SentryBuildVariable | 'WEPROMPT_INTERNAL_RELEASE' | 'WEPROMPT_UPDATE_BASE_URL', string | undefined>
>;

export type DesktopReleaseBuildPolicy = {
  internalRelease: boolean;
  updateBaseUrl: string | null;
  enableSentrySourceMaps: boolean;
  sentry: {
    dsn: string;
    authToken: string;
    org: string;
    project: string;
    release: string;
  };
};

const trimmed = (value: string | undefined): string => value?.trim() ?? '';

const AMBIGUOUS_UPDATE_PATH_ENCODING = /%(?:25|2e|2f|5c)/i;

const canonicalUpdatePath = (url: URL): string | null => {
  // A proxy may decode these values differently from WHATWG URL handling.
  // Reject encoded percent, dot, and path separators instead of allowing a
  // downstream normalization step to move a request outside the feed root.
  if (AMBIGUOUS_UPDATE_PATH_ENCODING.test(url.pathname)) return null;

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }

  if (decodedPath.includes('\\')) return null;
  if (decodedPath.split('/').some((segment) => segment === '.' || segment === '..')) return null;
  return decodedPath;
};

export function isUpdateUrlWithinBase(targetUrl: URL, configuredBaseUrl: string): boolean {
  let baseUrl: URL;
  try {
    baseUrl = new URL(configuredBaseUrl);
  } catch {
    return false;
  }

  const targetPath = canonicalUpdatePath(targetUrl);
  const baseCanonicalPath = canonicalUpdatePath(baseUrl);
  if (!targetPath || !baseCanonicalPath) return false;

  const basePath = baseCanonicalPath.endsWith('/') ? baseCanonicalPath : `${baseCanonicalPath}/`;
  const basePathWithoutSlash = basePath.slice(0, -1) || '/';

  return (
    targetUrl.protocol === 'https:' &&
    !targetUrl.username &&
    !targetUrl.password &&
    baseUrl.protocol === 'https:' &&
    !baseUrl.username &&
    !baseUrl.password &&
    targetUrl.origin === baseUrl.origin &&
    (targetPath === basePathWithoutSlash || targetPath.startsWith(basePath))
  );
}

const isUpstreamAionUiDestination = (url: URL): boolean => {
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  const pathname = url.pathname.toLowerCase();

  if (hostname === 'aionui.com' || hostname.endsWith('.aionui.com')) {
    return true;
  }

  if (hostname === 'github.com' && pathname.startsWith('/iofficeai/aionui')) {
    return true;
  }

  return hostname === 'api.github.com' && pathname.startsWith('/repos/iofficeai/aionui');
};

export function resolveUpdateBaseUrl(value: string | undefined): string | null {
  const rawValue = trimmed(value);
  if (!rawValue) return null;

  let url: URL;
  try {
    url = new URL(rawValue);
  } catch (error) {
    throw new Error('WEPROMPT_UPDATE_BASE_URL must be a valid URL', { cause: error });
  }

  if (url.protocol !== 'https:') {
    throw new Error('WEPROMPT_UPDATE_BASE_URL must use HTTPS');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('WEPROMPT_UPDATE_BASE_URL must not contain credentials, query parameters, or a fragment');
  }
  if (!canonicalUpdatePath(url)) {
    throw new Error('WEPROMPT_UPDATE_BASE_URL must not contain ambiguous path encoding');
  }
  if (isUpstreamAionUiDestination(url)) {
    throw new Error('WEPROMPT_UPDATE_BASE_URL must not use a public AionUi destination');
  }

  return url.toString().replace(/\/$/, '');
}

export function resolveDesktopReleaseBuildPolicy(
  environment: DesktopReleaseBuildEnvironment,
  options: { isDevelopment: boolean }
): DesktopReleaseBuildPolicy {
  const internalRelease = trimmed(environment.WEPROMPT_INTERNAL_RELEASE) === '1';
  const rawUpdateBaseUrl = trimmed(environment.WEPROMPT_UPDATE_BASE_URL);

  if (internalRelease && rawUpdateBaseUrl) {
    throw new Error('WEPROMPT_UPDATE_BASE_URL must be unset when WEPROMPT_INTERNAL_RELEASE=1');
  }

  const configuredSentryVariables = SENTRY_BUILD_VARIABLES.filter((key) => trimmed(environment[key]));
  if (internalRelease && configuredSentryVariables.length > 0) {
    throw new Error(`${configuredSentryVariables.join(', ')} must be unset when WEPROMPT_INTERNAL_RELEASE=1`);
  }

  const updateBaseUrl = resolveUpdateBaseUrl(rawUpdateBaseUrl);
  const explicitSourceMapUpload = trimmed(environment.SENTRY_UPLOAD_SOURCE_MAPS) === 'true';
  const enableSentrySourceMaps = !options.isDevelopment && !internalRelease && explicitSourceMapUpload;

  if (enableSentrySourceMaps) {
    const requiredVariables = [
      'SENTRY_DSN',
      'SENTRY_AUTH_TOKEN',
      'SENTRY_ORG',
      'SENTRY_PROJECT',
      'SENTRY_RELEASE',
    ] as const;
    const missingVariables = requiredVariables.filter((key) => !trimmed(environment[key]));
    if (missingVariables.length > 0) {
      throw new Error(`Sentry source-map upload requires ${missingVariables.join(', ')}`);
    }
  }

  return {
    internalRelease,
    updateBaseUrl,
    enableSentrySourceMaps,
    sentry: {
      dsn: internalRelease ? '' : trimmed(environment.SENTRY_DSN),
      authToken: trimmed(environment.SENTRY_AUTH_TOKEN),
      org: trimmed(environment.SENTRY_ORG),
      project: trimmed(environment.SENTRY_PROJECT),
      release: trimmed(environment.SENTRY_RELEASE),
    },
  };
}

export function getConfiguredUpdateBaseUrl(
  value: string | undefined = process.env.WEPROMPT_UPDATE_BASE_URL
): string | null {
  return resolveUpdateBaseUrl(value);
}

export function isUpdateFeatureEnabled(value: string | undefined = process.env.WEPROMPT_UPDATE_BASE_URL): boolean {
  return getConfiguredUpdateBaseUrl(value) !== null;
}
