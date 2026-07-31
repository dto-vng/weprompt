import type { IConversationTurnCompletedEvent, IResponseMessage } from '@/common/adapter/ipcBridge';
import type { TMessage } from '@/common/chat/chatLib';
import type { TChatConversation, TContextSnapshot } from '@/common/config/storage';
import type {
  AppOperationErrorCode,
  AppOperationMetadata,
  AppOperationResult,
  AppOperationsContextCompactOutput,
} from '@/common/types/appOperations';
import {
  compactConversationContext,
  ContextCompactionCanceledError,
  ContextCompactionOperationError,
  handoffConversationContext,
  isMeaningfulContextTurn,
  pinConversationContext,
  shouldAutoCompactContext,
  type CompactConversationContextResult,
  type ContextCompactionDependencies,
  useContextCompaction,
} from '@/renderer/pages/conversation/contextHandoff/useContextCompaction';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const snapshot: TContextSnapshot = {
  goal: 'Ship LLM-first context management.',
  current_state: ['Structured compaction is wired.'],
  decisions: ['Pins are immutable.'],
  artifacts: ['/workspace/Context.md'],
  user_preferences: ['Keep the UI compact.'],
  open_questions: [],
  next_steps: ['Verify the handoff.'],
  do_not_forget: ['Keep transcript export unchanged.'],
};

const operation: AppOperationMetadata = {
  task_id: 'context.compact',
  prompt_version: 'context.compact.v1',
  provider_id: 'operations-provider',
  model_id: 'operations-model',
  duration_ms: 25,
  queue_wait_ms: 2,
  attempts: 1,
  deduplicated: false,
};

const compactSuccess = (
  output: AppOperationsContextCompactOutput = { snapshot, through_turn_id: 'turn-4' }
): AppOperationResult<AppOperationsContextCompactOutput> => ({ ok: true, output, operation });

const compactFailure = (code: AppOperationErrorCode): AppOperationResult<AppOperationsContextCompactOutput> => ({
  ok: false,
  error: { code, retryable: code !== 'canceled' },
  operation,
});

const conversation: Extract<TChatConversation, { type: 'aionrs' }> = {
  id: 'conversation-1',
  name: 'Context work',
  type: 'aionrs',
  created_at: 1,
  modified_at: 2,
  model: {
    id: 'provider-1',
    platform: 'openai',
    name: 'OpenAI',
    base_url: '',
    api_key: '',
    use_model: 'model-1',
  },
  extra: {
    workspace: '/workspace',
    context_handoff: {
      pinned_context: [
        {
          id: 'pin-1',
          title: 'Reporting unit',
          content: 'Use VND millions.',
          source: 'manual',
          created_at: 1,
          updated_at: 1,
        },
      ],
    },
  },
};

const messages: TMessage[] = [
  {
    id: 'message-1',
    msg_id: 'message-1',
    conversation_id: 'conversation-1',
    type: 'text',
    position: 'right',
    content: { content: 'Build context management.' },
  },
  {
    id: 'message-2',
    msg_id: 'message-2',
    conversation_id: 'conversation-1',
    type: 'text',
    position: 'left',
    content: { content: 'The implementation is ready.' },
  },
];

type TestDependencies = ContextCompactionDependencies & {
  updates: Array<{ id: string; updates: Partial<TChatConversation>; merge_extra?: boolean }>;
};

const createDependencies = (): TestDependencies => {
  const updates: TestDependencies['updates'] = [];
  return {
    updates,
    getConversation: vi.fn(async () => conversation),
    loadMessages: vi.fn(async () => messages),
    readFile: vi.fn(async () => '# Conversation Context\n\n## Goal\n\n- Keep the edited goal.'),
    writeFile: vi.fn(async () => true),
    updateConversation: vi.fn(async (input) => {
      updates.push(input);
      return true;
    }),
    compactWithAppOperations: vi.fn(async () => compactSuccess()),
    cancelAppOperation: vi.fn(async () => {}),
    emitRefresh: vi.fn(),
    now: () => 100,
  };
};

const completedTurn = (overrides: Partial<IConversationTurnCompletedEvent> = {}): IConversationTurnCompletedEvent => ({
  session_id: 'conversation-1',
  turn_id: 'turn-1',
  status: 'finished',
  state: 'ai_waiting_input',
  detail: '',
  can_send_message: true,
  runtime: {
    state: 'idle',
    can_send_message: true,
    has_task: false,
    is_processing: false,
    pending_confirmations: 0,
    turn_id: null,
  },
  workspace: '/workspace',
  model: { platform: 'openai', name: 'OpenAI', use_model: 'model-1' },
  last_message: {
    id: 'message-2',
    type: 'text',
    content: 'Completed useful work.',
    status: 'finish',
    created_at: 100,
  },
  ...overrides,
});

const sparseCompletedTurn = (
  turnId: string,
  overrides: Partial<IConversationTurnCompletedEvent> = {}
): IConversationTurnCompletedEvent =>
  ({
    session_id: 'conversation-1',
    turn_id: turnId,
    status: 'finished',
    can_send_message: true,
    runtime: {
      state: 'idle',
      can_send_message: true,
      has_task: false,
      is_processing: false,
      pending_confirmations: 0,
      turn_id: null,
    },
    ...overrides,
  }) as IConversationTurnCompletedEvent;

const responseMessage = (turnId: string, overrides: Partial<IResponseMessage> = {}): IResponseMessage => ({
  conversation_id: 'conversation-1',
  turn_id: turnId,
  msg_id: `message-${turnId}`,
  type: 'content',
  data: { content: 'Completed useful work.' },
  hidden: false,
  ...overrides,
});

