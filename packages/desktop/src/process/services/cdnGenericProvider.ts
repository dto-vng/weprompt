/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DownloadOptions, WindowsUpdateInfo } from 'builder-util-runtime';
import type { ClientRequest, IncomingMessage } from 'electron';
import type { UpdateInfo } from 'electron-updater';
import { ElectronHttpExecutor } from 'electron-updater/out/electronHttpExecutor';
import { GenericProvider } from 'electron-updater/out/providers/GenericProvider';
import { resolveFiles as resolveProviderFiles } from 'electron-updater/out/providers/Provider';
import { getChannelFilename, newUrlFromBase } from 'electron-updater/out/util';
import log from 'electron-log';
import type { RequestOptions } from 'http';

type GenericProviderConfiguration = ConstructorParameters<typeof GenericProvider>[0];
type GenericProviderUpdater = ConstructorParameters<typeof GenericProvider>[1];
type GenericProviderRuntimeOptions = ConstructorParameters<typeof GenericProvider>[2];

export type CdnGenericProviderConfiguration = Omit<GenericProviderConfiguration, 'provider'> & {
  provider: 'custom';
  updateProvider?: unknown;
};

const withTrailingSlash = (url: string): string => (url.endsWith('/') ? url : `${url}/`);

const updateUrlError = (url: URL, baseUrl: URL): Error =>
  new Error(`Update URL is outside the configured update base: ${url.href} (base: ${baseUrl.href})`);

export function assertUpdateUrlWithinBase(url: URL, configuredBaseUrl: string): void {
  const baseUrl = new URL(withTrailingSlash(configuredBaseUrl));
  const basePath = baseUrl.pathname.endsWith('/') ? baseUrl.pathname : `${baseUrl.pathname}/`;
  const basePathWithoutSlash = basePath.slice(0, -1) || '/';

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.origin !== baseUrl.origin ||
    (url.pathname !== basePathWithoutSlash && !url.pathname.startsWith(basePath))
  ) {
    throw updateUrlError(url, baseUrl);
  }
}

export function requestOptionsToUpdateUrl(options: RequestOptions): URL {
  const protocol = options.protocol ?? 'https:';
  const hostname = options.hostname;
  let authority: string | undefined;

  if (hostname) {
    const normalizedHostname = hostname.includes(':') && !hostname.startsWith('[') ? `[${hostname}]` : hostname;
    authority = `${normalizedHostname}${options.port ? `:${options.port}` : ''}`;
  } else if (options.host) {
    authority = options.host;
  }

  if (!authority) {
    throw new Error('Update request is missing a hostname');
  }

  const requestPath = options.path ?? '/';
  return new URL(`${protocol}//${authority}${requestPath.startsWith('/') ? requestPath : `/${requestPath}`}`);
}

export class ContainedElectronHttpExecutor extends ElectronHttpExecutor {
  constructor(
    private readonly updateBaseUrl: string,
    proxyLoginCallback?: ConstructorParameters<typeof ElectronHttpExecutor>[0]
  ) {
    super(proxyLoginCallback);
  }

  override download(url: URL, destination: string, options: DownloadOptions): Promise<string> {
    assertUpdateUrlWithinBase(url, this.updateBaseUrl);
    return super.download(url, destination, options);
  }

  override createRequest(options: RequestOptions, callback: (response: IncomingMessage) => void): ClientRequest {
    assertUpdateUrlWithinBase(requestOptionsToUpdateUrl(options), this.updateBaseUrl);
    return super.createRequest(options, callback);
  }

