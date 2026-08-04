/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import {
  PRESENTATION_RUN_ARTIFACT_PHASES,
  PRESENTATION_RUN_DISPATCH_STATUSES,
  PRESENTATION_RUN_LIMITS,
} from '@/common/config/constants';
import type { PresentationRunFailure, PresentationRunFailureCode } from '@/common/types/office/presentationRun';

const RUN_ID = '434393ce-dd45-44fe-a51c-262b2b181cc5';
const MESSAGE_KEY = 'conversation.presentation.failure';

const failure = <Code extends PresentationRunFailureCode, Retryable extends boolean, State extends string, Details>(
  code: Code,
  retryable: Retryable,
  state: State,
  details: Details
) => ({
  ok: false as const,
  code,
  messageKey: MESSAGE_KEY,
  retryable,
  state,
  details,
});

export const PRESENTATION_RUN_FAILURE_POLICY = {
  FEATURE_DISABLED: failure('FEATURE_DISABLED', false, 'preflight', null),
  DESKTOP_REQUIRED: failure('DESKTOP_REQUIRED', false, 'preflight', null),
  INVALID_REQUEST: failure('INVALID_REQUEST', false, 'preflight', null),
  REQUEST_COLLISION: failure('REQUEST_COLLISION', false, 'lookup', { existingRunId: RUN_ID }),
  RUN_NOT_FOUND: failure('RUN_NOT_FOUND', false, 'lookup', null),
  RUN_FORBIDDEN: failure('RUN_FORBIDDEN', false, 'lookup', null),
  RUN_STATE_CONFLICT: failure('RUN_STATE_CONFLICT', false, 'lookup', {
    runId: RUN_ID,
    dispatchStatus: 'committed' as const,
  }),
  DRAFT_NOT_FOUND: failure('DRAFT_NOT_FOUND', false, 'lookup', null),
  DRAFT_EXPIRED: failure('DRAFT_EXPIRED', false, 'draft_expired', { draftId: RUN_ID }),
  DRAFT_FOREIGN: failure('DRAFT_FOREIGN', false, 'lookup', null),
  DRAFT_ALREADY_BOUND: failure('DRAFT_ALREADY_BOUND', false, 'draft_active', {
    draftId: RUN_ID,
    conversationId: RUN_ID,
  }),
  DRAFT_LIMIT_EXCEEDED: failure('DRAFT_LIMIT_EXCEEDED', false, 'preflight', null),
  GRANT_LIMIT_EXCEEDED: failure('GRANT_LIMIT_EXCEEDED', false, 'preflight', null),
  NATIVE_FILE_REQUIRED: failure('NATIVE_FILE_REQUIRED', false, 'preflight', null),
  DIALOG_UNAVAILABLE: failure('DIALOG_UNAVAILABLE', false, 'preflight', null),
  LEASE_CONFLICT: failure('LEASE_CONFLICT', false, 'committed', {
    runId: RUN_ID,
    leaseExpiresAt: '2026-08-04T00:00:30.000Z',
  }),
  LEASE_EXPIRED: failure('LEASE_EXPIRED', false, 'committed', { runId: RUN_ID, reclaimAllowed: true as const }),
  LEASE_FOREIGN: failure('LEASE_FOREIGN', false, 'committed', { runId: RUN_ID }),
  SCOPE_UNAVAILABLE: failure('SCOPE_UNAVAILABLE', false, 'preflight', null),
  TEAM_SCOPE_UNSUPPORTED: failure('TEAM_SCOPE_UNSUPPORTED', false, 'preflight', null),
  RUNTIME_UNSUPPORTED: failure('RUNTIME_UNSUPPORTED', false, 'preflight', null),
  SOURCE_GRANT_INVALID: failure('SOURCE_GRANT_INVALID', false, 'grant_validation', { grantId: RUN_ID }),
  SOURCE_GRANT_EXPIRED: failure('SOURCE_GRANT_EXPIRED', false, 'grant_expired', { grantId: RUN_ID }),
  SOURCE_GRANT_FOREIGN: failure('SOURCE_GRANT_FOREIGN', false, 'grant_validation', { grantId: RUN_ID }),
  SOURCE_GRANT_REPLAYED: failure('SOURCE_GRANT_REPLAYED', false, 'grant_validation', { grantId: RUN_ID }),
  SOURCE_TAMPERED: failure('SOURCE_TAMPERED', false, 'grant_validation', { grantId: RUN_ID }),
  SOURCE_LIMIT_EXCEEDED: failure('SOURCE_LIMIT_EXCEEDED', false, 'grant_validation', { grantId: RUN_ID }),
  SOURCE_FORMAT_UNSUPPORTED: failure('SOURCE_FORMAT_UNSUPPORTED', false, 'grant_validation', { grantId: RUN_ID }),
  TEMPLATE_NOT_FOUND: failure('TEMPLATE_NOT_FOUND', false, 'preflight', null),
  TEMPLATE_UNSUPPORTED: failure('TEMPLATE_UNSUPPORTED', false, 'preflight', null),
  RESOURCE_LIMIT_EXCEEDED: failure('RESOURCE_LIMIT_EXCEEDED', false, 'preflight', null),
  RATE_LIMITED: failure('RATE_LIMITED', true, 'preflight', { retryAfterMs: 1_000, postInvoked: false as const }),
  DISK_RESERVE_EXCEEDED: failure('DISK_RESERVE_EXCEEDED', false, 'preflight', null),
  PERSISTENCE_FAILED: failure('PERSISTENCE_FAILED', false, 'committed', { postInvoked: false as const }),
  BACKEND_PREFLIGHT_BLOCKED: failure('BACKEND_PREFLIGHT_BLOCKED', true, 'committed', {
    runId: RUN_ID,
    retryAfterMs: 1_000,
    postInvoked: false as const,
  }),
  DISPATCH_UNCERTAIN: failure('DISPATCH_UNCERTAIN', false, 'dispatch_uncertain', {
    runId: RUN_ID,
    postInvoked: true as const,
    queryRequired: true as const,
  }),
  TRACKING_REQUIRED: failure('TRACKING_REQUIRED', false, 'bound', { runId: RUN_ID }),
  CANDIDATE_UNAVAILABLE: failure('CANDIDATE_UNAVAILABLE', false, 'retained', { runId: RUN_ID }),
  HASH_MISMATCH: failure('HASH_MISMATCH', false, 'retained', { runId: RUN_ID }),
  UNSAFE_TO_OPEN: failure('UNSAFE_TO_OPEN', false, 'retained', { runId: RUN_ID }),
  UNSAFE_TO_DISCARD: failure('UNSAFE_TO_DISCARD', false, 'committed', { runId: RUN_ID }),
  INTERNAL_ERROR: failure('INTERNAL_ERROR', false, 'preflight', null),
} as const satisfies Record<PresentationRunFailureCode, PresentationRunFailure>;

