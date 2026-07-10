/**
 * @vitest-environment node
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ICreateConversationParams, ISendMessageParams } from '@/common/adapter/ipcBridge';

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
    wsMappedEmitter: vi.fn(emitter),
    stubEmitter: vi.fn(emitter),
  };
});

vi.mock('@/common/adapter/httpBridge', () => httpBridgeMocks);

vi.mock('@office-ai/platform', () => ({
  bridge: {
    buildProvider: vi.fn(() => ({
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
});