  protected override addRedirectHandlers(
    request: ClientRequest,
    options: RequestOptions,
    reject: (error: Error) => void,
    redirectCount: number,
    handler: (options: RequestOptions) => void
  ): void {
    super.addRedirectHandlers(request, options, reject, redirectCount, (redirectOptions) => {
      try {
        assertUpdateUrlWithinBase(requestOptionsToUpdateUrl(redirectOptions), this.updateBaseUrl);
        handler(redirectOptions);
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
}

export class CdnGenericProvider extends GenericProvider {
  private readonly _cdnBaseUrl: URL;
  // Parent stores `updater` privately; keep our own reference to rebuild the
  // channel-file URL for logging (the base `channel` getter is also private).
  private readonly _updater: GenericProviderUpdater;

  constructor(
    configuration: CdnGenericProviderConfiguration,
    updater: GenericProviderUpdater,
    runtimeOptions: GenericProviderRuntimeOptions
  ) {
    const genericConfiguration: GenericProviderConfiguration = {
      ...configuration,
      provider: 'generic',
    };
    super(genericConfiguration, updater, runtimeOptions);
    this._updater = updater;
    this._cdnBaseUrl = new URL(withTrailingSlash(configuration.url));
    log.debug('[auto-update] CDN provider initialized', {
      baseUrl: this._cdnBaseUrl.href,
      platform: runtimeOptions.platform,
      isUseMultipleRangeRequest: runtimeOptions.isUseMultipleRangeRequest,
    });
  }

  /**
   * Resolve the channel metadata file (e.g. `latest-mac.yml`) the updater fetches
   * to discover the newest version. Mirrors GenericProvider's private `channel`
   * getter, which is not accessible from a subclass.
   */
  private resolveLatestVersionUrl(): URL {
    const channelName = this._updater.channel ?? this.getDefaultChannelName();
    const channelFile = getChannelFilename(channelName);
    // `isAddNoCacheQuery` is a real getter on AppUpdater but absent from its public types.
    const addNoCacheQuery = Boolean((this._updater as unknown as { isAddNoCacheQuery?: boolean }).isAddNoCacheQuery);
    return newUrlFromBase(channelFile, this._cdnBaseUrl, addNoCacheQuery);
  }

  override async getLatestVersion(): Promise<UpdateInfo> {
    const latestVersionUrl = this.resolveLatestVersionUrl();
    assertUpdateUrlWithinBase(latestVersionUrl, this._cdnBaseUrl.href);
    log.info('[auto-update] Checking latest version from URL:', latestVersionUrl.href);
    return super.getLatestVersion();
  }

  override resolveFiles(updateInfo: UpdateInfo): ReturnType<GenericProvider['resolveFiles']> {
    const versionBaseUrl = new URL(`${updateInfo.version}/`, this._cdnBaseUrl);
    assertUpdateUrlWithinBase(versionBaseUrl, this._cdnBaseUrl.href);

    const filePaths = updateInfo.files?.map((file) => file.url) ?? (updateInfo.path ? [updateInfo.path] : []);
    for (const filePath of filePaths) {
      assertUpdateUrlWithinBase(new URL(filePath, versionBaseUrl), this._cdnBaseUrl.href);
    }
    const packages = (updateInfo as UpdateInfo & Pick<WindowsUpdateInfo, 'packages'>).packages;
    for (const packageInfo of Object.values(packages ?? {})) {
      if (packageInfo?.path) {
        assertUpdateUrlWithinBase(new URL(packageInfo.path, versionBaseUrl), this._cdnBaseUrl.href);
      }
    }

    const resolved = resolveProviderFiles(
      updateInfo,
      this._cdnBaseUrl,
      (filePath) => `${updateInfo.version}/${filePath}`
    );
    for (const file of resolved) {
      assertUpdateUrlWithinBase(file.url, this._cdnBaseUrl.href);
      if (file.packageInfo?.path) {
        assertUpdateUrlWithinBase(new URL(file.packageInfo.path), this._cdnBaseUrl.href);
      }
    }
    log.info('[auto-update] Update download URL(s) resolved:', {
      version: updateInfo.version,
      files: resolved.map((file) => file.url.href),
      packages: resolved.map((file) => file.packageInfo?.path).filter(Boolean),
    });
    return resolved;
  }
}
