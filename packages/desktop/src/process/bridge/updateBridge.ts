/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type {
  AutoUpdateReadyResult,
  UpdateCheckResult,
  UpdateDownloadCancelRequest,
  UpdateDownloadProgressEvent,
  UpdateDownloadRequest,
  UpdateDownloadResult,
  UpdateReleaseInfo,
  InstallerLastFailureMarker,
} from '@/common/update/updateTypes';
import { UPDATE_BRIDGE_DISABLED_CODE } from '@/common/update/updateTypes';
import { getConfiguredUpdateBaseUrl, isUpdateUrlWithinBase } from '@/common/update/updatePolicy';
import { uuid } from '@/common/utils';
import { app } from 'electron';
import log from 'electron-log';
import * as fs from 'fs';
import * as path from 'path';
import { consumeInstallerLastFailure } from '../services/installerLastFailure';

/** Lazily loads i18n to avoid pulling in initStorage chain at module load time */
let _i18nCache: Promise<typeof import('../services/i18n')> | null = null;
const getI18n = async () => {
  if (!_i18nCache) {
    _i18nCache = import('../services/i18n');
  }
  const m = await _i18nCache;
  return m.default;
};

/** Parameters for auto-update check via electron-updater */
interface AutoUpdateCheckParams {
  /** Whether to include prerelease/dev builds in update check */
  includePrerelease?: boolean;
}

const MAX_REDIRECTS = 8;
type AutoUpdaterService = (typeof import('../services/autoUpdaterService'))['autoUpdaterService'];

const loadAutoUpdaterService = async (): Promise<AutoUpdaterService> => {
  const { autoUpdaterService } = await import('../services/autoUpdaterService');
  return autoUpdaterService;
};

const createUpdatesDisabledResult = () => ({
  success: false as const,
  code: UPDATE_BRIDGE_DISABLED_CODE,
  msg: UPDATE_BRIDGE_DISABLED_CODE,
});

const assertAllowedUrl = async (rawUrl: string, updateBaseUrl: string) => {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error((await getI18n()).t('update.errors.invalidUrl'));
  }

  if (parsed.protocol !== 'https:') {
    throw new Error((await getI18n()).t('update.errors.httpsOnly'));
  }
  if (!isUpdateUrlWithinBase(parsed, updateBaseUrl)) {
    throw new Error((await getI18n()).t('update.errors.hostNotAllowed', { host: parsed.hostname }));
  }
};

const fetchWithAllowlistedRedirects = async (
  rawUrl: string,
  signal: AbortSignal,
  updateBaseUrl: string
): Promise<Response> => {
  let current = rawUrl;

  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    await assertAllowedUrl(current, updateBaseUrl);

    const res = await fetch(current, {
      signal,
      redirect: 'manual',
      headers: {
        'User-Agent': 'WePrompt',
      },
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) {
        throw new Error((await getI18n()).t('update.errors.redirectNoLocation'));
      }
      current = new URL(location, current).toString();
      continue;
    }

    return res;
  }

  throw new Error((await getI18n()).t('update.errors.tooManyRedirects'));
};

const mapAutoUpdateInfo = (info: {
  version: string;
  releaseDate?: string;
  releaseNotes?: unknown;
}): UpdateReleaseInfo => ({
  tagName: `v${info.version}`,
  version: info.version,
  name: info.version,
  body: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
  htmlUrl: '',
  publishedAt: info.releaseDate,
  prerelease: info.version.includes('-'),
  draft: false,
  assets: [],
});

type DownloadState = {
  abortController: AbortController;
  file_path: string;
};

type ActiveManualDownload = {
  downloadId: string;
  file_path: string;
};

const downloads = new Map<string, DownloadState>();
const activeManualDownloads = new Map<string, ActiveManualDownload>();
const manualDownloadKeysById = new Map<string, string>();
const cancelledManualDownloadIds = new Set<string>();

const sanitizeFileName = (name: string): string => {
  // Keep only base name and trim weird whitespace.
  const base = path.basename(name).trim();
  // Avoid empty names.
  return base || `WePrompt-update-${Date.now()}`;
};

const ensureUniquePath = (target: string): string => {
  if (!fs.existsSync(target)) return target;
  const dir = path.dirname(target);
  const ext = path.extname(target);
  const base = path.basename(target, ext);
  for (let i = 1; i < 1000; i++) {
    const next = path.join(dir, `${base} (${i})${ext}`);
    if (!fs.existsSync(next)) return next;
  }
  return path.join(dir, `${base}-${Date.now()}${ext}`);
};

