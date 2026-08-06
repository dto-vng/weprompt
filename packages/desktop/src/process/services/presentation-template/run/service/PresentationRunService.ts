/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from 'node:crypto';

import { PRESENTATION_RUN_LIMITS } from '@/common/config/constants';
import type {
  PresentationRunFailure,
  PresentationRunFailureCode,
  PresentationSourceRef,
  StartPresentationRunRequest,
  StartPresentationRunResult,
} from '@/common/types/office/presentationRun';
import {
  PresentationTemplateResolutionError,
  type PresentationTemplateService,
  type ResolvedPresentationTemplate,
} from '@/process/services/presentation-template/PresentationTemplateService';
import { TEMPLATE_ID_RE } from '@/process/services/presentation-template/templateManifest';
import {
  PresentationCanonicalCorruptionError,
  PresentationJournalRecoveryRequiredError,
  PresentationJournalTransactionError,
  PresentationRunSimulatedProcessCrashError,
  PresentationRunStoreError,
  PresentationSourceSnapshotError,
  PresentationSourceStoreError,
  type ClaimedPresentationSourceSnapshot,
  type PresentationRunFiles,
  type PresentationRunPreparationPayload,
  type PresentationRunStore,
  type PresentationSourceSnapshotReader,
  type StoredPresentationRunManifest,
} from '../storage';
import { buildPresentationRunDirective } from './presentationRunDirective';
import {
  buildPresentationGrounding,
  extractPresentationSources,
  PresentationSourceExtractionError,
  type ExtractedPresentationSource,
  type PresentationSourceExtractionInput,
} from './presentationSourceExtractor';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/;

export type PresentationRunAuthorityResolution =
  | {
      ok: true;
      principalId: string;
      scope: 'individual' | 'team';
      runtime: string | null;
    }
  | { ok: false; code: 'RUN_NOT_FOUND' | 'RUN_FORBIDDEN' | 'SCOPE_UNAVAILABLE' };

export type PresentationRunServiceOptions = {
  files: Pick<
    PresentationRunFiles,
    'getStagingRunPaths' | 'prepareRunAssets' | 'withAuthorizedSourceSnapshot' | 'readAuthorizedRunPreparation'
  >;
  store: Pick<
    PresentationRunStore,
    | 'allocateRun'
    | 'transitionRun'
    | 'getClaimedSourceSnapshots'
    | 'commitPreparedRun'
    | 'recordPostAllocationFailure'
    | 'getRun'
    | 'getByRequest'
  >;
  templates: Pick<PresentationTemplateService, 'getById'>;
  isFeatureEnabled: () => boolean;
  isDesktopRuntime: () => boolean;
  resolveAuthority: (input: { conversationId: string }) => Promise<PresentationRunAuthorityResolution>;
  extractSources?: typeof extractPresentationSources;
  now?: () => Date;
};

export type PreparedPresentationRunDispatch = {
  runId: string;
  rawInput: string;
  directive: string;
  sourceRefs: PresentationSourceRef[];
  injectSkills: ['officecli'];
  files: [string, string];
  planPath: string;
};

type NormalizedStartRequest = StartPresentationRunRequest;

class PresentationRunPreparationFailure extends Error {
  constructor(readonly failure: PresentationRunFailure) {
    super(failure.code);
    this.name = 'PresentationRunPreparationFailure';
  }
}

