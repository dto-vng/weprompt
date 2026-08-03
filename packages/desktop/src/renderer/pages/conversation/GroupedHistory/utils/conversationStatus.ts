/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IConversationTurnCompletedEvent } from '@/common/adapter/ipcBridge';
import type { TConversationRuntimeSummary } from '@/common/config/storage';

/** How long a successful completion remains visible in the conversation list. */
export const COMPLETION_MARK_DURATION_MS = 60_000;
export const STOPPED_MARK_DURATION_MS = 60_000;

export type TConversationCompletionRecord = {
  completedAt: number;
  seenAt?: number;
};

export type TConversationStatusMark = 'idle' | 'running' | 'needs_you' | 'done' | 'done_idle' | 'stopped' | 'failed';

export type TConversationStatusTooltipKey =
  | 'conversation.statusTooltip.waitingApproval'
  | 'conversation.statusTooltip.running'
  | 'conversation.statusTooltip.doneUnseen'
  | 'conversation.statusTooltip.doneSeen'
  | 'conversation.statusTooltip.doneIdle'
  | 'conversation.statusTooltip.stopped'
  | 'conversation.statusTooltip.failed';

export type TConversationTerminalMark = 'failed' | 'completed' | 'stopped';

export type TConversationStatusInput = {
  runtime?: TConversationRuntimeSummary;
  isGenerating: boolean;
  recentFailureAt?: number;
  recentStoppedAt?: number;
  completion?: TConversationCompletionRecord;
  now: number;
};

/** Returns whether live runtime state proves that user approval is blocking progress. */
export const isConversationAwaitingApproval = (runtime?: TConversationRuntimeSummary): boolean =>
  runtime?.state === 'waiting_confirmation' || (runtime?.pending_confirmations ?? 0) > 0;

/**
 * Classifies only terminal wire states whose meaning is verified by the renderer contract.
 * `ai_waiting_input` is ordinary successful completion; it is not evidence of a user-blocking question.
 */
export const resolveConversationTerminalMark = (
  state: IConversationTurnCompletedEvent['state']
): TConversationTerminalMark | null => {
  if (state === 'error') {
    return 'failed';
  }
  if (state === 'ai_waiting_input') {
    return 'completed';
  }
  if (state === 'stopped') {
    return 'stopped';
  }
  return null;
};

/** Resolves the single status mark shown for a conversation row. */
export const resolveConversationStatusMark = ({
  runtime,
  isGenerating,
  recentFailureAt,
  recentStoppedAt,
  completion,
  now,
}: TConversationStatusInput): TConversationStatusMark => {
  if (isConversationAwaitingApproval(runtime)) {
    return 'needs_you';
  }
  if (recentFailureAt !== undefined) {
    return 'failed';
  }
  if (
    isGenerating ||
    runtime?.state === 'starting' ||
    runtime?.state === 'running' ||
    runtime?.state === 'cancelling'
  ) {
    return 'running';
  }
  if (recentStoppedAt !== undefined && now - recentStoppedAt < STOPPED_MARK_DURATION_MS) {
    return 'stopped';
  }
  if (completion) {
    if (completion.seenAt === undefined || now - completion.completedAt < COMPLETION_MARK_DURATION_MS) {
      return 'done';
    }
    return 'done_idle';
  }
  return 'idle';
};

export const resolveConversationStatusTooltipKey = (
  statusMark: TConversationStatusMark,
  completion?: TConversationCompletionRecord
): TConversationStatusTooltipKey | null => {
  if (statusMark === 'idle') {
    return null;
  }
  if (statusMark === 'done') {
    return completion?.seenAt === undefined
      ? 'conversation.statusTooltip.doneUnseen'
      : 'conversation.statusTooltip.doneSeen';
  }
  if (statusMark === 'done_idle') {
    return 'conversation.statusTooltip.doneIdle';
  }
  if (statusMark === 'needs_you') {
    return 'conversation.statusTooltip.waitingApproval';
  }
  return `conversation.statusTooltip.${statusMark}`;
};
