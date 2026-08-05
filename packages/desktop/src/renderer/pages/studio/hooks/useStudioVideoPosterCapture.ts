/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { useEffect, useRef, useState } from 'react';

import { useManagedVideo } from './useManagedVideo';

export type StudioVideoPosterCaptureState = 'idle' | 'capturing' | 'captured' | 'ready_without_poster';

export type StudioVideoPosterCaptureInput = {
  projectId: string;
  sceneId: string;
  videoAssetId: string | null;
  enabled: boolean;
};

/** Captures one foreground video frame and submits renderer bytes through their dedicated trust boundary. */
export const useStudioVideoPosterCapture = ({
  projectId,
  sceneId,
  videoAssetId,
  enabled,
}: StudioVideoPosterCaptureInput): StudioVideoPosterCaptureState => {
  const targetAssetId = enabled ? videoAssetId : null;
  const { status: videoStatus, handle: videoHandle } = useManagedVideo(projectId, targetAssetId);
  const targetKey = targetAssetId === null ? null : `${projectId}:${sceneId}:${targetAssetId}`;
  const attemptedKeyRef = useRef<string | null>(null);
  const [state, setState] = useState<StudioVideoPosterCaptureState>(targetKey === null ? 'idle' : 'capturing');

  useEffect(() => {
    attemptedKeyRef.current = null;
    setState(targetKey === null ? 'idle' : 'capturing');
  }, [targetKey]);

  useEffect(() => {
    if (targetKey === null || targetAssetId === null) return;
    if (videoStatus === 'loading') {
      setState('capturing');
      return;
    }
    if (videoStatus === 'failed') {
      setState('ready_without_poster');
      return;
    }
    if (videoStatus !== 'ready' || videoHandle === null || attemptedKeyRef.current === targetKey) return;
    attemptedKeyRef.current = targetKey;
    let cancelled = false;
    void (async () => {
      try {
        await videoHandle.seekTo(Math.min(1, videoHandle.metadata.durationSeconds / 2));
        const frame = videoHandle.captureFrame();
        const result = await ipcBridge.creativeStudio.persistCapturedPoster.invoke({
          projectId,
          sceneId,
          videoAssetId: targetAssetId,
          dataUrl: frame.dataUrl,
          width: frame.width,
          height: frame.height,
        });
        if (!cancelled) setState(result.ok ? 'captured' : 'ready_without_poster');
      } catch {
        if (!cancelled) setState('ready_without_poster');
      } finally {
        videoHandle.close();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, sceneId, targetAssetId, targetKey, videoHandle, videoStatus]);

  return state;
};