function simulatedProcessCrash(
  error: unknown,
  seen = new Set<object>()
): PresentationRunSimulatedProcessCrashError | null {
  if (error instanceof PresentationRunSimulatedProcessCrashError) return error;
  if (typeof error !== 'object' || error === null || seen.has(error)) return null;
  seen.add(error);
  if ('cause' in error) {
    const nested = simulatedProcessCrash(error.cause, seen);
    if (nested !== null) return nested;
  }
  if ('operationError' in error) {
    const nested = simulatedProcessCrash(error.operationError, seen);
    if (nested !== null) return nested;
  }
  return 'cleanupError' in error ? simulatedProcessCrash(error.cleanupError, seen) : null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function failureState(code: PresentationRunFailureCode): string {
  if (code === 'RUN_NOT_FOUND' || code === 'RUN_FORBIDDEN') return 'lookup';
  if (
    code === 'SOURCE_GRANT_INVALID' ||
    code === 'SOURCE_GRANT_EXPIRED' ||
    code === 'SOURCE_GRANT_FOREIGN' ||
    code === 'SOURCE_GRANT_REPLAYED' ||
    code === 'SOURCE_TAMPERED' ||
    code === 'SOURCE_LIMIT_EXCEEDED' ||
    code === 'SOURCE_FORMAT_UNSUPPORTED'
  ) {
    return code === 'SOURCE_GRANT_EXPIRED' ? 'grant_expired' : 'grant_validation';
  }
  return 'preflight';
}

function runFailure(
  code: PresentationRunFailureCode,
  details: Record<string, unknown> | null = null
): PresentationRunFailure {
  return {
    ok: false,
    code,
    messageKey: `conversation.presentationRun.${code}`,
    retryable: false,
    state: failureState(code),
    details: code === 'PERSISTENCE_FAILED' ? { postInvoked: false } : details,
  } as PresentationRunFailure;
}

function stateConflict(run: StoredPresentationRunManifest): PresentationRunFailure {
  return {
    ok: false,
    code: 'RUN_STATE_CONFLICT',
    messageKey: 'conversation.presentationRun.RUN_STATE_CONFLICT',
    retryable: false,
    state: 'lookup',
    details: { runId: run.runId, dispatchStatus: run.dispatchStatus },
  };
}

function normalizeRequest(value: unknown): NormalizedStartRequest | null {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ['conversation_id', 'client_request_id', 'input', 'selected_template_id', 'sources']) ||
    typeof value.conversation_id !== 'string' ||
    !UUID_RE.test(value.conversation_id) ||
    typeof value.client_request_id !== 'string' ||
    !UUID_RE.test(value.client_request_id) ||
    typeof value.input !== 'string' ||
    value.input.trim().length === 0 ||
    value.input.length > PRESENTATION_RUN_LIMITS.MAX_EXTRACTED_CHARS_PER_SOURCE ||
    typeof value.selected_template_id !== 'string' ||
    !TEMPLATE_ID_RE.test(value.selected_template_id) ||
    !Array.isArray(value.sources) ||
    value.sources.length > PRESENTATION_RUN_LIMITS.MAX_SOURCES_PER_RUN
  ) {
    return null;
  }

  const sources: PresentationSourceRef[] = [];
  const grantIds = new Set<string>();
  let totalBytes = 0;
  for (const source of value.sources) {
    if (
      !isPlainRecord(source) ||
      !hasExactKeys(source, ['grantId', 'expectedByteLength', 'expectedSha256']) ||
      typeof source.grantId !== 'string' ||
      !UUID_RE.test(source.grantId) ||
      !Number.isSafeInteger(source.expectedByteLength) ||
      (source.expectedByteLength as number) < 1 ||
      (source.expectedByteLength as number) > PRESENTATION_RUN_LIMITS.MAX_SOURCE_BYTES ||
      typeof source.expectedSha256 !== 'string' ||
      !SHA256_RE.test(source.expectedSha256)
    ) {
      return null;
    }
    const normalizedGrantId = source.grantId.toLowerCase();
    if (grantIds.has(normalizedGrantId)) return null;
    grantIds.add(normalizedGrantId);
    totalBytes += source.expectedByteLength as number;
    if (totalBytes > PRESENTATION_RUN_LIMITS.MAX_TOTAL_SOURCE_BYTES) return null;
    sources.push({
      grantId: normalizedGrantId,
      expectedByteLength: source.expectedByteLength as number,
      expectedSha256: source.expectedSha256,
    });
  }

  return {
    conversation_id: value.conversation_id.toLowerCase(),
    client_request_id: value.client_request_id.toLowerCase(),
    input: value.input,
    selected_template_id: value.selected_template_id,
    sources,
  };
}

/** Hashes the exact user request and ordered opaque source claims, excluding the retry request id. */
export function createPresentationRunRequestFingerprint(request: StartPresentationRunRequest): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        version: 1,
        conversationId: request.conversation_id.toLowerCase(),
        rawInput: request.input,
        selectedTemplateId: request.selected_template_id,
        sources: request.sources.map((source) => ({
          grantId: source.grantId.toLowerCase(),
          expectedByteLength: source.expectedByteLength,
          expectedSha256: source.expectedSha256.toLowerCase(),
        })),
      })
    )
    .digest('hex');
}

