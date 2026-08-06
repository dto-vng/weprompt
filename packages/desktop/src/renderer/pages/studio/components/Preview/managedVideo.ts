/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';

import { createManagedStudioAssetUrl } from './managedStudioAssets';
import styles from './managed-video.module.css';

export type ManagedVideoFailureCode = 'not_found' | 'decode_unsupported' | 'load_failed';

export class ManagedVideoError extends Error {
  readonly code: ManagedVideoFailureCode;

  constructor(code: ManagedVideoFailureCode) {
    super(code);
    this.name = 'ManagedVideoError';
    this.code = code;
  }
}

export type ManagedVideoMetadata = {
  durationSeconds: number;
  width: number;
  height: number;
};

export type ManagedVideoFrame = {
  dataUrl: string;
  width: number;
  height: number;
};

export type ManagedVideoHandle = {
  readonly metadata: ManagedVideoMetadata;
  seekTo(seconds: number): Promise<number>;
  captureFrame(): ManagedVideoFrame;
  close(): void;
};

export type ManagedVideoService = {
  open(projectId: string, assetId: string, signal?: AbortSignal): Promise<ManagedVideoHandle>;
};

export type ManagedVideoAssetAvailability = 'available' | 'not_found' | 'decode_unsupported';

export type ManagedVideoDependencies = {
  lookupAsset(projectId: string, assetId: string): Promise<ManagedVideoAssetAvailability>;
  createVideoElement(): HTMLVideoElement;
  createCanvasElement(): HTMLCanvasElement;
};

const lookupManagedVideoAsset = async (projectId: string, assetId: string): Promise<ManagedVideoAssetAvailability> => {
  const result = await ipcBridge.creativeStudio.getProject.invoke({ projectId });
  if (result.ok === false) {
    if (result.error.code === 'not_found') return 'not_found';
    throw new ManagedVideoError('load_failed');
  }
  if (result.data === null) return 'not_found';
  const asset = result.data.assets[assetId];
  if (asset === undefined) return 'not_found';
  if (asset.mediaKind !== 'video' || asset.managedAsset.collection !== 'assets') return 'decode_unsupported';
  if (asset.projectId !== projectId || asset.sceneId === null) return 'not_found';
  const scene = result.data.scenes[asset.sceneId];
  return scene?.assetIds.includes(assetId) === true ? 'available' : 'not_found';
};

const defaultDependencies: ManagedVideoDependencies = {
  lookupAsset: lookupManagedVideoAsset,
  createVideoElement: () => document.createElement('video'),
  createCanvasElement: () => document.createElement('canvas'),
};

const mediaElementFailure = (video: HTMLVideoElement): ManagedVideoError =>
  new ManagedVideoError(video.error?.code === 4 ? 'decode_unsupported' : 'load_failed');

const validMetadata = (video: HTMLVideoElement): ManagedVideoMetadata | null => {
  if (
    !Number.isFinite(video.duration) ||
    video.duration <= 0 ||
    !Number.isSafeInteger(video.videoWidth) ||
    video.videoWidth < 1 ||
    !Number.isSafeInteger(video.videoHeight) ||
    video.videoHeight < 1
  ) {
    return null;
  }
  return {
    durationSeconds: video.duration,
    width: video.videoWidth,
    height: video.videoHeight,
  };
};

const releaseVideoElement = (video: HTMLVideoElement): void => {
  video.removeAttribute('src');
  try {
    video.load();
  } catch {
    // Releasing a failed decoder must remain best-effort and non-throwing.
  }
  video.remove();
};