describe('compactConversationContext', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('uses app operations provenance even when the conversation model differs', async () => {
    const dependencies = createDependencies();

    const result = await compactConversationContext(
      {
        conversationId: 'conversation-1',
        workspace: '/workspace',
        trigger: 'auto',
        targetTurnId: 'turn-4',
        budgetStatus: 'healthy',
        turnsSinceCompaction: 8,
      },
      dependencies
    );

    expect(result.source).toBe('llm');
    expect(result.operation).toEqual(operation);
    expect(dependencies.compactWithAppOperations).toHaveBeenCalledWith({
      operation_id: expect.any(String),
      conversation_id: 'conversation-1',
      trigger: 'auto',
      previous_snapshot: undefined,
      previous_markdown: '# Conversation Context\n\n## Goal\n\n- Keep the edited goal.',
      pinned_context: conversation.extra.context_handoff?.pinned_context,
      last_compacted_turn_id: undefined,
      target_turn_id: 'turn-4',
    });
    expect(dependencies.compactWithAppOperations.mock.calls[0]?.[0]).not.toHaveProperty('provider_id');
    expect(dependencies.compactWithAppOperations.mock.calls[0]?.[0]).not.toHaveProperty('model');
    expect(dependencies.writeFile).toHaveBeenCalledWith({
      path: '/workspace/Context.md',
      data: expect.stringContaining('- Ship LLM-first context management.'),
      workspace: '/workspace',
    });
    expect(dependencies.updates.at(-1)?.updates.extra).toEqual({
      context_handoff: expect.objectContaining({
        snapshot,
        revision: 1,
        source: 'llm',
        status: 'fresh',
        last_compacted_turn_id: 'turn-4',
        turns_since_compaction: 0,
        context_file_path: '/workspace/Context.md',
        context_file_name: 'Context.md',
      }),
    });
    expect(dependencies.updates[0]?.updates.extra).toEqual({
      context_handoff: expect.objectContaining({
        status: 'updating',
        turns_since_compaction: 8,
      }),
    });
    expect(dependencies.emitRefresh).toHaveBeenCalledWith('conversation-1');
  });

  it('normalizes bounded model variance instead of using the rules fallback', async () => {
    const dependencies = createDependencies();
    dependencies.compactWithAppOperations = vi.fn(async () =>
      compactSuccess({
        snapshot: {
          ...snapshot,
          goal: 'g'.repeat(1_001),
          current_state: Array.from({ length: 13 }, (_, index) => `State ${index}`),
          decisions: ['d'.repeat(501)],
          provider_note: 'ignore this extra field',
        },
        through_turn_id: 'turn-4',
      })
    );

    const result = await compactConversationContext(
      {
        conversationId: 'conversation-1',
        workspace: '/workspace',
        trigger: 'auto',
        targetTurnId: 'turn-4',
      },
      dependencies
    );

    expect(result.source).toBe('llm');
    expect(result.snapshot.goal).toHaveLength(1_000);
    expect(result.snapshot.current_state).toHaveLength(12);
    expect(result.snapshot.decisions[0]).toHaveLength(500);
    expect(result.snapshot).not.toHaveProperty('provider_note');
  });

  it.each<AppOperationErrorCode>([
    'not_configured',
    'model_unavailable',
    'queue_full',
    'provider_auth_failed',
    'provider_rate_limited',
    'provider_request_failed',
    'provider_timeout',
    'invalid_output',
  ])('writes rules context for %s', async (code) => {
    const dependencies = createDependencies();
    dependencies.compactWithAppOperations = vi.fn(async () => compactFailure(code));

    const result = await compactConversationContext(
      {
        conversationId: 'conversation-1',
        workspace: '/workspace',
        trigger: 'manual',
        targetTurnId: 'turn-4',
      },
      dependencies
    );

    expect(result.source).toBe('rules');
    expect(result.markdown).toContain('Keep the edited goal.');
    expect(dependencies.updates.at(-1)?.updates.extra).toEqual({
      context_handoff: expect.objectContaining({
        source: 'rules',
        status: 'fresh',
        last_error_code: code,
        revision: 1,
      }),
    });
  });

  it('does not advance the durable revision when writing Context.md fails', async () => {
    const dependencies = createDependencies();
    dependencies.writeFile = vi.fn(async () => false);

    await expect(
      compactConversationContext(
        {
          conversationId: 'conversation-1',
          workspace: '/workspace',
          trigger: 'manual',
          targetTurnId: 'turn-4',
        },
        dependencies
      )
    ).rejects.toBeInstanceOf(ContextCompactionOperationError);

    expect(dependencies.updates.at(-1)?.updates.extra).toEqual({
      context_handoff: expect.not.objectContaining({ revision: expect.any(Number) }),
    });
    expect(dependencies.updates.at(-1)?.updates.extra).toEqual({
      context_handoff: expect.objectContaining({ status: 'failed', last_error_code: 'file_write_failed' }),
    });
  });

  it('treats an invalid successful broker payload as invalid_output', async () => {
    const dependencies = createDependencies();
    dependencies.compactWithAppOperations = vi.fn(async () =>
      compactSuccess({ snapshot: { goal: 42 }, through_turn_id: 'turn-4' })
    );

    const result = await compactConversationContext(
      {
        conversationId: 'conversation-1',
        workspace: '/workspace',
        trigger: 'manual',
        targetTurnId: 'turn-4',
      },
      dependencies
    );

    expect(result.source).toBe('rules');
    expect(dependencies.updates.at(-1)?.updates.extra).toEqual({
      context_handoff: expect.objectContaining({
        source: 'rules',
        status: 'fresh',
        last_error_code: 'invalid_output',
      }),
    });
  });

  it('does not write a rules replacement after cancellation', async () => {
    const dependencies = createDependencies();
    dependencies.compactWithAppOperations = vi.fn(async () => compactFailure('canceled'));

    await expect(
      compactConversationContext(
        {
          conversationId: 'conversation-1',
          workspace: '/workspace',
          trigger: 'manual',
          targetTurnId: 'turn-4',
        },
        dependencies
      )
    ).rejects.toBeInstanceOf(ContextCompactionCanceledError);

    expect(dependencies.writeFile).not.toHaveBeenCalled();
    expect(dependencies.updates).toHaveLength(1);
    expect(dependencies.updates[0]?.updates.extra).toEqual({
      context_handoff: expect.objectContaining({ status: 'updating' }),
    });
  });

  it('retains an automatic triggering count when compaction is canceled after the updating transition', async () => {
    const dependencies = createDependencies();
    dependencies.compactWithAppOperations = vi.fn(async () => compactFailure('canceled'));

    await expect(
      compactConversationContext(
        {
          conversationId: 'conversation-1',
          workspace: '/workspace',
          trigger: 'auto',
          targetTurnId: 'turn-8',
          turnsSinceCompaction: 8,
        },
        dependencies
      )
    ).rejects.toBeInstanceOf(ContextCompactionCanceledError);

    expect(dependencies.updates).toHaveLength(1);
    expect(dependencies.updates[0]?.updates.extra).toEqual({
      context_handoff: expect.objectContaining({
        status: 'updating',
        turns_since_compaction: 8,
      }),
    });
  });

  it('retains an automatic triggering count when writing Context.md fails', async () => {
    const dependencies = createDependencies();
    dependencies.writeFile = vi.fn(async () => false);

    await expect(
      compactConversationContext(
        {
          conversationId: 'conversation-1',
          workspace: '/workspace',
          trigger: 'auto',
          targetTurnId: 'turn-8',
          turnsSinceCompaction: 8,
        },
        dependencies
      )
    ).rejects.toMatchObject({ code: 'file_write_failed' });

    expect(dependencies.updates[0]?.updates.extra).toEqual({
      context_handoff: expect.objectContaining({
        status: 'updating',
        turns_since_compaction: 8,
      }),
    });
    expect(dependencies.updates.at(-1)?.updates.extra).toEqual({
      context_handoff: expect.objectContaining({
        status: 'failed',
        turns_since_compaction: 8,
      }),
    });
  });

  it('retains an automatic triggering count when final metadata persistence fails', async () => {
    const dependencies = createDependencies();
    dependencies.updateConversation = vi
      .fn<(input: TestDependencies['updates'][number]) => Promise<boolean>>()
      .mockImplementation(async (input) => {
        dependencies.updates.push(input);
        return dependencies.updates.length === 1;
      });

    await expect(
      compactConversationContext(
        {
          conversationId: 'conversation-1',
          workspace: '/workspace',
          trigger: 'auto',
          targetTurnId: 'turn-8',
          turnsSinceCompaction: 8,
        },
        dependencies
      )
    ).rejects.toMatchObject({ code: 'metadata_write_failed' });

    expect(dependencies.updates[0]?.updates.extra).toEqual({
      context_handoff: expect.objectContaining({
        status: 'updating',
        turns_since_compaction: 8,
      }),
    });
    expect(dependencies.updates[1]?.updates.extra).toEqual({
      context_handoff: expect.objectContaining({
        status: 'fresh',
        turns_since_compaction: 0,
      }),
    });
    expect(dependencies.emitRefresh).not.toHaveBeenCalled();
  });

  it('keeps the same snapshot fields, through turn id, and Context.md fixture output', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-22T00:00:00.000Z'));
    const dependencies = createDependencies();

    const result = await compactConversationContext(
      {
        conversationId: 'conversation-1',
        workspace: '/workspace',
        trigger: 'handoff',
        targetTurnId: 'turn-4',
      },
      dependencies
    );

    expect(result.snapshot).toEqual(snapshot);
    expect(result.throughTurnId).toBe('turn-4');
    expect(result.markdown).toMatchInlineSnapshot(`
      "# Conversation Context

      - Conversation: Context work
      - Conversation ID: conversation-1
      - Exported At: 2026-07-22T00:00:00.000Z

      ## Goal

      - Ship LLM-first context management.

      ## Current State

      - Structured compaction is wired.

      ## Important Decisions

      - Pins are immutable.

      ## Files / Artifacts

      - /workspace/Context.md

      ## Assistant Setup

      - Conversation type: aionrs
      - Model: model-1

      ## Pinned Context

      - Reporting unit: Use VND millions.

      ## User Preferences

      - Keep the UI compact.

      ## Open Questions


      ## Next Step

      - Verify the handoff.

      ## Do Not Forget

      - Keep transcript export unchanged."
    `);
  });

  it('continues to read snapshots created before app operations metadata existed', async () => {
    const dependencies = createDependencies();
    dependencies.getConversation = vi.fn(async () => ({
      ...conversation,
      extra: {
        ...conversation.extra,
        context_handoff: {
          ...conversation.extra.context_handoff,
          snapshot,
          last_compacted_turn_id: 'turn-3',
        },
      },
    }));

    await compactConversationContext(
      {
        conversationId: 'conversation-1',
        workspace: '/workspace',
        trigger: 'auto',
        targetTurnId: 'turn-4',
      },
      dependencies
    );

    expect(dependencies.compactWithAppOperations).toHaveBeenCalledWith(
      expect.objectContaining({
        previous_snapshot: snapshot,
        last_compacted_turn_id: 'turn-3',
      })
    );
  });

  it('reports metadata failure after the file write without claiming a committed revision', async () => {
    const dependencies = createDependencies();
    dependencies.updateConversation = vi
      .fn<(input: TestDependencies['updates'][number]) => Promise<boolean>>()
      .mockImplementation(async (input) => {
        dependencies.updates.push(input);
        return dependencies.updates.length === 1;
      });

    await expect(
      compactConversationContext(
        {
          conversationId: 'conversation-1',
          workspace: '/workspace',
          trigger: 'manual',
          targetTurnId: 'turn-4',
        },
        dependencies
      )
    ).rejects.toMatchObject({ code: 'metadata_write_failed' });

    expect(dependencies.writeFile).toHaveBeenCalledOnce();
    expect(dependencies.emitRefresh).not.toHaveBeenCalled();
  });
});

