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
import { getLocalTokenUsageSummary } from '@/renderer/pages/conversation/utils/localTokenUsage';

const {
  mergeLiveMessageMock,
  processLocalCronResponseMock,
  responseStreamOnMock,
  responseStreamHandlerRef,
  updateConversationInvokeMock,
} = vi.hoisted(() => ({
  mergeLiveMessageMock: vi.fn(),
  processLocalCronResponseMock: vi.fn(),
  responseStreamOnMock: vi.fn(),
  responseStreamHandlerRef: {
    current: undefined as ((message: IResponseMessage) => void) | undefined,
  },
  updateConversationInvokeMock: vi.fn(),
}));

vi.mock('@/renderer/pages/conversation/Messages/hooks', () => ({
  useMergeLiveMessage: () => mergeLiveMessageMock,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/renderer/pages/conversation/runtime/useConversationRuntimeView', () => ({
  logStreamTerminalObserved: vi.fn(),
}));

vi.mock('@/renderer/pages/conversation/platforms/aionrs/localCronCommands', () => ({
  processLocalCronResponse: processLocalCronResponseMock,
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
    processLocalCronResponseMock.mockResolvedValue({ systemResponses: [] });
    responseStreamHandlerRef.current = undefined;
    localStorage.clear();
  });

  it('reports matching finish and error terminals to lifecycle consumers', async () => {
    const onTerminal = vi.fn();
    renderHook(() => useAionrsMessage('conv-1', { onTerminal }));

    act(() => {
      responseStreamHandlerRef.current?.({
        type: 'finish',
        data: null,
        msg_id: 'msg-1',
        turn_id: 'turn-1',
        conversation_id: 'conv-1',
      });
      responseStreamHandlerRef.current?.({
        type: 'error',
        data: 'failed',
        msg_id: 'msg-2',
        turn_id: 'turn-2',
        conversation_id: 'conv-1',
      });
    });

    expect(onTerminal).toHaveBeenNthCalledWith(1, { turnId: 'turn-1', outcome: 'completed' });
    expect(onTerminal).toHaveBeenNthCalledWith(2, { turnId: 'turn-2', outcome: 'failed' });
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

  it('keeps a final replacement snapshot terminal while allowing a later chunk to resume', async () => {
    const { result } = renderHook(() => useAionrsMessage('conv-1'));

    await waitFor(() => {
      expect(result.current.hasHydratedRunningState).toBe(true);
    });

    act(() => {
      responseStreamHandlerRef.current?.({
        type: 'content',
        data: { content: 'Hello world' },
        msg_id: 'reply-1',
        turn_id: 'turn-1',
        conversation_id: 'conv-1',
      });
      responseStreamHandlerRef.current?.({
        type: 'finish',
        data: null,
        msg_id: 'reply-1',
        turn_id: 'turn-1',
        conversation_id: 'conv-1',
      });
      responseStreamHandlerRef.current?.({
        type: 'content',
        data: { content: 'Hello world' },
        msg_id: 'reply-1',
        turn_id: 'turn-1',
        conversation_id: 'conv-1',
        replace: true,
      });
    });

    expect(result.current.running).toBe(false);
    expect(mergeLiveMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        msg_id: 'reply-1',
        content: expect.objectContaining({ content: 'Hello world', replace: true }),
      })
    );

    act(() => {
      responseStreamHandlerRef.current?.({
        type: 'content',
        data: { content: ' continued' },
        msg_id: 'reply-1',
        turn_id: 'turn-1',
        conversation_id: 'conv-1',
      });
    });

    expect(result.current.running).toBe(true);
  });

  it('keeps the text alias replacement terminal after finish', async () => {
    const { result } = renderHook(() => useAionrsMessage('conv-1'));

    await waitFor(() => {
      expect(result.current.hasHydratedRunningState).toBe(true);
    });

    act(() => {
      responseStreamHandlerRef.current?.({
        type: 'text',
        data: { content: 'Hello world' },
        msg_id: 'reply-text',
        turn_id: 'turn-text',
        conversation_id: 'conv-1',
      });
      responseStreamHandlerRef.current?.({
        type: 'finish',
        data: null,
        msg_id: 'reply-text',
        turn_id: 'turn-text',
        conversation_id: 'conv-1',
      });
      responseStreamHandlerRef.current?.({
        type: 'text',
        data: { content: 'Hello world' },
        msg_id: 'reply-text',
        turn_id: 'turn-text',
        conversation_id: 'conv-1',
        replace: true,
      });
    });

    expect(result.current.running).toBe(false);
    expect(mergeLiveMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        msg_id: 'reply-text',
        content: expect.objectContaining({ content: 'Hello world', replace: true }),
      })
    );
  });

  it('replaces buffered raw content before finalizing an assistant message', async () => {
    const { result } = renderHook(() => useAionrsMessage('conv-1'));

    await waitFor(() => {
      expect(result.current.hasHydratedRunningState).toBe(true);
    });

    act(() => {
      responseStreamHandlerRef.current?.({
        type: 'content',
        data: { content: 'Hello world' },
        msg_id: 'reply-1',
        turn_id: 'turn-1',
        conversation_id: 'conv-1',
      });
      responseStreamHandlerRef.current?.({
        type: 'content',
        data: { content: 'Hello world' },
        msg_id: 'reply-1',
        turn_id: 'turn-1',
        conversation_id: 'conv-1',
        replace: true,
      });
      responseStreamHandlerRef.current?.({
        type: 'finish',
        data: null,
        msg_id: 'reply-1',
        turn_id: 'turn-1',
        conversation_id: 'conv-1',
      });
    });

    await waitFor(() => {
      expect(processLocalCronResponseMock).toHaveBeenCalledWith('conv-1', 'Hello world');
    });
  });

  it('resets buffered raw content when an explicit replacement is empty', async () => {
    const { result } = renderHook(() => useAionrsMessage('conv-1'));

    await waitFor(() => {
      expect(result.current.hasHydratedRunningState).toBe(true);
    });

    act(() => {
      responseStreamHandlerRef.current?.({
        type: 'content',
        data: { content: 'stale' },
        msg_id: 'reply-reset',
        turn_id: 'turn-reset',
        conversation_id: 'conv-1',
      });
      responseStreamHandlerRef.current?.({
        type: 'content',
        data: { content: '' },
        msg_id: 'reply-reset',
        turn_id: 'turn-reset',
        conversation_id: 'conv-1',
        replace: true,
      });
      responseStreamHandlerRef.current?.({
        type: 'content',
        data: { content: 'Fresh' },
        msg_id: 'reply-reset',
        turn_id: 'turn-reset',
        conversation_id: 'conv-1',
      });
      responseStreamHandlerRef.current?.({
        type: 'finish',
        data: null,
        msg_id: 'reply-reset',
        turn_id: 'turn-reset',
        conversation_id: 'conv-1',
      });
    });

    await waitFor(() => {
      expect(processLocalCronResponseMock).toHaveBeenCalledWith('conv-1', 'Fresh');
    });
  });

  it('records explicit completed-turn usage once with a stable event id', async () => {
    renderHook(() => useAionrsMessage('conv-1'));

    await waitFor(() => {
      expect(responseStreamHandlerRef.current).toBeDefined();
    });

    const completedTurn: IResponseMessage = {
      type: 'finish',
      data: { input_tokens: 10, output_tokens: 5 },
      msg_id: 'message-1',
      turn_id: 'turn-1',
      conversation_id: 'conv-1',
    };

    act(() => {
      responseStreamHandlerRef.current?.(completedTurn);
      responseStreamHandlerRef.current?.(completedTurn);
    });

    const events = JSON.parse(localStorage.getItem('aionui.local-token-usage.v1') ?? '{"events":[]}').events;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: 'conv-1:turn-1',
      inputTokens: 10,
      outputTokens: 5,
    });
    expect(getLocalTokenUsageSummary()).toEqual({ today: 15, weekToDate: 15, monthToDate: 15 });
  });

  it('persists AionRS occupancy and records canonical provider usage once per turn', async () => {
    const { result } = renderHook(() => useAionrsMessage('conv-canonical'));
    const occurredAt = Date.now();

    await waitFor(() => {
      expect(responseStreamHandlerRef.current).toBeDefined();
    });

    const completedTurn = {
      type: 'finish',
      data: null,
      provider_usage: { input_tokens: 10, output_tokens: 5 },
      msg_id: 'message-1',
      turn_id: 'turn-1',
      conversation_id: 'conv-canonical',
      created_at: occurredAt,
    } as IResponseMessage;

    act(() => {
      responseStreamHandlerRef.current?.({
        type: 'tips',
        data: { content: 'Token watermark override: provider=0, local_estimate=11768, using=11768' },
        msg_id: 'message-1',
        turn_id: 'turn-1',
        conversation_id: 'conv-canonical',
        created_at: occurredAt,
      });
      responseStreamHandlerRef.current?.(completedTurn);
      responseStreamHandlerRef.current?.(completedTurn);
    });

    await waitFor(() => {
      expect(updateConversationInvokeMock).toHaveBeenCalledTimes(1);
    });
    expect(result.current.tokenUsage).toEqual({ total_tokens: 11_768 });
    expect(updateConversationInvokeMock).toHaveBeenCalledWith({
      id: 'conv-canonical',
      updates: {
        extra: {
          last_token_usage: { total_tokens: 11_768 },
        },
      },
      merge_extra: true,
    });
    expect(JSON.parse(localStorage.getItem('aionui.local-token-usage.v1') ?? '{"events":[]}').events).toEqual([
      expect.objectContaining({ id: 'conv-canonical:turn-1', inputTokens: 10, outputTokens: 5 }),
    ]);
  });

  it('restores AionRS occupancy and local totals after a remount', async () => {
    const occurredAt = Date.now();
    const firstMount = renderHook(() => useAionrsMessage('conv-restart'));

    act(() => {
      responseStreamHandlerRef.current?.({
        type: 'tips',
        data: { content: 'Token watermark override: provider=0, local_estimate=11768, using=11768' },
        msg_id: 'message-1',
        turn_id: 'turn-1',
        conversation_id: 'conv-restart',
        created_at: occurredAt,
      });
      responseStreamHandlerRef.current?.({
        type: 'finish',
        data: null,
        provider_usage: { input_tokens: 10, output_tokens: 5 },
        msg_id: 'message-1',
        turn_id: 'turn-1',
        conversation_id: 'conv-restart',
        created_at: occurredAt,
      });
    });
    await waitFor(() => expect(updateConversationInvokeMock).toHaveBeenCalledTimes(1));
    firstMount.unmount();

    vi.mocked(getConversationOrNull).mockResolvedValue({
      id: 'conv-restart',
      type: 'aionrs',
      name: 'Restarted conversation',
      created_at: occurredAt,
      modified_at: occurredAt,
      extra: {
        workspace: '/tmp/conv-restart',
        last_token_usage: { total_tokens: 11_768 },
      },
      model: {
        id: 'provider-1',
        platform: 'new-api',
        name: 'Kimi',
        base_url: '',
        api_key: '',
        use_model: 'kimi-k2.6',
      },
    } as never);

    const restarted = renderHook(() => useAionrsMessage('conv-restart'));

    await waitFor(() => {
      expect(restarted.result.current.tokenUsage).toEqual({ total_tokens: 11_768 });
    });
    expect(getLocalTokenUsageSummary()).toEqual({ today: 15, weekToDate: 15, monthToDate: 15 });
  });

  it('uses diagnostic estimates only for occupancy when completed turns omit provider usage', async () => {
    const { result } = renderHook(() => useAionrsMessage('conv-1'));

    await waitFor(() => {
      expect(responseStreamHandlerRef.current).toBeDefined();
    });

    act(() => {
      responseStreamHandlerRef.current?.({
        type: 'tips',
        data: {
          content: 'Token watermark override: provider=0, local_estimate=11768, using=11768',
        },
        msg_id: 'message-1',
        turn_id: 'turn-1',
        conversation_id: 'conv-1',
      });
      responseStreamHandlerRef.current?.({
        type: 'finish',
        data: null,
        msg_id: 'message-1',
        turn_id: 'turn-1',
        conversation_id: 'conv-1',
      });
      responseStreamHandlerRef.current?.({
        type: 'tips',
        data: {
          content: 'Token watermark override: provider=0, local_estimate=37034, using=37034',
        },
        msg_id: 'message-1',
        turn_id: 'turn-1',
        conversation_id: 'conv-1',
      });
      responseStreamHandlerRef.current?.({
        type: 'finish',
        data: {},
        msg_id: 'message-1',
        turn_id: 'turn-1',
        conversation_id: 'conv-1',
      });
    });

    expect(result.current.tokenUsage).toEqual({ total_tokens: 37_034 });
    expect(getLocalTokenUsageSummary()).toEqual({ today: 0, weekToDate: 0, monthToDate: 0 });
  });

  it('accepts a lower later occupancy snapshot after context compaction', async () => {
    const { result } = renderHook(() => useAionrsMessage('conv-1'));

    await waitFor(() => {
      expect(responseStreamHandlerRef.current).toBeDefined();
    });

    act(() => {
      responseStreamHandlerRef.current?.({
        type: 'tips',
        data: { content: 'Token watermark override: provider=0, local_estimate=37034, using=37034' },
        msg_id: 'message-1',
        turn_id: 'turn-1',
        conversation_id: 'conv-1',
      });
      responseStreamHandlerRef.current?.({
        type: 'tips',
        data: { content: 'Token watermark override: provider=0, local_estimate=11768, using=11768' },
        msg_id: 'message-2',
        turn_id: 'turn-2',
        conversation_id: 'conv-1',
      });
    });

    expect(result.current.tokenUsage).toEqual({ total_tokens: 11_768 });
  });

  it('keeps explicit provider consumption separate from a diagnostic occupancy estimate', async () => {
    const { result } = renderHook(() => useAionrsMessage('conv-1'));

    await waitFor(() => {
      expect(responseStreamHandlerRef.current).toBeDefined();
    });

    act(() => {
      responseStreamHandlerRef.current?.({
        type: 'tips',
        data: {
          content: 'Token watermark override: provider=0, local_estimate=11768, using=11768',
        },
        msg_id: 'message-1',
        turn_id: 'turn-1',
        conversation_id: 'conv-1',
      });
      responseStreamHandlerRef.current?.({
        type: 'finish',
        data: { input_tokens: 10, output_tokens: 5 },
        msg_id: 'message-1',
        turn_id: 'turn-1',
        conversation_id: 'conv-1',
      });
    });

    expect(result.current.tokenUsage).toEqual({ total_tokens: 11_768 });
    expect(getLocalTokenUsageSummary()).toEqual({ today: 15, weekToDate: 15, monthToDate: 15 });
  });

  it('does not record a completed turn without explicit usage', async () => {
    renderHook(() => useAionrsMessage('conv-1'));

    await waitFor(() => {
      expect(responseStreamHandlerRef.current).toBeDefined();
    });

    act(() => {
      responseStreamHandlerRef.current?.({
        type: 'finish',
        data: {},
        msg_id: 'message-1',
        conversation_id: 'conv-1',
      });
    });

    expect(getLocalTokenUsageSummary()).toEqual({ today: 0, weekToDate: 0, monthToDate: 0 });
  });

  it('does not invent missing input usage for an output-only report', async () => {
    renderHook(() => useAionrsMessage('conv-1'));

    await waitFor(() => {
      expect(responseStreamHandlerRef.current).toBeDefined();
    });

    act(() => {
      responseStreamHandlerRef.current?.({
        type: 'finish',
        data: { output_tokens: 8 },
        msg_id: 'message-1',
        conversation_id: 'conv-1',
      });
    });

    const events = JSON.parse(localStorage.getItem('aionui.local-token-usage.v1') ?? '{"events":[]}').events;
    expect(events).toHaveLength(0);
    expect(updateConversationInvokeMock).not.toHaveBeenCalled();
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 'malformed'])(
    'rejects a report with invalid input usage instead of inventing zero: %p',
    async (invalidInputTokens) => {
      renderHook(() => useAionrsMessage('conv-1'));

      await waitFor(() => {
        expect(responseStreamHandlerRef.current).toBeDefined();
      });

      act(() => {
        responseStreamHandlerRef.current?.({
          type: 'finish',
          data: { input_tokens: invalidInputTokens, output_tokens: 8 },
          msg_id: 'message-1',
          conversation_id: 'conv-1',
        });
      });

      const events = JSON.parse(localStorage.getItem('aionui.local-token-usage.v1') ?? '{"events":[]}').events;
      expect(events).toEqual([]);
      expect(updateConversationInvokeMock).not.toHaveBeenCalled();
    }
  );

  describe('reasoning-only turn detection', () => {
    const emptyReplyTips = () =>
      mergeLiveMessageMock.mock.calls.filter(
        ([message]) => message?.type === 'tips' && message?.content?.content === 'conversation.emptyModelReply'
      );

    const streamTurn = async (msgId: string, chunks: string[], extraEvents: IResponseMessage[] = []) => {
      const { result } = renderHook(() => useAionrsMessage('conv-1'));
      await waitFor(() => {
        expect(result.current.hasHydratedRunningState).toBe(true);
      });
      act(() => {
        result.current.setActiveMsgId(msgId);
        for (const chunk of chunks) {
          responseStreamHandlerRef.current?.({
            type: 'text',
            data: { content: chunk },
            msg_id: msgId,
            turn_id: 'turn-1',
            conversation_id: 'conv-1',
          });
        }
        for (const event of extraEvents) {
          responseStreamHandlerRef.current?.(event);
        }
      });
      return result;
    };

    const finishEvent = (msgId: string): IResponseMessage => ({
      type: 'finish',
      data: null,
      msg_id: msgId,
      turn_id: 'turn-1',
      conversation_id: 'conv-1',
    });

    it('surfaces an error tip when a turn ends with reasoning-only output', async () => {
      await streamTurn('msg-think', ['<think>planning the reply</think>\n'], [finishEvent('msg-think')]);

      expect(emptyReplyTips()).toHaveLength(1);
      const [message, forceUpdate] = emptyReplyTips()[0];
      expect(message.content.type).toBe('error');
      expect(forceUpdate).toBe(true);
    });

    it('does not flag a turn that produced a visible reply after thinking', async () => {
      await streamTurn('msg-ok', ['<think>plan</think>', 'Here is the answer'], [finishEvent('msg-ok')]);

      expect(emptyReplyTips()).toHaveLength(0);
    });

    it('does not flag a reasoning-only response that ran tools', async () => {
      await streamTurn(
        'msg-tools',
        ['<think>calling a tool</think>'],
        [
          {
            type: 'tool_group',
            data: [{ status: 'Success', name: 'Read' }],
            msg_id: 'msg-tools',
            turn_id: 'turn-1',
            conversation_id: 'conv-1',
          },
          finishEvent('msg-tools'),
        ]
      );

      expect(emptyReplyTips()).toHaveLength(0);
    });

    it('flags a duplicated finish event only once', async () => {
      await streamTurn('msg-dup', ['<think>planning</think>'], [finishEvent('msg-dup'), finishEvent('msg-dup')]);

      expect(emptyReplyTips()).toHaveLength(1);
    });

    it('does not flag a finish that arrives after the user stopped the turn', async () => {
      const result = await streamTurn('msg-stopped', ['<think>partial plan</think>']);

      act(() => {
        result.current.resetState();
        responseStreamHandlerRef.current?.(finishEvent('msg-stopped'));
      });

      expect(emptyReplyTips()).toHaveLength(0);
    });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 'malformed'])(
    'rejects a report with invalid output usage instead of inventing zero: %p',
    async (invalidOutputTokens) => {
      renderHook(() => useAionrsMessage('conv-1'));

      await waitFor(() => {
        expect(responseStreamHandlerRef.current).toBeDefined();
      });

      act(() => {
        responseStreamHandlerRef.current?.({
          type: 'finish',
          data: { input_tokens: 4, output_tokens: invalidOutputTokens },
          msg_id: 'message-1',
          conversation_id: 'conv-1',
        });
      });

      const events = JSON.parse(localStorage.getItem('aionui.local-token-usage.v1') ?? '{"events":[]}').events;
      expect(events).toEqual([]);
      expect(updateConversationInvokeMock).not.toHaveBeenCalled();
    }
  );
});
