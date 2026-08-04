/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  PRESENTATION_RUN_ARTIFACT_PHASES,
  PRESENTATION_RUN_DISPATCH_STATUSES,
  PRESENTATION_RUN_DISPOSITIONS,
  PRESENTATION_RUN_LIMITS,
} from '@/common/config/constants';

export type PresentationRunDispatchStatus = (typeof PRESENTATION_RUN_DISPATCH_STATUSES)[number];
export type PresentationRunArtifactPhase = (typeof PRESENTATION_RUN_ARTIFACT_PHASES)[number] | null;
export type PresentationRunDisposition = (typeof PRESENTATION_RUN_DISPOSITIONS)[number] | null;

export type PresentationRunRetainedCandidate = {
  relativePath: string;
  sha256: string;
  byteLength: number;
};

export type PresentationRunBinding = {
  conversationId: string;
  turnId: string;
  runtime: 'aionrs' | 'acp' | null;
  boundAt: string;
};

export type PresentationRunManifest = {
  version: 2;
  runId: string;
  clientRequestId: string;
  conversationId: string;
  selectedTemplateId: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  statusEnteredAt: string;
  committedAt: string | null;
  retainedAt: string | null;
  dispatchStatus: PresentationRunDispatchStatus;
  artifactPhase: PresentationRunArtifactPhase;
  disposition: PresentationRunDisposition;
  retainedCandidate: PresentationRunRetainedCandidate | null;
  sourceGrants: string[];
  binding: PresentationRunBinding | null;
  postInvoked: boolean;
  retainedBytes: number;
};

export type PresentationRunTransition = {
  expectedRevision: number;
  dispatchStatus: PresentationRunDispatchStatus;
  artifactPhase?: Exclude<PresentationRunArtifactPhase, null>;
  disposition?: PresentationRunDisposition;
  retainedCandidate?: PresentationRunRetainedCandidate | null;
  binding?: PresentationRunBinding;
  postInvoked?: boolean;
  now: string;
};

export type BindPresentationRunTurnInput = {
  expectedRevision: number;
  conversationId: string;
  turnId: string;
  runtime: PresentationRunBinding['runtime'];
  now: string;
};

const DISPATCH_TRANSITIONS: Readonly<Record<PresentationRunDispatchStatus, readonly PresentationRunDispatchStatus[]>> =
  {
    allocating: ['allocating', 'committed', 'failed_retained', 'discarded'],
    committed: ['committed', 'dispatching', 'failed_retained', 'discarded'],
    dispatching: ['dispatching', 'bound', 'dispatch_uncertain'],
    bound: ['bound', 'terminal_verified', 'retained', 'dispatch_uncertain'],
    terminal_verified: ['terminal_verified', 'retained', 'failed_retained'],
    retained: ['retained', 'discarded'],
    failed_retained: ['failed_retained', 'discarded'],
    dispatch_uncertain: ['dispatch_uncertain'],
    discarded: ['discarded'],
  };

const ARTIFACT_PHASES: readonly Exclude<PresentationRunArtifactPhase, null>[] = [
  'none',
  'sources_snapshotted',
  'sources_extracted',
  'candidate_retained',
  'candidate_copied',
  'structurally_valid',
  'ooxml_inspected',
  'rendered_exact_hash',
];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256;
}

function isSameBinding(left: PresentationRunBinding, right: BindPresentationRunTurnInput): boolean {
  return left.conversationId === right.conversationId && left.turnId === right.turnId && left.runtime === right.runtime;
}

function assertArtifactTransition(current: PresentationRunArtifactPhase, next: PresentationRunArtifactPhase): void {
  if (next === null) return;
  if (current === null) throw new Error('Illegal presentation run artifact transition');
  const currentIndex = ARTIFACT_PHASES.indexOf(current);
  const nextIndex = ARTIFACT_PHASES.indexOf(next);
  if (nextIndex !== currentIndex && nextIndex !== currentIndex + 1) {
    throw new Error('Illegal presentation run artifact transition');
  }
}

function assertCandidate(candidate: PresentationRunRetainedCandidate | null): void {
  if (candidate === null) return;
  if (
    candidate.relativePath !== 'retained/candidate.pptx' ||
    !/^[0-9a-f]{64}$/.test(candidate.sha256) ||
    !Number.isSafeInteger(candidate.byteLength) ||
    candidate.byteLength < 0 ||
    candidate.byteLength > PRESENTATION_RUN_LIMITS.MAX_CANDIDATE_COMPRESSED_BYTES
  ) {
    throw new Error('Invalid retained presentation candidate');
  }
}

