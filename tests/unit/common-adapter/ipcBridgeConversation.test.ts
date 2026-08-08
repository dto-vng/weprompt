/**
 * @vitest-environment node
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  IConversationTurnCompletedEvent,
  ICreateConversationParams,
  ISendMessageParams,
} from '@/common/adapter/ipcBridge';
import {
  getConversationRuntimeViewSnapshot,
  resetConversationRuntimeViewStoreForTest,
  turnCompleted,
} from '@/renderer/pages/conversation/runtime/conversationRuntimeViewStore';

type HttpCall = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
};

const httpBridgeMocks = vi.hoisted(() => {
  const calls: HttpCall[] = [];
  const provider =
    (method: HttpCall['method']) =>
    <Data, Params = undefined>(path: string | ((params: Params) => string), mapBody?: (params: Params) => unknown) => ({
      provider: vi.fn(),
      invoke: vi.fn(async (params?: Params) => {
        const resolvedPath = typeof path === 'function' ? path(params as Params) : path;
        calls.push({
          method,
          path: resolvedPath,
          body: mapBody && params !== undefined ? mapBody(params as Params) : undefined,
        });
        return true as Data;
      }),
    });
  const emitter = () => ({ on: vi.fn(() => vi.fn()), emit: vi.fn() });
  const mappedEmitter = <Params>(_eventName: string, transform: (raw: unknown) => Params) => {
    let listener: ((value: Params) => void) | undefined;
    return {
      on: vi.fn((next: (value: Params) => void) => {
        listener = next;
        return () => {
          if (listener === next) listener = undefined;
        };
      }),
      emit: vi.fn((raw: unknown) => listener?.(transform(raw))),
    };
  };

  return {
    calls,
    httpGet: provider('GET'),
    httpPost: provider('POST'),
    httpPut: provider('PUT'),
    httpPatch: provider('PATCH'),
    httpDelete: provider('DELETE'),
    httpRequest: vi.fn(),
    stubProvider: vi.fn((name: string, defaultValue: unknown) => ({
      provider: vi.fn(),
      invoke: vi.fn(async () => defaultValue),
    })),
    withResponseMap: vi.fn(
      (
        inner: { provider: unknown; invoke: (params?: unknown) => Promise<unknown> },
        map: (raw: unknown) => unknown
      ) => ({
        provider: inner.provider,
        invoke: vi.fn(async (params?: unknown) => map(await inner.invoke(params))),
      })
    ),
    wsEmitter: vi.fn(emitter),
    wsMappedEmitter: vi.fn(mappedEmitter),
    stubEmitter: vi.fn(emitter),
  };
});

vi.mock('@/common/adapter/httpBridge', () => httpBridgeMocks);

vi.mock('@/common/platform/bridge', () => ({
  bridge: {
    buildProvider: vi.fn(() => ({
      provider: vi.fn(),
      invoke: vi.fn(),
    })),
    buildRendererQuery: vi.fn(() => ({
      provider: vi.fn(),
      invoke: vi.fn(),
    })),
    buildEmitter: vi.fn(() => ({
      on: vi.fn(() => vi.fn()),
      emit: vi.fn(),
    })),
  },
}));

describe('ipcBridge conversation adapter', () => {
  beforeEach(() => {
    httpBridgeMocks.calls.length = 0;
    resetConversationRuntimeViewStoreForTest();
  });

  it('normalizes authoritative usage from ACP metadata and AionRS finish envelopes', async () => {
    const { normalizeResponseMessage } = await import('@/common/adapter/ipcBridge');

    expect(
      normalizeResponseMessage({
        type: 'acp_context_usage',
        data: { used: 12_000, size: 32_000, _meta: { input_tokens: 10, output_tokens: 5 } },
        msg_id: 'message-1',
        turn_id: 'turn-1',
        conversation_id: 'conv-acp',
      }).provider_usage
    ).toEqual({ input_tokens: 10, output_tokens: 5 });
    expect(
      normalizeResponseMessage({
        type: 'finish',
        data: { usage: { inputTokens: 20, outputTokens: 7 } },
        msg_id: 'message-2',
        turn_id: 'turn-2',
        conversation_id: 'conv-aionrs',
      }).provider_usage
    ).toEqual({ input_tokens: 20, output_tokens: 7 });
  });

  it('keeps provider usage absent when either authoritative counter is missing', async () => {
    const { normalizeResponseMessage } = await import('@/common/adapter/ipcBridge');

    const normalized = normalizeResponseMessage({
      type: 'acp_context_usage',
      data: { used: 12_000, size: 32_000, _meta: { input_tokens: 10 } },
      msg_id: 'message-1',
      turn_id: 'turn-1',
      conversation_id: 'conv-acp',
    });

    expect(normalized).not.toHaveProperty('provider_usage');
  });

  it('deletes conversations through the standard conversation endpoint', async () => {
    const { conversation } = await import('@/common/adapter/ipcBridge');

    await conversation.remove.invoke({ id: 'conv-1' });

    expect(httpBridgeMocks.calls).toContainEqual({
      method: 'DELETE',
      path: '/api/conversations/conv-1',
      body: undefined,
    });
  });

  it('passes context handoff metadata through create conversation requests', async () => {
    const { conversation } = await import('@/common/adapter/ipcBridge');
    const input: ICreateConversationParams = {
      type: 'aionrs',
      name: 'Handoff continuation',
      extra: {
        workspace: '/tmp/workspace',
        context: '# Conversation Context\n\n## Goal\nContinue safely.',
        context_file_name: 'Context.md',
        context_handoff: {
          pinned_context: [
            {
              id: 'ctx-1',
              title: 'Decision',
              content: 'Use VND millions.',
              source: 'context_md',
              created_at: 1,
              updated_at: 1,
            },
          ],
          context_file_path: '/tmp/workspace/Context.md',
          context_file_name: 'Context.md',
          last_budget_status: 'healthy',
          last_exported_at: 2,
        },
      },
    };

    await conversation.create.invoke(input);

    expect(httpBridgeMocks.calls).toContainEqual({
      method: 'POST',
      path: '/api/conversations',
      body: {
        type: 'aionrs',
        id: undefined,
        name: 'Handoff continuation',
        assistant: undefined,
        extra: input.extra,
      },
    });
  });

  it('passes project metadata through create conversation requests', async () => {
    const { conversation } = await import('@/common/adapter/ipcBridge');
    const input: ICreateConversationParams = {
      type: 'aionrs',
      name: 'Review June close',
      extra: {
        project_id: 'project-finance-close',
        workspace: '/Users/me/Finance Close',
        custom_workspace: true,
      },
    };

    await conversation.create.invoke(input);

    expect(httpBridgeMocks.calls).toContainEqual({
      method: 'POST',
      path: '/api/conversations',
      body: {
        type: 'aionrs',
        id: undefined,
        name: 'Review June close',
        assistant: undefined,
        extra: input.extra,
      },
    });
  });

  it('passes pinned context through send message requests', async () => {
    const { conversation } = await import('@/common/adapter/ipcBridge');
    const input: ISendMessageParams = {
      conversation_id: 'conv-1',
      input: 'Continue',
      files: [],
      pinned_context: [
        {
          id: 'ctx-1',
          title: 'Decision',
          content: 'Use VND millions.',
          source: 'manual',
          created_at: 1,
          updated_at: 1,
        },
      ],
    };

    await conversation.sendMessage.invoke(input);

    expect(httpBridgeMocks.calls).toContainEqual({
      method: 'POST',
      path: '/api/conversations/conv-1/messages',
      body: {
        content: input.input,
        files: input.files,
        loading_id: undefined,
        inject_skills: undefined,
        pinned_context: input.pinned_context,
      },
    });
  });

  it('requests invisible context compaction through the dedicated conversation endpoint', async () => {
    const { conversation } = await import('@/common/adapter/ipcBridge');
    const input = {
      conversation_id: 'conv-1',
      trigger: 'manual' as const,
      previous_snapshot: {
        goal: 'Finish the context manager',
        current_state: ['The deterministic fallback exists.'],
        decisions: [],
        artifacts: ['Context.md'],
        user_preferences: [],
        open_questions: [],
        next_steps: ['Add LLM compaction.'],
        do_not_forget: [],
      },
      previous_markdown: '# Conversation Context',
      pinned_context: [],
      last_compacted_turn_id: 'turn-3',
    };

    await conversation.compactContext.invoke(input);

    expect(httpBridgeMocks.calls).toContainEqual({
      method: 'POST',
      path: '/api/conversations/conv-1/context/compact',
      body: {
        trigger: input.trigger,
        previous_snapshot: input.previous_snapshot,
        previous_markdown: input.previous_markdown,
        pinned_context: input.pinned_context,
        last_compacted_turn_id: input.last_compacted_turn_id,
      },
    });
  });

  it('preserves unknown outcome fields on the pinned sparse completion payload', async () => {
    const { conversation } = await import('@/common/adapter/ipcBridge');
    let received: IConversationTurnCompletedEvent | undefined;
    const unsubscribe = conversation.turnCompleted.on((event) => {
      received = event;
    });

    (
      conversation.turnCompleted.emit as unknown as (raw: {
        user_id: string;
        conversation_id: string;
        session_id: string;
        turn_id: string;
        status: string;
        canSendMessage: boolean;
        runtime: {
          state: string;
          can_send_message: boolean;
          has_task: boolean;
          is_processing: boolean;
          pending_confirmations: number;
          turn_id: null;
        };
      }) => void
    )({
      user_id: 'user-1',
      conversation_id: 'conv-1',
      session_id: 'conv-1',
      turn_id: 'turn-failed',
      status: 'finished',
      canSendMessage: true,
      runtime: {
        state: 'idle',
        can_send_message: true,
        has_task: false,
        is_processing: false,
        pending_confirmations: 0,
        turn_id: null,
      },
    });

    expect(received).toMatchObject({
      session_id: 'conv-1',
      turn_id: 'turn-failed',
      status: 'finished',
    });
    expect(received).not.toHaveProperty('state');
    expect(received).not.toHaveProperty('last_message');
    unsubscribe();
  });

  it.each([
    ['missing', {}],
    ['null', { runtime: null }],
  ])('preserves a %s completion runtime as null', async (_label, runtimePayload) => {
    const { conversation } = await import('@/common/adapter/ipcBridge');
    let received: IConversationTurnCompletedEvent | undefined;
    const unsubscribe = conversation.turnCompleted.on((event) => {
      received = event;
    });

    (conversation.turnCompleted.emit as unknown as (raw: unknown) => void)({
      session_id: 'conv-1',
      turn_id: 'turn-1',
      status: 'finished',
      ...runtimePayload,
    });

    expect(received?.runtime).toBeNull();
    unsubscribe();
  });

  it('applies a valid runtime emitted after a null completion for the same turn', async () => {
    const { conversation } = await import('@/common/adapter/ipcBridge');
    const unsubscribe = conversation.turnCompleted.on((event) => {
      turnCompleted(event.session_id, event.turn_id, event.runtime);
    });
    const emit = conversation.turnCompleted.emit as unknown as (raw: unknown) => void;

    emit({
      session_id: 'conv-recovery',
      turn_id: 'turn-recovery',
      status: 'finished',
      runtime: null,
    });
    emit({
      session_id: 'conv-recovery',
      turn_id: 'turn-recovery',
      status: 'finished',
      runtime: {
        state: 'running',
        can_send_message: false,
        has_task: true,
        task_status: 'running',
        is_processing: true,
        pending_confirmations: 0,
        turn_id: 'turn-recovery',
      },
    });

    expect(getConversationRuntimeViewSnapshot('conv-recovery')).toMatchObject({
      hydrated: true,
      state: 'running',
      canSendMessage: false,
      isProcessing: true,
      activeTurnId: 'turn-recovery',
    });
    unsubscribe();
  });
});
