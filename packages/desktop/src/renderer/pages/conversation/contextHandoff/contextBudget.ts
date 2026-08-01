import { extractDiagnosticTokenEstimate, type TMessage } from '@/common/chat/chatLib';
import type {
  TChatConversation,
  TContextHandoffItem,
  TContextHandoffBudgetSnapshot,
  TokenUsageData,
} from '@/common/config/storage';
import { readMessageContent } from '@/renderer/utils/chat/conversationExport';
import type { ContextModelReference } from './contextLimit';
import { resolveConversationContextLimit, resolveModelContextLimit } from './contextLimit';
import { buildContextMarkdown } from './contextMarkdown';
import { getConversationPinnedContext } from './pinnedContext';

type EstimateContextBudgetInput = {
  messages?: TMessage[];
  pinnedContext?: TContextHandoffItem[];
  contextMarkdown?: string;
  contextLimit?: number;
  runtimeTokenUsage?: TokenUsageData | null;
  skillNames?: string[];
  toolNames?: string[];
};

export type ContextUsageSnapshot = {
  source: 'runtime' | 'estimated' | 'unknown';
  totalTokens: number | null;
  contextLimit?: number;
  ratio: number | null;
  status: TContextHandoffBudgetSnapshot['status'];
};

type ResolveConversationContextBudgetInput = {
  conversation: TChatConversation | null;
  messages?: TMessage[];
  runtimeTokenUsage?: TokenUsageData | null;
  skillNames?: string[];
  toolNames?: string[];
  contextLimit?: number;
  model?: ContextModelReference | null;
};

const EMPTY_BUCKETS: TContextHandoffBudgetSnapshot['buckets'] = {
  messages: { estimatedTokens: 0 },
  files: { estimatedTokens: 0 },
  skills: { estimatedTokens: 0 },
  memory: { estimatedTokens: 0 },
  tools: { estimatedTokens: 0 },
};

const FILE_REFERENCE_RE =
  /(?:^|\s)([~./\w-][^\s"'`<>]*\.(?:md|txt|json|csv|xlsx?|docx?|pptx?|pdf|png|jpe?g|gif|svg|html|css|tsx?|jsx?))/gi;

const estimateTokens = (value: string): number => Math.ceil(value.trim().length / 4);

const fileReferenceTokenEstimate = (messages: TMessage[]): number => {
  const refs = new Set<string>();
  messages.forEach((message) => {
    const content = readMessageContent(message);
    for (const match of content.matchAll(FILE_REFERENCE_RE)) {
      const filePath = match[1]?.trim();
      if (filePath) refs.add(filePath);
    }
  });
  return Array.from(refs).reduce((sum, ref) => sum + estimateTokens(ref), 0);
};

const messageTokenWatermarkEstimate = (messages: TMessage[]): number =>
  messages.reduce((currentMax, message) => {
    const estimate = extractDiagnosticTokenEstimate(readMessageContent(message));
    return estimate === null ? currentMax : Math.max(currentMax, estimate);
  }, 0);

const resolveStatus = (ratio: number | null): TContextHandoffBudgetSnapshot['status'] => {
  if (ratio === null) return 'healthy';
  if (ratio >= 0.9) return 'too_large';
  if (ratio >= 0.5) return 'compress';
  if (ratio >= 0.35) return 'watch';
  return 'healthy';
};

export const estimateContextBudget = (input: EstimateContextBudgetInput): TContextHandoffBudgetSnapshot => {
  const messages = input.messages ?? [];
  const pinnedContext = input.pinnedContext ?? [];
  const messageEstimate = messages.reduce((sum, message) => sum + estimateTokens(readMessageContent(message)), 0);
  const buckets: TContextHandoffBudgetSnapshot['buckets'] = {
    messages: { estimatedTokens: messageEstimate },
    files: { estimatedTokens: fileReferenceTokenEstimate(messages) + estimateTokens(input.contextMarkdown ?? '') },
    skills: { estimatedTokens: estimateTokens((input.skillNames ?? []).join('\n')) },
    memory: {
      estimatedTokens: pinnedContext.reduce((sum, item) => sum + estimateTokens(`${item.title}\n${item.content}`), 0),
    },
    tools: { estimatedTokens: estimateTokens((input.toolNames ?? []).join('\n')) },
  };

  const rawTotalEstimatedTokens = Object.values(buckets).reduce((sum, bucket) => sum + bucket.estimatedTokens, 0);
  const runtimeTokenEstimate = input.runtimeTokenUsage?.total_tokens ?? 0;
  const knownTokenEstimate = Math.max(messageTokenWatermarkEstimate(messages), runtimeTokenEstimate);
  if (knownTokenEstimate > rawTotalEstimatedTokens) {
    buckets.messages.estimatedTokens += knownTokenEstimate - rawTotalEstimatedTokens;
  }

  const totalEstimatedTokens = Object.values(buckets).reduce((sum, bucket) => sum + bucket.estimatedTokens, 0);
  const contextLimit = input.contextLimit;
  const ratio = contextLimit && contextLimit > 0 ? totalEstimatedTokens / contextLimit : null;

  return {
    status: resolveStatus(ratio),
    ratio,
    totalEstimatedTokens,
    contextLimit,
    buckets: totalEstimatedTokens > 0 ? buckets : EMPTY_BUCKETS,
  };
};

const validTokenTotal = (usage: TokenUsageData | null | undefined): number | undefined => {
  const total = usage?.total_tokens;
  return typeof total === 'number' && Number.isFinite(total) && total >= 0 ? total : undefined;
};

const persistedTokenUsage = (conversation: TChatConversation): TokenUsageData | null => {
  const usage = (conversation.extra as { last_token_usage?: TokenUsageData } | undefined)?.last_token_usage;
  return validTokenTotal(usage) === undefined ? null : (usage ?? null);
};

const positiveContextLimit = (value: number | undefined): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;

export const resolveConversationContextBudgetSnapshot = (
  input: ResolveConversationContextBudgetInput
): ContextUsageSnapshot => {
  if (!input.conversation) {
    return {
      source: 'unknown',
      totalTokens: null,
      contextLimit: undefined,
      ratio: null,
      status: 'healthy',
    };
  }

  const messages = input.messages ?? [];
  const runtimeTokenUsage =
    validTokenTotal(input.runtimeTokenUsage) === undefined
      ? persistedTokenUsage(input.conversation)
      : input.runtimeTokenUsage;
  const contextLimit =
    positiveContextLimit(input.contextLimit) ??
    (input.model === undefined
      ? resolveConversationContextLimit(input.conversation)
      : resolveModelContextLimit(input.model));
  const estimate = estimateContextBudget({
    messages,
    pinnedContext: getConversationPinnedContext(input.conversation),
    contextMarkdown: buildContextMarkdown({ conversation: input.conversation, messages }),
    contextLimit,
    runtimeTokenUsage,
    skillNames: input.skillNames,
    toolNames: input.toolNames,
  });
  const runtimeTotal = validTokenTotal(runtimeTokenUsage);
  const totalTokens = runtimeTotal ?? estimate.totalEstimatedTokens;
  const ratio = contextLimit ? totalTokens / contextLimit : null;

  return {
    source: runtimeTotal === undefined ? 'estimated' : 'runtime',
    totalTokens,
    contextLimit,
    ratio,
    status: resolveStatus(ratio),
  };
};
