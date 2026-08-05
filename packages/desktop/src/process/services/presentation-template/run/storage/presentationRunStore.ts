/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID as createRandomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { PRESENTATION_RUN_DISPATCH_STATUSES, PRESENTATION_RUN_LIMITS } from '@/common/config/constants';
import type { PresentationRunFailure } from '@/common/types/office/presentationRun';
import { PresentationRunSimulatedProcessCrashError, type PresentationRunFiles } from './presentationRunFiles';
import {
  PresentationCanonicalCorruptionError,
  PresentationJournalRecoveryRequiredError,
  PresentationJournalTransactionError,
  type PresentationRunJournal,
} from './presentationRunJournal';
import {
  assertPresentationRunManifestState,
  bindPresentationRunTurn,
  transitionPresentationRunState,
  type BindPresentationRunTurnInput,
  type PresentationRunManifest,
  type PresentationRunTransition,
} from './presentationRunStateMachine';

type LockWaiter = { resolve: (release: () => void) => void };

class KeyMutex {
  private locked = false;
  private readonly waiters: LockWaiter[] = [];

  async acquire(): Promise<() => void> {
    if (!this.locked) {
      this.locked = true;
      return this.release;
    }
    return new Promise<() => void>((resolve) => this.waiters.push({ resolve }));
  }

  get idle(): boolean {
    return !this.locked && this.waiters.length === 0;
  }

  private readonly release = (): void => {
    const next = this.waiters.shift();
    if (next !== undefined) {
      next.resolve(this.release);
      return;
    }
    this.locked = false;
  };
}

/** Acquires every requested key once and in lexical order. */
export class SortedKeyedLock {
  private readonly mutexes = new Map<string, KeyMutex>();

  constructor(private readonly onAcquire?: (sortedKeys: readonly string[]) => void) {}

  async runExclusive<T>(keys: readonly string[], operation: () => Promise<T>): Promise<T> {
    const sortedKeys = [...new Set(keys)].sort();
    this.onAcquire?.(sortedKeys);
    const acquired: { key: string; mutex: KeyMutex; release: () => void }[] = [];
    try {
      for (const key of sortedKeys) {
        const mutex = this.mutexes.get(key) ?? new KeyMutex();
        this.mutexes.set(key, mutex);
        acquired.push({ key, mutex, release: await mutex.acquire() });
      }
      return await operation();
    } finally {
      for (const lock of acquired.reverse()) {
        lock.release();
        if (lock.mutex.idle && this.mutexes.get(lock.key) === lock.mutex) this.mutexes.delete(lock.key);
      }
    }
  }
}

export type StoredPresentationRunManifest = PresentationRunManifest & {
  requestFingerprint: string;
  postAllocationFailure: PresentationRunFailure | null;
};

export type StoredPresentationRunTombstone = {
  version: 2;
  tombstoneType: 'presentation-run';
  revision: 0;
  runId: string;
  tombstonedAt: string;
  discardedRun: StoredPresentationRunManifest;
};

export type PresentationRunSweepResult = {
  failedRetained: string[];
  tombstoned: string[];
  purgedTombstones: string[];
  operatorAlerts: string[];
};

export type StoredPresentationGrantManifest = {
  version: 2;
  grantId: string;
  ownerKey: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  state: 'active' | 'claimed' | 'consumed' | 'revoked' | 'expired';
  byteLength: number;
  claimedRunId: string | null;
};

export type AllocatePresentationRunInput = {
  conversationId: string;
  clientRequestId: string;
  selectedTemplateId: string;
  requestFingerprint: string;
  grantClaims: readonly { grantId: string; expectedRevision: number }[];
};

export type AllocatePresentationRunResult =
  | { ok: true; status: 'created' | 'existing'; run: StoredPresentationRunManifest }
  | PresentationRunFailure;

type PresentationRunIndex = {
  version: 1;
  requests: Record<string, string>;
  conversations: Record<string, string[]>;
  turns: Record<string, string>;
  grants: Record<string, string>;
};

type PresentationRunStoreOptions = {
  files: PresentationRunFiles;
  journal: PresentationRunJournal;
  lock?: SortedKeyedLock;
  now?: () => Date;
  randomUUID?: () => string;
  getFreeDiskBytes: () => Promise<number>;
};

type TokenBucket = {
  tokens: number;
  updatedAtMs: number;
};

const createEmptyIndex = (): PresentationRunIndex => ({
  version: 1,
  requests: {},
  conversations: {},
  turns: {},
  grants: {},
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUEST_FINGERPRINT_RE = /^[0-9a-f]{64}$/;
const REQUEST_FINGERPRINT_INPUT_RE = /^[0-9a-f]{64}$/i;
const PREDISPATCH_STATUSES = new Set<StoredPresentationRunManifest['dispatchStatus']>(['allocating', 'committed']);
const LIVE_GENERATION_STATUSES = new Set<StoredPresentationRunManifest['dispatchStatus']>([
  'dispatching',
  'bound',
  'terminal_verified',
  'dispatch_uncertain',
]);
const RETAINED_STATUSES = new Set<StoredPresentationRunManifest['dispatchStatus']>(['retained', 'failed_retained']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

const isNonnegativeInteger = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

const isIsoTimestamp = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
};

const GRANT_STATES: readonly StoredPresentationGrantManifest['state'][] = [
  'active',
  'claimed',
  'consumed',
  'revoked',
  'expired',
];

function isStructurallyValidGrant(value: unknown, expectedGrantId: string): value is StoredPresentationGrantManifest {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'version',
      'grantId',
      'ownerKey',
      'revision',
      'createdAt',
      'updatedAt',
      'expiresAt',
      'state',
      'byteLength',
      'claimedRunId',
    ]) ||
    value.version !== 2 ||
    value.grantId !== expectedGrantId ||
    !UUID_RE.test(expectedGrantId) ||
    typeof value.ownerKey !== 'string' ||
    !/^(?:conversation|draft):.{1,256}$/.test(value.ownerKey) ||
    !isNonnegativeInteger(value.revision) ||
    !isIsoTimestamp(value.createdAt) ||
    !isIsoTimestamp(value.updatedAt) ||
    !isIsoTimestamp(value.expiresAt) ||
    !GRANT_STATES.includes(value.state as StoredPresentationGrantManifest['state']) ||
    !isNonnegativeInteger(value.byteLength) ||
    (value.claimedRunId !== null && (typeof value.claimedRunId !== 'string' || !UUID_RE.test(value.claimedRunId)))
  ) {
    return false;
  }
  const grant = value as StoredPresentationGrantManifest;
  if (
    Date.parse(grant.updatedAt) < Date.parse(grant.createdAt) ||
    Date.parse(grant.expiresAt) < Date.parse(grant.createdAt)
  ) {
    return false;
  }
  if (grant.state === 'active') return grant.claimedRunId === null;
  if (grant.state === 'claimed' || grant.state === 'consumed') return grant.claimedRunId !== null;
  return true;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function frozenSnapshot<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