describe('automatic context compaction policy', () => {
  it('accepts only explicit successful completion with meaningful assistant text', () => {
    expect(isMeaningfulContextTurn(completedTurn())).toBe(true);
    expect(isMeaningfulContextTurn(completedTurn({ state: 'error' }))).toBe(false);
    expect(
      isMeaningfulContextTurn(completedTurn({ last_message: { ...completedTurn().last_message, content: '' } }))
    ).toBe(false);
    expect(
      isMeaningfulContextTurn(completedTurn({ last_message: { ...completedTurn().last_message, type: 'tool' } }))
    ).toBe(false);
    expect(
      isMeaningfulContextTurn(
        completedTurn({
          last_message: {
            content: null,
            created_at: 100,
          },
        })
      )
    ).toBe(false);
    expect(isMeaningfulContextTurn(sparseCompletedTurn('turn-sparse'))).toBe(false);
  });

  it('waits below the automatic turn threshold with or without existing context', () => {
    expect(
      shouldAutoCompactContext({
        hasContext: false,
        turnsSinceCompaction: 7,
        previousBudgetStatus: 'healthy',
        nextBudgetStatus: 'healthy',
      })
    ).toBe(false);
    expect(
      shouldAutoCompactContext({
        hasContext: true,
        turnsSinceCompaction: 7,
        previousBudgetStatus: 'healthy',
        nextBudgetStatus: 'healthy',
      })
    ).toBe(false);
  });

  it('compacts on the eighth meaningful completed turn', () => {
    expect(
      shouldAutoCompactContext({
        hasContext: false,
        turnsSinceCompaction: 8,
        previousBudgetStatus: 'healthy',
        nextBudgetStatus: 'healthy',
      })
    ).toBe(true);
  });

  it('compacts below the turn threshold when the context budget escalates', () => {
    expect(
      shouldAutoCompactContext({
        hasContext: true,
        turnsSinceCompaction: 1,
        previousBudgetStatus: 'healthy',
        nextBudgetStatus: 'watch',
      })
    ).toBe(true);
  });

  it('waits below the turn threshold when the context budget remains unchanged', () => {
    expect(
      shouldAutoCompactContext({
        hasContext: true,
        turnsSinceCompaction: 1,
        previousBudgetStatus: 'watch',
        nextBudgetStatus: 'watch',
      })
    ).toBe(false);
  });

  it('persists the seventh completed turn without starting compaction', async () => {
    let listener: ((event: IConversationTurnCompletedEvent) => void) | undefined;
    const thresholdConversation: Extract<TChatConversation, { type: 'aionrs' }> = {
      ...conversation,
      extra: {
        ...conversation.extra,
        context_handoff: {
          ...conversation.extra.context_handoff,
          turns_since_compaction: 6,
        },
      },
    };
    const updateConversation = vi.fn(async () => true);
    const runCompaction = vi.fn();
    const dependencies = {
      subscribeTurnCompleted: vi.fn((next: (event: IConversationTurnCompletedEvent) => void) => {
        listener = next;
        return vi.fn();
      }),
      getConversation: vi.fn(async () => thresholdConversation),
      updateConversation,
      runCompaction,
      cancelAppOperation: vi.fn(async () => {}),
      now: () => 100,
    };

    renderHook(() =>
      useContextCompaction({
        conversationId: 'conversation-1',
        workspace: '/workspace',
        enabled: true,
        dependencies,
      })
    );

    act(() => listener?.(completedTurn()));

    await waitFor(() =>
      expect(updateConversation).toHaveBeenCalledWith({
        id: 'conversation-1',
        updates: {
          extra: {
            context_handoff: expect.objectContaining({
              status: 'stale',
              turns_since_compaction: 7,
            }),
          },
        },
        merge_extra: true,
      })
    );
    expect(runCompaction).not.toHaveBeenCalled();
  });

  it.each([undefined, 'left'] as const)(
    'starts invisible compaction for correlated assistant text with position %s',
    async (position) => {
      let completedListener: ((event: IConversationTurnCompletedEvent) => void) | undefined;
      let responseListener: ((event: IResponseMessage) => void) | undefined;
      const thresholdConversation: Extract<TChatConversation, { type: 'aionrs' }> = {
        ...conversation,
        extra: {
          ...conversation.extra,
          context_handoff: {
            ...conversation.extra.context_handoff,
            turns_since_compaction: 7,
          },
        },
      };
      const runCompaction = vi.fn(async () => ({
        fileName: 'Context.md',
        filePath: '/workspace/Context.md',
        markdown: '# Context',
        snapshot,
        source: 'llm' as const,
        throughTurnId: 'turn-1',
      }));
      const dependencies = {
        subscribeTurnCompleted: vi.fn((next: (event: IConversationTurnCompletedEvent) => void) => {
          completedListener = next;
          return vi.fn();
        }),
        subscribeResponseStream: vi.fn((next: (event: IResponseMessage) => void) => {
          responseListener = next;
          return vi.fn();
        }),
        getConversation: vi.fn(async () => thresholdConversation),
        updateConversation: vi.fn(async () => true),
        runCompaction,
        cancelAppOperation: vi.fn(async () => {}),
        now: () => 100,
      };

      renderHook(() =>
        useContextCompaction({
          conversationId: 'conversation-1',
          workspace: '/workspace',
          enabled: true,
          dependencies,
        })
      );

      act(() => {
        responseListener?.(responseMessage('turn-1', position ? { position } : {}));
        responseListener?.(responseMessage('turn-1', { type: 'finish', data: {} }));
        completedListener?.(sparseCompletedTurn('turn-1', { state: 'ai_waiting_input' }));
      });

      await waitFor(() =>
        expect(runCompaction).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'auto', targetTurnId: 'turn-1' }))
      );
    }
  );

  it.each([
    {
      label: 'explicit user position',
      content: responseMessage('turn-rejected', { position: 'right' }),
      finish: responseMessage('turn-rejected', { type: 'finish', data: {} }),
      completion: sparseCompletedTurn('turn-rejected', { state: 'ai_waiting_input' }),
    },
    {
      label: 'explicit center position',
      content: responseMessage('turn-rejected', { position: 'center' }),
      finish: responseMessage('turn-rejected', { type: 'finish', data: {} }),
      completion: sparseCompletedTurn('turn-rejected', { state: 'ai_waiting_input' }),
    },
    {
      label: 'explicit pop position',
      content: responseMessage('turn-rejected', { position: 'pop' }),
      finish: responseMessage('turn-rejected', { type: 'finish', data: {} }),
      completion: sparseCompletedTurn('turn-rejected', { state: 'ai_waiting_input' }),
    },
    {
      label: 'mismatched conversation',
      content: responseMessage('turn-rejected', { conversation_id: 'conversation-other', position: 'left' }),
      finish: responseMessage('turn-rejected', {
        conversation_id: 'conversation-other',
        type: 'finish',
        data: {},
      }),
      completion: sparseCompletedTurn('turn-rejected', { state: 'ai_waiting_input' }),
    },
    {
      label: 'mismatched turn',
      content: responseMessage('turn-other', { position: 'left' }),
      finish: responseMessage('turn-other', { type: 'finish', data: {} }),
      completion: sparseCompletedTurn('turn-rejected', { state: 'ai_waiting_input' }),
    },
    {
      label: 'enriched error state',
      content: responseMessage('turn-rejected', { position: 'left' }),
      finish: responseMessage('turn-rejected', { type: 'finish', data: {} }),
      completion: sparseCompletedTurn('turn-rejected', { state: 'error' }),
    },
    {
      label: 'enriched stopped state',
      content: responseMessage('turn-rejected', { position: 'left' }),
      finish: responseMessage('turn-rejected', { type: 'finish', data: {} }),
      completion: sparseCompletedTurn('turn-rejected', { state: 'stopped' }),
    },
    {
      label: 'sparse legacy completion',
      content: responseMessage('turn-rejected', { position: 'left' }),
      finish: responseMessage('turn-rejected', { type: 'finish', data: {} }),
      completion: sparseCompletedTurn('turn-rejected'),
    },
  ])('does not count $label', async ({ content, finish, completion }) => {
    let completedListener: ((event: IConversationTurnCompletedEvent) => void) | undefined;
    let responseListener: ((event: IResponseMessage) => void) | undefined;
    const thresholdConversation: Extract<TChatConversation, { type: 'aionrs' }> = {
      ...conversation,
      extra: {
        ...conversation.extra,
        context_handoff: {
          ...conversation.extra.context_handoff,
          turns_since_compaction: 7,
        },
      },
    };
    const getConversation = vi.fn(async () => thresholdConversation);
    const updateConversation = vi.fn(async () => true);
    const runCompaction = vi.fn();
    const dependencies = {
      subscribeTurnCompleted: vi.fn((next: (event: IConversationTurnCompletedEvent) => void) => {
        completedListener = next;
        return vi.fn();
      }),
      subscribeResponseStream: vi.fn((next: (event: IResponseMessage) => void) => {
        responseListener = next;
        return vi.fn();
      }),
      getConversation,
      updateConversation,
      runCompaction,
      cancelAppOperation: vi.fn(async () => {}),
      now: () => 100,
    };

    renderHook(() =>
      useContextCompaction({
        conversationId: 'conversation-1',
        workspace: '/workspace',
        enabled: true,
        dependencies,
      })
    );
    await waitFor(() => expect(getConversation).toHaveBeenCalledOnce());

    act(() => {
      responseListener?.(content);
      responseListener?.(finish);
      completedListener?.(completion);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getConversation).toHaveBeenCalledOnce();
    expect(updateConversation).not.toHaveBeenCalled();
    expect(runCompaction).not.toHaveBeenCalled();
  });

  it('does not count an exact sparse failed turn after an error message stream event', async () => {
    let completedListener: ((event: IConversationTurnCompletedEvent) => void) | undefined;
    let responseListener: ((event: IResponseMessage) => void) | undefined;
    const getConversation = vi.fn(async () => conversation);
    const updateConversation = vi.fn(async () => true);
    const runCompaction = vi.fn();
    const dependencies = {
      subscribeTurnCompleted: vi.fn((next: (event: IConversationTurnCompletedEvent) => void) => {
        completedListener = next;
        return vi.fn();
      }),
      subscribeResponseStream: vi.fn((next: (event: IResponseMessage) => void) => {
        responseListener = next;
        return vi.fn();
      }),
      getConversation,
      updateConversation,
      runCompaction,
      cancelAppOperation: vi.fn(async () => {}),
      now: () => 100,
    };

    renderHook(() =>
      useContextCompaction({
        conversationId: 'conversation-1',
        workspace: '/workspace',
        enabled: true,
        dependencies,
      })
    );
    await waitFor(() => expect(getConversation).toHaveBeenCalledOnce());

    act(() => {
      responseListener?.(
        responseMessage('turn-failed', {
          type: 'tips',
          data: { code: 'WORKSPACE_PATH_RUNTIME_UNAVAILABLE' },
          status: 'error',
        })
      );
      completedListener?.(sparseCompletedTurn('turn-failed'));
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(getConversation).toHaveBeenCalledOnce();
    expect(updateConversation).not.toHaveBeenCalled();
    expect(runCompaction).not.toHaveBeenCalled();
  });

  it('does not count an enriched sparse tool-only turn', async () => {
    let completedListener: ((event: IConversationTurnCompletedEvent) => void) | undefined;
    let responseListener: ((event: IResponseMessage) => void) | undefined;
    const getConversation = vi.fn(async () => conversation);
    const updateConversation = vi.fn(async () => true);
    const dependencies = {
      subscribeTurnCompleted: vi.fn((next: (event: IConversationTurnCompletedEvent) => void) => {
        completedListener = next;
        return vi.fn();
      }),
      subscribeResponseStream: vi.fn((next: (event: IResponseMessage) => void) => {
        responseListener = next;
        return vi.fn();
      }),
      getConversation,
      updateConversation,
      runCompaction: vi.fn(),
      cancelAppOperation: vi.fn(async () => {}),
      now: () => 100,
    };

    renderHook(() =>
      useContextCompaction({
        conversationId: 'conversation-1',
        workspace: '/workspace',
        enabled: true,
        dependencies,
      })
    );
    await waitFor(() => expect(getConversation).toHaveBeenCalledOnce());

    act(() => {
      responseListener?.(responseMessage('turn-tool', { type: 'tool_call', data: { status: 'finished' } }));
      responseListener?.(responseMessage('turn-tool', { type: 'finish', data: {} }));
      completedListener?.(sparseCompletedTurn('turn-tool', { state: 'ai_waiting_input' }));
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(getConversation).toHaveBeenCalledOnce();
    expect(updateConversation).not.toHaveBeenCalled();
  });

  it('derives the runtime budget status from the per-model window when no context limit is stored', async () => {
    let listener: ((event: IConversationTurnCompletedEvent) => void) | undefined;
    const runCompaction = vi.fn(async () => ({
      fileName: 'Context.md',
      filePath: '/workspace/Context.md',
      markdown: '# Context',
      snapshot,
      source: 'llm' as const,
      throughTurnId: 'turn-1',
    }));
    const budgetConversation: Extract<TChatConversation, { type: 'aionrs' }> = {
      ...conversation,
      model: { ...conversation.model, use_model: 'minimax-m2.5' },
      extra: {
        ...conversation.extra,
        // No last_context_limit — aionrs conversations never receive one.
        last_token_usage: { total_tokens: 180_000 },
        context_handoff: {
          ...conversation.extra.context_handoff,
          snapshot,
        },
      },
    };
    const dependencies = {
      subscribeTurnCompleted: vi.fn((next: (event: IConversationTurnCompletedEvent) => void) => {
        listener = next;
        return vi.fn();
      }),
      getConversation: vi.fn(async () => budgetConversation),
      updateConversation: vi.fn(async () => true),
      runCompaction,
      cancelAppOperation: vi.fn(async () => {}),
      now: () => 100,
    };

    renderHook(() =>
      useContextCompaction({
        conversationId: 'conversation-1',
        workspace: '/workspace',
        enabled: true,
        dependencies,
      })
    );

    act(() => listener?.(completedTurn()));

    await waitFor(() =>
      expect(runCompaction).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'auto', budgetStatus: 'compress' }))
    );
  });

  it('marks an interrupted compaction as pending when the hook mounts', async () => {
    const updateConversation = vi.fn(async () => true);
    const interruptedConversation: Extract<TChatConversation, { type: 'aionrs' }> = {
      ...conversation,
      extra: {
        ...conversation.extra,
        context_handoff: {
          ...conversation.extra.context_handoff,
          source: 'llm',
          status: 'updating',
          turns_since_compaction: 1,
        },
      },
    };
    const dependencies = {
      subscribeTurnCompleted: vi.fn(() => vi.fn()),
      getConversation: vi.fn(async () => interruptedConversation),
      updateConversation,
      runCompaction: vi.fn(),
      cancelAppOperation: vi.fn(async () => {}),
      now: () => 200,
    };

    renderHook(() =>
      useContextCompaction({
        conversationId: 'conversation-1',
        workspace: '/workspace',
        enabled: true,
        dependencies,
      })
    );

    await waitFor(() =>
      expect(updateConversation).toHaveBeenCalledWith({
        id: 'conversation-1',
        updates: {
          extra: {
            context_handoff: expect.objectContaining({
              source: 'llm',
              status: 'stale',
              turns_since_compaction: 1,
              last_error_code: 'interrupted',
            }),
          },
        },
        merge_extra: true,
      })
    );
  });

  it('ignores failed and tool-only completion events', async () => {
    let listener: ((event: IConversationTurnCompletedEvent) => void) | undefined;
    const runCompaction = vi.fn();
    const dependencies = {
      subscribeTurnCompleted: vi.fn((next: (event: IConversationTurnCompletedEvent) => void) => {
        listener = next;
        return vi.fn();
      }),
      getConversation: vi.fn(async () => conversation),
      updateConversation: vi.fn(async () => true),
      runCompaction,
      cancelAppOperation: vi.fn(async () => {}),
      now: () => 100,
    };

    renderHook(() =>
      useContextCompaction({
        conversationId: 'conversation-1',
        workspace: '/workspace',
        enabled: true,
        dependencies,
      })
    );

    act(() => {
      listener?.(completedTurn({ state: 'error' }));
      listener?.(completedTurn({ last_message: { ...completedTurn().last_message, type: 'tool' } }));
    });

    await Promise.resolve();
    expect(runCompaction).not.toHaveBeenCalled();
  });

  it('preserves every completion in an asynchronous burst and compacts through the latest turn', async () => {
    let completedListener: ((event: IConversationTurnCompletedEvent) => void) | undefined;
    let resolveFirstTurn: ((value: TChatConversation | null) => void) | undefined;
    const firstTurnRead = new Promise<TChatConversation | null>((resolve) => {
      resolveFirstTurn = resolve;
    });
    const sixTurnConversation: Extract<TChatConversation, { type: 'aionrs' }> = {
      ...conversation,
      extra: {
        ...conversation.extra,
        context_handoff: {
          ...conversation.extra.context_handoff,
          turns_since_compaction: 6,
        },
      },
    };
    const fiveTurnConversation: Extract<TChatConversation, { type: 'aionrs' }> = {
      ...sixTurnConversation,
      extra: {
        ...sixTurnConversation.extra,
        context_handoff: {
          ...sixTurnConversation.extra.context_handoff,
          turns_since_compaction: 5,
        },
      },
    };
    const getConversation = vi
      .fn<(conversationId: string) => Promise<TChatConversation | null>>()
      .mockResolvedValueOnce(fiveTurnConversation)
      .mockImplementationOnce(() => firstTurnRead)
      .mockResolvedValue(sixTurnConversation);
    const updateConversation = vi.fn(async () => true);
    const runCompaction = vi.fn(async () => ({
      fileName: 'Context.md',
      filePath: '/workspace/Context.md',
      markdown: '# Context',
      snapshot,
      source: 'llm' as const,
      throughTurnId: 'turn-3',
    }));
    const dependencies = {
      subscribeTurnCompleted: vi.fn((next: (event: IConversationTurnCompletedEvent) => void) => {
        completedListener = next;
        return vi.fn();
      }),
      getConversation,
      updateConversation,
      runCompaction,
      cancelAppOperation: vi.fn(async () => {}),
      now: () => 100,
    };

    renderHook(() =>
      useContextCompaction({
        conversationId: 'conversation-1',
        workspace: '/workspace',
        enabled: true,
        dependencies,
      })
    );
    await waitFor(() => expect(getConversation).toHaveBeenCalledOnce());

    act(() => completedListener?.(completedTurn({ turn_id: 'turn-1' })));
    await waitFor(() => expect(getConversation).toHaveBeenCalledTimes(2));
    act(() => {
      completedListener?.(completedTurn({ turn_id: 'turn-2' }));
      completedListener?.(completedTurn({ turn_id: 'turn-3' }));
    });
    resolveFirstTurn?.(fiveTurnConversation);

    await waitFor(() =>
      expect(updateConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          updates: {
            extra: {
              context_handoff: expect.objectContaining({ turns_since_compaction: 6 }),
            },
          },
        })
      )
    );
    await waitFor(() =>
      expect(runCompaction).toHaveBeenCalledWith(
        expect.objectContaining({
          trigger: 'auto',
          targetTurnId: 'turn-3',
          turnsSinceCompaction: 8,
        })
      )
    );
    expect(updateConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        updates: {
          extra: {
            context_handoff: expect.objectContaining({
              status: 'stale',
              turns_since_compaction: 8,
            }),
          },
        },
      })
    );
    expect(getConversation).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['cancellation before updating', new ContextCompactionCanceledError()],
    ['Context.md write failure', new ContextCompactionOperationError('file_write_failed')],
    ['metadata write failure', new ContextCompactionOperationError('metadata_write_failed')],
  ])('retains a threshold-crossing burst after %s', async (_label, failure) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    let completedListener: ((event: IConversationTurnCompletedEvent) => void) | undefined;
    let resolveFirstTurn: ((value: TChatConversation | null) => void) | undefined;
    const firstTurnRead = new Promise<TChatConversation | null>((resolve) => {
      resolveFirstTurn = resolve;
    });
    const fiveTurnConversation: Extract<TChatConversation, { type: 'aionrs' }> = {
      ...conversation,
      extra: {
        ...conversation.extra,
        context_handoff: {
          ...conversation.extra.context_handoff,
          turns_since_compaction: 5,
        },
      },
    };
    const sixTurnConversation: Extract<TChatConversation, { type: 'aionrs' }> = {
      ...fiveTurnConversation,
      extra: {
        ...fiveTurnConversation.extra,
        context_handoff: {
          ...fiveTurnConversation.extra.context_handoff,
          turns_since_compaction: 6,
        },
      },
    };
    const getConversation = vi
      .fn<(conversationId: string) => Promise<TChatConversation | null>>()
      .mockResolvedValueOnce(fiveTurnConversation)
      .mockImplementationOnce(() => firstTurnRead)
      .mockResolvedValue(sixTurnConversation);
    const updateConversation = vi.fn(async () => true);
    const runCompaction = vi.fn(async () => Promise.reject(failure));
    const dependencies = {
      subscribeTurnCompleted: vi.fn((next: (event: IConversationTurnCompletedEvent) => void) => {
        completedListener = next;
        return vi.fn();
      }),
      getConversation,
      updateConversation,
      runCompaction,
      cancelAppOperation: vi.fn(async () => {}),
      now: () => 100,
    };

    renderHook(() =>
      useContextCompaction({
        conversationId: 'conversation-1',
        workspace: '/workspace',
        enabled: true,
        dependencies,
      })
    );
    await waitFor(() => expect(getConversation).toHaveBeenCalledOnce());

    act(() => completedListener?.(completedTurn({ turn_id: 'turn-1' })));
    await waitFor(() => expect(getConversation).toHaveBeenCalledTimes(2));
    act(() => {
      completedListener?.(completedTurn({ turn_id: 'turn-2' }));
      completedListener?.(completedTurn({ turn_id: 'turn-3' }));
    });
    resolveFirstTurn?.(fiveTurnConversation);

    await waitFor(() =>
      expect(runCompaction).toHaveBeenCalledWith(
        expect.objectContaining({
          trigger: 'auto',
          targetTurnId: 'turn-3',
          turnsSinceCompaction: 8,
        })
      )
    );
    expect(updateConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        updates: {
          extra: {
            context_handoff: expect.objectContaining({
              status: 'stale',
              turns_since_compaction: 8,
            }),
          },
        },
      })
    );
  });

  it.each([
    ['returns false', async () => false],
    ['rejects', async () => Promise.reject(new Error('metadata unavailable'))],
  ])('retains a failed threshold batch when count persistence %s', async (_label, failPersistence) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    let completedListener: ((event: IConversationTurnCompletedEvent) => void) | undefined;
    const thresholdConversation: Extract<TChatConversation, { type: 'aionrs' }> = {
      ...conversation,
      extra: {
        ...conversation.extra,
        context_handoff: {
          ...conversation.extra.context_handoff,
          turns_since_compaction: 7,
        },
      },
    };
    const updateConversation = vi
      .fn<(input: TestDependencies['updates'][number]) => Promise<boolean>>()
      .mockImplementationOnce(failPersistence)
      .mockResolvedValue(true);
    const runCompaction = vi.fn(async () => ({
      fileName: 'Context.md',
      filePath: '/workspace/Context.md',
      markdown: '# Context',
      snapshot,
      source: 'llm' as const,
      throughTurnId: 'turn-9',
    }));
    const dependencies = {
      subscribeTurnCompleted: vi.fn((next: (event: IConversationTurnCompletedEvent) => void) => {
        completedListener = next;
        return vi.fn();
      }),
      getConversation: vi.fn(async () => thresholdConversation),
      updateConversation,
      runCompaction,
      cancelAppOperation: vi.fn(async () => {}),
      now: () => 100,
    };

    renderHook(() =>
      useContextCompaction({
        conversationId: 'conversation-1',
        workspace: '/workspace',
        enabled: true,
        dependencies,
      })
    );
    await waitFor(() => expect(dependencies.getConversation).toHaveBeenCalledOnce());

    act(() => completedListener?.(completedTurn({ turn_id: 'turn-8' })));
    await waitFor(() => expect(updateConversation).toHaveBeenCalledOnce());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => completedListener?.(completedTurn({ turn_id: 'turn-9' })));

    await waitFor(() =>
      expect(updateConversation).toHaveBeenLastCalledWith(
        expect.objectContaining({
          updates: {
            extra: {
              context_handoff: expect.objectContaining({
                status: 'stale',
                turns_since_compaction: 9,
              }),
            },
          },
        })
      )
    );
    await waitFor(() =>
      expect(runCompaction).toHaveBeenCalledWith(
        expect.objectContaining({
          trigger: 'auto',
          targetTurnId: 'turn-9',
          turnsSinceCompaction: 9,
        })
      )
    );
  });

  it.each(['manual', 'handoff'] as const)(
    'serializes a threshold turn behind an in-flight %s compaction during disposal',
    async (trigger) => {
      let completedListener: ((event: IConversationTurnCompletedEvent) => void) | undefined;
      let resolveBroker: ((value: AppOperationResult<AppOperationsContextCompactOutput>) => void) | undefined;
      let resolveThresholdUpdate: (() => void) | undefined;
      let resolveManualCommit: (() => void) | undefined;
      let resolveManualCommitStarted: (() => void) | undefined;
      const manualCommitStarted = new Promise<void>((resolve) => {
        resolveManualCommitStarted = resolve;
      });
      let storedConversation: Extract<TChatConversation, { type: 'aionrs' }> = {
        ...conversation,
        extra: {
          ...conversation.extra,
          context_handoff: {
            ...conversation.extra.context_handoff,
            turns_since_compaction: 7,
          },
        },
      };
      let activeMetadataWrites = 0;
      let maxConcurrentMetadataWrites = 0;

      const applyUpdate = (input: TestDependencies['updates'][number]): void => {
        const contextHandoff = input.updates.extra?.context_handoff;
        if (!contextHandoff) return;
        storedConversation = {
          ...storedConversation,
          extra: {
            ...storedConversation.extra,
            context_handoff: contextHandoff,
          },
        };
      };
      const updateConversation = vi.fn(async (input: TestDependencies['updates'][number]): Promise<boolean> => {
        const contextHandoff = input.updates.extra?.context_handoff;
        activeMetadataWrites += 1;
        maxConcurrentMetadataWrites = Math.max(maxConcurrentMetadataWrites, activeMetadataWrites);
        const finish = (): boolean => {
          applyUpdate(input);
          activeMetadataWrites -= 1;
          return true;
        };

        if (contextHandoff?.status === 'stale' && contextHandoff.turns_since_compaction === 8) {
          return new Promise<boolean>((resolve) => {
            resolveThresholdUpdate = () => resolve(finish());
          });
        }
        if (contextHandoff?.status === 'fresh' && contextHandoff.turns_since_compaction === 0) {
          resolveManualCommitStarted?.();
          return new Promise<boolean>((resolve) => {
            resolveManualCommit = () => resolve(finish());
          });
        }
        return finish();
      });
      const compactionDependencies = createDependencies();
      compactionDependencies.getConversation = vi.fn(async () => storedConversation);
      compactionDependencies.updateConversation = updateConversation;
      compactionDependencies.compactWithAppOperations = vi.fn(
        () =>
          new Promise((resolve) => {
            resolveBroker = resolve;
          })
      );
      const runCompaction = vi.fn((input) => compactConversationContext(input, compactionDependencies));
      const getConversation = vi.fn(async () => storedConversation);
      const dependencies = {
        subscribeTurnCompleted: vi.fn((next: (event: IConversationTurnCompletedEvent) => void) => {
          completedListener = next;
          return vi.fn();
        }),
        getConversation,
        updateConversation,
        runCompaction,
        cancelAppOperation: vi.fn(async () => {}),
        now: () => 100,
      };
      const { result, unmount } = renderHook(() =>
        useContextCompaction({
          conversationId: 'conversation-1',
          workspace: '/workspace',
          enabled: true,
          dependencies,
        })
      );
      await waitFor(() => expect(getConversation).toHaveBeenCalledOnce());

      let compactionPromise: Promise<CompactConversationContextResult | null> | undefined;
      act(() => {
        compactionPromise = result.current.compact(trigger);
      });
      const compactionOutcome = compactionPromise?.then(
        (value) => value,
        (error: unknown) => error
      );
      await waitFor(() => expect(compactionDependencies.compactWithAppOperations).toHaveBeenCalledOnce());

      act(() => completedListener?.(completedTurn({ turn_id: 'turn-8' })));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      resolveBroker?.(compactSuccess({ snapshot, through_turn_id: 'turn-before-threshold' }));
      await manualCommitStarted;
      unmount();

      resolveThresholdUpdate?.();
      await Promise.resolve();
      resolveManualCommit?.();

      expect(await compactionOutcome).toBeInstanceOf(ContextCompactionCanceledError);
      await waitFor(() => expect(storedConversation.extra.context_handoff?.turns_since_compaction).toBe(1));
      expect(maxConcurrentMetadataWrites).toBe(1);
      expect(runCompaction).toHaveBeenCalledOnce();
    }
  );

  it('persists a pending threshold batch when disposal happens before the updating transition', async () => {
    let completedListener: ((event: IConversationTurnCompletedEvent) => void) | undefined;
    let resolveFirstTurn: ((value: TChatConversation | null) => void) | undefined;
    const firstTurnRead = new Promise<TChatConversation | null>((resolve) => {
      resolveFirstTurn = resolve;
    });
    const fiveTurnConversation: Extract<TChatConversation, { type: 'aionrs' }> = {
      ...conversation,
      extra: {
        ...conversation.extra,
        context_handoff: {
          ...conversation.extra.context_handoff,
          turns_since_compaction: 5,
        },
      },
    };
    const sixTurnConversation: Extract<TChatConversation, { type: 'aionrs' }> = {
      ...fiveTurnConversation,
      extra: {
        ...fiveTurnConversation.extra,
        context_handoff: {
          ...fiveTurnConversation.extra.context_handoff,
          turns_since_compaction: 6,
        },
      },
    };
    const getConversation = vi
      .fn<(conversationId: string) => Promise<TChatConversation | null>>()
      .mockResolvedValueOnce(fiveTurnConversation)
      .mockImplementationOnce(() => firstTurnRead)
      .mockResolvedValue(sixTurnConversation);
    const updateConversation = vi.fn(async () => true);
    const runCompaction = vi.fn();
    const dependencies = {
      subscribeTurnCompleted: vi.fn((next: (event: IConversationTurnCompletedEvent) => void) => {
        completedListener = next;
        return vi.fn();
      }),
      getConversation,
      updateConversation,
      runCompaction,
      cancelAppOperation: vi.fn(async () => {}),
      now: () => 100,
    };
    const { unmount } = renderHook(() =>
      useContextCompaction({
        conversationId: 'conversation-1',
        workspace: '/workspace',
        enabled: true,
        dependencies,
      })
    );
    await waitFor(() => expect(getConversation).toHaveBeenCalledOnce());

    act(() => completedListener?.(completedTurn({ turn_id: 'turn-1' })));
    await waitFor(() => expect(getConversation).toHaveBeenCalledTimes(2));
    act(() => {
      completedListener?.(completedTurn({ turn_id: 'turn-2' }));
      completedListener?.(completedTurn({ turn_id: 'turn-3' }));
    });
    unmount();
    resolveFirstTurn?.(fiveTurnConversation);

    await waitFor(() =>
      expect(updateConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          updates: {
            extra: {
              context_handoff: expect.objectContaining({
                status: 'stale',
                turns_since_compaction: 8,
              }),
            },
          },
        })
      )
    );
    expect(runCompaction).not.toHaveBeenCalled();
  });

  it('coalesces requests received during a compaction into one follow-up run', async () => {
    let resolveFirst: ((result: CompactConversationContextResult) => void) | undefined;
    const firstResult: CompactConversationContextResult = {
      fileName: 'Context.md',
      filePath: '/workspace/Context.md',
      markdown: '# First',
      snapshot,
      source: 'llm',
      throughTurnId: 'turn-1',
    };
    const secondResult: CompactConversationContextResult = {
      ...firstResult,
      markdown: '# Second',
      throughTurnId: 'turn-2',
    };
    const runCompaction = vi
      .fn<(input: { trigger: string }) => Promise<CompactConversationContextResult>>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          })
      )
      .mockResolvedValueOnce(secondResult);
    const dependencies = {
      subscribeTurnCompleted: vi.fn(() => vi.fn()),
      getConversation: vi.fn(async () => conversation),
      updateConversation: vi.fn(async () => true),
      runCompaction,
      cancelAppOperation: vi.fn(async () => {}),
      now: () => 100,
    };
    const { result } = renderHook(() =>
      useContextCompaction({
        conversationId: 'conversation-1',
        workspace: '/workspace',
        dependencies,
      })
    );

    let firstPromise: Promise<CompactConversationContextResult | null> | undefined;
    act(() => {
      firstPromise = result.current.compact('manual');
      void result.current.compact('handoff', 'turn-2');
    });
    expect(runCompaction).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst?.(firstResult);
      await firstPromise;
    });

    expect(runCompaction).toHaveBeenCalledTimes(2);
    expect(runCompaction).toHaveBeenLastCalledWith(
      expect.objectContaining({ trigger: 'handoff', targetTurnId: 'turn-2' })
    );
  });

  it('stops before broker registration when unmounted during preliminary loading', async () => {
    let resolveConversation: ((value: TChatConversation | null) => void) | undefined;
    const compactionDependencies = createDependencies();
    compactionDependencies.getConversation = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveConversation = resolve;
        })
    );
    const runCompaction = vi.fn((input) => compactConversationContext(input, compactionDependencies));
    const cancelAppOperation = vi.fn(async () => {});
    const dependencies = {
      subscribeTurnCompleted: vi.fn(() => vi.fn()),
      getConversation: vi.fn(async () => conversation),
      updateConversation: vi.fn(async () => true),
      runCompaction,
      cancelAppOperation,
      now: () => 100,
    };
    const { result, unmount } = renderHook(() =>
      useContextCompaction({
        conversationId: 'conversation-1',
        workspace: '/workspace',
        enabled: false,
        dependencies,
      })
    );

    let compactPromise: Promise<CompactConversationContextResult | null> | undefined;
    act(() => {
      compactPromise = result.current.compact('manual');
    });
    const operationId = runCompaction.mock.calls[0]?.[0].operationId;
    await waitFor(() => expect(compactionDependencies.getConversation).toHaveBeenCalledOnce());

    unmount();
    resolveConversation?.(conversation);

    await expect(compactPromise).rejects.toBeInstanceOf(ContextCompactionCanceledError);
    expect(cancelAppOperation).toHaveBeenCalledWith(operationId);
    expect(compactionDependencies.compactWithAppOperations).not.toHaveBeenCalled();
    expect(compactionDependencies.writeFile).not.toHaveBeenCalled();
    expect(compactionDependencies.updateConversation).not.toHaveBeenCalled();
  });

  it('stops before Context.md and revision writes when unmounted after broker completion', async () => {
    let resolveBroker: ((value: AppOperationResult<AppOperationsContextCompactOutput>) => void) | undefined;
    const compactionDependencies = createDependencies();
    compactionDependencies.compactWithAppOperations = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveBroker = resolve;
        })
    );
    const runCompaction = vi.fn((input) => compactConversationContext(input, compactionDependencies));
    let signalAtRemoteCancel: AbortSignal | undefined;
    const cancelAppOperation = vi.fn(async () => {
      signalAtRemoteCancel = runCompaction.mock.calls[0]?.[0].signal;
    });
    const dependencies = {
      subscribeTurnCompleted: vi.fn(() => vi.fn()),
      getConversation: vi.fn(async () => conversation),
      updateConversation: vi.fn(async () => true),
      runCompaction,
      cancelAppOperation,
      now: () => 100,
    };
    const { result, unmount } = renderHook(() =>
      useContextCompaction({
        conversationId: 'conversation-1',
        workspace: '/workspace',
        enabled: false,
        dependencies,
      })
    );

    let compactPromise: Promise<CompactConversationContextResult | null> | undefined;
    act(() => {
      compactPromise = result.current.compact('manual');
    });
    await waitFor(() => expect(compactionDependencies.compactWithAppOperations).toHaveBeenCalledOnce());

    unmount();
    resolveBroker?.(compactSuccess());

    await expect(compactPromise).rejects.toBeInstanceOf(ContextCompactionCanceledError);
    expect(cancelAppOperation).toHaveBeenCalledOnce();
    expect(signalAtRemoteCancel?.aborted).toBe(true);
    expect(compactionDependencies.writeFile).not.toHaveBeenCalled();
    expect(compactionDependencies.updates).toHaveLength(1);
    expect(compactionDependencies.updates[0]?.updates.extra).toEqual({
      context_handoff: expect.objectContaining({ status: 'updating' }),
    });
  });

  it('unsubscribes from completed turns on unmount', () => {
    const unsubscribe = vi.fn();
    const dependencies = {
      subscribeTurnCompleted: vi.fn(() => unsubscribe),
      getConversation: vi.fn(async () => conversation),
      updateConversation: vi.fn(async () => true),
      runCompaction: vi.fn(),
      cancelAppOperation: vi.fn(async () => {}),
      now: () => 100,
    };
    const { unmount } = renderHook(() =>
      useContextCompaction({
        conversationId: 'conversation-1',
        workspace: '/workspace',
        dependencies,
      })
    );

    unmount();

    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});

