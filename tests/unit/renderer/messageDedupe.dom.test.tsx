/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { type PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMessageText } from '@/common/chat/chatLib';
import {
  MessageListProvider,
  useAddOrUpdateMessage,
  useMessageList,
  useReplaceWithAnchorWindow,
} from '@/renderer/pages/conversation/Messages/hooks';

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      userCreated: {
        on: vi.fn().mockReturnValue(() => {}),
      },
    },
    database: {
      getConversationMessages: {
        invoke: vi.fn(),
      },
    },
  },
}));

const CONVERSATION_ID = 'conv-1';

const textMessage = (id: string, msg_id: string, content: string, created_at: number): IMessageText => ({
  id,
  msg_id,
  conversation_id: CONVERSATION_ID,
  type: 'text',
  position: 'left',
  created_at,
  content: {
    content,
  },
});

const userMessage = (id: string, msg_id: string, content: string, created_at: number): IMessageText => ({
  ...textMessage(id, msg_id, content, created_at),
  position: 'right',
});

function TestWrapper({ children }: PropsWithChildren): JSX.Element {
  return <MessageListProvider value={[]}>{children}</MessageListProvider>;
}

function useMessageHarness() {
  return {
    addOrUpdateMessage: useAddOrUpdateMessage(),
    replaceWithAnchorWindow: useReplaceWithAnchorWindow(),
    messages: useMessageList(),
  };
}

async function flushMessageQueue(): Promise<void> {
  await act(async () => {
    vi.runAllTimers();
  });
}

describe('message dedupe', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('does not show the same assistant answer from live stream and persisted history twice', async () => {
    const { result } = renderHook(() => useMessageHarness(), {
      wrapper: TestWrapper,
    });

    act(() => {
      result.current.addOrUpdateMessage(textMessage('live-answer', 'live-msg', 'same final answer', 100));
    });
    await flushMessageQueue();

    act(() => {
      result.current.replaceWithAnchorWindow(CONVERSATION_ID, [
        userMessage('persisted-user', 'user-msg', 'question', 50),
        textMessage('persisted-answer', 'persisted-msg', 'same final answer', 200),
      ]);
    });

    expect(result.current.messages.map((message) => message.id)).toEqual(['persisted-user', 'persisted-answer']);
  });
});