const FAILURE_RULES: Record<string, { states: readonly string[]; retryable: boolean }> = {
  FEATURE_DISABLED: { states: ['preflight'], retryable: false },
  DESKTOP_REQUIRED: { states: ['preflight'], retryable: false },
  INVALID_REQUEST: { states: ['preflight'], retryable: false },
  REQUEST_COLLISION: { states: ['lookup'], retryable: false },
  RUN_NOT_FOUND: { states: ['lookup'], retryable: false },
  RUN_FORBIDDEN: { states: ['lookup'], retryable: false },
  RUN_STATE_CONFLICT: { states: ['lookup'], retryable: false },
  DRAFT_NOT_FOUND: { states: ['lookup'], retryable: false },
  DRAFT_EXPIRED: { states: ['draft_expired'], retryable: false },
  DRAFT_FOREIGN: { states: ['lookup'], retryable: false },
  DRAFT_ALREADY_BOUND: { states: ['draft_active'], retryable: false },
  DRAFT_LIMIT_EXCEEDED: { states: ['preflight'], retryable: false },
  GRANT_LIMIT_EXCEEDED: { states: ['preflight'], retryable: false },
  NATIVE_FILE_REQUIRED: { states: ['preflight'], retryable: false },
  DIALOG_UNAVAILABLE: { states: ['preflight'], retryable: false },
  LEASE_CONFLICT: { states: ['committed'], retryable: false },
  LEASE_EXPIRED: { states: ['committed'], retryable: false },
  LEASE_FOREIGN: { states: ['committed'], retryable: false },
  SCOPE_UNAVAILABLE: { states: ['preflight'], retryable: false },
  TEAM_SCOPE_UNSUPPORTED: { states: ['preflight'], retryable: false },
  RUNTIME_UNSUPPORTED: { states: ['preflight'], retryable: false },
  SOURCE_GRANT_INVALID: { states: ['grant_validation'], retryable: false },
  SOURCE_GRANT_EXPIRED: { states: ['grant_expired'], retryable: false },
  SOURCE_GRANT_FOREIGN: { states: ['grant_validation'], retryable: false },
  SOURCE_GRANT_REPLAYED: { states: ['grant_validation'], retryable: false },
  SOURCE_TAMPERED: { states: ['grant_validation'], retryable: false },
  SOURCE_LIMIT_EXCEEDED: { states: ['grant_validation'], retryable: false },
  SOURCE_FORMAT_UNSUPPORTED: { states: ['grant_validation'], retryable: false },
  TEMPLATE_NOT_FOUND: { states: ['preflight'], retryable: false },
  TEMPLATE_UNSUPPORTED: { states: ['preflight'], retryable: false },
  RESOURCE_LIMIT_EXCEEDED: { states: ['preflight'], retryable: false },
  RATE_LIMITED: { states: ['preflight'], retryable: true },
  DISK_RESERVE_EXCEEDED: { states: ['preflight'], retryable: false },
  PERSISTENCE_FAILED: { states: ['preflight', 'committed'], retryable: false },
  BACKEND_PREFLIGHT_BLOCKED: { states: ['committed'], retryable: true },
  DISPATCH_UNCERTAIN: { states: ['dispatch_uncertain'], retryable: false },
  TRACKING_REQUIRED: { states: ['bound', 'retained'], retryable: false },
  CANDIDATE_UNAVAILABLE: { states: ['retained'], retryable: false },
  HASH_MISMATCH: { states: ['retained'], retryable: false },
  UNSAFE_TO_OPEN: { states: ['committed', 'dispatching', 'bound', 'dispatch_uncertain', 'retained'], retryable: false },
  UNSAFE_TO_DISCARD: {
    states: ['committed', 'dispatching', 'bound', 'dispatch_uncertain', 'retained'],
    retryable: false,
  },
  INTERNAL_ERROR: { states: ['preflight'], retryable: false },
};

function hasIdDetails(details: unknown, key: string, extras: Record<string, unknown> = {}): boolean {
  if (!isRecord(details) || typeof details[key] !== 'string') return false;
  return (
    hasExactKeys(details, [key, ...Object.keys(extras)]) &&
    Object.entries(extras).every(([extraKey, expected]) => details[extraKey] === expected)
  );
}

function isFailureDetails(code: string, details: unknown): boolean {
  if (
    [
      'FEATURE_DISABLED',
      'DESKTOP_REQUIRED',
      'INVALID_REQUEST',
      'RUN_NOT_FOUND',
      'RUN_FORBIDDEN',
      'DRAFT_NOT_FOUND',
      'DRAFT_FOREIGN',
      'DRAFT_LIMIT_EXCEEDED',
      'GRANT_LIMIT_EXCEEDED',
      'NATIVE_FILE_REQUIRED',
      'DIALOG_UNAVAILABLE',
      'SCOPE_UNAVAILABLE',
      'TEAM_SCOPE_UNSUPPORTED',
      'RUNTIME_UNSUPPORTED',
      'TEMPLATE_NOT_FOUND',
      'TEMPLATE_UNSUPPORTED',
      'RESOURCE_LIMIT_EXCEEDED',
      'DISK_RESERVE_EXCEEDED',
      'INTERNAL_ERROR',
    ].includes(code)
  ) {
    return details === null;
  }
  if (code === 'REQUEST_COLLISION') return hasIdDetails(details, 'existingRunId');
  if (code === 'DRAFT_EXPIRED') return hasIdDetails(details, 'draftId');
  if (code === 'DRAFT_ALREADY_BOUND') {
    return (
      isRecord(details) &&
      hasExactKeys(details, ['draftId', 'conversationId']) &&
      typeof details.draftId === 'string' &&
      typeof details.conversationId === 'string'
    );
  }
  if (code === 'RUN_STATE_CONFLICT') {
    return (
      isRecord(details) &&
      hasExactKeys(details, ['runId', 'dispatchStatus']) &&
      typeof details.runId === 'string' &&
      typeof details.dispatchStatus === 'string' &&
      (PRESENTATION_RUN_DISPATCH_STATUSES as readonly string[]).includes(details.dispatchStatus)
    );
  }
  if (code === 'SOURCE_GRANT_EXPIRED') return hasIdDetails(details, 'grantId');
  if (code.startsWith('SOURCE_')) {
    return (
      isRecord(details) &&
      Object.keys(details).every((key) => key === 'grantId') &&
      (details.grantId === undefined || typeof details.grantId === 'string')
    );
  }
  if (code === 'LEASE_CONFLICT') {
    return (
      isRecord(details) &&
      hasExactKeys(details, ['runId', 'leaseExpiresAt']) &&
      typeof details.runId === 'string' &&
      typeof details.leaseExpiresAt === 'string'
    );
  }
  if (code === 'LEASE_EXPIRED') return hasIdDetails(details, 'runId', { reclaimAllowed: true });
  if (
    code === 'LEASE_FOREIGN' ||
    code === 'TRACKING_REQUIRED' ||
    code === 'CANDIDATE_UNAVAILABLE' ||
    code === 'HASH_MISMATCH' ||
    code === 'UNSAFE_TO_OPEN' ||
    code === 'UNSAFE_TO_DISCARD'
  ) {
    return hasIdDetails(details, 'runId');
  }
  if (code === 'RATE_LIMITED') {
    return (
      isRecord(details) &&
      hasExactKeys(details, ['retryAfterMs', 'postInvoked']) &&
      isNonnegativeInteger(details.retryAfterMs) &&
      details.postInvoked === false
    );
  }
  if (code === 'BACKEND_PREFLIGHT_BLOCKED') {
    return (
      isRecord(details) &&
      hasExactKeys(details, ['runId', 'retryAfterMs', 'postInvoked']) &&
      typeof details.runId === 'string' &&
      isNonnegativeInteger(details.retryAfterMs) &&
      details.postInvoked === false
    );
  }
  if (code === 'PERSISTENCE_FAILED') {
    return isRecord(details) && hasExactKeys(details, ['postInvoked']) && details.postInvoked === false;
  }
  if (code === 'DISPATCH_UNCERTAIN') {
    return (
      isRecord(details) &&
      hasExactKeys(details, ['runId', 'postInvoked', 'queryRequired']) &&
      typeof details.runId === 'string' &&
      details.postInvoked === true &&
      details.queryRequired === true
    );
  }
  return false;
}