describe('native context actions', () => {
  it('persists a user-owned pin before compacting the context', async () => {
    const updateConversation = vi.fn(async () => true);
    const compactContext = vi.fn(async () => ({
      fileName: 'Context.md',
      filePath: '/workspace/Context.md',
      markdown: '# Context',
      snapshot,
      source: 'llm' as const,
      throughTurnId: 'turn-4',
    }));

    const result = await pinConversationContext(
      {
        conversationId: 'conversation-1',
        workspace: '/workspace',
        text: 'Keep accessibility checks in the acceptance criteria.',
      },
      {
        getConversation: vi.fn(async () => conversation),
        updateConversation,
        compactContext,
        createId: () => 'pin-2',
        now: () => 200,
      }
    );

    expect(updateConversation).toHaveBeenCalledWith({
      id: 'conversation-1',
      updates: {
        extra: {
          context_handoff: expect.objectContaining({
            pinned_context: expect.arrayContaining([
              expect.objectContaining({
                id: 'pin-2',
                content: 'Keep accessibility checks in the acceptance criteria.',
                source: 'manual',
              }),
            ]),
          }),
        },
      },
      merge_extra: true,
    });
    expect(compactContext).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      workspace: '/workspace',
      trigger: 'manual',
    });
    expect(result.pin.id).toBe('pin-2');
  });

  it('compacts stale context, rereads the edited file, and creates a clean continuation', async () => {
    const staleConversation: Extract<TChatConversation, { type: 'aionrs' }> = {
      ...conversation,
      status: 'running',
      runtime: {
        state: 'running',
        can_send_message: false,
        has_task: true,
        task_status: 'running',
        is_processing: true,
        pending_confirmations: 0,
        turn_id: 'turn-5',
      },
      assistant: {
        id: 'assistant-1',
        source: 'preset',
        name: 'Forge',
        avatar: '',
        backend: 'aionrs',
      },
      extra: {
        ...conversation.extra,
        skills: ['context-manager'],
        mcp_server_ids: ['mcp-1'],
        mcp_servers: ['Filesystem'],
        last_token_usage: { total_tokens: 12_000 },
        context_handoff: {
          ...conversation.extra.context_handoff,
          context_file_path: '/workspace/Context.md',
          context_file_name: 'Context.md',
          revision: 4,
          status: 'stale',
          source: 'llm',
          last_compacted_turn_id: 'turn-4',
          turns_since_compaction: 1,
          last_error_code: 'provider_timeout',
        },
      },
    };
    const refreshedConversation: Extract<TChatConversation, { type: 'aionrs' }> = {
      ...staleConversation,
      extra: {
        ...staleConversation.extra,
        context_handoff: {
          ...staleConversation.extra.context_handoff,
          status: 'fresh',
          turns_since_compaction: 0,
        },
      },
    };
    const getConversation = vi
      .fn<() => Promise<TChatConversation | null>>()
      .mockResolvedValueOnce(staleConversation)
      .mockResolvedValue(refreshedConversation);
    const compactContext = vi.fn(async () => null);
    const createConversation = vi.fn(async ({ conversation: next }: { conversation: TChatConversation }) => next);

    const result = await handoffConversationContext(
      { conversationId: 'conversation-1', workspace: '/workspace' },
      {
        getConversation,
        compactContext,
        readFile: vi.fn(async () => '# Edited Context\n\nKeep this exact edit.'),
        createConversation,
        createId: () => 'conversation-2',
        now: () => 300,
      }
    );

    expect(compactContext).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      workspace: '/workspace',
      trigger: 'handoff',
    });
    expect(createConversation).toHaveBeenCalledWith({
      conversation: expect.objectContaining({
        id: 'conversation-2',
        assistant: staleConversation.assistant,
        model: staleConversation.model,
        runtime: undefined,
        status: undefined,
        extra: expect.objectContaining({
          workspace: '/workspace',
          skills: ['context-manager'],
          mcp_server_ids: ['mcp-1'],
          context: '# Edited Context\n\nKeep this exact edit.',
          context_file_name: 'Context.md',
          context_handoff: expect.objectContaining({
            pinned_context: staleConversation.extra.context_handoff?.pinned_context,
            source: 'user',
            status: 'fresh',
            turns_since_compaction: 0,
          }),
        }),
      }),
    });
    const nextHandoff = result.conversation.extra.context_handoff;
    expect(nextHandoff).not.toHaveProperty('revision');
    expect(nextHandoff).not.toHaveProperty('last_compacted_turn_id');
    expect(nextHandoff).not.toHaveProperty('last_error_code');
    expect(result.conversation.extra).not.toHaveProperty('last_token_usage');
  });

  it('skips compaction when Context.md is already fresh', async () => {
    const freshConversation: Extract<TChatConversation, { type: 'aionrs' }> = {
      ...conversation,
      extra: {
        ...conversation.extra,
        context_handoff: {
          ...conversation.extra.context_handoff,
          context_file_path: '/workspace/Context.md',
          context_file_name: 'Context.md',
          status: 'fresh',
          turns_since_compaction: 0,
        },
      },
    };
    const compactContext = vi.fn();

    await handoffConversationContext(
      { conversationId: 'conversation-1', workspace: '/workspace' },
      {
        getConversation: vi.fn(async () => freshConversation),
        compactContext,
        readFile: vi.fn(async () => '# Fresh Context'),
        createConversation: vi.fn(async ({ conversation: next }) => next),
        createId: () => 'conversation-2',
        now: () => 300,
      }
    );

    expect(compactContext).not.toHaveBeenCalled();
  });
});