export function assertPresentationRunManifestState(run: PresentationRunManifest): void {
  if (
    run.version !== 2 ||
    !UUID_RE.test(run.runId) ||
    !isIdentifier(run.clientRequestId) ||
    !isIdentifier(run.conversationId) ||
    !isIdentifier(run.selectedTemplateId) ||
    !Number.isSafeInteger(run.revision) ||
    run.revision < 0 ||
    !isIsoTimestamp(run.createdAt) ||
    !isIsoTimestamp(run.updatedAt) ||
    !isIsoTimestamp(run.statusEnteredAt) ||
    (run.committedAt !== null && !isIsoTimestamp(run.committedAt)) ||
    (run.retainedAt !== null && !isIsoTimestamp(run.retainedAt)) ||
    !(PRESENTATION_RUN_DISPATCH_STATUSES as readonly unknown[]).includes(run.dispatchStatus) ||
    (run.artifactPhase !== null &&
      !(PRESENTATION_RUN_ARTIFACT_PHASES as readonly unknown[]).includes(run.artifactPhase)) ||
    (run.disposition !== null && !(PRESENTATION_RUN_DISPOSITIONS as readonly unknown[]).includes(run.disposition)) ||
    !Array.isArray(run.sourceGrants) ||
    run.sourceGrants.some((grantId) => typeof grantId !== 'string' || !UUID_RE.test(grantId)) ||
    new Set(run.sourceGrants).size !== run.sourceGrants.length ||
    typeof run.postInvoked !== 'boolean' ||
    !Number.isSafeInteger(run.retainedBytes) ||
    run.retainedBytes < 0
  ) {
    throw new Error('Invalid presentation run manifest');
  }
  const createdAt = Date.parse(run.createdAt);
  const updatedAt = Date.parse(run.updatedAt);
  const statusEnteredAt = Date.parse(run.statusEnteredAt);
  const committedAt = run.committedAt === null ? null : Date.parse(run.committedAt);
  const retainedAt = run.retainedAt === null ? null : Date.parse(run.retainedAt);
  if (
    updatedAt < createdAt ||
    statusEnteredAt < createdAt ||
    statusEnteredAt > updatedAt ||
    (committedAt !== null && (committedAt < createdAt || committedAt > updatedAt)) ||
    (retainedAt !== null && (retainedAt < createdAt || retainedAt > updatedAt)) ||
    (run.dispatchStatus === 'allocating' && (committedAt !== null || retainedAt !== null)) ||
    (['committed', 'dispatching', 'bound', 'terminal_verified', 'dispatch_uncertain', 'retained'].includes(
      run.dispatchStatus
    ) &&
      committedAt === null) ||
    (run.dispatchStatus !== 'retained' &&
      run.dispatchStatus !== 'failed_retained' &&
      run.dispatchStatus !== 'discarded' &&
      retainedAt !== null) ||
    ((run.dispatchStatus === 'retained' || run.dispatchStatus === 'failed_retained') &&
      (retainedAt === null || retainedAt !== statusEnteredAt || (committedAt !== null && retainedAt < committedAt)))
  ) {
    throw new Error('Invalid presentation run lifecycle timestamps');
  }
  if (
    run.binding !== null &&
    (!isIdentifier(run.binding.conversationId) ||
      run.binding.conversationId !== run.conversationId ||
      !isIdentifier(run.binding.turnId) ||
      !['aionrs', 'acp', null].includes(run.binding.runtime) ||
      !isIsoTimestamp(run.binding.boundAt) ||
      Date.parse(run.binding.boundAt) < createdAt ||
      Date.parse(run.binding.boundAt) > updatedAt)
  ) {
    throw new Error('Invalid presentation run manifest');
  }
  if (run.dispatchStatus === 'discarded') {
    if (run.artifactPhase !== null || run.disposition !== null || run.retainedCandidate !== null) {
      throw new Error('Invalid discarded presentation run state');
    }
    return;
  }

  if (run.artifactPhase === null) throw new Error('Invalid presentation run artifact phase');
  const phaseIndex = ARTIFACT_PHASES.indexOf(run.artifactPhase);
  const candidatePhase = ARTIFACT_PHASES.indexOf('candidate_retained');
  const hasCandidate = run.retainedCandidate !== null;
  if (phaseIndex >= candidatePhase !== hasCandidate) {
    throw new Error('Retained candidate does not match artifact phase');
  }
  assertCandidate(run.retainedCandidate);

  if (run.dispatchStatus === 'allocating' || run.dispatchStatus === 'committed') {
    if (run.postInvoked || run.binding !== null || run.disposition !== null || phaseIndex > 2) {
      throw new Error('Invalid pre-dispatch presentation run state');
    }
    return;
  }
  if (run.dispatchStatus === 'dispatching') {
    if (!run.postInvoked || run.binding !== null || run.disposition !== null || phaseIndex > 2) {
      throw new Error('Invalid dispatching presentation run state');
    }
    return;
  }
  if (run.dispatchStatus === 'bound') {
    if (!run.postInvoked || run.binding === null || run.disposition !== null || phaseIndex > 2) {
      throw new Error('Invalid bound presentation run state');
    }
    return;
  }
  if (run.dispatchStatus === 'dispatch_uncertain') {
    if (
      !run.postInvoked ||
      run.disposition !== 'TRACKING_REQUIRED' ||
      run.retainedCandidate !== null ||
      phaseIndex > 2
    ) {
      throw new Error('Invalid uncertain presentation run state');
    }
    return;
  }
  if (run.dispatchStatus === 'terminal_verified') {
    if (
      !run.postInvoked ||
      run.binding === null ||
      run.disposition !== null ||
      phaseIndex < 2 ||
      run.artifactPhase === 'rendered_exact_hash'
    ) {
      throw new Error('Invalid terminal presentation run state');
    }
    return;
  }

  const isTracking = run.disposition === 'TRACKING_REQUIRED';
  const isReview = run.disposition === 'REVIEW_REQUIRED';
  if (isTracking && run.retainedCandidate === null && phaseIndex <= 2) return;
  if (isReview && run.retainedCandidate !== null && phaseIndex >= candidatePhase) return;
  throw new Error('Invalid retained presentation run state');
}