function isPresentationRunFailure(value: unknown): value is PresentationRunFailure {
  if (!isRecord(value) || !hasExactKeys(value, ['ok', 'code', 'messageKey', 'retryable', 'state', 'details'])) {
    return false;
  }
  const rule = typeof value.code === 'string' ? FAILURE_RULES[value.code] : undefined;
  return (
    rule !== undefined &&
    value.ok === false &&
    value.messageKey === `conversation.presentationRun.${value.code}` &&
    value.retryable === rule.retryable &&
    typeof value.state === 'string' &&
    rule.states.includes(value.state) &&
    isFailureDetails(value.code as string, value.details)
  );
}

const requestIndexKey = (conversationId: string, clientRequestId: string): string =>
  `${conversationId}\u0000${clientRequestId}`;

const preflightFailure = <Code extends 'DISK_RESERVE_EXCEEDED' | 'RESOURCE_LIMIT_EXCEEDED'>(
  code: Code
): Extract<PresentationRunFailure, { code: Code }> =>
  ({
    ok: false,
    code,
    messageKey: `conversation.presentationRun.${code}`,
    retryable: false,
    state: 'preflight',
    details: null,
  }) as Extract<PresentationRunFailure, { code: Code }>;

const collisionFailure = (runId: string): Extract<PresentationRunFailure, { code: 'REQUEST_COLLISION' }> => ({
  ok: false,
  code: 'REQUEST_COLLISION',
  messageKey: 'conversation.presentationRun.REQUEST_COLLISION',
  retryable: false,
  state: 'lookup',
  details: { existingRunId: runId },
});

/** Serialized canonical store for presentation runs and their repairable indexes. */
export class PresentationRunStore {
  private readonly files: PresentationRunFiles;
  private readonly journal: PresentationRunJournal;
  private readonly lock: SortedKeyedLock;
  private readonly now: () => Date;
  private readonly randomUUID: () => string;
  private readonly getFreeDiskBytes: () => Promise<number>;
  private initialization: Promise<void> | null = null;
  private index: PresentationRunIndex = createEmptyIndex();
  private readonly runs = new Map<string, StoredPresentationRunManifest>();
  private readonly tombstones = new Map<string, StoredPresentationRunTombstone>();
  private readonly conversationStartBuckets = new Map<string, TokenBucket>();
  private appStartBucket: TokenBucket | null = null;
  private storageHealthy = true;
  private indexRepairPending = false;

  constructor(options: PresentationRunStoreOptions) {
    this.files = options.files;
    this.journal = options.journal;
    this.lock = options.lock ?? new SortedKeyedLock();
    this.now = options.now ?? (() => new Date());
    this.randomUUID = options.randomUUID ?? createRandomUUID;
    this.getFreeDiskBytes = options.getFreeDiskBytes;
  }

  async initialize(): Promise<void> {
    this.initialization ??= this.initializeOnce();
    return this.initialization;
  }

  async allocateRun(unsafeInput: AllocatePresentationRunInput): Promise<AllocatePresentationRunResult> {
    const input = structuredClone(unsafeInput);
    if (typeof input.requestFingerprint === 'string' && REQUEST_FINGERPRINT_INPUT_RE.test(input.requestFingerprint)) {
      input.requestFingerprint = input.requestFingerprint.toLowerCase();
    }
    deepFreeze(input);
    await this.initialize();
    this.assertStorageHealthy();
    const requestKey = requestIndexKey(input.conversationId, input.clientRequestId);
    const lockKeys = [
      'store:health',
      `conversation:${input.conversationId}`,
      ...input.grantClaims.map(({ grantId }) => `grant:${grantId}`),
      'policy:app',
      `request:${requestKey}`,
    ];
    return this.lock.runExclusive(lockKeys, async () => {
      this.assertStorageHealthy();
      const existing = await this.findByRequest(input.conversationId, input.clientRequestId);
      if (existing !== null) {
        if (existing.requestFingerprint !== input.requestFingerprint) return collisionFailure(existing.runId);
        if (existing.postAllocationFailure !== null) return existing.postAllocationFailure;
        return { ok: true, status: 'existing', run: existing };
      }

      if (input.grantClaims.length > PRESENTATION_RUN_LIMITS.MAX_SOURCES_PER_RUN) {
        return preflightFailure('RESOURCE_LIMIT_EXCEEDED');
      }
      const grantIds = input.grantClaims.map(({ grantId }) => grantId);
      if (new Set(grantIds).size !== grantIds.length) {
        const duplicate = grantIds.find((grantId, index) => grantIds.indexOf(grantId) !== index);
        return {
          ok: false,
          code: 'SOURCE_GRANT_INVALID',
          messageKey: 'conversation.presentationRun.SOURCE_GRANT_INVALID',
          retryable: false,
          state: 'grant_validation',
          details: { grantId: duplicate },
        };
      }
      const grants: StoredPresentationGrantManifest[] = [];
      let sourceBytes = 0;
      for (const claim of input.grantClaims) {
        const canonical = await this.journal.readCanonical<Record<string, unknown>>('grant', claim.grantId);
        if (!isStructurallyValidGrant(canonical, claim.grantId)) {
          return {
            ok: false,
            code: 'SOURCE_GRANT_INVALID',
            messageKey: 'conversation.presentationRun.SOURCE_GRANT_INVALID',
            retryable: false,
            state: 'grant_validation',
            details: { grantId: claim.grantId },
          };
        }
        const grant = canonical;
        if (grant.ownerKey !== `conversation:${input.conversationId}`) {
          return {
            ok: false,
            code: 'SOURCE_GRANT_FOREIGN',
            messageKey: 'conversation.presentationRun.SOURCE_GRANT_FOREIGN',
            retryable: false,
            state: 'grant_validation',
            details: { grantId: claim.grantId },
          };
        }
        if (grant.state === 'expired') {
          return {
            ok: false,
            code: 'SOURCE_GRANT_EXPIRED',
            messageKey: 'conversation.presentationRun.SOURCE_GRANT_EXPIRED',
            retryable: false,
            state: 'grant_expired',
            details: { grantId: claim.grantId },
          };
        }
        if (grant.state === 'claimed' || grant.state === 'consumed') {
          return {
            ok: false,
            code: 'SOURCE_GRANT_REPLAYED',
            messageKey: 'conversation.presentationRun.SOURCE_GRANT_REPLAYED',
            retryable: false,
            state: 'grant_validation',
            details: { grantId: claim.grantId },
          };
        }
        if (grant.state !== 'active' || grant.revision !== claim.expectedRevision) {
          return {
            ok: false,
            code: 'SOURCE_GRANT_INVALID',
            messageKey: 'conversation.presentationRun.SOURCE_GRANT_INVALID',
            retryable: false,
            state: 'grant_validation',
            details: { grantId: claim.grantId },
          };
        }
        sourceBytes += grant.byteLength;
        if (
          grant.byteLength > PRESENTATION_RUN_LIMITS.MAX_SOURCE_BYTES ||
          sourceBytes > PRESENTATION_RUN_LIMITS.MAX_TOTAL_SOURCE_BYTES
        ) {
          return {
            ok: false,
            code: 'SOURCE_LIMIT_EXCEEDED',
            messageKey: 'conversation.presentationRun.SOURCE_LIMIT_EXCEEDED',
            retryable: false,
            state: 'grant_validation',
            details: { grantId: claim.grantId },
          };
        }
        grants.push(grant);
      }
      const freeBytes = await this.getFreeDiskBytes();
      const allocationTime = this.now();
      const expiredGrant = grants.find((grant) => Date.parse(grant.expiresAt) <= allocationTime.getTime());
      if (expiredGrant !== undefined) {
        return {
          ok: false,
          code: 'SOURCE_GRANT_EXPIRED',
          messageKey: 'conversation.presentationRun.SOURCE_GRANT_EXPIRED',
          retryable: false,
          state: 'grant_expired',
          details: { grantId: expiredGrant.grantId },
        };
      }
      const capacityFailure = this.getCapacityFailure(input.conversationId, freeBytes);
      if (capacityFailure !== null) return capacityFailure;
      if (this.wouldExceedRetainedBytes(input.conversationId, sourceBytes)) {
        return preflightFailure('RESOURCE_LIMIT_EXCEEDED');
      }
      const rateFailure = this.getRateLimitFailure(input.conversationId, allocationTime.getTime());
      if (rateFailure !== null) return rateFailure;
      const now = allocationTime.toISOString();
      const runId = this.randomUUID();
      if (!UUID_RE.test(runId) || this.runs.has(runId) || this.tombstones.has(runId)) {
        throw new Error('Presentation run allocator produced a colliding id');
      }
      const run: StoredPresentationRunManifest = {
        version: 2,
        runId,
        clientRequestId: input.clientRequestId,
        conversationId: input.conversationId,
        selectedTemplateId: input.selectedTemplateId,
        requestFingerprint: input.requestFingerprint,
        postAllocationFailure: null,
        revision: 0,
        createdAt: now,
        updatedAt: now,
        statusEnteredAt: now,
        committedAt: null,
        retainedAt: null,
        dispatchStatus: 'allocating',
        artifactPhase: 'none',
        disposition: null,
        retainedCandidate: null,
        sourceGrants: input.grantClaims.map(({ grantId }) => grantId),
        binding: null,
        postInvoked: false,
        retainedBytes: sourceBytes,
      };
      this.assertStoredRun(run, runId);
      await this.runCanonicalTransaction({
        mutations: [
          { entityKind: 'run', entityId: runId, expectedRevision: null, nextManifest: run },
          ...grants.map((grant) => ({
            entityKind: 'grant' as const,
            entityId: grant.grantId,
            expectedRevision: grant.revision,
            nextManifest: {
              ...grant,
              revision: grant.revision + 1,
              updatedAt: now,
              state: 'claimed' as const,
              claimedRunId: runId,
            },
          })),
        ],
      });
      const cached = this.cacheRun(run);
      this.addRunToIndex(cached);
      this.consumeStartTokens(input.conversationId, allocationTime.getTime());
      await this.persistDerivedIndexBestEffort();
      return { ok: true, status: 'created', run: this.snapshotRun(cached) };
    });
  }