function startSuccess(run: StoredPresentationRunManifest): StartPresentationRunResult {
  if (run.dispatchStatus !== 'committed' || run.artifactPhase !== 'sources_extracted') {
    return stateConflict(run);
  }
  return {
    ok: true,
    run: {
      runId: run.runId,
      clientRequestId: run.clientRequestId,
      conversationId: run.conversationId,
      selectedTemplateId: run.selectedTemplateId,
      revision: run.revision,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      dispatchStatus: 'committed',
      artifactPhase: 'sources_extracted',
      disposition: null,
      retainedCandidate: null,
      actions: { openAllowed: false, discardAllowed: true },
    },
  };
}

function preparationFailure(error: unknown): PresentationRunFailure {
  if (error instanceof PresentationRunPreparationFailure) return error.failure;
  if (error instanceof PresentationTemplateResolutionError) return runFailure(error.code);
  if (error instanceof PresentationSourceExtractionError) {
    return runFailure(error.code, error.code === 'RESOURCE_LIMIT_EXCEEDED' ? null : { grantId: error.grantId });
  }
  if (error instanceof PresentationSourceSnapshotError) return runFailure(error.code);
  if (error instanceof PresentationSourceStoreError) return runFailure(error.code, error.details);
  if (error instanceof PresentationRunStoreError) return runFailure(error.code);
  if (
    error instanceof PresentationCanonicalCorruptionError ||
    error instanceof PresentationJournalRecoveryRequiredError ||
    error instanceof PresentationJournalTransactionError
  ) {
    return runFailure('PERSISTENCE_FAILED');
  }
  return runFailure('INTERNAL_ERROR');
}

async function extractClaimedSources(
  claimed: readonly ClaimedPresentationSourceSnapshot[],
  files: PresentationRunServiceOptions['files'],
  extractSources: typeof extractPresentationSources
): Promise<ExtractedPresentationSource[]> {
  const inputs: PresentationSourceExtractionInput[] = [];
  const enterLease = async (index: number): Promise<ExtractedPresentationSource[]> => {
    const source = claimed[index];
    if (source === undefined) return extractSources([...inputs]);
    try {
      return await files.withAuthorizedSourceSnapshot(
        {
          grantId: source.grantId,
          format: source.format,
          relativePath: source.snapshotRelativePath,
          sha256: source.sha256,
          byteLength: source.byteLength,
        },
        async (snapshot: PresentationSourceSnapshotReader) => {
          inputs.push({
            grantId: source.grantId,
            displayName: source.displayName,
            format: source.format,
            byteLength: source.byteLength,
            sha256: source.sha256,
            snapshot: {
              byteLength: snapshot.byteLength,
              readBytes: snapshot.readBytes,
            },
          });
          try {
            return await enterLease(index + 1);
          } finally {
            inputs.pop();
          }
        }
      );
    } catch (error) {
      if (error instanceof PresentationSourceSnapshotError) {
        throw new PresentationRunPreparationFailure(runFailure(error.code, { grantId: source.grantId }));
      }
      throw error;
    }
  };
  return enterLease(0);
}

/** Main-process preparation authority for a managed presentation start. */
export class PresentationRunService {
  private readonly options: PresentationRunServiceOptions;
  private readonly extractSources: typeof extractPresentationSources;
  private readonly now: () => Date;
  private readonly starts = new Map<string, Promise<StartPresentationRunResult>>();

  constructor(options: PresentationRunServiceOptions) {
    this.options = options;
    this.extractSources = options.extractSources ?? extractPresentationSources;
    this.now = options.now ?? (() => new Date());
  }

