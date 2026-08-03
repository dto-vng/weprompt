/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import {
  conversationDeleted,
  streamTerminalObserved,
  turnCompleted,
  type ConversationRuntimeViewLogEntry,
} from './conversationRuntimeViewStore';

let disposeTurnCompleted: (() => void) | null = null;
let disposeListChanged: (() => void) | null = null;

const logConversationRuntimeView = (entry: ConversationRuntimeViewLogEntry): void => {
  const rendererLogger = ipcBridge.application?.writeRendererLog;
  if (!rendererLogger) {
    return;
  }

  void rendererLogger
    .invoke({
      level: entry.level,
      tag: 'conversationRuntimeView',
      message: entry.event,
      data: entry.data,
    })
    .catch(() => {});
};

export const flushConversationRuntimeViewLogs = (logs: ConversationRuntimeViewLogEntry[]): void => {
  logs.forEach(logConversationRuntimeView);
};

export const ensureConversationRuntimeViewEvents = (): void => {
  if (!disposeTurnCompleted && ipcBridge.conversation.turnCompleted) {
    disposeTurnCompleted = ipcBridge.conversation.turnCompleted.on((event) => {
      flushConversationRuntimeViewLogs(turnCompleted(event.session_id, event.turn_id, event.runtime));
    });
  }

  if (!disposeListChanged && ipcBridge.conversation.listChanged) {
    disposeListChanged = ipcBridge.conversation.listChanged.on((event) => {
      if (event.action === 'deleted') {
        flushConversationRuntimeViewLogs(conversationDeleted(event.conversation_id));
      }
    });
  }
};

export const logStreamTerminalObserved = (
  conversation_id: string,
  turn_id: string | undefined,
  platform: 'acp' | 'aionrs',
  stream_type: string
): void => {
  if (turn_id) {
    flushConversationRuntimeViewLogs(streamTerminalObserved(conversation_id, turn_id));
  }

  const rendererLogger = ipcBridge.application?.writeRendererLog;
  if (!rendererLogger) {
    return;
  }

  void rendererLogger
    .invoke({
      level: 'info',
      tag: 'conversationRuntimeView',
      message: 'stream_terminal_observed',
      data: {
        conversation_id,
        turn_id,
        platform,
        stream_type,
      },
    })
    .catch(() => {});
};

export const resetConversationRuntimeViewEventsForTest = (): void => {
  disposeTurnCompleted?.();
  disposeListChanged?.();
  disposeTurnCompleted = null;
  disposeListChanged = null;
};