  async recordPostAllocationFailure(
    runId: string,
    expectedRevision: number,
    unsafeFailure: PresentationRunFailure
  ): Promise<StoredPresentationRunManifest> {
    const failure = frozenSnapshot(unsafeFailure);
    if (!isPresentationRunFailure(failure)) throw new Error('Invalid presentation run failure envelope');
    await this.initialize();
    this.assertStorageHealthy();
    return this.lock.runExclusive(['store:health', `run:${runId}`], async () => {
      this.assertStorageHealthy();
      const current = this.runs.get(runId);
      if (current === undefined) throw new Error('Presentation run not found');
      if (current.postAllocationFailure !== null) {
        if (isDeepStrictEqual(current.postAllocationFailure, failure)) return this.snapshotRun(current);
        throw new Error('Presentation post-allocation failure is immutable');
      }
      if (current.revision !== expectedRevision) throw new Error('Presentation run revision conflict');
      const next: StoredPresentationRunManifest = {
        ...current,
        revision: current.revision + 1,
        updatedAt: this.now().toISOString(),
        postAllocationFailure: structuredClone(failure),
      };
      this.assertStoredRun(next, runId);
      await this.runCanonicalTransaction({
        mutations: [{ entityKind: 'run', entityId: runId, expectedRevision: current.revision, nextManifest: next }],
      });
      const cached = this.cacheRun(next);
      this.index = this.buildIndex();
      await this.persistDerivedIndexBestEffort();
      return this.snapshotRun(cached);
    });
  }

  async retainCandidate(runId: string, expectedRevision: number): Promise<StoredPresentationRunManifest> {
    await this.initialize();
    this.assertStorageHealthy();
    return this.lock.runExclusive(['store:health', `run:${runId}`], async () => {
      this.assertStorageHealthy();
      const current = this.runs.get(runId);
      if (current === undefined) throw new Error('Presentation run not found');
      if (current.revision !== expectedRevision) throw new Error('Presentation run revision conflict');
      if (
        current.dispatchStatus !== 'terminal_verified' ||
        current.artifactPhase !== 'sources_extracted' ||
        current.retainedCandidate !== null
      ) {
        throw new Error('Candidate retention requires terminal verification');
      }
      const candidateByteLength = await this.files.getStagingCandidateByteLength(runId);
      if (this.wouldExceedRetainedBytes(current.conversationId, candidateByteLength)) {
        throw new Error('Presentation retained resource limit exceeded');
      }
      const prepared = await this.files.prepareRetainedCandidate(runId);
      if (this.wouldExceedRetainedBytes(current.conversationId, prepared.byteLength)) {
        await this.files.removePreparedRetainedCandidate(prepared);
        throw new Error('Presentation retained resource limit exceeded');
      }
      const next = transitionPresentationRunState(current, {
        expectedRevision,
        dispatchStatus: 'terminal_verified',
        artifactPhase: 'candidate_retained',
        retainedCandidate: {
          relativePath: prepared.finalRelativePath,
          sha256: prepared.sha256,
          byteLength: prepared.byteLength,
        },
        now: this.now().toISOString(),
      }) as StoredPresentationRunManifest;
      next.retainedBytes = current.retainedBytes + prepared.byteLength;
      this.assertStoredRun(next, runId);
      await this.runCanonicalTransaction(
        {
          retainedCandidatePromotions: [prepared],
          mutations: [{ entityKind: 'run', entityId: runId, expectedRevision: current.revision, nextManifest: next }],
        },
        () => this.files.removePreparedRetainedCandidate(prepared)
      );
      const cached = this.cacheRun(next);
      this.index = this.buildIndex();
      await this.persistDerivedIndexBestEffort();
      return this.snapshotRun(cached);
    });
  }

  async getRun(runId: string): Promise<StoredPresentationRunManifest | null> {
    await this.initialize();
    this.assertStorageHealthy();
    return this.lock.runExclusive(['store:health'], async () => {
      this.assertStorageHealthy();
      const run = this.runs.get(runId) ?? this.tombstones.get(runId)?.discardedRun;
      return run === undefined ? null : this.snapshotRun(run);
    });
  }

  async getByRequest(conversationId: string, clientRequestId: string): Promise<StoredPresentationRunManifest | null> {
    await this.initialize();
    this.assertStorageHealthy();
    return this.lock.runExclusive(['store:health'], async () => {
      this.assertStorageHealthy();
      return this.findByRequest(conversationId, clientRequestId);
    });
  }