  async start(unsafeRequest: StartPresentationRunRequest): Promise<StartPresentationRunResult> {
    if (!this.options.isFeatureEnabled()) return runFailure('FEATURE_DISABLED');
    if (!this.options.isDesktopRuntime()) return runFailure('DESKTOP_REQUIRED');
    const request = normalizeRequest(unsafeRequest);
    if (request === null) return runFailure('INVALID_REQUEST');

    let authority: PresentationRunAuthorityResolution;
    try {
      authority = await this.options.resolveAuthority({ conversationId: request.conversation_id });
    } catch {
      return runFailure('SCOPE_UNAVAILABLE');
    }
    if (authority.ok === false) return runFailure(authority.code);
    if (authority.scope !== 'individual') return runFailure('TEAM_SCOPE_UNSUPPORTED');
    if (authority.runtime !== 'aionrs' && authority.runtime !== 'acp') return runFailure('RUNTIME_UNSUPPORTED');
    if (
      authority.principalId.length < 1 ||
      authority.principalId.length > 256 ||
      authority.principalId.includes('\u0000')
    ) {
      return runFailure('SCOPE_UNAVAILABLE');
    }

    const fingerprint = createPresentationRunRequestFingerprint(request);
    const inFlightKey = `${authority.principalId}\u0000${request.conversation_id}\u0000${request.client_request_id}\u0000${fingerprint}`;
    const existing = this.starts.get(inFlightKey);
    if (existing !== undefined) return existing;
    const pending = this.startPrepared(request, fingerprint, authority.principalId).finally(() =>
      this.starts.delete(inFlightKey)
    );
    this.starts.set(inFlightKey, pending);
    return pending;
  }

  private async startPrepared(
    request: NormalizedStartRequest,
    requestFingerprint: string,
    principalId: string
  ): Promise<StartPresentationRunResult> {
    let allocation: Awaited<ReturnType<PresentationRunServiceOptions['store']['allocateRun']>>;
    try {
      allocation = await this.options.store.allocateRun({
        conversationId: request.conversation_id,
        clientRequestId: request.client_request_id,
        selectedTemplateId: request.selected_template_id,
        requestFingerprint,
        principalId,
        grantClaims: request.sources,
      });
    } catch (error) {
      const crash = simulatedProcessCrash(error);
      if (crash !== null) throw crash;
      let canonical: StoredPresentationRunManifest | null;
      try {
        canonical = await this.options.store.getByRequest(request.conversation_id, request.client_request_id);
      } catch (reconcileError) {
        const reconcileCrash = simulatedProcessCrash(reconcileError);
        if (reconcileCrash !== null) throw reconcileCrash;
        return runFailure('PERSISTENCE_FAILED');
      }
      if (canonical === null) return runFailure('PERSISTENCE_FAILED');
      if (canonical.requestFingerprint !== requestFingerprint) {
        return {
          ok: false,
          code: 'REQUEST_COLLISION',
          messageKey: 'conversation.presentationRun.REQUEST_COLLISION',
          retryable: false,
          state: 'lookup',
          details: { existingRunId: canonical.runId },
        };
      }
      if (canonical.postAllocationFailure !== null) return canonical.postAllocationFailure;
      allocation = { ok: true, status: 'existing', run: canonical };
    }
    if (allocation.ok === false) return allocation;

    let run = allocation.run;
    if (allocation.status === 'existing' && run.dispatchStatus === 'committed' && run.preparation != null) {
      return startSuccess(run);
    }
    if (
      run.dispatchStatus !== 'allocating' ||
      (run.artifactPhase !== 'none' && run.artifactPhase !== 'sources_snapshotted')
    ) {
      return stateConflict(run);
    }

    try {
      if (run.artifactPhase === 'none') {
        run = await this.options.store.transitionRun(run.runId, {
          expectedRevision: run.revision,
          dispatchStatus: 'allocating',
          artifactPhase: 'sources_snapshotted',
          now: this.now().toISOString(),
        });
      }

      const template = await this.resolveTemplate(request.selected_template_id);
      const claimed = await this.options.store.getClaimedSourceSnapshots(run.runId);
      const extracted = await extractClaimedSources(claimed, this.options.files, this.extractSources);
      const grounding = buildPresentationGrounding(request.input, extracted, {
        fileName: template.theme.fileName,
        sha256: template.theme.sha256,
        text: template.theme.bytes.toString('utf8'),
      });
      const paths = this.options.files.getStagingRunPaths(run.runId);
      const directive = buildPresentationRunDirective({
        themeFileName: template.theme.fileName,
        referenceFileName: template.reference.fileName,
        groundingFileName: 'grounding.md',
        candidatePath: paths.candidatePath,
        planPath: paths.planPath,
      });
      const prepared = await this.options.files.prepareRunAssets({
        runId: run.runId,
        candidateBytes: template.reference.bytes,
        grounding,
        rawInput: request.input,
        directive,
        sourceRefs: request.sources,
        injectSkills: ['officecli'],
        template: {
          theme: {
            fileName: template.theme.fileName,
            sha256: template.theme.sha256,
            byteLength: template.theme.byteLength,
          },
          reference: {
            fileName: template.reference.fileName,
            sha256: template.reference.sha256,
            byteLength: template.reference.byteLength,
          },
        },
      });
      run = await this.options.store.commitPreparedRun(run.runId, run.revision, prepared);
      return startSuccess(run);
    } catch (error) {
      const crash = simulatedProcessCrash(error);
      if (crash !== null) throw crash;
      const failure = preparationFailure(error);
      let canonical: StoredPresentationRunManifest | null;
      try {
        canonical = await this.options.store.getRun(run.runId);
      } catch (reconcileError) {
        const reconcileCrash = simulatedProcessCrash(reconcileError);
        if (reconcileCrash !== null) throw reconcileCrash;
        return runFailure('PERSISTENCE_FAILED');
      }
      if (canonical === null) return runFailure('PERSISTENCE_FAILED');
      if (canonical.postAllocationFailure !== null) return canonical.postAllocationFailure;
      if (canonical.dispatchStatus === 'committed' && canonical.preparation != null) return startSuccess(canonical);
      if (
        canonical.dispatchStatus !== 'allocating' ||
        (canonical.artifactPhase !== 'none' && canonical.artifactPhase !== 'sources_snapshotted')
      ) {
        return stateConflict(canonical);
      }
      run = canonical;
      try {
        await this.options.store.recordPostAllocationFailure(run.runId, run.revision, failure);
      } catch (recordError) {
        const recordCrash = simulatedProcessCrash(recordError);
        if (recordCrash !== null) throw recordCrash;
        try {
          canonical = await this.options.store.getRun(run.runId);
        } catch (reconcileError) {
          const reconcileCrash = simulatedProcessCrash(reconcileError);
          if (reconcileCrash !== null) throw reconcileCrash;
          return runFailure('PERSISTENCE_FAILED');
        }
        if (canonical?.postAllocationFailure !== null && canonical?.postAllocationFailure !== undefined) {
          return canonical.postAllocationFailure;
        }
        if (canonical?.dispatchStatus === 'committed' && canonical.preparation != null) return startSuccess(canonical);
        return runFailure('PERSISTENCE_FAILED');
      }
      return failure;
    }
  }

