/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type {
  StudioCommandErrorCode,
  StudioRenderErrorCode,
  StudioRenderProgressEvent,
} from '@/common/types/project/creativeStudioTypes';
import { useCallback, useEffect, useRef, useState } from 'react';

export type StudioRenderViewState = {
  status: 'idle' | StudioRenderProgressEvent['status'];
  progress: number;
  assetId: string | null;
  missingSceneIds: string[] | null;
  errorMessageKey: string | null;
};

export type UseStudioRenderResult = StudioRenderViewState & {
  render(): Promise<void>;
  cancel(): Promise<void>;
};

const RENDER_ERROR_MESSAGE_KEYS: Record<StudioRenderErrorCode, string> = {
  busy: 'conversation.creativeStudio.phase.review.render.errors.busy',
  ffmpeg_unavailable: 'conversation.creativeStudio.phase.review.render.errors.ffmpegUnavailable',
  render_failed: 'conversation.creativeStudio.phase.review.render.errors.failed',
  no_renderable_scenes: 'conversation.creativeStudio.phase.review.render.errors.noRenderableScenes',
  cancelled: 'conversation.creativeStudio.phase.review.render.errors.cancelled',
};

const idleState = (): StudioRenderViewState => ({
  status: 'idle',
  progress: 0,
  assetId: null,
  missingSceneIds: null,
  errorMessageKey: null,
});

const isRenderErrorCode = (code: StudioCommandErrorCode): code is StudioRenderErrorCode =>
  Object.hasOwn(RENDER_ERROR_MESSAGE_KEYS, code);

const stateFromEvent = (event: StudioRenderProgressEvent): StudioRenderViewState => {
  switch (event.status) {
    case 'running':
      return {
        status: 'running',
        progress: event.progress,
        assetId: null,
        missingSceneIds: null,
        errorMessageKey: null,
      };
    case 'succeeded':
      return {
        status: 'succeeded',
        progress: 1,
        assetId: event.assetId,
        missingSceneIds: [...event.missingSceneIds],
        errorMessageKey: null,
      };
    case 'failed':
      return {
        status: 'failed',
        progress: event.progress,
        assetId: null,
        missingSceneIds: event.missingSceneIds === undefined ? null : [...event.missingSceneIds],
        errorMessageKey: RENDER_ERROR_MESSAGE_KEYS[event.errorCode],
      };
    case 'cancelled':
      return {
        status: 'cancelled',
        progress: event.progress,
        assetId: null,
        missingSceneIds: [...event.missingSceneIds],
        errorMessageKey: RENDER_ERROR_MESSAGE_KEYS.cancelled,
      };
  }
};

/** Keeps one project's local render action synchronized with the terminal event stream. */
export const useStudioRender = (projectId: string): UseStudioRenderResult => {
  const [state, setState] = useState<StudioRenderViewState>(idleState);
  const projectIdRef = useRef(projectId);
  const requestGenerationRef = useRef(0);
  const renderInFlightRef = useRef(false);
  projectIdRef.current = projectId;

  useEffect(() => {
    const generation = requestGenerationRef.current + 1;
    requestGenerationRef.current = generation;
    renderInFlightRef.current = false;
    setState(idleState());
    const unsubscribe = ipcBridge.creativeStudio.renderProgress.on((event) => {
      if (event.projectId !== projectId || requestGenerationRef.current !== generation) return;
      setState(stateFromEvent(event));
    });
    return () => {
      if (requestGenerationRef.current === generation) requestGenerationRef.current += 1;
      unsubscribe();
    };
  }, [projectId]);

  const render = useCallback(async (): Promise<void> => {
    if (renderInFlightRef.current) return;
    renderInFlightRef.current = true;
    const requestedProjectId = projectId;
    const generation = requestGenerationRef.current;
    setState({
      status: 'running',
      progress: 0,
      assetId: null,
      missingSceneIds: null,
      errorMessageKey: null,
    });
    try {
      const result = await ipcBridge.creativeStudio.renderCut.invoke({ projectId: requestedProjectId });
      if (projectIdRef.current !== requestedProjectId || requestGenerationRef.current !== generation) return;
      if (result.ok === true) {
        setState({
          status: 'succeeded',
          progress: 1,
          assetId: result.data.assetId,
          missingSceneIds: [...result.data.missingSceneIds],
          errorMessageKey: null,
        });
        return;
      }
      const errorMessageKey = isRenderErrorCode(result.error.code)
        ? RENDER_ERROR_MESSAGE_KEYS[result.error.code]
        : RENDER_ERROR_MESSAGE_KEYS.render_failed;
      setState((current) => ({
        ...current,
        status: result.error.code === 'cancelled' ? 'cancelled' : 'failed',
        assetId: null,
        errorMessageKey,
      }));
    } catch {
      if (projectIdRef.current !== requestedProjectId || requestGenerationRef.current !== generation) return;
      setState((current) => ({
        ...current,
        status: 'failed',
        assetId: null,
        errorMessageKey: RENDER_ERROR_MESSAGE_KEYS.render_failed,
      }));
    } finally {
      if (projectIdRef.current === requestedProjectId && requestGenerationRef.current === generation) {
        renderInFlightRef.current = false;
      }
    }
  }, [projectId]);

  const cancel = useCallback(async (): Promise<void> => {
    if (!renderInFlightRef.current) return;
    try {
      const result = await ipcBridge.creativeStudio.cancelRender.invoke({ projectId });
      if (result.ok === false && projectIdRef.current === projectId) {
        setState((current) => ({
          ...current,
          status: 'failed',
          errorMessageKey: RENDER_ERROR_MESSAGE_KEYS.render_failed,
        }));
      }
    } catch {
      if (projectIdRef.current === projectId) {
        setState((current) => ({
          ...current,
          status: 'failed',
          errorMessageKey: RENDER_ERROR_MESSAGE_KEYS.render_failed,
        }));
      }
    }
  }, [projectId]);

  return { ...state, render, cancel };
};