  async transitionRun(
    runId: string,
    unsafeTransition: PresentationRunTransition
  ): Promise<StoredPresentationRunManifest> {
    const transition = frozenSnapshot(unsafeTransition);
    await this.initialize();
    this.assertStorageHealthy();
    if (transition.dispatchStatus === 'bound' || transition.binding !== undefined) {
      throw new Error('Presentation run binding requires bindRunTurn');
    }
    if (transition.dispatchStatus === 'discarded') {
      throw new Error('Presentation discard requires discardRun');
    }
    if (transition.artifactPhase === 'candidate_retained' || transition.retainedCandidate !== undefined) {
      throw new Error('Presentation candidate retention requires retainCandidate');
    }
    const currentForLock = this.runs.get(runId);
    if (currentForLock === undefined) throw new Error('Presentation run not found');
    const lockKeys = ['store:health', `run:${runId}`];
    if (transition.dispatchStatus === 'dispatching') {
      lockKeys.push('policy:app', `conversation:${currentForLock.conversationId}`);
    }
    return this.lock.runExclusive(lockKeys, async () => {
      this.assertStorageHealthy();
      const current = this.runs.get(runId);
      if (current === undefined) throw new Error('Presentation run not found');
      const next = transitionPresentationRunState(current, transition) as StoredPresentationRunManifest;
      if (!LIVE_GENERATION_STATUSES.has(current.dispatchStatus) && LIVE_GENERATION_STATUSES.has(next.dispatchStatus)) {
        this.assertLiveGenerationCapacity(current.conversationId);
      }
      await this.commitRunMutation(current, next);
      return this.snapshotRun(next);
    });
  }

  async bindRunTurn(
    runId: string,
    unsafeInput: BindPresentationRunTurnInput
  ): Promise<{ status: 'bound' | 'already_bound'; manifest: StoredPresentationRunManifest }> {
    const input = frozenSnapshot(unsafeInput);
    await this.initialize();
    this.assertStorageHealthy();
    return this.lock.runExclusive(
      [
        'store:health',
        `conversation:${input.conversationId}`,
        `run:${runId}`,
        `turn:${input.conversationId}\u0000${input.turnId}`,
      ],
      async () => {
        this.assertStorageHealthy();
        const current = this.runs.get(runId);
        if (current === undefined) throw new Error('Presentation run not found');
        const turnKey = `${input.conversationId}\u0000${input.turnId}`;
        const owner = this.index.turns[turnKey];
        if (owner !== undefined && owner !== runId) {
          throw new Error('Presentation conversation turn is already bound to another run');
        }
        const result = bindPresentationRunTurn(current, input);
        if (result.status === 'already_bound') {
          return { status: result.status, manifest: this.snapshotRun(current) };
        }
        const next = result.manifest as StoredPresentationRunManifest;
        await this.commitRunMutation(current, next);
        return { status: result.status, manifest: this.snapshotRun(next) };
      }
    );
  }

  async listPublicRecoverable(conversationId: string): Promise<StoredPresentationRunManifest[]> {
    await this.initialize();
    this.assertStorageHealthy();
    const recoverable = new Set(['retained', 'failed_retained', 'dispatch_uncertain']);
    return this.lock.runExclusive(['store:health'], async () => {
      this.assertStorageHealthy();
      return this.sortedRuns((run) => run.conversationId === conversationId && recoverable.has(run.dispatchStatus));
    });
  }

  async listDispatchReconciliation(): Promise<StoredPresentationRunManifest[]> {
    await this.initialize();
    this.assertStorageHealthy();
    return this.lock.runExclusive(['store:health'], async () => {
      this.assertStorageHealthy();
      return this.sortedRuns((run) => run.dispatchStatus === 'dispatching' || run.dispatchStatus === 'bound');
    });
  }

  async listTerminalReconciliation(): Promise<StoredPresentationRunManifest[]> {
    await this.initialize();
    this.assertStorageHealthy();
    return this.lock.runExclusive(['store:health'], async () => {
      this.assertStorageHealthy();
      return this.sortedRuns((run) => run.dispatchStatus === 'terminal_verified');
    });
  }

  async listCommittedForInitialDispatch(): Promise<StoredPresentationRunManifest[]> {
    await this.initialize();
    this.assertStorageHealthy();
    return this.lock.runExclusive(['store:health'], async () => {
      this.assertStorageHealthy();
      return this.sortedRuns((run) => run.dispatchStatus === 'committed' && !run.postInvoked);
    });
  }

  async discardRun(runId: string, expectedRevision: number): Promise<StoredPresentationRunManifest> {
    await this.initialize();
    this.assertStorageHealthy();
    return this.lock.runExclusive(['store:health', 'policy:app', `run:${runId}`], async () => {
      this.assertStorageHealthy();
      const existingTombstone = this.tombstones.get(runId);
      if (existingTombstone !== undefined) {
        await this.cleanupTombstonedRun(existingTombstone);
        return this.snapshotRun(existingTombstone.discardedRun);
      }
      const current = this.runs.get(runId);
      if (current === undefined) throw new Error('Presentation run not found');
      const discarded = transitionPresentationRunState(current, {
        expectedRevision,
        dispatchStatus: 'discarded',
        now: this.now().toISOString(),
      }) as StoredPresentationRunManifest;
      return this.persistTombstone(current, discarded);
    });
  }

  async sweepExpiredRuns(): Promise<PresentationRunSweepResult> {
    await this.initialize();
    this.assertStorageHealthy();
    return this.lock.runExclusive(['store:health', 'policy:app'], async () => {
      this.assertStorageHealthy();
      return this.sweepCanonicalState(this.now());
    });
  }

  private async initializeOnce(): Promise<void> {
    await this.files.initialize();
    await this.journal.recover();
    await this.reloadCanonicalState();
    await this.sweepCanonicalState(this.now());
  }

  private async sweepCanonicalState(now: Date): Promise<PresentationRunSweepResult> {
    const nowIso = now.toISOString();
    const result: PresentationRunSweepResult = {
      failedRetained: [],
      tombstoned: [],
      purgedTombstones: [],
      operatorAlerts: [],
    };
    for (const run of Array.from(this.runs.values())) {
      if (
        run.dispatchStatus === 'allocating' &&
        now.getTime() - Date.parse(run.createdAt) >= PRESENTATION_RUN_LIMITS.ALLOCATING_TTL_MS
      ) {
        const next = transitionPresentationRunState(run, {
          expectedRevision: run.revision,
          dispatchStatus: 'failed_retained',
          disposition: 'TRACKING_REQUIRED',
          now: nowIso,
        }) as StoredPresentationRunManifest;
        await this.commitRunMutation(run, next);
        result.failedRetained.push(run.runId);
        continue;
      }
      if (
        run.dispatchStatus === 'committed' &&
        run.committedAt !== null &&
        now.getTime() - Date.parse(run.committedAt) >= PRESENTATION_RUN_LIMITS.COMMITTED_TTL_MS
      ) {
        const next = transitionPresentationRunState(run, {
          expectedRevision: run.revision,
          dispatchStatus: 'failed_retained',
          disposition: 'TRACKING_REQUIRED',
          now: nowIso,
        }) as StoredPresentationRunManifest;
        await this.commitRunMutation(run, next);
        result.failedRetained.push(run.runId);
        continue;
      }
      if (
        (run.dispatchStatus === 'retained' || run.dispatchStatus === 'failed_retained') &&
        run.retainedAt !== null &&
        now.getTime() - Date.parse(run.retainedAt) >= PRESENTATION_RUN_LIMITS.FAILED_OR_REVIEW_RETENTION_MS
      ) {
        const discarded = this.createGarbageCollectedDiscard(run, nowIso);
        await this.persistTombstone(run, discarded);
        result.tombstoned.push(run.runId);
        continue;
      }
      if (
        run.dispatchStatus === 'dispatch_uncertain' &&
        now.getTime() - Date.parse(run.statusEnteredAt) >= PRESENTATION_RUN_LIMITS.UNCERTAIN_OPERATOR_ALERT_MS
      ) {
        result.operatorAlerts.push(run.runId);
      }
    }
    for (const tombstone of Array.from(this.tombstones.values())) {
      await this.cleanupTombstonedRun(tombstone);
      if (now.getTime() - Date.parse(tombstone.tombstonedAt) >= PRESENTATION_RUN_LIMITS.TOMBSTONE_RETENTION_MS) {
        await this.files.removeTombstone('run', tombstone.runId);
        this.tombstones.delete(tombstone.runId);
        result.purgedTombstones.push(tombstone.runId);
      }
    }
    if (result.purgedTombstones.length > 0) {
      this.index = this.buildIndex();
      await this.persistDerivedIndexBestEffort();
    }
    return result;
  }