const buildManualDownloadKey = (url: string, fallbackUrl: string | undefined, fileName: string): string => {
  const primary = new URL(url).toString();
  const fallback = fallbackUrl ? new URL(fallbackUrl).toString() : '';
  return [primary, fallback, fileName].join('\n');
};

const emitProgress = (evt: UpdateDownloadProgressEvent) => {
  ipcBridge.update.downloadProgress.emit(evt);
};

const cleanupManualDownload = (downloadId: string) => {
  downloads.delete(downloadId);
  const activeKey = manualDownloadKeysById.get(downloadId);
  if (activeKey) {
    activeManualDownloads.delete(activeKey);
    manualDownloadKeysById.delete(downloadId);
  }
};

type DownloadAttempt = {
  ok: boolean;
  isAbort: boolean;
  message: string;
  receivedBytes: number;
  totalBytes?: number;
};

/**
 * Attempt to download from a single URL into `file_path`.
 * Emits `starting`/`downloading` progress events but NOT the terminal
 * completed/error/cancelled events — the caller decides whether to retry
 * or surface the final state.
 */
const attemptDownload = async (
  downloadId: string,
  url: string,
  file_path: string,
  abortController: AbortController,
  updateBaseUrl: string
): Promise<DownloadAttempt> => {
  let receivedBytes = 0;
  let totalBytes: number | undefined;

  const startedAt = Date.now();
  let lastEmitAt = 0;

  const emitThrottled = (status: UpdateDownloadProgressEvent['status']) => {
    const now = Date.now();
    const shouldEmit = now - lastEmitAt >= 250 || status !== 'downloading';
    if (!shouldEmit) return;

    const elapsedSec = Math.max(0.001, (now - startedAt) / 1000);
    const bytesPerSecond = receivedBytes / elapsedSec;
    const percent = totalBytes ? Math.min(100, (receivedBytes / totalBytes) * 100) : undefined;

    lastEmitAt = now;
    emitProgress({
      downloadId,
      status,
      receivedBytes,
      totalBytes,
      percent,
      bytesPerSecond,
    });
  };

  emitThrottled('starting');

  log.info('[update-download] Downloading from URL:', url);

  let stream: fs.WriteStream | null = null;
  try {
    const res = await fetchWithAllowlistedRedirects(url, abortController.signal, updateBaseUrl);

    if (!res.ok) {
      throw new Error((await getI18n()).t('update.errors.downloadFailed', { status: res.status }));
    }

    const contentLengthHeader = res.headers.get('content-length');
    if (contentLengthHeader) {
      const parsed = parseInt(contentLengthHeader, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        totalBytes = parsed;
      }
    }

    if (!res.body) {
      throw new Error((await getI18n()).t('update.errors.downloadNoBody'));
    }

    stream = fs.createWriteStream(file_path);
    const reader = res.body.getReader();

    let doneReading = false;
    while (!doneReading) {
      const { done, value } = await reader.read();
      doneReading = done;
      if (doneReading) break;
      if (!value) continue;

      receivedBytes += value.byteLength;

      const buf = Buffer.from(value);
      if (!stream.write(buf)) {
        await new Promise<void>((resolve) => stream?.once('drain', () => resolve()));
      }

      emitThrottled('downloading');
    }

    await new Promise<void>((resolve, reject) => {
      if (!stream) {
        resolve();
        return;
      }
      stream.end(() => resolve());
      stream.on('error', reject);
    });

    return { ok: true, isAbort: false, message: '', receivedBytes, totalBytes };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const isAbort = abortController.signal.aborted || message.toLowerCase().includes('aborted');

    try {
      stream?.close();
    } catch {
      // ignore
    }

    // Remove partial file before retrying or reporting failure.
    try {
      if (fs.existsSync(file_path)) {
        fs.rmSync(file_path, { force: true });
      }
    } catch {
      // ignore
    }

    return { ok: false, isAbort, message, receivedBytes, totalBytes };
  }
};