  private async resolveTemplate(
    id: string
  ): Promise<ResolvedPresentationTemplate & { reference: NonNullable<ResolvedPresentationTemplate['reference']> }> {
    const template = await this.options.templates.getById(id);
    if (template === null) throw new PresentationRunPreparationFailure(runFailure('TEMPLATE_NOT_FOUND'));
    if (template.manifest.format !== 'pptx' || template.reference === null) {
      throw new PresentationRunPreparationFailure(runFailure('TEMPLATE_UNSUPPORTED'));
    }
    return template as ResolvedPresentationTemplate & {
      reference: NonNullable<ResolvedPresentationTemplate['reference']>;
    };
  }

  async getPreparedRun(runId: string): Promise<PreparedPresentationRunDispatch | null> {
    if (!UUID_RE.test(runId)) return null;
    const run = await this.options.store.getRun(runId.toLowerCase());
    if (
      run === null ||
      run.dispatchStatus !== 'committed' ||
      run.artifactPhase !== 'sources_extracted' ||
      run.preparation == null
    ) {
      return null;
    }
    const payload: PresentationRunPreparationPayload = await this.options.files.readAuthorizedRunPreparation(
      run.runId,
      run.preparation
    );
    const paths = this.options.files.getStagingRunPaths(run.runId);
    return {
      runId: run.runId,
      rawInput: payload.rawInput,
      directive: payload.directive,
      sourceRefs: structuredClone(payload.sourceRefs),
      injectSkills: ['officecli'],
      files: [paths.groundingPath, paths.candidatePath],
      planPath: paths.planPath,
    };
  }
}
