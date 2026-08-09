import { describe, expect, it, vi } from 'vitest';
import type { TMessage } from '@/common/chat/chatLib';
import type { TChatConversation, TContextHandoffItem } from '@/common/config/storage';
import {
  clearActiveContextBudget,
  contextUsagePercent,
  contextUsageProgressPercent,
  estimateContextBudget,
  formatContextUsagePercent,
  getActiveContextBudget,
  publishActiveContextBudget,
  resolveConversationContextBudgetSnapshot,
  subscribeActiveContextBudget,
} from '@/renderer/pages/conversation/contextHandoff/contextBudget';

const textMessage = (content: string): TMessage => ({
  id: content,
  msg_id: content,
  conversation_id: 'conv-1',
  type: 'text',
  position: 'right',
  content: { content },
});

const tipMessage = (content: string): TMessage => ({
  id: content,
  msg_id: content,
  conversation_id: 'conv-1',
  type: 'tips',
  position: 'center',
  content: { content, type: 'success' },
});

const aionrsConversation = (model: { model?: string; use_model?: string | null }): TChatConversation =>
  ({
    id: 'conv-1',
    name: 'Budget fixture',
    type: 'aionrs',
    created_at: 1,
    modified_at: 1,
    extra: { backend: 'aionrs', workspace: '/tmp/budget-fixture' },
    model: {
      id: 'provider-1',
      name: 'Provider',
      platform: 'openai',
      base_url: '',
      api_key: '',
      ...model,
    },
  }) as TChatConversation;

describe('estimateContextBudget', () => {
  it('groups estimated tokens by context source', () => {
    const pinnedContext: TContextHandoffItem[] = [
      {
        id: 'pin-1',
        title: 'Reporting unit',
        content: 'Use VND millions.',
        source: 'manual',
        created_at: 1,
        updated_at: 1,
      },
    ];

    const snapshot = estimateContextBudget({
      messages: [textMessage('Build the dashboard from data.csv.')],
      pinnedContext,
      contextMarkdown: '# Conversation Context\n\n## Goal\nContinue.',
      contextLimit: 1_000,
    });

    expect(snapshot.buckets.messages.estimatedTokens).toBeGreaterThan(0);
    expect(snapshot.buckets.files.estimatedTokens).toBeGreaterThan(0);
    expect(snapshot.buckets.memory.estimatedTokens).toBeGreaterThan(0);
    expect(snapshot.totalEstimatedTokens).toBe(
      snapshot.buckets.messages.estimatedTokens +
        snapshot.buckets.files.estimatedTokens +
        snapshot.buckets.skills.estimatedTokens +
        snapshot.buckets.memory.estimatedTokens +
        snapshot.buckets.tools.estimatedTokens
    );
  });

  it('uses warning states without blocking send', () => {
    expect(estimateContextBudget({ messages: [textMessage('x'.repeat(2_000))], contextLimit: 1_000 }).status).toBe(
      'compress'
    );
    expect(estimateContextBudget({ messages: [textMessage('x'.repeat(3_600))], contextLimit: 1_000 }).status).toBe(
      'too_large'
    );
  });

  it('does not invent a precise percentage when backend capacity is unknown', () => {
    const snapshot = estimateContextBudget({ messages: [textMessage('Summarize this conversation.')] });

    expect(snapshot.contextLimit).toBeUndefined();
    expect(snapshot.ratio).toBeNull();
  });

  it('uses backend token watermark telemetry as the minimum message usage estimate', () => {
    const snapshot = estimateContextBudget({
      messages: [
        textMessage('Short compact transcript.'),
        tipMessage('Token watermark override: provider=0, local_estimate=19756, using=92412'),
      ],
      contextLimit: 100_000,
    });

    expect(snapshot.totalEstimatedTokens).toBe(92412);
    expect(snapshot.buckets.messages.estimatedTokens).toBe(92412);
    expect(snapshot.status).toBe('too_large');
  });

  it('uses persisted runtime token usage when telemetry tips are filtered from messages', () => {
    const snapshot = estimateContextBudget({
      messages: [textMessage('Short compact transcript.')],
      runtimeTokenUsage: { total_tokens: 42_000 },
      contextLimit: 100_000,
    });

    expect(snapshot.totalEstimatedTokens).toBe(42_000);
    expect(snapshot.buckets.messages.estimatedTokens).toBe(42_000);
    expect(snapshot.status).toBe('watch');
  });

  it('prefers authoritative runtime usage over a larger local estimate', () => {
    const snapshot = resolveConversationContextBudgetSnapshot({
      conversation: aionrsConversation({ use_model: 'gpt-4.1' }),
      messages: [textMessage('x'.repeat(4_000))],
      runtimeTokenUsage: { total_tokens: 400 },
    });

    expect(snapshot.source).toBe('runtime');
    expect(snapshot.totalTokens).toBe(400);
  });

  it('falls back to an explicitly labeled estimate and resolves the raw backend model field', () => {
    const snapshot = resolveConversationContextBudgetSnapshot({
      conversation: aionrsConversation({ model: 'minimax/minimax-m2.5', use_model: null }),
      messages: [textMessage('Summarize this conversation.')],
    });

    expect(snapshot.source).toBe('estimated');
    expect(snapshot.totalTokens).toBeGreaterThan(0);
    expect(snapshot.contextLimit).toBe(204_800);
    expect(snapshot.ratio).toBe(snapshot.totalTokens / 204_800);
  });

  it('keeps an unknown snapshot when neither the conversation nor its model limit is available', () => {
    expect(
      resolveConversationContextBudgetSnapshot({
        conversation: null,
        messages: [],
      })
    ).toEqual({
      source: 'unknown',
      totalTokens: null,
      contextLimit: undefined,
      ratio: null,
      status: 'healthy',
    });
  });
});

describe('active context budget sharing', () => {
  it('shares the latest composer snapshot with sibling conversation surfaces', () => {
    const first = {
      source: 'estimated' as const,
      totalTokens: 20_000,
      contextLimit: 1_000_000,
      ratio: 0.02,
      status: 'healthy' as const,
    };
    const latest = { ...first, totalTokens: 110_000, ratio: 0.11 };
    const listener = vi.fn();
    const unsubscribe = subscribeActiveContextBudget('conv-shared', listener);

    publishActiveContextBudget('conv-shared', first);
    publishActiveContextBudget('conv-shared', latest);

    expect(getActiveContextBudget('conv-shared')).toEqual(latest);
    expect(listener).toHaveBeenCalledTimes(2);

    clearActiveContextBudget('conv-shared', first);
    expect(getActiveContextBudget('conv-shared')).toEqual(latest);

    clearActiveContextBudget('conv-shared', latest);
    expect(getActiveContextBudget('conv-shared')).toBeUndefined();
    unsubscribe();
  });
});

describe('context usage percentage formatting', () => {
  it.each([
    { ratio: null, percent: 0, label: '--', progress: 0 },
    { ratio: 0, percent: 0, label: '0%', progress: 0 },
    { ratio: 0.004, percent: 0, label: '0%', progress: 0 },
    { ratio: 0.006, percent: 1, label: '1%', progress: 1 },
    { ratio: 1.2, percent: 120, label: '120%', progress: 100 },
  ])('formats $ratio consistently as $label', ({ ratio, percent, label, progress }) => {
    expect(contextUsagePercent(ratio)).toBe(percent);
    expect(formatContextUsagePercent(ratio)).toBe(label);
    expect(contextUsageProgressPercent(ratio)).toBe(progress);
  });
});
