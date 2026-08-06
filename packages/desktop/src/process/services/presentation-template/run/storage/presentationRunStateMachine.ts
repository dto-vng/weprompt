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
import type { PresentationGrantOwner, PresentationSourceDescriptor } from '@/common/types/office/presentationRun';

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
  const isCandidatePhaseOrLater = phaseIndex >= candidatePhase;
  if (isCandidatePhaseOrLater !== hasCandidate) {
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

export type PresentationSourceFormat = PresentationSourceDescriptor['format'];
export type PresentationSourceKind = PresentationSourceDescriptor['sourceKind'];

export type PresentationSourceOwnerManifest = {
  version: 2;
  recordType: 'presentation-source-owner';
  ownerId: string;
  owner: PresentationGrantOwner;
  principalId: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  grantIds: string[];
  unboundBytes: number;
  draftClientRequestId: string | null;
  draftLifecycle: 'active' | 'bound' | 'expired' | 'purged' | null;
};

export type PresentationSourceGrantManifest = {
  version: 2;
  recordType: 'presentation-source-grant';
  grantId: string;
  owner: PresentationGrantOwner;
  revision: number;
  displayName: string;
  format: PresentationSourceFormat;
  sourceKind: PresentationSourceKind;
  snapshotRelativePath: `source.${PresentationSourceDescriptor['format']}`;
  sha256: string;
  byteLength: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  stateEnteredAt: string;
  state: 'active' | 'claimed' | 'consumed' | 'revoked' | 'expired';
  queueExtendedAt: string | null;
  queueItemId: string | null;
  claimedRunId: string | null;
};

export type PresentationSourceDraftManifest = {
  version: 2;
  recordType: 'presentation-source-draft';
  draftId: string;
  clientRequestId: string;
  principalId: string;
  revision: number;
  state: 'active' | 'bound';
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  boundConversationId: string | null;
  boundAt: string | null;
};

export type PresentationSourceGrantTombstone = {
  version: 2;
  recordType: 'presentation-source-grant-tombstone';
  revision: 0;
  grantId: string;
  owner: PresentationGrantOwner;
  terminalState: 'consumed' | 'revoked' | 'expired';
  terminalAt: string;
  tombstonedAt: string;
  deleteAfter: string;
  lastRevision: number;
};

export type PresentationSourceDraftTombstone = {
  version: 2;
  recordType: 'presentation-source-draft-tombstone';
  revision: 0;
  draftId: string;
  clientRequestId: string;
  principalId: string;
  terminalState: 'bound' | 'expired';
  terminalAt: string;
  tombstonedAt: string;
  deleteAfter: string;
  lastRevision: number;
  boundConversationId: string | null;
};

const SOURCE_FORMATS: readonly PresentationSourceFormat[] = ['pdf', 'docx', 'xlsx', 'pptx', 'txt', 'md', 'csv'];
const SOURCE_KINDS: readonly PresentationSourceKind[] = ['native-picker', 'external-drop', 'workspace-relative'];
const SOURCE_STATES: readonly PresentationSourceGrantManifest['state'][] = [
  'active',
  'claimed',
  'consumed',
  'revoked',
  'expired',
];

function hasExactManifestKeys(value: object, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isGrantOwner(value: unknown): value is PresentationGrantOwner {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  if ('owner_type' in value && value.owner_type === 'draft') {
    return (
      hasExactManifestKeys(value, ['owner_type', 'draft_id']) &&
      'draft_id' in value &&
      typeof value.draft_id === 'string' &&
      UUID_RE.test(value.draft_id)
    );
  }
  return (
    'owner_type' in value &&
    value.owner_type === 'conversation' &&
    hasExactManifestKeys(value, ['owner_type', 'conversation_id']) &&
    'conversation_id' in value &&
    typeof value.conversation_id === 'string' &&
    UUID_RE.test(value.conversation_id)
  );
}

function assertOrderedTimestamps(createdAt: string, updatedAt: string, ...timestamps: (string | null)[]): void {
  if (!isIsoTimestamp(createdAt) || !isIsoTimestamp(updatedAt) || Date.parse(updatedAt) < Date.parse(createdAt)) {
    throw new Error('Invalid presentation source lifecycle timestamps');
  }
  for (const timestamp of timestamps) {
    if (timestamp !== null && (!isIsoTimestamp(timestamp) || Date.parse(timestamp) < Date.parse(createdAt))) {
      throw new Error('Invalid presentation source lifecycle timestamps');
    }
  }
}

export function assertPresentationSourceOwnerManifest(value: PresentationSourceOwnerManifest): void {
  if (
    !hasExactManifestKeys(value, [
      'version',
      'recordType',
      'ownerId',
      'owner',
      'principalId',
      'revision',
      'createdAt',
      'updatedAt',
      'grantIds',
      'unboundBytes',
      'draftClientRequestId',
      'draftLifecycle',
    ]) ||
    value.version !== 2 ||
    value.recordType !== 'presentation-source-owner' ||
    !UUID_RE.test(value.ownerId) ||
    !isGrantOwner(value.owner) ||
    !isIdentifier(value.principalId) ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    !Array.isArray(value.grantIds) ||
    value.grantIds.some((grantId) => !UUID_RE.test(grantId)) ||
    new Set(value.grantIds).size !== value.grantIds.length ||
    !Number.isSafeInteger(value.unboundBytes) ||
    value.unboundBytes < 0 ||
    (value.owner.owner_type === 'conversation' &&
      (value.draftClientRequestId !== null || value.draftLifecycle !== null)) ||
    (value.owner.owner_type === 'draft' &&
      (!isIdentifier(value.draftClientRequestId) ||
        !['active', 'bound', 'expired', 'purged'].includes(value.draftLifecycle ?? '')))
  ) {
    throw new Error('Invalid presentation source owner manifest');
  }
  assertOrderedTimestamps(value.createdAt, value.updatedAt);
  if (value.draftLifecycle !== null && value.draftLifecycle !== 'active' && value.grantIds.length !== 0) {
    throw new Error('Terminal presentation draft owner retained live grants');
  }
}

export function assertPresentationSourceGrantManifest(value: PresentationSourceGrantManifest): void {
  if (
    !hasExactManifestKeys(value, [
      'version',
      'recordType',
      'grantId',
      'owner',
      'revision',
      'displayName',
      'format',
      'sourceKind',
      'snapshotRelativePath',
      'sha256',
      'byteLength',
      'createdAt',
      'updatedAt',
      'expiresAt',
      'stateEnteredAt',
      'state',
      'queueExtendedAt',
      'queueItemId',
      'claimedRunId',
    ]) ||
    value.version !== 2 ||
    value.recordType !== 'presentation-source-grant' ||
    !UUID_RE.test(value.grantId) ||
    !isGrantOwner(value.owner) ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    !isIdentifier(value.displayName) ||
    value.displayName.includes('/') ||
    value.displayName.includes('\\') ||
    !SOURCE_FORMATS.includes(value.format) ||
    !SOURCE_KINDS.includes(value.sourceKind) ||
    value.snapshotRelativePath !== `source.${value.format}` ||
    !/^[0-9a-f]{64}$/.test(value.sha256) ||
    !Number.isSafeInteger(value.byteLength) ||
    value.byteLength < 1 ||
    value.byteLength > PRESENTATION_RUN_LIMITS.MAX_SOURCE_BYTES ||
    !SOURCE_STATES.includes(value.state) ||
    (value.queueExtendedAt === null) !== (value.queueItemId === null) ||
    (value.queueItemId !== null && !isIdentifier(value.queueItemId)) ||
    (value.state === 'claimed' || value.state === 'consumed') !== (value.claimedRunId !== null) ||
    (value.claimedRunId !== null && !UUID_RE.test(value.claimedRunId))
  ) {
    throw new Error('Invalid presentation source grant manifest');
  }
  assertOrderedTimestamps(
    value.createdAt,
    value.updatedAt,
    value.expiresAt,
    value.stateEnteredAt,
    value.queueExtendedAt
  );
  if (
    Date.parse(value.stateEnteredAt) > Date.parse(value.updatedAt) ||
    (value.state === 'active' && Date.parse(value.updatedAt) > Date.parse(value.expiresAt)) ||
    (value.queueExtendedAt !== null &&
      (Date.parse(value.queueExtendedAt) > Date.parse(value.updatedAt) ||
        Date.parse(value.expiresAt) < Date.parse(value.queueExtendedAt)))
  ) {
    throw new Error('Invalid presentation source lifecycle timestamps');
  }
}

export function assertPresentationSourceDraftManifest(value: PresentationSourceDraftManifest): void {
  if (
    !hasExactManifestKeys(value, [
      'version',
      'recordType',
      'draftId',
      'clientRequestId',
      'principalId',
      'revision',
      'state',
      'createdAt',
      'updatedAt',
      'expiresAt',
      'boundConversationId',
      'boundAt',
    ]) ||
    value.version !== 2 ||
    value.recordType !== 'presentation-source-draft' ||
    !UUID_RE.test(value.draftId) ||
    !isIdentifier(value.clientRequestId) ||
    !isIdentifier(value.principalId) ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    !['active', 'bound'].includes(value.state) ||
    (value.state === 'active' && (value.boundConversationId !== null || value.boundAt !== null)) ||
    (value.state === 'bound' && (value.boundConversationId === null || value.boundAt === null)) ||
    (value.boundConversationId !== null && !UUID_RE.test(value.boundConversationId))
  ) {
    throw new Error('Invalid presentation source draft manifest');
  }
  assertOrderedTimestamps(value.createdAt, value.updatedAt, value.expiresAt, value.boundAt);
  if (
    Date.parse(value.updatedAt) > Date.parse(value.expiresAt) ||
    (value.boundAt !== null && Date.parse(value.boundAt) > Date.parse(value.updatedAt))
  ) {
    throw new Error('Invalid presentation source lifecycle timestamps');
  }
}

export function assertPresentationSourceGrantTombstone(value: PresentationSourceGrantTombstone): void {
  if (
    !hasExactManifestKeys(value, [
      'version',
      'recordType',
      'revision',
      'grantId',
      'owner',
      'terminalState',
      'terminalAt',
      'tombstonedAt',
      'deleteAfter',
      'lastRevision',
    ]) ||
    value.version !== 2 ||
    value.recordType !== 'presentation-source-grant-tombstone' ||
    value.revision !== 0 ||
    !UUID_RE.test(value.grantId) ||
    !isGrantOwner(value.owner) ||
    !['consumed', 'revoked', 'expired'].includes(value.terminalState) ||
    !Number.isSafeInteger(value.lastRevision) ||
    value.lastRevision < 0
  ) {
    throw new Error('Invalid presentation source grant tombstone');
  }
  assertOrderedTimestamps(value.terminalAt, value.tombstonedAt, value.deleteAfter);
}

export function assertPresentationSourceDraftTombstone(value: PresentationSourceDraftTombstone): void {
  if (
    !hasExactManifestKeys(value, [
      'version',
      'recordType',
      'revision',
      'draftId',
      'clientRequestId',
      'principalId',
      'terminalState',
      'terminalAt',
      'tombstonedAt',
      'deleteAfter',
      'lastRevision',
      'boundConversationId',
    ]) ||
    value.version !== 2 ||
    value.recordType !== 'presentation-source-draft-tombstone' ||
    value.revision !== 0 ||
    !UUID_RE.test(value.draftId) ||
    !isIdentifier(value.clientRequestId) ||
    !isIdentifier(value.principalId) ||
    !['bound', 'expired'].includes(value.terminalState) ||
    !Number.isSafeInteger(value.lastRevision) ||
    value.lastRevision < 0 ||
    (value.terminalState === 'bound') !== (value.boundConversationId !== null) ||
    (value.boundConversationId !== null && !UUID_RE.test(value.boundConversationId))
  ) {
    throw new Error('Invalid presentation source draft tombstone');
  }
  assertOrderedTimestamps(value.terminalAt, value.tombstonedAt, value.deleteAfter);
}
