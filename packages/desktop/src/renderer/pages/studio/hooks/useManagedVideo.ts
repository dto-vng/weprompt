/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  createManagedVideo,
  ManagedVideoError,
  type ManagedVideoFailureCode,
  type ManagedVideoHandle,
} from '../components/Preview/managedVideo';

export const managedVideo = createManagedVideo();

export type ManagedVideoHookState = {
  status: 'idle' | 'loading' | 'ready' | 'failed';
  handle: ManagedVideoHandle | null;
  failure: ManagedVideoFailureCode | null;
  close: () => void;
};

/** React lifecycle ownership over the plain managed-video service. */
export const useManagedVideo = (projectId: string, assetId: string | null): ManagedVideoHookState => {
  const handleRef = useRef<ManagedVideoHandle | null>(null);
  const [state, setState] = useState<Omit<ManagedVideoHookState, 'close'>>({
    status: assetId === null ? 'idle' : 'loading',
    handle: null,
    failure: null,
  });

  const close = useCallback((): void => {
    handleRef.current?.close();
    handleRef.current = null;
    setState({ status: 'idle', handle: null, failure: null });
  }, []);

  useEffect(() => {
    let cancelled = false;
    let opened: ManagedVideoHandle | null = null;
    handleRef.current?.close();
    handleRef.current = null;
    if (assetId === null) {
      setState({ status: 'idle', handle: null, failure: null });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading', handle: null, failure: null });
    void managedVideo.open(projectId, assetId, controller.signal).then(
      (handle) => {
        opened = handle;
        if (cancelled) {
          handle.close();
          return;
        }
        handleRef.current = handle;
        setState({ status: 'ready', handle, failure: null });
      },
      (error: unknown) => {
        if (cancelled) return;
        setState({
          status: 'failed',
          handle: null,
          failure: error instanceof ManagedVideoError ? error.code : 'load_failed',
        });
      }
    );
    return () => {
      cancelled = true;
      controller.abort();
      opened?.close();
      if (handleRef.current === opened) handleRef.current = null;
    };
  }, [assetId, projectId]);

  return { ...state, close };
};
