import type { TChatConversation, TContextHandoffExtra } from '@/common/config/storage';
import { getConversationContextHandoffExtra } from './pinnedContext';

type AionrsConversation = Extract<TChatConversation, { type: 'aionrs' }>;

export type ContextHandoffExtraPatch = {
  context_handoff: TContextHandoffExtra;
};

export const buildContextHandoffExtraPatch = (
  conversation: AionrsConversation,
  updates: Partial<TContextHandoffExtra>
): ContextHandoffExtraPatch => ({
  context_handoff: {
    ...getConversationContextHandoffExtra(conversation),
    ...updates,
  },
});
