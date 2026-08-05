/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ipcBridge } from '@/common';
import { ManagedVideoError, type ManagedVideoHandle } from '@renderer/pages/studio/components/Preview/managedVideo';
import { managedVideo } from '@renderer/pages/studio/hooks/useManagedVideo';
import { useStudioVideoPosterCapture } from '@renderer/pages/studio/hooks/useStudioVideoPosterCapture';

const handle = (): ManagedVideoHandle => ({
  metadata: { durationSeconds: 5.085011, width: 1280, height: 720 },
  seekTo: vi.fn(async () => 1),
  captureFrame: vi.fn(() => ({
    dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    width: 1280,
    height: 720,
  })),
  close: vi.fn(),
});

describe('useStudioVideoPosterCapture', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('captures a presented video frame and submits its exact take lineage', async () => {
    const video = handle();
    vi.spyOn(managedVideo, 'open').mockResolvedValue(video);
    const persist = vi.spyOn(ipcBridge.creativeStudio.persistCapturedPoster, 'invoke').mockResolvedValue({
      ok: true,
      data: {
        id: 'poster-1',
        projectId: 'project-1',
        sceneId: 'scene-1',
        mediaKind: 'image',
        mimeType: 'image/png',
        managedAsset: { collection: 'thumbnails', fileName: 'poster-1.png' },
        byteSize: 64,
        sha256: '1'.repeat(64),
        width: 1280,
        height: 720,
        createdAt: '2026-08-05T00:00:00.000Z',
      },
    });

    const view = renderHook(() =>
      useStudioVideoPosterCapture({
        projectId: 'project-1',
        sceneId: 'scene-1',
        videoAssetId: 'video-1',
        enabled: true,
      })
    );

    await waitFor(() => expect(view.result.current).toBe('captured'));
    expect(video.seekTo).toHaveBeenCalledExactlyOnceWith(1);
    expect(persist).toHaveBeenCalledExactlyOnceWith({
      projectId: 'project-1',
      sceneId: 'scene-1',
      videoAssetId: 'video-1',
      dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      width: 1280,
      height: 720,
    });
    expect(video.close).toHaveBeenCalledOnce();
  });

  it('settles on a usable ready state when the renderer cannot decode the video', async () => {
    vi.spyOn(managedVideo, 'open').mockRejectedValue(new ManagedVideoError('decode_unsupported'));

    const view = renderHook(() =>
      useStudioVideoPosterCapture({
        projectId: 'project-1',
        sceneId: 'scene-1',
        videoAssetId: 'video-1',
        enabled: true,
      })
    );

    await waitFor(() => expect(view.result.current).toBe('ready_without_poster'));
  });
});
