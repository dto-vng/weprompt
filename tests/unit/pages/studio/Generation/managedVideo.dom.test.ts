/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createManagedVideo,
  ManagedVideoError,
  type ManagedVideoHandle,
} from '@renderer/pages/studio/components/Preview/managedVideo';
import { managedVideo, useManagedVideo } from '@renderer/pages/studio/hooks/useManagedVideo';

const metadata = {
  durationSeconds: 5.085011,
  width: 1280,
  height: 720,
};

const prepareVideo = (): {
  video: HTMLVideoElement;
  nextFrame: (mediaTime: number) => void;
} => {
  const video = document.createElement('video');
  let frameCallback: VideoFrameRequestCallback | null = null;
  Object.defineProperties(video, {
    duration: { configurable: true, value: metadata.durationSeconds },
    videoWidth: { configurable: true, value: metadata.width },
    videoHeight: { configurable: true, value: metadata.height },
    load: { configurable: true, value: vi.fn() },
    requestVideoFrameCallback: {
      configurable: true,
      value: vi.fn((callback: VideoFrameRequestCallback) => {
        frameCallback = callback;
        return 7;
      }),
    },
    cancelVideoFrameCallback: { configurable: true, value: vi.fn() },
  });
  return {
    video,
    nextFrame(mediaTime) {
      if (frameCallback === null) throw new Error('No frame callback is pending');
      const callback = frameCallback;
      frameCallback = null;
      callback(0, { mediaTime } as VideoFrameCallbackMetadata);
    },
  };
};

const openPreparedVideo = async (): Promise<{
  handle: ManagedVideoHandle;
  video: HTMLVideoElement;
  nextFrame: (mediaTime: number) => void;
  drawImage: ReturnType<typeof vi.fn>;
}> => {
  const { video, nextFrame } = prepareVideo();
  const drawImage = vi.fn();
  const canvas = document.createElement('canvas');
  canvas.getContext = vi.fn(() => ({ drawImage }) as unknown as CanvasRenderingContext2D);
  canvas.toDataURL = vi.fn(() => 'data:image/png;base64,iVBORw0KGgo=');
  const service = createManagedVideo({
    lookupAsset: async () => 'available',
    createVideoElement: () => video,
    createCanvasElement: () => canvas,
  });

  const opening = service.open('project-1', 'video-1');
  await Promise.resolve();
  video.dispatchEvent(new Event('loadedmetadata'));
  return { handle: await opening, video, nextFrame, drawImage };
};

describe('managed video', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes fractional decoded metadata and the actual presented seek time', async () => {
    const { handle, nextFrame } = await openPreparedVideo();

    expect(handle.metadata).toEqual(metadata);
    const seeking = handle.seekTo(4.99);
    nextFrame(4.958333);

    await expect(seeking).resolves.toBe(4.958333);
  });

  it('captures the presented frame as PNG bytes with intrinsic dimensions', async () => {
    const { handle, video, drawImage } = await openPreparedVideo();

    expect(handle.captureFrame()).toEqual({
      dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      width: 1280,
      height: 720,
    });
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 1280, 720);
  });

  it('releases its media element when closed', async () => {
    const { handle, video } = await openPreparedVideo();
    const load = vi.mocked(video.load);
    expect(video.isConnected).toBe(true);

    handle.close();

    expect(video.isConnected).toBe(false);
    expect(video.getAttribute('src')).toBeNull();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('reports a missing managed asset as not_found before decoding', async () => {
    const service = createManagedVideo({
      lookupAsset: async () => 'not_found',
      createVideoElement: () => prepareVideo().video,
      createCanvasElement: () => document.createElement('canvas'),
    });

    await expect(service.open('project-1', 'missing-video')).rejects.toEqual(new ManagedVideoError('not_found'));
  });

  it('reports an existing unsupported codec separately from a missing asset', async () => {
    const { video } = prepareVideo();
    Object.defineProperty(video, 'error', { configurable: true, value: { code: 4 } });
    const service = createManagedVideo({
      lookupAsset: async () => 'available',
      createVideoElement: () => video,
      createCanvasElement: () => document.createElement('canvas'),
    });

    const opening = service.open('project-1', 'video-1');
    await Promise.resolve();
    video.dispatchEvent(new Event('error'));

    await expect(opening).rejects.toEqual(new ManagedVideoError('decode_unsupported'));
  });

  it('reports other media-load failures without relabeling them as codec failures', async () => {
    const { video } = prepareVideo();
    Object.defineProperty(video, 'error', { configurable: true, value: { code: 3 } });
    const service = createManagedVideo({
      lookupAsset: async () => 'available',
      createVideoElement: () => video,
      createCanvasElement: () => document.createElement('canvas'),
    });

    const opening = service.open('project-1', 'video-1');
    await Promise.resolve();
    video.dispatchEvent(new Event('error'));

    await expect(opening).rejects.toEqual(new ManagedVideoError('load_failed'));
  });
});

describe('useManagedVideo', () => {
  it('owns the handle lifecycle for a React caller', async () => {
    const close = vi.fn();
    const handle = {
      metadata,
      seekTo: vi.fn(async (seconds: number) => seconds),
      captureFrame: vi.fn(() => ({ dataUrl: 'data:image/png;base64,iVBORw0KGgo=', width: 1280, height: 720 })),
      close,
    } satisfies ManagedVideoHandle;
    vi.spyOn(managedVideo, 'open').mockResolvedValue(handle);

    const view = renderHook(() => useManagedVideo('project-1', 'video-1'));
    await waitFor(() => expect(view.result.current.status).toBe('ready'));

    act(() => view.unmount());
    expect(close).toHaveBeenCalledOnce();
  });
});
