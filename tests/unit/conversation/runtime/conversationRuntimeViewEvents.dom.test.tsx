/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IConversationListChangedEvent, IConversationTurnCompletedEvent } from '@/common/adapter/ipcBridge';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ensureConversationRuntimeViewEvents,
  resetConversationRuntimeViewEventsForTest,
} from '@/renderer/pages/conversation/runtime/conversationRuntimeViewEvents';
import { resetConversationRuntimeViewStoreForTest } from '@/renderer/pages/conversation/runtime/conversationRuntimeViewStore';
import { useConversationRuntimeView } from '@/renderer/pages/conversation/runtime/useConversationRuntimeView';

const mocks = vi.hoisted(() => ({
  emittersAvailable: {
    listChanged: true,
    turnCompleted: true,
  },
  getConversationOrNullMock: vi.fn(),
  listChangedHandlerRef: {
    current: undefined as ((event: IConversationListChangedEvent) => void) | undefined,
  },
  listChangedOnMock: vi.fn(),
  turnCompletedHandlerRef: {
    current: undefined as ((event: IConversationTurnCompletedEvent) => void) | undefined,
  },
  turnCompletedOnMock: vi.fn(),
  writeRendererLogMock: vi.fn().mockResolvedValue(undefined),
}));

const {
  emittersAvailable,
  getConversationOrNullMock,
  listChangedHandlerRef,
  listChangedOnMock,
  turnCompletedHandlerRef,
  turnCompletedOnMock,
} = mocks;

vi.mock('@/common', () => ({
  ipcBridge: {
    application: {
      writeRendererLog: {
        invoke: mocks.writeRendererLogMock,
      },
    },
    conversation: {
      get listChanged() {
        return mocks.emittersAvailable.listChanged ? { on: mocks.listChangedOnMock } : undefined;
      },
      get turnCompleted() {
        return mocks.emittersAvailable.turnCompleted ? { on: mocks.turnCompletedOnMock } : undefined;
      },
    },
  },
}));

vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  getConversationOrNull: mocks.getConversationOrNullMock,
}));

const runningRuntime: IConversationTurnCompletedEvent['runtime'] = {
  state: 'running',
  can_send_message: false,
  has_task: true,
  task_status: 'running',
  is_processing: true,
  pending_confirmations: 0,
  turn_id: 'turn-1',
};

const completedTurn = (): IConversationTurnCompletedEvent => ({
  session_id: 'conv-1',
  turn_id: 'turn-1',
  status: 'finished',
  state: 'ai_waiting_input',
  detail: '',
  can_send_message: true,
  runtime: {
    state: 'idle',
    can_send_message: true,
    has_task: false,
    task_status: 'finished',
    is_processing: false,
    pending_confirmations: 0,
    turn_id: null,
  },
  workspace: '/workspace',
  model: { platform: 'openai', name: 'OpenAI', use_model: 'model-1' },
});

describe('conversation runtime view event ownership', () => {
  beforeEach(() => {
    resetConversationRuntimeViewEventsForTest();
    resetConversationRuntimeViewStoreForTest();
    vi.clearAllMocks();
    emittersAvailable.listChanged = true;
    emittersAvailable.turnCompleted = true;
    listChangedHandlerRef.current = undefined;
    turnCompletedHandlerRef.current = undefined;
    getConversationOrNullMock.mockImplementation(() => new Promise(() => {}));
    listChangedOnMock.mockImplementation((handler: (event: IConversationListChangedEvent) => void) => {
      listChangedHandlerRef.current = handler;
      return vi.fn();
    });
    turnCompletedOnMock.mockImplementation((handler: (event: IConversationTurnCompletedEvent) => void) => {
      turnCompletedHandlerRef.current = handler;
      return vi.fn();
    });
  });

  afterEach(() => {
    resetConversationRuntimeViewEventsForTest();
    resetConversationRuntimeViewStoreForTest();
    vi.clearAllMocks();
  });

  it('installs one transport listener for three hook consumers', () => {
    renderHook(() => useConversationRuntimeView('conv-1'));
    renderHook(() => useConversationRuntimeView('conv-1'));
    renderHook(() => useConversationRuntimeView('conv-1'));

    expect(turnCompletedOnMock).toHaveBeenCalledTimes(1);
    expect(listChangedOnMock).toHaveBeenCalledTimes(1);
  });

  it('keeps transport updates alive after one hook consumer unmounts', async () => {
    getConversationOrNullMock.mockResolvedValue({ runtime: runningRuntime });
    const first = renderHook(() => useConversationRuntimeView('conv-1'));
    const remaining = renderHook(() => useConversationRuntimeView('conv-1'));

    await waitFor(() => expect(remaining.result.current.state).toBe('running'));
    first.unmount();

    act(() => {
      turnCompletedHandlerRef.current?.(completedTurn());
    });

    expect(remaining.result.current.state).toBe('idle');
    expect(remaining.result.current.canSendMessage).toBe(true);
  });

  it('retries a missing optional emitter without duplicating an installed listener', () => {
    emittersAvailable.listChanged = false;

    ensureConversationRuntimeViewEvents();
    expect(turnCompletedOnMock).toHaveBeenCalledTimes(1);
    expect(listChangedOnMock).not.toHaveBeenCalled();

    emittersAvailable.listChanged = true;
    ensureConversationRuntimeViewEvents();
    ensureConversationRuntimeViewEvents();

    expect(turnCompletedOnMock).toHaveBeenCalledTimes(1);
    expect(listChangedOnMock).toHaveBeenCalledTimes(1);
  });
});