  private async reloadCanonicalState(): Promise<void> {
    const scannedRuns = new Map<string, StoredPresentationRunManifest>();
    const scannedTombstones = new Map<string, StoredPresentationRunTombstone>();
    for (const runId of (await this.files.listTombstoneIds('run')).sort()) {
      let tombstone: StoredPresentationRunTombstone | null;
      try {
        tombstone = await this.journal.readCanonical<StoredPresentationRunTombstone>('run-tombstone', runId);
        if (tombstone === null) {
          throw new PresentationCanonicalCorruptionError('Presentation run tombstone is missing');
        }
        this.assertStoredTombstone(tombstone, runId);
      } catch (error) {
        if (!(error instanceof PresentationCanonicalCorruptionError)) throw error;
        await this.files.quarantineEntity('run-tombstone', runId);
        continue;
      }
      await this.cleanupTombstonedRun(tombstone);
      scannedTombstones.set(runId, frozenSnapshot(tombstone));
    }
    for (const runId of (await this.files.listEntityIds('run')).sort()) {
      let run: StoredPresentationRunManifest | null;
      try {
        run = await this.journal.readCanonical<StoredPresentationRunManifest>('run', runId);
        if (run === null) {
          throw new PresentationCanonicalCorruptionError('Presentation run manifest is missing');
        }
        this.assertStoredRun(run, runId);
      } catch (error) {
        if (!(error instanceof PresentationCanonicalCorruptionError)) throw error;
        await this.files.quarantineEntity('run', runId);
        continue;
      }
      await this.files.removeUnreferencedCandidateTemps(runId);
      const cached = frozenSnapshot(run);
      scannedRuns.set(cached.runId, cached);
    }
    const scannedIndex = this.buildIndex(scannedRuns.values(), scannedTombstones.values());
    this.runs.clear();
    for (const [runId, run] of scannedRuns) this.runs.set(runId, run);
    this.tombstones.clear();
    for (const [runId, tombstone] of scannedTombstones) this.tombstones.set(runId, tombstone);
    this.index = scannedIndex;
    this.rebuildRateBuckets();
    await this.persistDerivedIndexBestEffort();
  }

  private async findByRequest(
    conversationId: string,
    clientRequestId: string
  ): Promise<StoredPresentationRunManifest | null> {
    const indexedRunId = this.index.requests[requestIndexKey(conversationId, clientRequestId)];
    if (indexedRunId !== undefined) {
      const indexed = this.runs.get(indexedRunId);
      const indexedTombstone = this.tombstones.get(indexedRunId)?.discardedRun;
      const indexedRecord = indexed ?? indexedTombstone;
      if (
        indexedRecord !== undefined &&
        indexedRecord.conversationId === conversationId &&
        indexedRecord.clientRequestId === clientRequestId
      ) {
        return this.snapshotRun(indexedRecord);
      }
    }
    for (const run of this.runs.values()) {
      if (run.conversationId === conversationId && run.clientRequestId === clientRequestId) {
        return this.snapshotRun(run);
      }
    }
    for (const tombstone of this.tombstones.values()) {
      const run = tombstone.discardedRun;
      if (run.conversationId === conversationId && run.clientRequestId === clientRequestId) {
        return this.snapshotRun(run);
      }
    }
    return null;
  }

  private addRunToIndex(run: StoredPresentationRunManifest, index: PresentationRunIndex = this.index): void {
    const requestKey = requestIndexKey(run.conversationId, run.clientRequestId);
    const requestOwner = index.requests[requestKey];
    if (requestOwner !== undefined && requestOwner !== run.runId) {
      throw new PresentationCanonicalCorruptionError('Duplicate presentation request ownership');
    }
    index.requests[requestKey] = run.runId;
    const runs = index.conversations[run.conversationId] ?? [];
    if (!runs.includes(run.runId)) runs.push(run.runId);
    index.conversations[run.conversationId] = runs;
    if (run.binding !== null) {
      const turnKey = `${run.binding.conversationId}\u0000${run.binding.turnId}`;
      const turnOwner = index.turns[turnKey];
      if (turnOwner !== undefined && turnOwner !== run.runId) {
        throw new PresentationCanonicalCorruptionError('Duplicate presentation turn ownership');
      }
      index.turns[turnKey] = run.runId;
    }
    for (const grantId of run.sourceGrants) {
      const grantOwner = index.grants[grantId];
      if (grantOwner !== undefined && grantOwner !== run.runId) {
        throw new PresentationCanonicalCorruptionError('Duplicate presentation grant ownership');
      }
      index.grants[grantId] = run.runId;
    }
  }

  private async commitRunMutation(
    current: StoredPresentationRunManifest,
    next: StoredPresentationRunManifest
  ): Promise<void> {
    if (!isDeepStrictEqual(current.postAllocationFailure, next.postAllocationFailure)) {
      throw new Error('Presentation post-allocation failure is immutable');
    }
    this.assertStoredRun(next, current.runId);
    await this.runCanonicalTransaction({
      mutations: [
        {
          entityKind: 'run',
          entityId: current.runId,
          expectedRevision: current.revision,
          nextManifest: next,
        },
      ],
    });
    this.cacheRun(next);
    this.index = this.buildIndex();
    await this.persistDerivedIndexBestEffort();
  }

  private async persistTombstone(
    current: StoredPresentationRunManifest,
    discarded: StoredPresentationRunManifest
  ): Promise<StoredPresentationRunManifest> {
    const tombstone: StoredPresentationRunTombstone = {
      version: 2,
      tombstoneType: 'presentation-run',
      revision: 0,
      runId: current.runId,
      tombstonedAt: discarded.updatedAt,
      discardedRun: frozenSnapshot(discarded),
    };
    this.assertStoredTombstone(tombstone, current.runId);
    await this.runCanonicalTransaction({
      mutations: [
        {
          entityKind: 'run',
          entityId: current.runId,
          expectedRevision: current.revision,
          nextManifest: discarded,
        },
        {
          entityKind: 'run-tombstone',
          entityId: current.runId,
          expectedRevision: null,
          nextManifest: tombstone,
        },
      ],
    });
    const cachedTombstone = frozenSnapshot(tombstone);
    this.tombstones.set(current.runId, cachedTombstone);
    this.runs.delete(current.runId);
    this.index = this.buildIndex();
    await this.persistDerivedIndexBestEffort();
    await this.cleanupTombstonedRun(cachedTombstone);
    return this.snapshotRun(cachedTombstone.discardedRun);
  }