/** Applies one compare-and-swap guarded presentation-run lifecycle transition. */
export function transitionPresentationRunState(
  current: PresentationRunManifest,
  transition: PresentationRunTransition
): PresentationRunManifest {
  assertPresentationRunManifestState(current);
  if (!isIsoTimestamp(transition.now)) throw new Error('Invalid presentation run transition timestamp');
  if (Date.parse(transition.now) < Date.parse(current.updatedAt)) {
    throw new Error('Presentation run transition timestamp regressed');
  }
  if (current.postInvoked && transition.postInvoked === false) {
    throw new Error('Presentation POST invocation proof is monotonic');
  }
  if (current.revision !== transition.expectedRevision) {
    throw new Error('Presentation run revision conflict');
  }

  if (transition.dispatchStatus === 'discarded') {
    const isPredispatch = current.dispatchStatus === 'allocating' || current.dispatchStatus === 'committed';
    const isReviewRetained =
      (current.dispatchStatus === 'retained' || current.dispatchStatus === 'failed_retained') &&
      current.disposition === 'REVIEW_REQUIRED';
    const isFailedTracking =
      current.dispatchStatus === 'failed_retained' && current.disposition === 'TRACKING_REQUIRED';
    if ((!isPredispatch && !isReviewRetained && !isFailedTracking) || (isPredispatch && current.postInvoked)) {
      throw new Error('Illegal presentation run dispatch transition');
    }
    return {
      ...current,
      revision: current.revision + 1,
      updatedAt: transition.now,
      statusEnteredAt: transition.now,
      dispatchStatus: 'discarded',
      artifactPhase: null,
      disposition: null,
      retainedCandidate: null,
      binding: null,
      retainedBytes: 0,
    };
  }

  if (!DISPATCH_TRANSITIONS[current.dispatchStatus].includes(transition.dispatchStatus)) {
    throw new Error('Illegal presentation run dispatch transition');
  }

  const artifactPhase = transition.artifactPhase ?? current.artifactPhase;
  assertArtifactTransition(current.artifactPhase, artifactPhase);
  if (
    current.retainedCandidate === null &&
    artifactPhase === 'candidate_retained' &&
    transition.dispatchStatus !== 'terminal_verified'
  ) {
    throw new Error('Candidate retention requires terminal verification');
  }

  const next: PresentationRunManifest = {
    ...current,
    revision: current.revision + 1,
    updatedAt: transition.now,
    statusEnteredAt: current.dispatchStatus === transition.dispatchStatus ? current.statusEnteredAt : transition.now,
    committedAt: current.committedAt ?? (transition.dispatchStatus === 'committed' ? transition.now : null),
    retainedAt:
      current.retainedAt ??
      (transition.dispatchStatus === 'retained' || transition.dispatchStatus === 'failed_retained'
        ? transition.now
        : null),
    dispatchStatus: transition.dispatchStatus,
    artifactPhase,
    disposition:
      transition.disposition ??
      (transition.dispatchStatus === 'dispatch_uncertain' || transition.dispatchStatus === 'failed_retained'
        ? 'TRACKING_REQUIRED'
        : current.disposition),
    retainedCandidate:
      transition.retainedCandidate === undefined ? current.retainedCandidate : transition.retainedCandidate,
    binding: transition.binding ?? current.binding,
    postInvoked: transition.postInvoked ?? current.postInvoked,
  };
  assertPresentationRunManifestState(next);
  return next;
}

/** Binds the exact acknowledged turn once; an exact replay does not mutate the manifest. */
export function bindPresentationRunTurn(
  current: PresentationRunManifest,
  input: BindPresentationRunTurnInput
): { status: 'bound' | 'already_bound'; manifest: PresentationRunManifest } {
  if (current.binding !== null) {
    if (isSameBinding(current.binding, input)) {
      return { status: 'already_bound', manifest: current };
    }
    throw new Error('Presentation run is already bound to another turn');
  }
  if (current.conversationId !== input.conversationId) {
    throw new Error('Presentation run conversation does not match binding');
  }
  const manifest = transitionPresentationRunState(current, {
    expectedRevision: input.expectedRevision,
    dispatchStatus: 'bound',
    binding: {
      conversationId: input.conversationId,
      turnId: input.turnId,
      runtime: input.runtime,
      boundAt: input.now,
    },
    now: input.now,
  });
  return { status: 'bound', manifest };
}
