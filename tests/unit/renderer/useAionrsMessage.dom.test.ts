/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import { useAionrsMessage } from '@/renderer/pages/conversation/platforms/aionrs/useAionrsMessage';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';

const { mergeLiveMessageMock, responseStreamOnMock, responseStreamHandlerRef, updateConversationInvokeMock } =
  vi.hoisted(() => ({
    mergeLiveMessageMock: vi.fn(),
    responseStreamOnMock: vi.fn(),
    responseStreamHandlerRef: {
      current: undefined as ((message: IResponseMessage) => void) | undefined,
    },
    updateConversationInvokeMock: vi.fn(),
  }));

vi.mock('@/renderer/pages/conversation/Messages/hooks', () => ({
  useMergeLiveMessage: () => mergeLiveMessageMock,
}));

vi.mock('@/renderer/pages/conversation/runtime/useConversationRuntimeView', () => ({
  logStreamTerminalObserved: vi.fn(),
}));

vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  getConversationOrNull: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      responseStream: {
        on: responseStreamOnMock.mockImplementation((handler: (message: IResponseMessage) => void) => {
          responseStreamHandlerRef.current = handler;
          return vi.fn();
        }),
      },
      update: {
        invoke: updateConversationInvokeMock,
      },
    },
  },
}));

describe('useAionrsMessage runtime state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getConversationOrNull).mockResolvedValue(null);
    updateConversationInvokeMock.mockResolvedValue(undefined);
    responseStreamHandlerRef.current = undefined;
  });

  it('clears active tool state when the stream finishes', async () => {
    const { result } = renderHook(() => useAionrsMessage('conv-1'));

    await waitFor(() => {
      expect(result.current.hasHydratedRunningState).toBe(true);
    });

    act(() => {
      responseStreamHandlerRef.current?.({
        type: 'tool_group',
        data: [{ status: 'Executing', name: 'Read' }],
        msg_id: 'msg-1',
        turn_id: 'turn-1',
        conversation_id: 'conv-1',
      });
    });

    expect(result.current.running).toBe(true);

    act(() => {
      responseStreamHandlerRef.current?.({
        type: 'finish',
        data: null,
        msg_id: 'msg-1',
        turn_id: 'turn-1',
        conversation_id: 'conv-1',
      });
    });

    expect(result.current.running).toBe(false);
  });
});