  private createGarbageCollectedDiscard(
    current: StoredPresentationRunManifest,
    now: string
  ): StoredPresentationRunManifest {
    if (current.dispatchStatus !== 'retained' && current.dispatchStatus !== 'failed_retained') {
      throw new Error('Presentation run is not eligible for garbage collection');
    }
    const discarded: StoredPresentationRunManifest = {
      ...current,
      revision: current.revision + 1,
      updatedAt: now,
      statusEnteredAt: now,
      dispatchStatus: 'discarded',
      artifactPhase: null,
      disposition: null,
      retainedCandidate: null,
      binding: null,
      retainedBytes: 0,
    };
    this.assertStoredRun(discarded, current.runId);
    return discarded;
  }

  private async cleanupTombstonedRun(tombstone: StoredPresentationRunTombstone): Promise<void> {
    await this.files.removeRun(tombstone.runId);
    for (const grantId of tombstone.discardedRun.sourceGrants) await this.files.removeGrant(grantId);
  }

  private sortedRuns(predicate: (run: StoredPresentationRunManifest) => boolean): StoredPresentationRunManifest[] {
    return Array.from(this.runs.values())
      .filter(predicate)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.runId.localeCompare(left.runId))
      .map((run) => this.snapshotRun(run));
  }

  private buildIndex(
    runs: Iterable<StoredPresentationRunManifest> = this.runs.values(),
    tombstones: Iterable<StoredPresentationRunTombstone> = this.tombstones.values()
  ): PresentationRunIndex {
    const index = createEmptyIndex();
    for (const run of runs) this.addRunToIndex(run, index);
    for (const tombstone of tombstones) {
      const run = tombstone.discardedRun;
      const requestKey = requestIndexKey(run.conversationId, run.clientRequestId);
      if (index.requests[requestKey] !== undefined && index.requests[requestKey] !== run.runId) {
        throw new PresentationCanonicalCorruptionError('Duplicate presentation request ownership');
      }
      index.requests[requestKey] = run.runId;
    }
    return index;
  }

  private assertStoredRun(run: StoredPresentationRunManifest, expectedRunId: string): void {
    if (
      !isRecord(run) ||
      !hasExactKeys(run, [
        'version',
        'runId',
        'clientRequestId',
        'conversationId',
        'selectedTemplateId',
        'requestFingerprint',
        'postAllocationFailure',
        'revision',
        'createdAt',
        'updatedAt',
        'statusEnteredAt',
        'committedAt',
        'retainedAt',
        'dispatchStatus',
        'artifactPhase',
        'disposition',
        'retainedCandidate',
        'sourceGrants',
        'binding',
        'postInvoked',
        'retainedBytes',
      ]) ||
      run.version !== 2 ||
      run.runId !== expectedRunId ||
      !REQUEST_FINGERPRINT_RE.test(run.requestFingerprint) ||
      !Number.isSafeInteger(run.revision) ||
      run.revision < 0 ||
      !Array.isArray(run.sourceGrants) ||
      !Number.isSafeInteger(run.retainedBytes) ||
      run.retainedBytes < 0 ||
      (run.postAllocationFailure !== null && !isPresentationRunFailure(run.postAllocationFailure))
    ) {
      throw new PresentationCanonicalCorruptionError('Presentation canonical run manifest is corrupt');
    }
    if (
      (run.retainedCandidate !== null &&
        (!isRecord(run.retainedCandidate) ||
          !hasExactKeys(run.retainedCandidate, ['relativePath', 'sha256', 'byteLength']))) ||
      (run.binding !== null &&
        (!isRecord(run.binding) || !hasExactKeys(run.binding, ['conversationId', 'turnId', 'runtime', 'boundAt'])))
    ) {
      throw new PresentationCanonicalCorruptionError('Presentation canonical run manifest is corrupt');
    }
    try {
      assertPresentationRunManifestState(run);
    } catch (error) {
      throw new PresentationCanonicalCorruptionError('Presentation canonical run manifest is corrupt', {
        cause: error,
      });
    }
  }

  private assertStoredTombstone(tombstone: StoredPresentationRunTombstone, expectedRunId: string): void {
    if (
      !hasExactKeys(tombstone as unknown as Record<string, unknown>, [
        'version',
        'tombstoneType',
        'revision',
        'runId',
        'tombstonedAt',
        'discardedRun',
      ]) ||
      tombstone.version !== 2 ||
      tombstone.tombstoneType !== 'presentation-run' ||
      tombstone.revision !== 0 ||
      tombstone.runId !== expectedRunId ||
      !UUID_RE.test(tombstone.runId) ||
      Number.isNaN(Date.parse(tombstone.tombstonedAt)) ||
      new Date(Date.parse(tombstone.tombstonedAt)).toISOString() !== tombstone.tombstonedAt ||
      !isRecord(tombstone.discardedRun) ||
      tombstone.discardedRun.runId !== tombstone.runId ||
      tombstone.discardedRun.dispatchStatus !== 'discarded' ||
      tombstone.discardedRun.updatedAt !== tombstone.tombstonedAt
    ) {
      throw new PresentationCanonicalCorruptionError('Presentation canonical run tombstone is corrupt');
    }
    this.assertStoredRun(tombstone.discardedRun, tombstone.runId);
  }

  private cacheRun(run: StoredPresentationRunManifest): StoredPresentationRunManifest {
    const cached = frozenSnapshot(run);
    this.runs.set(cached.runId, cached);
    return cached;
  }

  private snapshotRun(run: StoredPresentationRunManifest): StoredPresentationRunManifest {
    return frozenSnapshot(run);
  }

  private getCapacityFailure(
    conversationId: string,
    freeBytes: number
  ): Extract<PresentationRunFailure, { code: 'RESOURCE_LIMIT_EXCEEDED' | 'DISK_RESERVE_EXCEEDED' }> | null {
    const runs = Array.from(this.runs.values());
    const predispatch = runs.filter((run) => PREDISPATCH_STATUSES.has(run.dispatchStatus));
    const live = runs.filter((run) => LIVE_GENERATION_STATUSES.has(run.dispatchStatus));
    const active = [...predispatch, ...live];
    const retained = runs.filter((run) => RETAINED_STATUSES.has(run.dispatchStatus));
    const conversationActiveCount = active.filter((run) => run.conversationId === conversationId).length;
    const conversationRetained = retained.filter((run) => run.conversationId === conversationId);
    const conversationDurableBytes = runs
      .filter((run) => run.conversationId === conversationId)
      .reduce((total, run) => total + run.retainedBytes, 0);
    const appDurableBytes = runs.reduce((total, run) => total + run.retainedBytes, 0);
    if (
      predispatch.length >= PRESENTATION_RUN_LIMITS.MAX_PREDISPATCH_INTENTS_PER_APP ||
      conversationRetained.length >= PRESENTATION_RUN_LIMITS.MAX_RETAINED_RUNS_PER_CONVERSATION ||
      retained.length >= PRESENTATION_RUN_LIMITS.MAX_RETAINED_RUNS_PER_APP ||
      conversationRetained.length + conversationActiveCount >=
        PRESENTATION_RUN_LIMITS.MAX_RETAINED_RUNS_PER_CONVERSATION ||
      retained.length + active.length >= PRESENTATION_RUN_LIMITS.MAX_RETAINED_RUNS_PER_APP ||
      conversationDurableBytes >= PRESENTATION_RUN_LIMITS.MAX_RETAINED_BYTES_PER_CONVERSATION ||
      appDurableBytes >= PRESENTATION_RUN_LIMITS.MAX_RETAINED_BYTES_PER_APP
    ) {
      return preflightFailure('RESOURCE_LIMIT_EXCEEDED');
    }
    const reservedAfterStart = (active.length + 1) * PRESENTATION_RUN_LIMITS.TRANSIENT_DISK_RESERVATION_BYTES_PER_RUN;
    if (
      !Number.isSafeInteger(freeBytes) ||
      freeBytes < PRESENTATION_RUN_LIMITS.MIN_FREE_BYTES_BEFORE_START ||
      freeBytes - reservedAfterStart < PRESENTATION_RUN_LIMITS.MIN_UNRESERVED_BYTES_AFTER_RESERVATIONS
    ) {
      return preflightFailure('DISK_RESERVE_EXCEEDED');
    }
    return null;
  }

  private assertLiveGenerationCapacity(conversationId: string): void {
    const live = Array.from(this.runs.values()).filter((run) => LIVE_GENERATION_STATUSES.has(run.dispatchStatus));
    if (
      live.filter((run) => run.conversationId === conversationId).length >=
        PRESENTATION_RUN_LIMITS.MAX_LIVE_RUNS_PER_CONVERSATION ||
      live.length >= PRESENTATION_RUN_LIMITS.MAX_LIVE_RUNS_PER_APP
    ) {
      throw new Error('Presentation live run resource limit exceeded');
    }
  }

  private wouldExceedRetainedBytes(conversationId: string, additionalBytes: number): boolean {
    if (!Number.isSafeInteger(additionalBytes) || additionalBytes < 0) return true;
    const runs = Array.from(this.runs.values());
    const conversationBytes = runs
      .filter((run) => run.conversationId === conversationId)
      .reduce((total, run) => total + run.retainedBytes, 0);
    const appBytes = runs.reduce((total, run) => total + run.retainedBytes, 0);
    return (
      conversationBytes + additionalBytes > PRESENTATION_RUN_LIMITS.MAX_RETAINED_BYTES_PER_CONVERSATION ||
      appBytes + additionalBytes > PRESENTATION_RUN_LIMITS.MAX_RETAINED_BYTES_PER_APP
    );
  }

  private getRateLimitFailure(
    conversationId: string,
    nowMs: number
  ): Extract<PresentationRunFailure, { code: 'RATE_LIMITED' }> | null {
    const conversationBucket = this.refillBucket(
      this.conversationStartBuckets.get(conversationId),
      PRESENTATION_RUN_LIMITS.STARTS_PER_CONVERSATION_BURST,
      PRESENTATION_RUN_LIMITS.MAX_STARTS_PER_CONVERSATION_PER_WINDOW,
      nowMs
    );
    this.conversationStartBuckets.set(conversationId, conversationBucket);
    const appBucket = this.refillBucket(
      this.appStartBucket ?? undefined,
      PRESENTATION_RUN_LIMITS.STARTS_PER_APP_BURST,
      PRESENTATION_RUN_LIMITS.MAX_STARTS_PER_APP_PER_WINDOW,
      nowMs
    );
    this.appStartBucket = appBucket;
    const conversationDeficit = Math.max(0, 1 - conversationBucket.tokens);
    const appDeficit = Math.max(0, 1 - appBucket.tokens);
    if (conversationDeficit === 0 && appDeficit === 0) return null;
    const conversationRetryMs =
      (conversationDeficit * PRESENTATION_RUN_LIMITS.START_RATE_WINDOW_MS) /
      PRESENTATION_RUN_LIMITS.MAX_STARTS_PER_CONVERSATION_PER_WINDOW;
    const appRetryMs =
      (appDeficit * PRESENTATION_RUN_LIMITS.START_RATE_WINDOW_MS) /
      PRESENTATION_RUN_LIMITS.MAX_STARTS_PER_APP_PER_WINDOW;
    return {
      ok: false,
      code: 'RATE_LIMITED',
      messageKey: 'conversation.presentationRun.RATE_LIMITED',
      retryable: true,
      state: 'preflight',
      details: { retryAfterMs: Math.ceil(Math.max(conversationRetryMs, appRetryMs)), postInvoked: false },
    };
  }

  private consumeStartTokens(conversationId: string, atMs: number): void {
    this.recordStartEvent(conversationId, atMs);
  }

  private rebuildRateBuckets(): void {
    this.conversationStartBuckets.clear();
    this.appStartBucket = null;
    const starts = Array.from(this.runs.values())
      .concat(Array.from(this.tombstones.values(), ({ discardedRun }) => discardedRun))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.runId.localeCompare(right.runId));
    for (const run of starts) this.recordStartEvent(run.conversationId, Date.parse(run.createdAt));
  }

  private recordStartEvent(conversationId: string, atMs: number): void {
    const conversationBucket = this.refillBucket(
      this.conversationStartBuckets.get(conversationId),
      PRESENTATION_RUN_LIMITS.STARTS_PER_CONVERSATION_BURST,
      PRESENTATION_RUN_LIMITS.MAX_STARTS_PER_CONVERSATION_PER_WINDOW,
      atMs
    );
    conversationBucket.tokens = Math.max(0, conversationBucket.tokens - 1);
    this.conversationStartBuckets.set(conversationId, conversationBucket);
    const appBucket = this.refillBucket(
      this.appStartBucket ?? undefined,
      PRESENTATION_RUN_LIMITS.STARTS_PER_APP_BURST,
      PRESENTATION_RUN_LIMITS.MAX_STARTS_PER_APP_PER_WINDOW,
      atMs
    );
    appBucket.tokens = Math.max(0, appBucket.tokens - 1);
    this.appStartBucket = appBucket;
  }

  private refillBucket(
    bucket: TokenBucket | undefined,
    capacity: number,
    startsPerWindow: number,
    atMs: number
  ): TokenBucket {
    if (bucket === undefined) return { tokens: capacity, updatedAtMs: atMs };
    const elapsedMs = Math.max(0, atMs - bucket.updatedAtMs);
    return {
      tokens: Math.min(
        capacity,
        bucket.tokens + (elapsedMs * startsPerWindow) / PRESENTATION_RUN_LIMITS.START_RATE_WINDOW_MS
      ),
      updatedAtMs: Math.max(bucket.updatedAtMs, atMs),
    };
  }

  private async runCanonicalTransaction(
    input: Parameters<PresentationRunJournal['transaction']>[0],
    cleanupBeforeIntent?: () => Promise<void>
  ): Promise<void> {
    try {
      await this.journal.transaction(input);
    } catch (error) {
      if (
        error instanceof PresentationJournalTransactionError &&
        error.cause instanceof PresentationRunSimulatedProcessCrashError
      ) {
        this.storageHealthy = false;
        throw error;
      }
      if (
        !(error instanceof PresentationJournalTransactionError) &&
        !(error instanceof PresentationJournalRecoveryRequiredError)
      ) {
        throw error;
      }
      this.storageHealthy = false;
      let cleanupError: unknown;
      if (
        (error instanceof PresentationJournalTransactionError && !error.intentMayExist) ||
        error instanceof PresentationJournalRecoveryRequiredError
      ) {
        try {
          await cleanupBeforeIntent?.();
        } catch (caught) {
          cleanupError = caught;
        }
      }
      try {
        await this.journal.recover();
        await this.reloadCanonicalState();
        this.storageHealthy = true;
      } catch (recoveryError) {
        throw new Error('Presentation run store recovery required', { cause: recoveryError });
      }
      if (cleanupError !== undefined) throw cleanupError;
      throw error;
    }
  }

  private async persistDerivedIndexBestEffort(): Promise<void> {
    try {
      await this.journal.writeDerivedIndex(this.index);
      this.indexRepairPending = false;
    } catch {
      this.indexRepairPending = true;
    }
  }

  private assertStorageHealthy(): void {
    if (!this.storageHealthy) throw new Error('Presentation run store recovery required');
    if (this.indexRepairPending) void this.persistDerivedIndexBestEffort();
  }
}