const strictDetails = {
  runId: z.object({ runId: z.string() }).strict(),
  grantId: z.object({ grantId: z.string().optional() }).strict(),
};

const failureEnvelope = <Code extends z.ZodTypeAny, State extends z.ZodTypeAny, Details extends z.ZodTypeAny>(
  code: Code,
  retryable: boolean,
  state: State,
  details: Details
) =>
  z
    .object({
      ok: z.literal(false),
      code,
      messageKey: z.string().min(1),
      retryable: z.literal(retryable),
      state,
      details,
    })
    .strict();

const presentationRunFailureSchema = z.union([
  failureEnvelope(
    z.enum([
      'FEATURE_DISABLED',
      'DESKTOP_REQUIRED',
      'INVALID_REQUEST',
      'SCOPE_UNAVAILABLE',
      'TEAM_SCOPE_UNSUPPORTED',
      'RUNTIME_UNSUPPORTED',
      'DRAFT_LIMIT_EXCEEDED',
      'GRANT_LIMIT_EXCEEDED',
      'NATIVE_FILE_REQUIRED',
      'DIALOG_UNAVAILABLE',
      'TEMPLATE_NOT_FOUND',
      'TEMPLATE_UNSUPPORTED',
      'RESOURCE_LIMIT_EXCEEDED',
      'DISK_RESERVE_EXCEEDED',
      'INTERNAL_ERROR',
    ]),
    false,
    z.literal('preflight'),
    z.null()
  ),
  failureEnvelope(
    z.literal('REQUEST_COLLISION'),
    false,
    z.literal('lookup'),
    z.object({ existingRunId: z.string() }).strict()
  ),
  failureEnvelope(
    z.enum(['RUN_NOT_FOUND', 'RUN_FORBIDDEN', 'DRAFT_NOT_FOUND', 'DRAFT_FOREIGN']),
    false,
    z.literal('lookup'),
    z.null()
  ),
  failureEnvelope(
    z.literal('RUN_STATE_CONFLICT'),
    false,
    z.literal('lookup'),
    z.object({ runId: z.string(), dispatchStatus: z.enum(PRESENTATION_RUN_DISPATCH_STATUSES) }).strict()
  ),
  failureEnvelope(
    z.literal('DRAFT_EXPIRED'),
    false,
    z.literal('draft_expired'),
    z.object({ draftId: z.string() }).strict()
  ),
  failureEnvelope(
    z.literal('DRAFT_ALREADY_BOUND'),
    false,
    z.literal('draft_active'),
    z.object({ draftId: z.string(), conversationId: z.string() }).strict()
  ),
  failureEnvelope(
    z.enum([
      'SOURCE_GRANT_INVALID',
      'SOURCE_GRANT_FOREIGN',
      'SOURCE_GRANT_REPLAYED',
      'SOURCE_TAMPERED',
      'SOURCE_LIMIT_EXCEEDED',
      'SOURCE_FORMAT_UNSUPPORTED',
    ]),
    false,
    z.literal('grant_validation'),
    strictDetails.grantId
  ),
  failureEnvelope(
    z.literal('SOURCE_GRANT_EXPIRED'),
    false,
    z.literal('grant_expired'),
    z.object({ grantId: z.string() }).strict()
  ),
  failureEnvelope(
    z.literal('LEASE_CONFLICT'),
    false,
    z.literal('committed'),
    z.object({ runId: z.string(), leaseExpiresAt: z.string() }).strict()
  ),
  failureEnvelope(
    z.literal('LEASE_EXPIRED'),
    false,
    z.literal('committed'),
    z.object({ runId: z.string(), reclaimAllowed: z.literal(true) }).strict()
  ),
  failureEnvelope(z.literal('LEASE_FOREIGN'), false, z.literal('committed'), strictDetails.runId),
  failureEnvelope(
    z.literal('RATE_LIMITED'),
    true,
    z.literal('preflight'),
    z.object({ retryAfterMs: z.number(), postInvoked: z.literal(false) }).strict()
  ),
  failureEnvelope(
    z.literal('BACKEND_PREFLIGHT_BLOCKED'),
    true,
    z.literal('committed'),
    z.object({ runId: z.string(), retryAfterMs: z.number(), postInvoked: z.literal(false) }).strict()
  ),
  failureEnvelope(
    z.literal('PERSISTENCE_FAILED'),
    false,
    z.enum(['preflight', 'committed']),
    z.object({ postInvoked: z.literal(false) }).strict()
  ),
  failureEnvelope(
    z.literal('DISPATCH_UNCERTAIN'),
    false,
    z.literal('dispatch_uncertain'),
    z.object({ runId: z.string(), postInvoked: z.literal(true), queryRequired: z.literal(true) }).strict()
  ),
  failureEnvelope(z.literal('TRACKING_REQUIRED'), false, z.enum(['bound', 'retained']), strictDetails.runId),
  failureEnvelope(
    z.enum(['CANDIDATE_UNAVAILABLE', 'HASH_MISMATCH']),
    false,
    z.literal('retained'),
    strictDetails.runId
  ),
  failureEnvelope(
    z.enum(['UNSAFE_TO_OPEN', 'UNSAFE_TO_DISCARD']),
    false,
    z.enum(['committed', 'dispatching', 'bound', 'dispatch_uncertain', 'retained']),
    strictDetails.runId
  ),
]);