const startDownloadInBackground = async (
  downloadId: string,
  url: string,
  file_path: string,
  abortController: AbortController,
  updateBaseUrl: string,
  fallbackUrl?: string
) => {
  const runWithFallback = async (): Promise<DownloadAttempt> => {
    const primary = await attemptDownload(downloadId, url, file_path, abortController, updateBaseUrl);
    if (primary.ok) return primary;
    if (primary.isAbort) return primary;
    if (!fallbackUrl || fallbackUrl === url) return primary;

    try {
      await assertAllowedUrl(fallbackUrl, updateBaseUrl);
    } catch (err) {
      // Fallback URL itself is invalid — keep the primary failure result.
      log.warn('[update-download] Fallback URL rejected by allowlist:', err);
      return primary;
    }

    log.warn(`[update-download] Primary download failed (${primary.message}). Retrying with fallback URL.`);
    return attemptDownload(downloadId, fallbackUrl, file_path, abortController, updateBaseUrl);
  };

  const finalResult = await runWithFallback();

  try {
    if (cancelledManualDownloadIds.has(downloadId)) {
      return;
    }
    if (finalResult.ok) {
      emitProgress({
        downloadId,
        status: 'completed',
        receivedBytes: finalResult.receivedBytes,
        totalBytes: finalResult.totalBytes,
        percent: finalResult.totalBytes
          ? Math.min(100, (finalResult.receivedBytes / finalResult.totalBytes) * 100)
          : undefined,
        file_path,
      });
    } else {
      emitProgress({
        downloadId,
        status: finalResult.isAbort ? 'cancelled' : 'error',
        receivedBytes: finalResult.receivedBytes,
        totalBytes: finalResult.totalBytes,
        error: finalResult.message,
      });
    }
  } finally {
    cleanupManualDownload(downloadId);
    cancelledManualDownloadIds.delete(downloadId);
  }
};

/**
 * Create a status broadcast callback that sends updates via ipcBridge.autoUpdate.status.emit.
 * This is a pure emitter: it does not bind to any specific window.
 * The ipcBridge channel broadcasts to all renderer listeners, so no window guard is needed here.
 */
export function createAutoUpdateStatusBroadcast(): (
  status: import('../services/autoUpdaterService').AutoUpdateStatus
) => void {
  return (status) => {
    ipcBridge.autoUpdate.status.emit(status);
  };
}

const registerDisabledUpdateProviders = (): void => {
  ipcBridge.update.check.provider(async () => createUpdatesDisabledResult());
  ipcBridge.update.download.provider(async () => createUpdatesDisabledResult());
  ipcBridge.update.cancelDownload.provider(async () => createUpdatesDisabledResult());
  ipcBridge.autoUpdate.check.provider(async () => createUpdatesDisabledResult());
  ipcBridge.autoUpdate.restoreDownloaded.provider(async () => ({
    ...createUpdatesDisabledResult(),
    data: { ready: false },
  }));
  ipcBridge.autoUpdate.download.provider(async () => createUpdatesDisabledResult());
  ipcBridge.autoUpdate.cancelDownload.provider(async () => createUpdatesDisabledResult());
  ipcBridge.autoUpdate.quitAndInstall.provider(async () => createUpdatesDisabledResult());
};