/** Creates a foreground-only managed-video owner for metadata, seeking, and frame capture. */
export const createManagedVideo = (deps: ManagedVideoDependencies = defaultDependencies): ManagedVideoService => ({
  async open(projectId, assetId, signal) {
    const source = createManagedStudioAssetUrl(projectId, assetId);
    if (source === null) throw new ManagedVideoError('not_found');
    let availability: ManagedVideoAssetAvailability;
    try {
      availability = await deps.lookupAsset(projectId, assetId);
    } catch (error) {
      if (error instanceof ManagedVideoError) throw error;
      throw new ManagedVideoError('load_failed');
    }
    if (availability !== 'available') throw new ManagedVideoError(availability);
    if (signal?.aborted === true) throw new ManagedVideoError('load_failed');

    const video = deps.createVideoElement();
    video.className = styles.mediaElement;
    video.setAttribute('aria-hidden', 'true');
    video.tabIndex = -1;
    document.body.append(video);
    const metadata = await new Promise<ManagedVideoMetadata>((resolve, reject) => {
      const cleanup = (): void => {
        video.removeEventListener('loadedmetadata', onMetadata);
        video.removeEventListener('error', onError);
        signal?.removeEventListener('abort', onAbort);
      };
      const onMetadata = (): void => {
        cleanup();
        const decoded = validMetadata(video);
        if (decoded === null) {
          releaseVideoElement(video);
          reject(new ManagedVideoError('load_failed'));
          return;
        }
        resolve(decoded);
      };
      const onError = (): void => {
        cleanup();
        const failure = mediaElementFailure(video);
        releaseVideoElement(video);
        reject(failure);
      };
      const onAbort = (): void => {
        cleanup();
        releaseVideoElement(video);
        reject(new ManagedVideoError('load_failed'));
      };
      video.addEventListener('loadedmetadata', onMetadata, { once: true });
      video.addEventListener('error', onError, { once: true });
      signal?.addEventListener('abort', onAbort, { once: true });
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.src = source;
      try {
        video.load();
      } catch {
        cleanup();
        releaseVideoElement(video);
        reject(new ManagedVideoError('load_failed'));
      }
    });

    let closed = false;
    let pendingFrame:
      | {
          id: number;
          cancel: () => void;
        }
      | undefined;

    const cancelPendingFrame = (): void => {
      if (pendingFrame === undefined) return;
      const frame = pendingFrame;
      pendingFrame = undefined;
      frame.cancel();
    };

    return {
      metadata,
      seekTo(seconds) {
        if (closed || !Number.isFinite(seconds) || typeof video.requestVideoFrameCallback !== 'function') {
          return Promise.reject(new ManagedVideoError('load_failed'));
        }
        cancelPendingFrame();
        return new Promise<number>((resolve, reject) => {
          const onError = (): void => finish(() => reject(mediaElementFailure(video)));
          const finish = (settle: () => void): void => {
            video.removeEventListener('error', onError);
            pendingFrame = undefined;
            settle();
          };
          video.addEventListener('error', onError, { once: true });
          const id = video.requestVideoFrameCallback((_now, presented) => {
            if (!Number.isFinite(presented.mediaTime) || presented.mediaTime < 0) {
              finish(() => reject(new ManagedVideoError('load_failed')));
              return;
            }
            finish(() => resolve(presented.mediaTime));
          });
          pendingFrame = {
            id,
            cancel: () => {
              video.cancelVideoFrameCallback(id);
              finish(() => reject(new ManagedVideoError('load_failed')));
            },
          };
          try {
            video.currentTime = Math.max(0, Math.min(seconds, metadata.durationSeconds));
          } catch {
            video.cancelVideoFrameCallback(id);
            finish(() => reject(new ManagedVideoError('load_failed')));
          }
        });
      },
      captureFrame() {
        if (closed) throw new ManagedVideoError('load_failed');
        const canvas = deps.createCanvasElement();
        canvas.width = metadata.width;
        canvas.height = metadata.height;
        const context = canvas.getContext('2d');
        if (context === null) throw new ManagedVideoError('load_failed');
        try {
          context.drawImage(video, 0, 0, metadata.width, metadata.height);
          const dataUrl = canvas.toDataURL('image/png');
          if (!dataUrl.startsWith('data:image/png;base64,')) throw new ManagedVideoError('load_failed');
          return { dataUrl, width: metadata.width, height: metadata.height };
        } catch (error) {
          if (error instanceof ManagedVideoError) throw error;
          throw new ManagedVideoError('load_failed');
        }
      },
      close() {
        if (closed) return;
        closed = true;
        cancelPendingFrame();
        releaseVideoElement(video);
      },
    };
  },
});
