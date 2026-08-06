/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  PresentationGrantOwner,
  PresentationRunFailureCode,
  PresentationSourceRef,
} from '../office/presentationRun';

export const PRESENTATION_COMMAND_QUEUE_VERSION = 2 as const;
export const PRESENTATION_COMMAND_QUEUE_MAX_ITEMS = 20;
export const PRESENTATION_COMMAND_QUEUE_MAX_INPUT_LENGTH = 20_000;
export const PRESENTATION_COMMAND_QUEUE_MAX_STATE_BYTES = 256 * 1024;

export type PresentationCommandQueueExecution =
  | { state: 'persisting' }
  | { state: 'queued' }
  | { state: 'claimed'; claimedAt: string }
  | { state: 'committed'; runId: string; revision: number; postInvoked: false }
  | { state: 'dispatching'; runId: string; revision: number }
  | { state: 'bound'; runId: string; revision: number }
  | { state: 'preflight_failed'; code: PresentationRunFailureCode }
  | { state: 'dispatch_uncertain'; runId: string; revision: number | null };

export type PresentationCommandQueueItem = {
  queueItemId: string;
  clientRequestId: string;
  input: string;
  selectedTemplateId: string;
  sources: PresentationSourceRef[];
  sourceOwner: PresentationGrantOwner | null;
  expectedOwnerRevision: number | null;
  confirmedOwnerRevision: number | null;
  createdAt: string;
  updatedAt: string;
  execution: PresentationCommandQueueExecution;
};

export type PresentationCommandQueueState = {
  version: typeof PRESENTATION_COMMAND_QUEUE_VERSION;
  conversationId: string;
  revision: number;
  items: PresentationCommandQueueItem[];
};

export type EnqueuePresentationCommandInput = Pick<
  PresentationCommandQueueItem,
  | 'queueItemId'
  | 'clientRequestId'
  | 'input'
  | 'selectedTemplateId'
  | 'sources'
  | 'sourceOwner'
  | 'expectedOwnerRevision'
>;

export type PresentationCommandQueueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
