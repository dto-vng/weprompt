import { describe, expect, it } from 'vitest';
import type { TChatConversation, TProviderWithModel } from '@/common/config/storage';
import { resolveConversationContextLimit } from '@/renderer/pages/conversation/contextHandoff/contextLimit';

type AionrsConversation = Extract<TChatConversation, { type: 'aionrs' }>;

const model = (overrides: Partial<TProviderWithModel> = {}): TProviderWithModel => ({
  id: 'provider-1',
  platform: '',
  name: '',
  base_url: '',
  api_key: '',
  use_model: 'minimax-m2.5',
  ...overrides,
});

const aionrsConversation = (
  extra: Partial<AionrsConversation['extra']> = {},
  modelOverrides: Partial<TProviderWithModel> = {}
): AionrsConversation => ({
  id: 'conversation-1',
  name: 'Source chat',
  type: 'aionrs',
  created_at: 1,
  modified_at: 1,
  model: model(modelOverrides),
  extra: { workspace: '/workspace', ...extra },
});

describe('resolveConversationContextLimit', () => {
  it('returns undefined when there is no conversation', () => {
    expect(resolveConversationContextLimit(null)).toBeUndefined();
  });

  it('prefers the backend-populated per-conversation limit', () => {
    const conversation = aionrsConversation(
      { last_context_limit: 100_000 },
      { context_limit: 50_000, use_model: 'gpt-4o' }
    );
    expect(resolveConversationContextLimit(conversation)).toBe(100_000);
  });

  it('falls back to the provider-advertised window when no conversation limit is stored', () => {
    const conversation = aionrsConversation({}, { context_limit: 50_000, use_model: 'gpt-4o' });
    expect(resolveConversationContextLimit(conversation)).toBe(50_000);
  });

  it('falls back to the per-model default when neither conversation nor provider supplies a limit', () => {
    const conversation = aionrsConversation({}, { use_model: 'minimax-m2.5' });
    expect(resolveConversationContextLimit(conversation)).toBe(192_000);
  });

  it('ignores a non-positive stored limit and still resolves the model default', () => {
    const conversation = aionrsConversation({ last_context_limit: 0 }, { use_model: 'minimax-m2.5' });
    expect(resolveConversationContextLimit(conversation)).toBe(192_000);
  });

  it('returns undefined when the limit is truly unknown so the budget stays "--"', () => {
    const conversation = aionrsConversation({}, { use_model: 'totally-made-up-model' });
    expect(resolveConversationContextLimit(conversation)).toBeUndefined();
  });
});