export function initUpdateBridge(): void {
  ipcBridge.update.consumeInstallerLastFailure.provider(
    async (): Promise<{ success: boolean; data: InstallerLastFailureMarker | null; msg?: string }> => {
      try {
        return {
          success: true,
          data: await consumeInstallerLastFailure({ appDataDir: app.getPath('appData') }),
        };
      } catch (err: unknown) {
        return { success: false, data: null, msg: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  const updateBaseUrl = getConfiguredUpdateBaseUrl();
  if (!updateBaseUrl) {
    registerDisabledUpdateProviders();
    return;
  }

  ipcBridge.update.check.provider(
    async (params): Promise<{ success: boolean; data?: UpdateCheckResult; msg?: string }> => {
      try {
        const includePrerelease = Boolean(params?.includePrerelease);
        const currentVersion = app.getVersion();
        const autoUpdaterService = await loadAutoUpdaterService();
        autoUpdaterService.setAllowPrerelease(includePrerelease);
        const result = await autoUpdaterService.checkForUpdates();
        if (!result.success) {
          return { success: false, msg: result.error };
        }
        if (!result.updateInfo) {
          return { success: true, data: { currentVersion, updateAvailable: false } };
        }

        return {
          success: true,
          data: {
            currentVersion,
            updateAvailable: true,
            latest: mapAutoUpdateInfo(result.updateInfo),
          },
        };
      } catch (err: unknown) {
        return { success: false, msg: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  ipcBridge.update.download.provider(
    async (params: UpdateDownloadRequest): Promise<{ success: boolean; data?: UpdateDownloadResult; msg?: string }> => {
      try {
        if (!params?.url) {
          return { success: false, msg: (await getI18n()).t('update.errors.missingUrl') };
        }

        // Defense-in-depth: every URL and redirect must remain under the
        // configured product-owned update base.
        await assertAllowedUrl(params.url, updateBaseUrl);
        if (params.fallbackUrl) {
          await assertAllowedUrl(params.fallbackUrl, updateBaseUrl);
        }

        const downloadId = params.downloadId || uuid();
        const abortController = new AbortController();

        const downloadsDir = app.getPath('downloads');
        const urlObj = new URL(params.url);
        const urlName = path.basename(urlObj.pathname);
        const baseName = sanitizeFileName(params.file_name || urlName);
        const activeKey = buildManualDownloadKey(params.url, params.fallbackUrl, baseName);
        const activeDownload = activeManualDownloads.get(activeKey);
        if (activeDownload) {
          return Promise.resolve({ success: true, data: activeDownload });
        }

        const targetPath = ensureUniquePath(path.join(downloadsDir, baseName));
        downloads.set(downloadId, { abortController, file_path: targetPath });
        activeManualDownloads.set(activeKey, { downloadId, file_path: targetPath });
        manualDownloadKeysById.set(downloadId, activeKey);

        // Start background download, but return immediately so the UI stays responsive.
        void startDownloadInBackground(
          downloadId,
          params.url,
          targetPath,
          abortController,
          updateBaseUrl,
          params.fallbackUrl
        );

        return Promise.resolve({ success: true, data: { downloadId, file_path: targetPath } });
      } catch (err: unknown) {
        return Promise.resolve({ success: false, msg: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  ipcBridge.update.cancelDownload.provider(
    async (params: UpdateDownloadCancelRequest): Promise<{ success: boolean; msg?: string }> => {
      try {
        const downloadId = params?.downloadId;
        if (!downloadId) {
          return { success: false, msg: (await getI18n()).t('update.errors.missingDownloadId') };
        }

        const activeDownload = downloads.get(downloadId);
        if (!activeDownload) {
          return { success: true };
        }

        cancelledManualDownloadIds.add(downloadId);
        activeDownload.abortController.abort();
        emitProgress({
          downloadId,
          status: 'cancelled',
          receivedBytes: 0,
          file_path: activeDownload.file_path,
        });
        cleanupManualDownload(downloadId);

        return { success: true };
      } catch (err: unknown) {
        return { success: false, msg: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  // Auto-updater IPC handlers (electron-updater)
  ipcBridge.autoUpdate.check.provider(
    async (
      params: AutoUpdateCheckParams
    ): Promise<{
      success: boolean;
      data?: { updateInfo?: { version: string; releaseDate?: string; releaseNotes?: string } };
      msg?: string;
    }> => {
      try {
        const autoUpdaterService = await loadAutoUpdaterService();
        // Set prerelease preference before checking
        const includePrerelease = Boolean(params?.includePrerelease);
        autoUpdaterService.setAllowPrerelease(includePrerelease);

        const result = await autoUpdaterService.checkForUpdates();
        if (result.success && result.updateInfo) {
          // autoUpdaterService.checkForUpdates() only returns updateInfo when
          // electron-updater confirms isUpdateAvailable, so we can trust it directly.
          return {
            success: true,
            data: {
              updateInfo: {
                version: result.updateInfo.version,
                releaseDate: result.updateInfo.releaseDate,
                releaseNotes:
                  typeof result.updateInfo.releaseNotes === 'string' ? result.updateInfo.releaseNotes : undefined,
              },
            },
          };
        }
        return { success: result.success, msg: result.error };
      } catch (err: unknown) {
        return { success: false, msg: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  ipcBridge.autoUpdate.download.provider(async (): Promise<{ success: boolean; msg?: string }> => {
    try {
      const autoUpdaterService = await loadAutoUpdaterService();
      const result = await autoUpdaterService.downloadUpdate();
      return { success: result.success, msg: result.error };
    } catch (err: unknown) {
      return { success: false, msg: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcBridge.autoUpdate.restoreDownloaded.provider(
    async (): Promise<{ success: boolean; data: AutoUpdateReadyResult; msg?: string }> => {
      try {
        const autoUpdaterService = await loadAutoUpdaterService();
        const result = await autoUpdaterService.restoreDownloadedUpdateIfAvailable();
        return { success: result.success, data: result.data, msg: result.error };
      } catch (err: unknown) {
        return {
          success: false,
          data: { ready: false },
          msg: err instanceof Error ? err.message : String(err),
        };
      }
    }
  );

  ipcBridge.autoUpdate.cancelDownload.provider(async (): Promise<{ success: boolean; msg?: string }> => {
    try {
      const autoUpdaterService = await loadAutoUpdaterService();
      const result = await autoUpdaterService.cancelDownload();
      return { success: result.success, msg: result.error };
    } catch (err: unknown) {
      return { success: false, msg: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcBridge.autoUpdate.quitAndInstall.provider(async (): Promise<{ success: boolean; msg?: string }> => {
    const autoUpdaterService = await loadAutoUpdaterService();
    await autoUpdaterService.quitAndInstall();
    return { success: true };
  });
}
