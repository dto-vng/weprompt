/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PresentationRunFailureCode, PresentationSourceRef } from '../office/presentationRun';

export type PresentationSubmissionSnapshot = Readonly<{
  queueItemId: string;
  clientRequestId: string;
  input: string;
  selectedTemplateId: string;
  sources: readonly PresentationSourceRef[];
  capturedAt: string;
}>;

export type PresentationSubmissionProgress =
  | { state: 'persisting' }
  | { state: 'queued' }
  | { state: 'committed'; runId: string; revision: number }
  | { state: 'dispatching'; runId: string; revision: number }
  | { state: 'bound'; runId: string; revision: number }
  | { state: 'preflight_failed'; code: PresentationRunFailureCode }
  | { state: 'dispatch_uncertain'; runId: string; revision: number | null };

export type PresentationSubmissionProgressObservation = Readonly<{
  queueItemId: string;
  progress: PresentationSubmissionProgress;
}>;

export type ManagedPresentationSubmission = {
  selectedTemplateId: string;
  sources: readonly PresentationSourceRef[];
  onSubmit: (snapshot: PresentationSubmissionSnapshot) => Promise<PresentationSubmissionProgress>;
  onRestore?: (snapshot: PresentationSubmissionSnapshot) => Promise<void>;
  progress?: PresentationSubmissionProgressObservation | null;
};
