/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { WindowsUpdateInfo } from 'builder-util-runtime';
import type { ClientRequest } from 'electron';
import type { RequestOptions } from 'http';
import { describe, expect, it, vi } from 'vitest';
import type { UpdateInfo } from 'electron-updater';
import type { AppUpdater } from 'electron-updater/out/AppUpdater';
import type { ProviderRuntimeOptions } from 'electron-updater/out/providers/Provider';
import { resolveUpdateBaseUrl } from '@/common/update/updatePolicy';
import {
  assertUpdateUrlWithinBase,
  CdnGenericProvider,
  ContainedElectronHttpExecutor,
  requestOptionsToUpdateUrl,
} from '@/process/services/update/cdnGenericProvider';
import { buildCdnFeedOptions } from '@/process/services/update/updateFeed';

const makeRuntimeOptions = (): ProviderRuntimeOptions => ({
  isUseMultipleRangeRequest: true,
  platform: 'darwin',
  executor: {
    request: vi.fn(),
  } as unknown as ProviderRuntimeOptions['executor'],
});

describe('CDN update feed options', () => {
  it('builds a custom electron-updater provider pointed at the configured product feed', () => {
    const options = buildCdnFeedOptions('https://updates.weprompt.test/releases');

    expect(options.provider).toBe('custom');
    expect(options.url).toBe('https://updates.weprompt.test/releases');
    expect(options.updateProvider).toBe(CdnGenericProvider);
  });

  it('fails closed when no update feed is configured', () => {
    expect(() => buildCdnFeedOptions(null)).toThrow('updates-disabled');
  });

  it.each([
    'https://updates.weprompt.test/releases/%2e%2e%2fprivate',
    'https://updates.weprompt.test/releases/%252e%252e%252fprivate',
  ])('rejects an update base with ambiguous encoded traversal: %s', (url) => {
    expect(() => resolveUpdateBaseUrl(url)).toThrow(/ambiguous path encoding/i);
  });
});

describe('CdnGenericProvider', () => {
  it('resolves relative update files under the version directory', () => {
    const provider = new CdnGenericProvider(
      {
        provider: 'custom',
        url: 'https://updates.weprompt.test/releases',
      },
      {} as AppUpdater,
      makeRuntimeOptions()
    );

    const files = provider.resolveFiles({
      version: '2.1.14',
      files: [
        {
          url: 'WePrompt-2.1.14-mac-arm64.dmg',
          sha512: 'sha512-value',
        },
      ],
      path: 'WePrompt-2.1.14-mac-arm64.dmg',
      sha512: 'sha512-value',
      releaseDate: '2026-06-08T00:00:00.000Z',
    } satisfies UpdateInfo);

    expect(files[0]?.url.href).toBe('https://updates.weprompt.test/releases/2.1.14/WePrompt-2.1.14-mac-arm64.dmg');
  });

  it.each([
    '../../outside/WePrompt.dmg',
    'https://static.aionui.com/releases/WePrompt.dmg',
    'https://updates.weprompt.test/other/WePrompt.dmg',
  ])('rejects update metadata that resolves outside the configured base: %s', (fileUrl) => {
    const provider = new CdnGenericProvider(
      {
        provider: 'custom',
        url: 'https://updates.weprompt.test/releases',
      },
      {} as AppUpdater,
      makeRuntimeOptions()
    );

    expect(() =>
      provider.resolveFiles({
        version: '2.1.14',
        files: [{ url: fileUrl, sha512: 'sha512-value' }],
        path: fileUrl,
        sha512: 'sha512-value',
        releaseDate: '2026-06-08T00:00:00.000Z',
      } satisfies UpdateInfo)
    ).toThrow(/outside the configured update base/i);
  });

  it('rejects a web-installer package path outside the configured base', () => {
    const provider = new CdnGenericProvider(
      {
        provider: 'custom',
        url: 'https://updates.weprompt.test/releases',
      },
      {} as AppUpdater,
      makeRuntimeOptions()
    );
    const updateInfo: UpdateInfo & Pick<WindowsUpdateInfo, 'packages'> = {
      version: '2.1.14',
      files: [{ url: 'WePrompt-2.1.14-win-x64.exe', sha512: 'sha512-value' }],
      path: 'WePrompt-2.1.14-win-x64.exe',
      sha512: 'sha512-value',
      releaseDate: '2026-06-08T00:00:00.000Z',
      packages: {
        [process.arch]: {
          path: '../../outside/package.7z',
          sha512: 'package-sha512-value',
        },
      },
    };

    expect(() => provider.resolveFiles(updateInfo)).toThrow(/outside the configured update base/i);
  });

  it('rejects request and redirect options outside the configured origin and path', () => {
    expect(
      requestOptionsToUpdateUrl({
        protocol: 'https:',
        hostname: 'updates.weprompt.test',
        path: '/releases/latest.yml',
      }).href
    ).toBe('https://updates.weprompt.test/releases/latest.yml');

    expect(() =>
      assertUpdateUrlWithinBase(
        new URL('https://static.aionui.com/releases/latest.yml'),
        'https://updates.weprompt.test/releases'
      )
    ).toThrow(/outside the configured update base/i);
    expect(() =>
      assertUpdateUrlWithinBase(
        new URL('https://updates.weprompt.test/other/latest.yml'),
        'https://updates.weprompt.test/releases'
      )
    ).toThrow(/outside the configured update base/i);
  });

  it.each([
    'https://updates.weprompt.test/releases/%2e%2e%2fprivate/latest.yml',
    'https://updates.weprompt.test/releases/%2e%2e%5cprivate/latest.yml',
    'https://updates.weprompt.test/releases/%252e%252e%252fprivate/latest.yml',
  ])('rejects ambiguous encoded paths before an updater or proxy can normalize them: %s', (url) => {
    expect(() => assertUpdateUrlWithinBase(new URL(url), 'https://updates.weprompt.test/releases')).toThrow(
      /outside the configured update base/i
    );
  });

  it('rejects an electron redirect before following it outside the configured base', () => {
    class ExposedContainedExecutor extends ContainedElectronHttpExecutor {
      attachRedirectHandler(
        request: ClientRequest,
        options: RequestOptions,
        reject: (error: Error) => void,
        handler: (options: RequestOptions) => void
      ): void {
        this.addRedirectHandlers(request, options, reject, 0, handler);
      }
    }

    type RedirectListener = (statusCode: number, method: string, redirectUrl: string) => void;
    let redirectListener: RedirectListener | undefined;
    const abort = vi.fn();
    const request = {
      abort,
      on: vi.fn((event: string, listener: RedirectListener) => {
        if (event === 'redirect') redirectListener = listener;
        return request;
      }),
    } as unknown as ClientRequest;
    const reject = vi.fn();
    const followRedirect = vi.fn();
    const executor = new ExposedContainedExecutor('https://updates.weprompt.test/releases');

    executor.attachRedirectHandler(
      request,
      {
        protocol: 'https:',
        hostname: 'updates.weprompt.test',
        path: '/releases/latest.yml',
      },
      reject,
      followRedirect
    );
    expect(redirectListener).toBeTypeOf('function');

    redirectListener?.(302, 'GET', 'https://static.aionui.com/releases/latest.yml');

    expect(abort).toHaveBeenCalledTimes(1);
    expect(followRedirect).not.toHaveBeenCalled();
    expect(reject).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/outside/i) }));
  });
});