const runBaseSchema = z
  .object({
    runId: z.string(),
    clientRequestId: z.string(),
    conversationId: z.string(),
    selectedTemplateId: z.string(),
    revision: z.number(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
const noActionsSchema = z.object({ openAllowed: z.literal(false), discardAllowed: z.literal(false) }).strict();
const discardOnlyActionsSchema = z.object({ openAllowed: z.literal(false), discardAllowed: z.literal(true) }).strict();
const retainedActionsSchema = z.object({ openAllowed: z.literal(true), discardAllowed: z.literal(true) }).strict();
const retainedCandidateSchema = z.object({ sha256: z.string(), byteLength: z.number() }).strict();

const presentationRunPublicSchema = z.union([
  runBaseSchema.extend({
    dispatchStatus: z.enum(['allocating', 'committed']),
    artifactPhase: z.enum(['none', 'sources_snapshotted', 'sources_extracted']),
    disposition: z.null(),
    retainedCandidate: z.null(),
    actions: discardOnlyActionsSchema,
  }),
  runBaseSchema.extend({
    dispatchStatus: z.enum(['dispatching', 'bound']),
    artifactPhase: z.enum(['none', 'sources_snapshotted', 'sources_extracted']),
    disposition: z.null(),
    retainedCandidate: z.null(),
    actions: noActionsSchema,
  }),
  runBaseSchema.extend({
    dispatchStatus: z.literal('terminal_verified'),
    artifactPhase: z.enum([
      'sources_extracted',
      'candidate_retained',
      'candidate_copied',
      'structurally_valid',
      'ooxml_inspected',
    ]),
    disposition: z.null(),
    retainedCandidate: retainedCandidateSchema.nullable(),
    actions: noActionsSchema,
  }),
  runBaseSchema.extend({
    dispatchStatus: z.enum(['retained', 'failed_retained']),
    artifactPhase: z.enum([
      'candidate_retained',
      'candidate_copied',
      'structurally_valid',
      'ooxml_inspected',
      'rendered_exact_hash',
    ]),
    disposition: z.literal('REVIEW_REQUIRED'),
    retainedCandidate: retainedCandidateSchema,
    actions: retainedActionsSchema,
  }),
  runBaseSchema.extend({
    dispatchStatus: z.literal('failed_retained'),
    artifactPhase: z.enum(['none', 'sources_snapshotted', 'sources_extracted']),
    disposition: z.literal('TRACKING_REQUIRED'),
    retainedCandidate: z.null(),
    actions: discardOnlyActionsSchema,
  }),
  runBaseSchema.extend({
    dispatchStatus: z.enum(['retained', 'dispatch_uncertain']),
    artifactPhase: z.enum(['none', 'sources_snapshotted', 'sources_extracted']),
    disposition: z.literal('TRACKING_REQUIRED'),
    retainedCandidate: z.null(),
    actions: noActionsSchema,
  }),
  runBaseSchema.extend({
    dispatchStatus: z.literal('discarded'),
    artifactPhase: z.null(),
    disposition: z.null(),
    retainedCandidate: z.null(),
    actions: noActionsSchema,
  }),
]);

describe('managed presentation failure policy', () => {
  it('accepts the exhaustive code-specific retryability, state, and details map', () => {
    const rejectedCodes = Object.values(PRESENTATION_RUN_FAILURE_POLICY)
      .filter((entry) => !presentationRunFailureSchema.safeParse(entry).success)
      .map((entry) => entry.code);

    expect(rejectedCodes).toEqual([]);
  });

  it('rejects drift in retryability, state, details, or envelope fields for every code', () => {
    const acceptedMutations = Object.values(PRESENTATION_RUN_FAILURE_POLICY).flatMap((entry) => {
      const mutations: unknown[] = [
        { ...entry, retryable: !entry.retryable },
        { ...entry, state: 'wrong_state' },
        { ...entry, details: { unexpected: true } },
        { ...entry, rawError: 'private backend error' },
      ];
      return mutations.filter((mutation) => presentationRunFailureSchema.safeParse(mutation).success);
    });

    expect(acceptedMutations).toEqual([]);
  });
});

describe('managed presentation public-state policy', () => {
  const base = {
    runId: RUN_ID,
    clientRequestId: RUN_ID,
    conversationId: RUN_ID,
    selectedTemplateId: 'business-review',
    revision: 1,
    createdAt: '2026-08-04T00:00:00.000Z',
    updatedAt: '2026-08-04T00:00:01.000Z',
  };
  const candidate = { sha256: 'a'.repeat(64), byteLength: 4_096 };

  it('accepts every allowed dispatch, artifact, disposition, and action family', () => {
    const allowed = [
      {
        ...base,
        dispatchStatus: 'committed',
        artifactPhase: 'sources_extracted',
        disposition: null,
        retainedCandidate: null,
        actions: { openAllowed: false, discardAllowed: true },
      },
      {
        ...base,
        dispatchStatus: 'bound',
        artifactPhase: 'sources_extracted',
        disposition: null,
        retainedCandidate: null,
        actions: { openAllowed: false, discardAllowed: false },
      },
      {
        ...base,
        dispatchStatus: 'terminal_verified',
        artifactPhase: 'candidate_retained',
        disposition: null,
        retainedCandidate: candidate,
        actions: { openAllowed: false, discardAllowed: false },
      },
      {
        ...base,
        dispatchStatus: 'retained',
        artifactPhase: 'rendered_exact_hash',
        disposition: 'REVIEW_REQUIRED',
        retainedCandidate: candidate,
        actions: { openAllowed: true, discardAllowed: true },
      },
      {
        ...base,
        dispatchStatus: 'failed_retained',
        artifactPhase: 'sources_extracted',
        disposition: 'TRACKING_REQUIRED',
        retainedCandidate: null,
        actions: { openAllowed: false, discardAllowed: true },
      },
      {
        ...base,
        dispatchStatus: 'dispatch_uncertain',
        artifactPhase: 'sources_extracted',
        disposition: 'TRACKING_REQUIRED',
        retainedCandidate: null,
        actions: { openAllowed: false, discardAllowed: false },
      },
      {
        ...base,
        dispatchStatus: 'discarded',
        artifactPhase: null,
        disposition: null,
        retainedCandidate: null,
        actions: { openAllowed: false, discardAllowed: false },
      },
    ];

    expect(allowed.every((run) => presentationRunPublicSchema.safeParse(run).success)).toBe(true);
  });

  it('rejects candidates, phases, dispositions, and actions in forbidden combinations', () => {
    const forbidden = [
      {
        ...base,
        dispatchStatus: 'allocating',
        artifactPhase: 'none',
        disposition: null,
        retainedCandidate: candidate,
        actions: { openAllowed: false, discardAllowed: true },
      },
      {
        ...base,
        dispatchStatus: 'dispatching',
        artifactPhase: 'sources_extracted',
        disposition: null,
        retainedCandidate: null,
        actions: { openAllowed: false, discardAllowed: true },
      },
      {
        ...base,
        dispatchStatus: 'terminal_verified',
        artifactPhase: 'rendered_exact_hash',
        disposition: null,
        retainedCandidate: candidate,
        actions: { openAllowed: false, discardAllowed: false },
      },
      {
        ...base,
        dispatchStatus: 'retained',
        artifactPhase: 'rendered_exact_hash',
        disposition: 'REVIEW_REQUIRED',
        retainedCandidate: null,
        actions: { openAllowed: true, discardAllowed: true },
      },
      {
        ...base,
        dispatchStatus: 'dispatch_uncertain',
        artifactPhase: 'sources_extracted',
        disposition: 'TRACKING_REQUIRED',
        retainedCandidate: null,
        actions: { openAllowed: false, discardAllowed: true },
      },
      {
        ...base,
        dispatchStatus: 'discarded',
        artifactPhase: 'none',
        disposition: null,
        retainedCandidate: null,
        actions: { openAllowed: false, discardAllowed: false },
      },
    ];

    expect(forbidden.every((run) => !presentationRunPublicSchema.safeParse(run).success)).toBe(true);
  });
});

describe('managed presentation fixed resource policy', () => {
  const MiB = 1_024 * 1_024;
  const GiB = 1_024 * MiB;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  it('keeps source, grant, extraction, and template limits fixed', () => {
    expect(PRESENTATION_RUN_LIMITS).toMatchObject({
      MAX_SOURCES_PER_RUN: 16,
      MAX_SOURCE_BYTES: 64 * MiB,
      MAX_TOTAL_SOURCE_BYTES: 256 * MiB,
      GRANT_TTL_MS: 15 * minute,
      QUEUED_GRANT_TTL_MS: 24 * hour,
      GRANT_SWEEP_INTERVAL_MS: 5 * minute,
      MAX_UNBOUND_GRANTS_PER_OWNER: 16,
      MAX_UNBOUND_GRANTS_PER_APP: 64,
      MAX_LIVE_GUID_DRAFTS_PER_APP: 16,
      MAX_UNBOUND_GRANT_BYTES_PER_OWNER: 256 * MiB,
      MAX_UNBOUND_GRANT_BYTES_PER_APP: 512 * MiB,
      MAX_EXTRACTED_CHARS_PER_SOURCE: 200_000,
      MAX_EXTRACTED_CHARS_TOTAL: 1_000_000,
      MAX_PDF_PAGES: 50,
      MAX_EXTRACTION_ATTEMPTS: 2,
      EXTRACTION_ATTEMPT_TIMEOUT_MS: 30_000,
      MAX_OFFICECLI_STDOUT_BYTES: 8 * MiB,
      MAX_THEME_BYTES: 1 * MiB,
      MAX_REFERENCE_BYTES: 64 * MiB,
      MAX_TEMPLATE_REFERENCE_BYTES: 128 * MiB,
    });
  });

  it('keeps candidate, OOXML, plan, and render limits fixed', () => {
    expect(PRESENTATION_RUN_LIMITS).toMatchObject({
      MAX_CANDIDATE_COMPRESSED_BYTES: 256 * MiB,
      MAX_NON_RENDER_COPY_WRITE_BYTES_PER_RUN: 1 * GiB,
      MAX_PLAN_JSON_BYTES: 1 * MiB,
      MAX_SOURCE_REFS_PER_SLIDE: 16,
      MAX_ZIP_ENTRIES: 4_096,
      MAX_ZIP_ENTRY_BYTES: 32 * MiB,
      MAX_ZIP_EXPANDED_BYTES: 512 * MiB,
      MAX_XML_BYTES: 16 * MiB,
      MAX_XML_NESTING_DEPTH: 64,
      MAX_SLIDES: 100,
      MAX_SHAPES_PER_SLIDE: 512,
      MAX_TEXT_CHARS_PER_SLIDE: 100_000,
      MAX_TEXT_CHARS_TOTAL: 2_000_000,
      MAX_RENDER_BYTES_PER_SLIDE: 25 * MiB,
      MAX_RENDER_BYTES_TOTAL: 500 * MiB,
      RENDER_TIMEOUT_MS: 90_000,
    });
  });

  it('keeps run, queue, recovery, retention, and disk limits fixed', () => {
    expect(PRESENTATION_RUN_LIMITS).toMatchObject({
      ACTIVE_GENERATION_TTL_MS: 30 * minute,
      MAX_LIVE_RUNS_PER_CONVERSATION: 1,
      MAX_LIVE_RUNS_PER_APP: 2,
      MAX_PREDISPATCH_INTENTS_PER_APP: 8,
      MAX_EXTRACTION_CONCURRENCY: 2,
      MAX_RENDER_CONCURRENCY: 1,
      RECOVERABLE_LIST_MIN_LIMIT: 1,
      RECOVERABLE_LIST_DEFAULT_LIMIT: 20,
      RECOVERABLE_LIST_MAX_LIMIT: 20,
      MAX_RETAINED_RUNS_PER_CONVERSATION: 10,
      MAX_RETAINED_RUNS_PER_APP: 100,
      MAX_RETAINED_BYTES_PER_CONVERSATION: 640 * MiB,
      MAX_RETAINED_BYTES_PER_APP: 3 * GiB,
      TRANSIENT_DISK_RESERVATION_BYTES_PER_RUN: 2 * GiB,
      MIN_FREE_BYTES_BEFORE_START: 3 * GiB,
      MIN_UNRESERVED_BYTES_AFTER_RESERVATIONS: 1 * GiB,
      ALLOCATING_TTL_MS: 10 * minute,
      COMMITTED_TTL_MS: 24 * hour,
      FAILED_OR_REVIEW_RETENTION_MS: 7 * day,
      UNCERTAIN_OPERATOR_ALERT_MS: 30 * day,
      TOMBSTONE_RETENTION_MS: 7 * day,
      OWNED_DIRECTORY_MODE: 0o700,
      OWNED_FILE_MODE: 0o600,
    });
  });

  it('keeps rate, lease, and terminal-event limits fixed', () => {
    expect(PRESENTATION_RUN_LIMITS).toMatchObject({
      START_RATE_WINDOW_MS: minute,
      MAX_STARTS_PER_CONVERSATION_PER_WINDOW: 2,
      STARTS_PER_CONVERSATION_BURST: 1,
      MAX_STARTS_PER_APP_PER_WINDOW: 6,
      STARTS_PER_APP_BURST: 2,
      INITIAL_CLAIM_LEASE_MS: 30_000,
      INITIAL_CLAIM_RENEWAL_MS: 10_000,
      MAX_WEBSOCKET_INBOUND_FRAME_BYTES: 256 * 1_024,
      WEBSOCKET_EVENT_RATE_WINDOW_MS: minute,
      MAX_WEBSOCKET_EVENTS_PER_WINDOW: 120,
      WEBSOCKET_EVENT_BURST: 20,
      MAX_TERMINAL_BEFORE_BIND_PENDING: 32,
      TERMINAL_BEFORE_BIND_TTL_MS: 120_000,
      MAX_RECONNECT_MESSAGE_BUFFER: 0,
      WEBSOCKET_DIAGNOSTIC_INTERVAL_MS: minute,
    });
  });

  it('enumerates only artifact phases declared by the foundation contract', () => {
    expect(PRESENTATION_RUN_ARTIFACT_PHASES).toHaveLength(8);
  });
});
