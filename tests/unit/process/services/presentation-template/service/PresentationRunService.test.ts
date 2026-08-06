/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  GetPresentationRunRequest,
  OpenPresentationRunRequest,
  StartPresentationRunRequest,
} from '@/common/types/office/presentationRun';
import {
  createPresentationRunRequestFingerprint,
  PresentationRunService,
  type PresentationRunServiceOptions,
} from '@/process/services/presentation-template/run/service/PresentationRunService';
import {
  PresentationScopeResolver as ActualPresentationScopeResolver,
  type PresentationScopeResolverOptions,
} from '@/process/services/presentation-template/run/service/PresentationScopeResolver';
import {
  PresentationJournalTransactionError,
  PresentationRunSimulatedProcessCrashError,
  PresentationRunStoreError,
} from '@/process/services/presentation-template/run/storage';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const CONVERSATION_ID = '22222222-2222-4222-8222-222222222222';
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const GRANT_ID = '44444444-4444-4444-8444-444444444444';
const FOREIGN_CONVERSATION_ID = '55555555-5555-4555-8555-555555555555';
const SECOND_RUN_ID = '66666666-6666-4666-8666-666666666666';
const NOW = '2026-08-04T00:00:00.000Z';
const CANDIDATE_SHA256 = 'd'.repeat(64);
const RUN_NOT_FOUND_FAILURE = {
  ok: false,
  code: 'RUN_NOT_FOUND',
  messageKey: 'conversation.presentationRun.RUN_NOT_FOUND',
  retryable: false,
  state: 'lookup',
  details: null,
} as const;

const request = (sources: StartPresentationRunRequest['sources'] = []): StartPresentationRunRequest => ({
  conversation_id: CONVERSATION_ID,
  client_request_id: REQUEST_ID,
  input: 'Create a concise board update',
  selected_template_id: 'business-review',
  sources,
});

const sourceRef = {
  grantId: GRANT_ID,
  expectedByteLength: 12,
  expectedSha256: 'a'.repeat(64),
};

const sourceId = (suffix: number): string => `44444444-4444-4444-8444-${String(suffix).padStart(12, '0')}`;

const themeBytes = Buffer.from('# Board theme\nUse navy accents.');
const referenceBytes = Buffer.from('pptx-reference');

function preparationPayload() {
  return {
    version: 1 as const,
    rawInput: request().input,
    directive: 'managed directive',
    sourceRefs: [],
    injectSkills: ['officecli'] as ['officecli'],
    template: {
      theme: {
        fileName: 'THEME.md',
        sha256: createHash('sha256').update(themeBytes).digest('hex'),
        byteLength: themeBytes.length,
      },
      reference: {
        fileName: 'reference.pptx',
        sha256: createHash('sha256').update(referenceBytes).digest('hex'),
        byteLength: referenceBytes.length,
      },
    },
    grounding: { relativePath: 'agent/grounding.md' as const, sha256: 'b'.repeat(64), byteLength: 100 },
    candidate: {
      relativePath: 'agent/candidate.pptx' as const,
      sha256: createHash('sha256').update(referenceBytes).digest('hex'),
      byteLength: referenceBytes.length,
    },
  };
}

function runManifest(state: 'allocating' | 'snapshotted' | 'committed' = 'allocating', sourceGrants: string[] = []) {
  const preparation =
    state === 'committed'
      ? {
          payload: preparationPayload(),
          relativePath: 'preparation.json' as const,
          sha256: 'c'.repeat(64),
          byteLength: 500,
        }
      : null;
  return {
    version: 2 as const,
    runId: RUN_ID,
    clientRequestId: REQUEST_ID,
    conversationId: CONVERSATION_ID,
    selectedTemplateId: 'business-review',
    requestFingerprint: createPresentationRunRequestFingerprint(request()),
    postAllocationFailure: null,
    revision: state === 'allocating' ? 0 : state === 'snapshotted' ? 1 : 2,
    createdAt: NOW,
    updatedAt: NOW,
    statusEnteredAt: NOW,
    committedAt: state === 'committed' ? NOW : null,
    retainedAt: null,
    dispatchStatus: state === 'committed' ? ('committed' as const) : ('allocating' as const),
    artifactPhase:
      state === 'allocating'
        ? ('none' as const)
        : state === 'snapshotted'
          ? ('sources_snapshotted' as const)
          : ('sources_extracted' as const),
    disposition: null,
    retainedCandidate: null,
    sourceGrants,
    binding: null,
    postInvoked: false,
    retainedBytes: 0,
    preparation,
  };
}

function recoveryManifest(
  overrides: Partial<ReturnType<typeof runManifest>> & {
    runId?: string;
    conversationId?: string;
    clientRequestId?: string;
    dispatchStatus?: ReturnType<typeof runManifest>['dispatchStatus'] | string;
    artifactPhase?: ReturnType<typeof runManifest>['artifactPhase'] | string | null;
    disposition?: 'TRACKING_REQUIRED' | 'REVIEW_REQUIRED' | null;
    retainedCandidate?: { relativePath: string; sha256: string; byteLength: number } | null;
  } = {}
) {
  return {
    ...runManifest('committed'),
    revision: 5,
    retainedAt: NOW,
    dispatchStatus: 'retained' as const,
    artifactPhase: 'rendered_exact_hash' as const,
    disposition: 'REVIEW_REQUIRED' as const,
    retainedCandidate: {
      relativePath: 'retained/candidate.pptx',
      sha256: CANDIDATE_SHA256,
      byteLength: 4,
    },
    postInvoked: true,
    ...overrides,
  };
}

function createHarness() {
  const prepared = {
    runId: RUN_ID,
    record: {
      payload: preparationPayload(),
      relativePath: 'preparation.json',
      sha256: 'c'.repeat(64),
      byteLength: 500,
    },
  };
  const store = {
    allocateRun: vi.fn(async () => ({ ok: true as const, status: 'created' as const, run: runManifest() })),
    transitionRun: vi.fn(async () => runManifest('snapshotted')),
    getClaimedSourceSnapshots: vi.fn(async () => []),
    commitPreparedRun: vi.fn(async () => runManifest('committed')),
    recordPostAllocationFailure: vi.fn(async () => runManifest('snapshotted')),
    getRun: vi.fn(async () => runManifest('committed')),
    getByRequest: vi.fn(async () => null),
    listPublicRecoverable: vi.fn(async () => []),
    discardRun: vi.fn(async () =>
      recoveryManifest({ dispatchStatus: 'discarded', artifactPhase: null, disposition: null, retainedCandidate: null })
    ),
  };
  const files = {
    getStagingRunPaths: vi.fn(() => ({
      candidatePath: `/private/tmp/runs/${RUN_ID}/agent/candidate.pptx`,
      groundingPath: `/private/tmp/runs/${RUN_ID}/agent/grounding.md`,
      planPath: `/private/tmp/runs/${RUN_ID}/agent/plan.json`,
    })),
    prepareRunAssets: vi.fn(async () => prepared),
    withAuthorizedSourceSnapshot: vi.fn(),
    readAuthorizedRunPreparation: vi.fn(async () => preparationPayload()),
    withAuthorizedRetainedCandidate: vi.fn(async (_runId, candidate, callback) =>
      candidate === null
        ? null
        : callback({ byteLength: candidate.byteLength, readAt: async () => Buffer.from([0x50, 0x4b, 0x03, 0x04]) })
    ),
  };
  const templates = {
    getById: vi.fn(async () => ({
      manifest: {
        id: 'business-review',
        name: 'Business Review',
        description: 'Board deck',
        format: 'pptx' as const,
        kind: 'deck' as const,
        source: 'builtin' as const,
        themeFile: 'THEME.md',
        referenceFile: 'reference.pptx',
        preview: 'preview.svg',
        version: 1,
        createdAt: NOW,
      },
      theme: {
        fileName: 'THEME.md',
        bytes: themeBytes,
        byteLength: themeBytes.length,
        sha256: createHash('sha256').update(themeBytes).digest('hex'),
      },
      reference: {
        fileName: 'reference.pptx',
        bytes: referenceBytes,
        byteLength: referenceBytes.length,
        sha256: createHash('sha256').update(referenceBytes).digest('hex'),
      },
    })),
  };
  const resolveAuthority = vi.fn(async () => ({
    ok: true as const,
    principalId: 'desktop-local-principal',
    scope: 'individual' as const,
    runtime: 'aionrs' as const,
  }));
  const extractSources = vi.fn(async () => []);
  const openRetainedCandidate = vi.fn(async () => '');
  const options = {
    files,
    store,
    templates,
    isFeatureEnabled: () => true,
    isDesktopRuntime: () => true,
    resolveAuthority,
    extractSources,
    openRetainedCandidate,
    recoveryCursorSecret: Buffer.alloc(32, 7),
    now: () => new Date(NOW),
  } as unknown as PresentationRunServiceOptions;
  return {
    service: new PresentationRunService(options),
    options,
    files,
    store,
    templates,
    resolveAuthority,
    extractSources,
    openRetainedCandidate,
  };
}

describe('PresentationRunService', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('rejects feature, desktop, invalid, team, and unsupported-runtime requests before later dependencies', async () => {
    const base = createHarness();
    const disabled = new PresentationRunService({
      ...base.options,
      isFeatureEnabled: () => false,
    });
    await expect(disabled.start(request())).resolves.toMatchObject({ ok: false, code: 'FEATURE_DISABLED' });
    expect(base.resolveAuthority).not.toHaveBeenCalled();
    expect(base.store.allocateRun).not.toHaveBeenCalled();

    const desktopHarness = createHarness();
    const browser = new PresentationRunService({ ...desktopHarness.options, isDesktopRuntime: () => false });
    await expect(browser.start(request())).resolves.toMatchObject({ ok: false, code: 'DESKTOP_REQUIRED' });
    expect(desktopHarness.resolveAuthority).not.toHaveBeenCalled();
    expect(desktopHarness.store.allocateRun).not.toHaveBeenCalled();

    const invalidHarness = createHarness();
    await expect(
      invalidHarness.service.start({
        ...request(),
        input: '',
        caller_path: '/private/source',
      } as StartPresentationRunRequest)
    ).resolves.toMatchObject({ ok: false, code: 'INVALID_REQUEST' });
    expect(invalidHarness.resolveAuthority).not.toHaveBeenCalled();

    const teamHarness = createHarness();
    teamHarness.resolveAuthority.mockResolvedValueOnce({
      ok: true,
      principalId: 'desktop-local-principal',
      scope: 'team',
      runtime: 'aionrs',
    });
    await expect(teamHarness.service.start(request())).resolves.toMatchObject({
      ok: false,
      code: 'TEAM_SCOPE_UNSUPPORTED',
    });
    expect(teamHarness.store.allocateRun).not.toHaveBeenCalled();

    const runtimeHarness = createHarness();
    runtimeHarness.resolveAuthority.mockResolvedValueOnce({
      ok: true,
      principalId: 'desktop-local-principal',
      scope: 'individual',
      runtime: 'browser',
    });
    await expect(runtimeHarness.service.start(request())).resolves.toMatchObject({
      ok: false,
      code: 'RUNTIME_UNSUPPORTED',
    });
    expect(runtimeHarness.store.allocateRun).not.toHaveBeenCalled();

    const unavailableHarness = createHarness();
    unavailableHarness.resolveAuthority.mockResolvedValueOnce({ ok: false, code: 'SCOPE_UNAVAILABLE' });
    await expect(unavailableHarness.service.start(request())).resolves.toMatchObject({
      ok: false,
      code: 'SCOPE_UNAVAILABLE',
    });
    expect(unavailableHarness.store.allocateRun).not.toHaveBeenCalled();
  });

  it('validates source-count, identity, hash, and aggregate-byte boundaries before authority', async () => {
    const invalidRequests: StartPresentationRunRequest[] = [
      request(
        Array.from({ length: 17 }, (_, index) => ({
          grantId: sourceId(index + 1),
          expectedByteLength: 1,
          expectedSha256: 'a'.repeat(64),
        }))
      ),
      request([sourceRef, sourceRef]),
      request([{ ...sourceRef, grantId: 'not-a-uuid' }]),
      request([{ ...sourceRef, expectedSha256: 'A'.repeat(64) }]),
      request([
        ...Array.from({ length: 4 }, (_, index) => ({
          grantId: sourceId(index + 1),
          expectedByteLength: 64 * 1_024 * 1_024,
          expectedSha256: 'a'.repeat(64),
        })),
        { grantId: sourceId(5), expectedByteLength: 1, expectedSha256: 'b'.repeat(64) },
      ]),
    ];

    for (const invalid of invalidRequests) {
      const harness = createHarness();
      // eslint-disable-next-line no-await-in-loop -- every invalid request needs isolated side-effect counters
      await expect(harness.service.start(invalid)).resolves.toMatchObject({ ok: false, code: 'INVALID_REQUEST' });
      expect(harness.resolveAuthority).not.toHaveBeenCalled();
      expect(harness.store.allocateRun).not.toHaveBeenCalled();
    }

    const boundaryHarness = createHarness();
    const atBoundary = request(
      Array.from({ length: 16 }, (_, index) => ({
        grantId: sourceId(index + 1),
        expectedByteLength: 1,
        expectedSha256: 'a'.repeat(64),
      }))
    );
    await expect(boundaryHarness.service.start(atBoundary)).resolves.toMatchObject({ ok: true });
    expect(boundaryHarness.store.allocateRun).toHaveBeenCalledOnce();
  });

  it('preserves the durable foreign-grant denial without reading source or template bytes', async () => {
    const harness = createHarness();
    harness.store.allocateRun.mockResolvedValueOnce({
      ok: false,
      code: 'SOURCE_GRANT_FOREIGN',
      messageKey: 'conversation.presentationRun.SOURCE_GRANT_FOREIGN',
      retryable: false,
      state: 'grant_lookup',
      details: { grantId: GRANT_ID },
    } as never);

    await expect(harness.service.start(request([sourceRef]))).resolves.toMatchObject({
      ok: false,
      code: 'SOURCE_GRANT_FOREIGN',
    });
    expect(harness.store.allocateRun).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: CONVERSATION_ID,
        principalId: 'desktop-local-principal',
        grantClaims: [sourceRef],
      })
    );
    expect(harness.store.transitionRun).not.toHaveBeenCalled();
    expect(harness.store.getClaimedSourceSnapshots).not.toHaveBeenCalled();
    expect(harness.templates.getById).not.toHaveBeenCalled();
    expect(harness.files.prepareRunAssets).not.toHaveBeenCalled();
  });

  it('prepares a prompt-only run and returns only the safe committed projection', async () => {
    const harness = createHarness();
    const result = await harness.service.start(request());

    expect(result).toEqual({
      ok: true,
      run: {
        runId: RUN_ID,
        clientRequestId: REQUEST_ID,
        conversationId: CONVERSATION_ID,
        selectedTemplateId: 'business-review',
        revision: 2,
        createdAt: NOW,
        updatedAt: NOW,
        dispatchStatus: 'committed',
        artifactPhase: 'sources_extracted',
        disposition: null,
        retainedCandidate: null,
        actions: { openAllowed: false, discardAllowed: true },
      },
    });
    expect(harness.store.allocateRun).toHaveBeenCalledWith(
      expect.objectContaining({
        grantClaims: [],
        principalId: 'desktop-local-principal',
        requestFingerprint: createPresentationRunRequestFingerprint(request()),
      })
    );
    expect(harness.files.prepareRunAssets).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: RUN_ID,
        candidateBytes: referenceBytes,
        rawInput: request().input,
        sourceRefs: [],
        injectSkills: ['officecli'],
      })
    );
    expect(JSON.stringify(result)).not.toContain('managed directive');
    expect(JSON.stringify(result)).not.toContain('/private/');
    expect(JSON.stringify(result)).not.toContain(request().input);
  });

  it('claims ordered opaque refs by expected hash and length and extracts only leased snapshots', async () => {
    const harness = createHarness();
    harness.store.allocateRun.mockResolvedValueOnce({
      ok: true,
      status: 'created',
      run: runManifest('allocating', [GRANT_ID]),
    });
    harness.store.transitionRun.mockResolvedValueOnce(runManifest('snapshotted', [GRANT_ID]));
    harness.store.getClaimedSourceSnapshots.mockResolvedValueOnce([
      {
        grantId: GRANT_ID,
        displayName: 'metrics.csv',
        format: 'csv',
        sourceKind: 'native-picker',
        byteLength: 12,
        sha256: 'a'.repeat(64),
        snapshotRelativePath: 'source.csv',
      },
    ]);
    harness.files.withAuthorizedSourceSnapshot.mockImplementationOnce(async (_reference, callback) =>
      callback({
        byteLength: 12,
        readBytes: async () => Buffer.from('Revenue,100'),
      })
    );
    harness.extractSources.mockResolvedValueOnce([
      {
        grantId: GRANT_ID,
        displayName: 'metrics.csv',
        format: 'csv',
        byteLength: 12,
        sha256: 'a'.repeat(64),
        text: 'Revenue,100',
        characterCount: 11,
      },
    ]);

    await expect(harness.service.start(request([sourceRef]))).resolves.toMatchObject({ ok: true });
    expect(harness.store.allocateRun).toHaveBeenCalledWith(
      expect.objectContaining({
        principalId: 'desktop-local-principal',
        grantClaims: [{ grantId: GRANT_ID, expectedByteLength: 12, expectedSha256: 'a'.repeat(64) }],
      })
    );
    expect(harness.extractSources).toHaveBeenCalledWith([
      expect.objectContaining({
        grantId: GRANT_ID,
        snapshot: expect.objectContaining({ byteLength: 12, readBytes: expect.any(Function) }),
      }),
    ]);
    expect(harness.files.prepareRunAssets.mock.calls[0]?.[0].grounding).toContain('Revenue,100');
    expect(harness.files.prepareRunAssets.mock.calls[0]?.[0].grounding).not.toContain('/private/grants');
  });

  it('preserves source order while holding every snapshot lease through extraction', async () => {
    const harness = createHarness();
    const secondGrantId = sourceId(2);
    const claims = [sourceRef, { grantId: secondGrantId, expectedByteLength: 7, expectedSha256: 'b'.repeat(64) }];
    harness.store.allocateRun.mockResolvedValueOnce({
      ok: true,
      status: 'created',
      run: runManifest(
        'allocating',
        claims.map(({ grantId }) => grantId)
      ),
    });
    harness.store.transitionRun.mockResolvedValueOnce(
      runManifest(
        'snapshotted',
        claims.map(({ grantId }) => grantId)
      )
    );
    harness.store.getClaimedSourceSnapshots.mockResolvedValueOnce([
      {
        grantId: GRANT_ID,
        displayName: 'first.csv',
        format: 'csv',
        sourceKind: 'native-picker',
        byteLength: 12,
        sha256: 'a'.repeat(64),
        snapshotRelativePath: 'source.csv',
      },
      {
        grantId: secondGrantId,
        displayName: 'second.txt',
        format: 'txt',
        sourceKind: 'native-picker',
        byteLength: 7,
        sha256: 'b'.repeat(64),
        snapshotRelativePath: 'source.txt',
      },
    ]);
    let activeLeases = 0;
    harness.files.withAuthorizedSourceSnapshot.mockImplementation(async (reference, callback) => {
      activeLeases += 1;
      try {
        return await callback({
          byteLength: reference.byteLength,
          readBytes: async () => Buffer.from(reference.grantId === GRANT_ID ? 'Revenue,100' : 'summary'),
        });
      } finally {
        activeLeases -= 1;
      }
    });
    harness.extractSources.mockImplementationOnce(async (inputs) => {
      expect(activeLeases).toBe(2);
      expect(inputs.map(({ grantId }) => grantId)).toEqual([GRANT_ID, secondGrantId]);
      return [];
    });

    await expect(harness.service.start(request(claims))).resolves.toMatchObject({ ok: true });
    expect(activeLeases).toBe(0);
  });

  it('returns an existing committed start without repeating template resolution or extraction', async () => {
    const harness = createHarness();
    harness.store.allocateRun.mockResolvedValueOnce({
      ok: true,
      status: 'existing',
      run: runManifest('committed'),
    });

    await expect(harness.service.start(request())).resolves.toMatchObject({
      ok: true,
      run: { runId: RUN_ID, dispatchStatus: 'committed', artifactPhase: 'sources_extracted' },
    });
    expect(harness.templates.getById).not.toHaveBeenCalled();
    expect(harness.extractSources).not.toHaveBeenCalled();
    expect(harness.files.prepareRunAssets).not.toHaveBeenCalled();
  });

  it('reconciles an ambiguous allocation reply by the durable request identity', async () => {
    const harness = createHarness();
    harness.store.allocateRun.mockRejectedValueOnce(new Error('allocation reply lost'));
    harness.store.getByRequest.mockResolvedValueOnce(runManifest('committed'));

    await expect(harness.service.start(request())).resolves.toMatchObject({
      ok: true,
      run: { runId: RUN_ID, dispatchStatus: 'committed' },
    });
    expect(harness.templates.getById).not.toHaveBeenCalled();
  });

  it('authorizes every concurrent caller before joining identical in-flight preparation', async () => {
    const harness = createHarness();

    const [first, second] = await Promise.all([harness.service.start(request()), harness.service.start(request())]);

    expect(first).toEqual(second);
    expect(harness.resolveAuthority).toHaveBeenCalledTimes(2);
    expect(harness.store.allocateRun).toHaveBeenCalledOnce();
  });

  it('does not share an authorized in-flight result with a forbidden concurrent caller', async () => {
    const harness = createHarness();
    harness.resolveAuthority
      .mockResolvedValueOnce({
        ok: true,
        principalId: 'desktop-local-principal',
        scope: 'individual',
        runtime: 'aionrs',
      })
      .mockResolvedValueOnce({ ok: false, code: 'RUN_FORBIDDEN' });

    const [authorized, forbidden] = await Promise.all([
      harness.service.start(request()),
      harness.service.start(request()),
    ]);

    expect(authorized).toMatchObject({ ok: true });
    expect(forbidden).toMatchObject({ ok: false, code: 'RUN_FORBIDDEN' });
    expect(harness.store.allocateRun).toHaveBeenCalledOnce();
  });

  it('resumes a snapshotted allocation without repeating its transition', async () => {
    const harness = createHarness();
    harness.store.allocateRun.mockResolvedValueOnce({
      ok: true,
      status: 'existing',
      run: runManifest('snapshotted'),
    });

    await expect(harness.service.start(request())).resolves.toMatchObject({ ok: true });

    expect(harness.store.transitionRun).not.toHaveBeenCalled();
    expect(harness.store.commitPreparedRun).toHaveBeenCalledWith(RUN_ID, 1, expect.any(Object));
  });

  it('persists a post-allocation template failure so replay has one stable result', async () => {
    const harness = createHarness();
    harness.templates.getById.mockResolvedValueOnce(null);
    harness.store.getRun.mockResolvedValueOnce(runManifest('snapshotted'));

    await expect(harness.service.start(request())).resolves.toMatchObject({ ok: false, code: 'TEMPLATE_NOT_FOUND' });
    expect(harness.store.recordPostAllocationFailure).toHaveBeenCalledWith(
      RUN_ID,
      1,
      expect.objectContaining({ ok: false, code: 'TEMPLATE_NOT_FOUND' })
    );
    expect(harness.extractSources).not.toHaveBeenCalled();
  });

  it('rejects a non-PPTX template and persists the stable failure', async () => {
    const harness = createHarness();
    const resolved = await harness.templates.getById();
    harness.templates.getById.mockResolvedValueOnce({
      ...resolved,
      manifest: { ...resolved.manifest, format: 'docx' },
    });
    harness.store.getRun.mockResolvedValueOnce(runManifest('snapshotted'));

    await expect(harness.service.start(request())).resolves.toMatchObject({
      ok: false,
      code: 'TEMPLATE_UNSUPPORTED',
    });
    expect(harness.store.recordPostAllocationFailure).toHaveBeenCalledWith(
      RUN_ID,
      1,
      expect.objectContaining({ code: 'TEMPLATE_UNSUPPORTED' })
    );
  });

  it('propagates a modeled process crash without recording a contradictory failure', async () => {
    const harness = createHarness();
    harness.templates.getById.mockRejectedValueOnce(
      new PresentationJournalTransactionError('simulated crash', true, {
        cause: new PresentationRunSimulatedProcessCrashError(),
      })
    );

    await expect(harness.service.start(request())).rejects.toBeInstanceOf(PresentationRunSimulatedProcessCrashError);
    expect(harness.store.getRun).not.toHaveBeenCalled();
    expect(harness.store.recordPostAllocationFailure).not.toHaveBeenCalled();
  });

  it('reconciles an ambiguous preparation commit to the canonical committed result', async () => {
    const harness = createHarness();
    harness.store.commitPreparedRun.mockRejectedValueOnce(new Error('post-commit fsync reply lost'));
    harness.store.getRun.mockResolvedValueOnce(runManifest('committed'));

    await expect(harness.service.start(request())).resolves.toMatchObject({
      ok: true,
      run: { runId: RUN_ID, dispatchStatus: 'committed', artifactPhase: 'sources_extracted' },
    });
    expect(harness.store.recordPostAllocationFailure).not.toHaveBeenCalled();
  });

  it('reconciles an ambiguous failure write to the canonical persisted failure', async () => {
    const harness = createHarness();
    const stableFailure = {
      ok: false as const,
      code: 'TEMPLATE_NOT_FOUND' as const,
      messageKey: 'conversation.presentationRun.TEMPLATE_NOT_FOUND',
      retryable: false as const,
      state: 'preflight' as const,
      details: null,
    };
    harness.templates.getById.mockResolvedValueOnce(null);
    harness.store.getRun.mockResolvedValueOnce(runManifest('snapshotted')).mockResolvedValueOnce({
      ...runManifest('snapshotted'),
      revision: 2,
      postAllocationFailure: stableFailure,
    });
    harness.store.recordPostAllocationFailure.mockRejectedValueOnce(new Error('commit reply lost'));

    await expect(harness.service.start(request())).resolves.toEqual(stableFailure);
    expect(harness.store.getRun).toHaveBeenCalledTimes(2);
  });

  it('preserves a typed storage resource limit instead of degrading to internal error', async () => {
    const harness = createHarness();
    harness.store.commitPreparedRun.mockRejectedValueOnce(new PresentationRunStoreError('RESOURCE_LIMIT_EXCEEDED'));
    harness.store.getRun.mockResolvedValueOnce(runManifest('snapshotted'));

    await expect(harness.service.start(request())).resolves.toMatchObject({
      ok: false,
      code: 'RESOURCE_LIMIT_EXCEEDED',
    });
    expect(harness.store.recordPostAllocationFailure).toHaveBeenCalledWith(
      RUN_ID,
      1,
      expect.objectContaining({ code: 'RESOURCE_LIMIT_EXCEEDED' })
    );
  });

  it('reconstructs the main-only prepared dispatch record without exposing the reference path', async () => {
    const harness = createHarness();
    const prepared = await harness.service.getPreparedRun(RUN_ID);

    expect(prepared).toMatchObject({
      runId: RUN_ID,
      rawInput: request().input,
      directive: 'managed directive',
      sourceRefs: [],
      injectSkills: ['officecli'],
      files: [`/private/tmp/runs/${RUN_ID}/agent/grounding.md`, `/private/tmp/runs/${RUN_ID}/agent/candidate.pptx`],
      planPath: `/private/tmp/runs/${RUN_ID}/agent/plan.json`,
    });
    expect(JSON.stringify(prepared)).not.toContain('reference.pptx');
  });

  it('validates direct run-operation payloads before authority or storage', async () => {
    const invalidCalls: Array<(service: PresentationRunService) => Promise<unknown>> = [
      (service) =>
        service.start({ ...request(), selected_template_id: '../business-review' } as StartPresentationRunRequest),
      (service) => service.start({ ...request(), input: 'x'.repeat(200_001) }),
      (service) =>
        service.get({
          conversation_id: CONVERSATION_ID,
          run_id: RUN_ID,
          native_path: '/private/run',
        } as GetPresentationRunRequest),
      (service) => service.get({ conversation_id: '../foreign', run_id: RUN_ID }),
      (service) =>
        service.get({
          conversation_id: CONVERSATION_ID,
          run_id: RUN_ID,
          client_request_id: REQUEST_ID,
        } as GetPresentationRunRequest),
      (service) => service.listRecoverable({ conversation_id: CONVERSATION_ID, limit: 21 }),
      (service) => service.listRecoverable({ conversation_id: CONVERSATION_ID, cursor: '/private/cursor' }),
      (service) =>
        service.openRecovery({
          conversation_id: CONVERSATION_ID,
          run_id: RUN_ID,
          expected_sha256: CANDIDATE_SHA256,
          candidate_path: '/private/candidate.pptx',
        } as OpenPresentationRunRequest),
      (service) => service.discard({ conversation_id: CONVERSATION_ID, run_id: RUN_ID, expected_revision: -1 }),
    ];

    for (const call of invalidCalls) {
      const harness = createHarness();
      // eslint-disable-next-line no-await-in-loop -- every malformed request needs isolated authority/IO counters
      await expect(call(harness.service)).resolves.toMatchObject({ ok: false, code: 'INVALID_REQUEST' });
      expect(harness.resolveAuthority).not.toHaveBeenCalled();
      expect(harness.store.getRun).not.toHaveBeenCalled();
      expect(harness.store.getByRequest).not.toHaveBeenCalled();
      expect(harness.store.listPublicRecoverable).not.toHaveBeenCalled();
      expect(harness.store.discardRun).not.toHaveBeenCalled();
      expect(harness.files.withAuthorizedRetainedCandidate).not.toHaveBeenCalled();
    }
  });

  it('allows authorized recovery reads while the creating feature remains disabled', async () => {
    const harness = createHarness();
    harness.store.getRun.mockResolvedValue(recoveryManifest());
    const service = new PresentationRunService({ ...harness.options, isFeatureEnabled: () => false });

    await expect(service.get({ conversation_id: CONVERSATION_ID, run_id: RUN_ID })).resolves.toMatchObject({
      ok: true,
      run: { runId: RUN_ID, dispatchStatus: 'retained' },
    });
    expect(harness.resolveAuthority).toHaveBeenCalledOnce();
    expect(harness.store.getRun).toHaveBeenCalledWith(RUN_ID);
  });

  it('returns a path-free authorized run by either exact selector', async () => {
    const harness = createHarness();
    const retained = recoveryManifest();
    harness.store.getRun.mockResolvedValue(retained);
    harness.store.getByRequest.mockResolvedValue(retained);

    const byRun = await harness.service.get({ conversation_id: CONVERSATION_ID, run_id: RUN_ID });
    const byRequest = await harness.service.get({ conversation_id: CONVERSATION_ID, client_request_id: REQUEST_ID });

    expect(byRun).toEqual(byRequest);
    expect(byRun).toMatchObject({
      ok: true,
      run: {
        retainedCandidate: { sha256: CANDIDATE_SHA256, byteLength: 4 },
        actions: { openAllowed: false, discardAllowed: true },
      },
    });
    expect(JSON.stringify(byRun)).not.toContain('relativePath');
    expect(JSON.stringify(byRun)).not.toContain('requestFingerprint');
    expect(harness.store.getByRequest).toHaveBeenCalledWith(CONVERSATION_ID, REQUEST_ID);
  });

  it('makes foreign and absent run IDs indistinguishable on get', async () => {
    const foreignHarness = createHarness();
    foreignHarness.store.getRun.mockResolvedValue(recoveryManifest());
    const absentHarness = createHarness();
    absentHarness.store.getRun.mockResolvedValue(null);

    const foreign = await foreignHarness.service.get({
      conversation_id: FOREIGN_CONVERSATION_ID,
      run_id: RUN_ID,
    });
    const absent = await absentHarness.service.get({
      conversation_id: FOREIGN_CONVERSATION_ID,
      run_id: RUN_ID,
    });

    expect(foreign).toEqual(RUN_NOT_FOUND_FAILURE);
    expect(absent).toEqual(RUN_NOT_FOUND_FAILURE);
    expect(foreign).toEqual(absent);
  });

  it('rejects unavailable, team, unsupported-runtime, and browser recovery before lookup', async () => {
    const authorityCases = [
      { ok: false as const, code: 'SCOPE_UNAVAILABLE' as const },
      { ok: true as const, principalId: 'desktop-local-principal', scope: 'team' as const, runtime: 'aionrs' },
      { ok: true as const, principalId: 'desktop-local-principal', scope: 'individual' as const, runtime: 'codex' },
    ];
    for (const authority of authorityCases) {
      const harness = createHarness();
      harness.resolveAuthority.mockResolvedValue(authority);
      // eslint-disable-next-line no-await-in-loop -- each authority failure needs isolated lookup counters
      await expect(harness.service.get({ conversation_id: CONVERSATION_ID, run_id: RUN_ID })).resolves.toMatchObject({
        ok: false,
      });
      expect(harness.store.getRun).not.toHaveBeenCalled();
    }

    const browserHarness = createHarness();
    const browser = new PresentationRunService({ ...browserHarness.options, isDesktopRuntime: () => false });
    await expect(browser.get({ conversation_id: CONVERSATION_ID, run_id: RUN_ID })).resolves.toMatchObject({
      ok: false,
      code: 'DESKTOP_REQUIRED',
    });
    expect(browserHarness.resolveAuthority).not.toHaveBeenCalled();
    expect(browserHarness.store.getRun).not.toHaveBeenCalled();
  });

  it('pages recoverable runs with an authenticated conversation-bound cursor', async () => {
    const harness = createHarness();
    const first = recoveryManifest({ updatedAt: '2026-08-04T00:00:02.000Z' });
    const second = recoveryManifest({
      runId: SECOND_RUN_ID,
      clientRequestId: '77777777-7777-4777-8777-777777777777',
      updatedAt: '2026-08-04T00:00:01.000Z',
    });
    harness.store.listPublicRecoverable.mockResolvedValue([first, second]);

    const firstPage = await harness.service.listRecoverable({ conversation_id: CONVERSATION_ID, limit: 1 });
    expect(firstPage).toMatchObject({ ok: true, items: [{ runId: RUN_ID }] });
    if (!firstPage.ok || firstPage.nextCursor === null) throw new Error('Expected a second recovery page');

    await expect(
      harness.service.listRecoverable({
        conversation_id: CONVERSATION_ID,
        limit: 1,
        cursor: firstPage.nextCursor,
      })
    ).resolves.toMatchObject({ ok: true, items: [{ runId: SECOND_RUN_ID }], nextCursor: null });
    expect(JSON.stringify(firstPage)).not.toContain('relativePath');

    await expect(
      harness.service.listRecoverable({
        conversation_id: FOREIGN_CONVERSATION_ID,
        limit: 1,
        cursor: firstPage.nextCursor,
      })
    ).resolves.toMatchObject({ ok: false, code: 'INVALID_REQUEST' });

    const callsBeforeTamper = harness.store.listPublicRecoverable.mock.calls.length;
    const tampered = `${firstPage.nextCursor.slice(0, -1)}${firstPage.nextCursor.endsWith('a') ? 'b' : 'a'}`;
    await expect(
      harness.service.listRecoverable({ conversation_id: CONVERSATION_ID, limit: 1, cursor: tampered })
    ).resolves.toMatchObject({ ok: false, code: 'INVALID_REQUEST' });
    expect(harness.store.listPublicRecoverable).toHaveBeenCalledTimes(callsBeforeTamper);
  });

  it('rejects a valid cursor whose durable sort tuple no longer resolves', async () => {
    const harness = createHarness();
    harness.store.listPublicRecoverable.mockResolvedValueOnce([
      recoveryManifest(),
      recoveryManifest({ runId: SECOND_RUN_ID, updatedAt: '2026-08-03T00:00:00.000Z' }),
    ]);
    const firstPage = await harness.service.listRecoverable({ conversation_id: CONVERSATION_ID, limit: 1 });
    if (!firstPage.ok || firstPage.nextCursor === null) throw new Error('Expected a recovery cursor');
    harness.store.listPublicRecoverable.mockResolvedValueOnce([]);

    await expect(
      harness.service.listRecoverable({ conversation_id: CONVERSATION_ID, cursor: firstPage.nextCursor })
    ).resolves.toMatchObject({ ok: false, code: 'INVALID_REQUEST' });
  });

  it('withholds Open when a retained candidate has phase but no Task 8 readiness evidence', async () => {
    const harness = createHarness();
    harness.store.getRun.mockResolvedValue(recoveryManifest());

    await expect(
      harness.service.openRecovery({
        conversation_id: CONVERSATION_ID,
        run_id: RUN_ID,
        expected_sha256: CANDIDATE_SHA256,
      })
    ).resolves.toEqual({
      ok: false,
      code: 'UNSAFE_TO_OPEN',
      messageKey: 'conversation.presentationRun.UNSAFE_TO_OPEN',
      retryable: false,
      state: 'retained',
      details: { runId: RUN_ID },
    });
    expect(harness.files.withAuthorizedRetainedCandidate).not.toHaveBeenCalled();
    expect(harness.openRetainedCandidate).not.toHaveBeenCalled();
  });

  it.each([
    ['wrong expected hash before readiness exists', recoveryManifest(), 'e'.repeat(64), 'UNSAFE_TO_OPEN'],
    [
      'pre-inspection candidate',
      recoveryManifest({ artifactPhase: 'structurally_valid' }),
      CANDIDATE_SHA256,
      'UNSAFE_TO_OPEN',
    ],
    [
      'uncertain run',
      recoveryManifest({
        dispatchStatus: 'dispatch_uncertain',
        artifactPhase: 'sources_extracted',
        disposition: 'TRACKING_REQUIRED',
        retainedCandidate: null,
      }),
      CANDIDATE_SHA256,
      'UNSAFE_TO_OPEN',
    ],
  ] as const)('rejects %s without touching the candidate', async (_reason, manifest, expectedSha256, code) => {
    const harness = createHarness();
    harness.store.getRun.mockResolvedValue(manifest);

    await expect(
      harness.service.openRecovery({
        conversation_id: CONVERSATION_ID,
        run_id: RUN_ID,
        expected_sha256: expectedSha256,
      })
    ).resolves.toMatchObject({ ok: false, code });
    expect(harness.files.withAuthorizedRetainedCandidate).not.toHaveBeenCalled();
    expect(harness.openRetainedCandidate).not.toHaveBeenCalled();
  });

  it.each([
    ['allocating', 'committed'],
    ['terminal_verified', 'bound'],
    ['failed_retained', 'retained'],
    ['discarded', 'retained'],
  ] as const)('maps internal %s Open denial to the stable %s failure state', async (dispatchStatus, state) => {
    const harness = createHarness();
    harness.store.getRun.mockResolvedValue(
      recoveryManifest({
        dispatchStatus,
        ...(dispatchStatus === 'discarded' ? { artifactPhase: null, disposition: null, retainedCandidate: null } : {}),
      })
    );

    await expect(
      harness.service.openRecovery({
        conversation_id: CONVERSATION_ID,
        run_id: RUN_ID,
        expected_sha256: CANDIDATE_SHA256,
      })
    ).resolves.toMatchObject({ ok: false, code: 'UNSAFE_TO_OPEN', state });
  });

  it('makes foreign and absent run IDs indistinguishable on open without touching a candidate', async () => {
    const foreignHarness = createHarness();
    foreignHarness.store.getRun.mockResolvedValue(recoveryManifest());
    const absentHarness = createHarness();
    absentHarness.store.getRun.mockResolvedValue(null);

    const foreign = await foreignHarness.service.openRecovery({
      conversation_id: FOREIGN_CONVERSATION_ID,
      run_id: RUN_ID,
      expected_sha256: CANDIDATE_SHA256,
    });
    const absent = await absentHarness.service.openRecovery({
      conversation_id: FOREIGN_CONVERSATION_ID,
      run_id: RUN_ID,
      expected_sha256: CANDIDATE_SHA256,
    });

    expect(foreign).toEqual(RUN_NOT_FOUND_FAILURE);
    expect(absent).toEqual(RUN_NOT_FOUND_FAILURE);
    expect(foreignHarness.files.withAuthorizedRetainedCandidate).not.toHaveBeenCalled();
    expect(foreignHarness.openRetainedCandidate).not.toHaveBeenCalled();
    expect(absentHarness.files.withAuthorizedRetainedCandidate).not.toHaveBeenCalled();
    expect(absentHarness.openRetainedCandidate).not.toHaveBeenCalled();
  });

  it('discards only safety-qualified exact-revision runs and keeps tombstone replay idempotent', async () => {
    const harness = createHarness();
    harness.store.getRun.mockResolvedValue(recoveryManifest());
    harness.store.discardRun.mockResolvedValue(
      recoveryManifest({
        revision: 6,
        updatedAt: '2026-08-04T00:01:00.000Z',
        dispatchStatus: 'discarded',
        artifactPhase: null,
        disposition: null,
        retainedCandidate: null,
      })
    );

    await expect(
      harness.service.discard({ conversation_id: CONVERSATION_ID, run_id: RUN_ID, expected_revision: 5 })
    ).resolves.toEqual({
      ok: true,
      runId: RUN_ID,
      discardedAt: '2026-08-04T00:01:00.000Z',
      alreadyDiscarded: false,
    });
    expect(harness.store.discardRun).toHaveBeenCalledWith(RUN_ID, 5);

    const tombstoneHarness = createHarness();
    const tombstone = recoveryManifest({
      dispatchStatus: 'discarded',
      artifactPhase: null,
      disposition: null,
      retainedCandidate: null,
    });
    tombstoneHarness.store.getRun.mockResolvedValue(tombstone);
    tombstoneHarness.store.discardRun.mockResolvedValue(tombstone);
    await expect(
      tombstoneHarness.service.discard({ conversation_id: CONVERSATION_ID, run_id: RUN_ID, expected_revision: 5 })
    ).resolves.toMatchObject({ ok: true, alreadyDiscarded: true });
    expect(tombstoneHarness.store.discardRun).toHaveBeenCalledWith(RUN_ID, 5);
  });

  it('does not report a tombstone replay as successful when retained-file cleanup still fails', async () => {
    const harness = createHarness();
    harness.store.getRun.mockResolvedValue(
      recoveryManifest({ dispatchStatus: 'discarded', artifactPhase: null, disposition: null, retainedCandidate: null })
    );
    harness.store.discardRun.mockRejectedValue(new Error('cleanup failed'));

    await expect(
      harness.service.discard({ conversation_id: CONVERSATION_ID, run_id: RUN_ID, expected_revision: 5 })
    ).resolves.toMatchObject({ ok: false, code: 'PERSISTENCE_FAILED' });
    expect(harness.store.discardRun).toHaveBeenCalledWith(RUN_ID, 5);
  });

  it('retries tombstone cleanup after discard persistence commits before throwing', async () => {
    const harness = createHarness();
    const active = recoveryManifest();
    const tombstone = recoveryManifest({
      revision: 6,
      updatedAt: '2026-08-04T00:01:00.000Z',
      dispatchStatus: 'discarded',
      artifactPhase: null,
      disposition: null,
      retainedCandidate: null,
    });
    harness.store.getRun.mockResolvedValueOnce(active).mockResolvedValueOnce(tombstone);
    harness.store.discardRun.mockRejectedValueOnce(new Error('cleanup failed')).mockResolvedValueOnce(tombstone);

    await expect(
      harness.service.discard({ conversation_id: CONVERSATION_ID, run_id: RUN_ID, expected_revision: 5 })
    ).resolves.toEqual({
      ok: true,
      runId: RUN_ID,
      discardedAt: '2026-08-04T00:01:00.000Z',
      alreadyDiscarded: false,
    });
    expect(harness.store.discardRun).toHaveBeenNthCalledWith(1, RUN_ID, 5);
    expect(harness.store.discardRun).toHaveBeenNthCalledWith(2, RUN_ID, 5);
  });

  it('does not mask a failed post-commit cleanup retry as discard success', async () => {
    const harness = createHarness();
    const tombstone = recoveryManifest({
      revision: 6,
      dispatchStatus: 'discarded',
      artifactPhase: null,
      disposition: null,
      retainedCandidate: null,
    });
    harness.store.getRun.mockResolvedValueOnce(recoveryManifest()).mockResolvedValueOnce(tombstone);
    harness.store.discardRun
      .mockRejectedValueOnce(new Error('cleanup failed'))
      .mockRejectedValueOnce(new Error('cleanup retry failed'));

    await expect(
      harness.service.discard({ conversation_id: CONVERSATION_ID, run_id: RUN_ID, expected_revision: 5 })
    ).resolves.toMatchObject({ ok: false, code: 'PERSISTENCE_FAILED' });
    expect(harness.store.discardRun).toHaveBeenCalledTimes(2);
  });

  it('makes foreign and absent run IDs indistinguishable on discard without mutation', async () => {
    const foreignHarness = createHarness();
    foreignHarness.store.getRun.mockResolvedValue(recoveryManifest());
    const absentHarness = createHarness();
    absentHarness.store.getRun.mockResolvedValue(null);

    const foreign = await foreignHarness.service.discard({
      conversation_id: FOREIGN_CONVERSATION_ID,
      run_id: RUN_ID,
      expected_revision: 5,
    });
    const absent = await absentHarness.service.discard({
      conversation_id: FOREIGN_CONVERSATION_ID,
      run_id: RUN_ID,
      expected_revision: 5,
    });

    expect(foreign).toEqual(RUN_NOT_FOUND_FAILURE);
    expect(absent).toEqual(RUN_NOT_FOUND_FAILURE);
    expect(foreignHarness.store.discardRun).not.toHaveBeenCalled();
    expect(absentHarness.store.discardRun).not.toHaveBeenCalled();
  });

  it('maps an internal terminal status to the stable bound state for an unsafe Discard denial', async () => {
    const harness = createHarness();
    harness.store.getRun.mockResolvedValue(
      recoveryManifest({
        dispatchStatus: 'terminal_verified',
        artifactPhase: 'rendered_exact_hash',
        disposition: null,
      })
    );

    await expect(
      harness.service.discard({
        conversation_id: CONVERSATION_ID,
        run_id: RUN_ID,
        expected_revision: 5,
      })
    ).resolves.toMatchObject({ ok: false, code: 'UNSAFE_TO_DISCARD', state: 'bound' });
    expect(harness.store.discardRun).not.toHaveBeenCalled();
  });

  it.each([
    [
      'uncertain',
      recoveryManifest({
        dispatchStatus: 'dispatch_uncertain',
        artifactPhase: 'sources_extracted',
        disposition: 'TRACKING_REQUIRED',
        retainedCandidate: null,
      }),
      5,
      'UNSAFE_TO_DISCARD',
    ],
    [
      'bound',
      recoveryManifest({
        dispatchStatus: 'bound',
        artifactPhase: 'sources_extracted',
        disposition: null,
        retainedCandidate: null,
      }),
      5,
      'UNSAFE_TO_DISCARD',
    ],
    ['wrong revision', recoveryManifest(), 4, 'RUN_STATE_CONFLICT'],
  ] as const)('rejects %s discard before storage mutation', async (_reason, manifest, expectedRevision, code) => {
    const harness = createHarness();
    harness.store.getRun.mockResolvedValue(manifest);

    await expect(
      harness.service.discard({
        conversation_id: CONVERSATION_ID,
        run_id: RUN_ID,
        expected_revision: expectedRevision,
      })
    ).resolves.toMatchObject({ ok: false, code });
    expect(harness.store.discardRun).not.toHaveBeenCalled();
  });
});

describe('createPresentationRunRequestFingerprint', () => {
  it('hashes exact raw input and ordered normalized refs with a versioned shape', () => {
    const first = createPresentationRunRequestFingerprint(request([sourceRef]));
    const repeated = createPresentationRunRequestFingerprint(request([sourceRef]));
    const reordered = createPresentationRunRequestFingerprint(
      request(
        [
          sourceRef,
          { grantId: '55555555-5555-4555-8555-555555555555', expectedByteLength: 1, expectedSha256: 'b'.repeat(64) },
        ].toReversed()
      )
    );

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(repeated).toBe(first);
    expect(reordered).not.toBe(first);
    expect(createPresentationRunRequestFingerprint({ ...request([sourceRef]), input: `${request().input} ` })).not.toBe(
      first
    );
  });
});

describe('presentation run native provider policy', () => {
  it('enforces flag, desktop, and authoritative scope before native start service dispatch', async () => {
    const originalProcessType = Object.getOwnPropertyDescriptor(process, 'type');
    const policy = { enabled: false };
    const providers = new Map<string, (request: never) => Promise<unknown> | unknown>();
    const construction = vi.fn();
    const teamList = vi.fn(async () => []);
    let conversationResponse = {
      id: CONVERSATION_ID,
      type: 'aionrs',
      extra: { workspace: '/workspace' },
    };
    const conversationGet = vi.fn(async () => conversationResponse);
    let rawTeamResponse: unknown = [];
    const rawTeamRequest = vi.fn(async (_method: string, _path: string) => rawTeamResponse);
    let runServiceOptions: unknown;
    let scopeResolverOptions: unknown;
    let sourceServiceOptions: unknown;
    const runService = {
      start: vi.fn(async (value: StartPresentationRunRequest) => {
        const options = runServiceOptions as {
          resolveAuthority: (input: {
            conversationId: string;
          }) => Promise<
            { ok: false; code: string } | { ok: true; scope: 'individual' | 'team'; runtime: string | null }
          >;
        };
        const authority = await options.resolveAuthority({ conversationId: value.conversation_id });
        if (authority.ok === false) return { ok: false, code: authority.code };
        if (authority.scope === 'team') return { ok: false, code: 'TEAM_SCOPE_UNSUPPORTED' };
        if (authority.runtime !== 'aionrs' && authority.runtime !== 'acp') {
          return { ok: false, code: 'RUNTIME_UNSUPPORTED' };
        }
        return { ok: false, code: 'INTERNAL_ERROR' };
      }),
      get: vi.fn(async () => ({ ok: false, code: 'RUN_NOT_FOUND' })),
      listRecoverable: vi.fn(),
      openRecovery: vi.fn(),
      discard: vi.fn(),
    };
    const sourceService = {
      bindDraft: vi.fn(),
      createDraft: vi.fn(),
      getSourceOwner: vi.fn(),
      grantExternalDropPaths: vi.fn(),
      grantWorkspaceSource: vi.fn(),
      pickSources: vi.fn(),
      revoke: vi.fn(),
    };
    const provider = (name: string) => ({
      provider: (handler: (request: never) => Promise<unknown> | unknown) => providers.set(name, handler),
    });
    const templateProviders = {
      allocateScratch: provider('templateAllocate'),
      completeScratch: provider('templateComplete'),
      discardScratch: provider('templateDiscard'),
      importSpec: provider('templateImport'),
      list: provider('templateList'),
      remove: provider('templateRemove'),
      retainScratch: provider('templateRetain'),
    };

    vi.resetModules();
    vi.doMock('electron', () => ({
      app: { getPath: vi.fn(() => '/tmp/weprompt-task7') },
      dialog: { showOpenDialog: vi.fn() },
      ipcMain: { handle: vi.fn() },
      shell: { openPath: vi.fn(async () => '') },
    }));
    vi.doMock('@/common', () => ({
      ipcBridge: {
        conversation: { get: { invoke: conversationGet } },
        team: { list: { invoke: teamList } },
        presentationTemplates: templateProviders,
        presentationSources: {
          bindDraft: provider('sourceBind'),
          createDraft: provider('sourceCreate'),
          getSourceOwner: provider('sourceGet'),
          grantWorkspaceSource: provider('sourceWorkspace'),
          pickSources: provider('sourcePick'),
          revoke: provider('sourceRevoke'),
        },
        presentationRuns: {
          start: provider('runStart'),
          get: provider('runGet'),
          listRecoverable: provider('runList'),
          openRecovery: provider('runOpen'),
          discard: provider('runDiscard'),
        },
      },
    }));
    vi.doMock('@/common/adapter/httpBridge', () => ({
      httpRequest: rawTeamRequest,
      isBackendHttpError: vi.fn(() => false),
    }));
    vi.doMock('@/common/config/constants', () => ({
      get PRESENTATION_RUN_V2_ENABLED() {
        return policy.enabled;
      },
    }));
    vi.doMock('@process/resources/presentation-templates/index', () => ({ BUILTIN_TEMPLATE_PACKS: [] }));
    vi.doMock('@/process/services/presentation-template/PresentationTemplateService', () => ({
      PresentationTemplateService: class {
        getById = vi.fn();
        list = vi.fn();
      },
    }));
    vi.doMock('@process/services/presentation-template/run', () => ({
      ArtifactScratchService: class {
        allocate = vi.fn();
      },
      PresentationRunFiles: class {
        roots = { runRoot: '/tmp/weprompt-task7/presentation-runs' };
        constructor() {
          construction();
        }
      },
      PresentationRunJournal: class {
        readonly storageKind = 'journal';

        constructor() {
          construction();
        }
      },
      PresentationRunStore: class {
        constructor() {
          construction();
        }

        getRun(): undefined {
          return undefined;
        }
      },
      PresentationSourceGrantService: class {
        constructor(options: unknown) {
          construction();
          sourceServiceOptions = options;
          return sourceService;
        }

        getSourceOwner(): undefined {
          return undefined;
        }
      },
      PresentationRunService: class {
        constructor(options: unknown) {
          construction();
          runServiceOptions = options;
          return runService;
        }

        get(): undefined {
          return undefined;
        }
      },
      PresentationScopeResolver: class extends ActualPresentationScopeResolver {
        constructor(options: PresentationScopeResolverOptions) {
          super(options);
          scopeResolverOptions = options;
        }
      },
      createPresentationSourceGrantService: vi.fn(() => sourceService),
    }));
    Object.defineProperty(process, 'type', { configurable: true, value: 'browser' });

    try {
      const { initPresentationTemplateBridge } = await import('@/process/services/presentation-template/bridge');
      initPresentationTemplateBridge();
      const startProvider = providers.get('runStart');
      const getProvider = providers.get('runGet');
      expect(startProvider).toBeTypeOf('function');
      expect(getProvider).toBeTypeOf('function');

      await expect(startProvider?.(request() as never)).resolves.toMatchObject({
        ok: false,
        code: 'FEATURE_DISABLED',
      });
      expect(construction).not.toHaveBeenCalled();
      expect(runService.start).not.toHaveBeenCalled();
      expect(conversationGet).not.toHaveBeenCalled();
      expect(rawTeamRequest).not.toHaveBeenCalled();

      policy.enabled = true;
      const authorityCases = [
        {
          code: 'SCOPE_UNAVAILABLE',
          rawTeams: {},
          runtime: 'aionrs',
        },
        {
          code: 'TEAM_SCOPE_UNSUPPORTED',
          rawTeams: [
            {
              id: 'team-1',
              user_id: 'system_default_user',
              agents: [{ slot_id: 'lead', conversation_id: CONVERSATION_ID }],
            },
          ],
          runtime: 'aionrs',
        },
        {
          code: 'RUNTIME_UNSUPPORTED',
          rawTeams: [],
          runtime: 'codex',
        },
      ] as const;
      const authorityResults: unknown[] = [];
      for (const authorityCase of authorityCases) {
        rawTeamResponse = authorityCase.rawTeams;
        conversationResponse.type = authorityCase.runtime;
        // eslint-disable-next-line no-await-in-loop -- provider isolation counters cover each authority branch in order
        authorityResults.push(await startProvider?.(request() as never));
      }
      expect(authorityResults).toEqual(authorityCases.map(({ code }) => expect.objectContaining({ ok: false, code })));
      expect(construction).not.toHaveBeenCalled();
      expect(runService.start).not.toHaveBeenCalled();

      rawTeamResponse = [];
      conversationResponse.type = 'aionrs';
      await expect(startProvider?.(request() as never)).resolves.toMatchObject({
        ok: false,
        code: 'INTERNAL_ERROR',
      });
      expect(construction).toHaveBeenCalled();
      expect(runService.start).toHaveBeenCalledOnce();
      expect(rawTeamRequest).toHaveBeenCalledWith('GET', '/api/teams?user_id=system_default_user');
      expect(teamList).not.toHaveBeenCalled();

      policy.enabled = false;
      await expect(getProvider?.({ conversation_id: CONVERSATION_ID, run_id: RUN_ID } as never)).resolves.toMatchObject(
        { ok: false, code: 'RUN_NOT_FOUND' }
      );
      expect(runService.get).toHaveBeenCalledOnce();

      const capturedSourceOptions = sourceServiceOptions as {
        getPrincipalId: () => Promise<string>;
      };
      expect(await capturedSourceOptions.getPrincipalId()).toBe('desktop-local-principal');

      const capturedRunOptions = runServiceOptions as {
        resolveAuthority: (input: { conversationId: string; principalId: string }) => Promise<unknown>;
      };
      await expect(
        capturedRunOptions.resolveAuthority({
          conversationId: CONVERSATION_ID,
          principalId: 'desktop-local-principal',
        })
      ).resolves.toMatchObject({ ok: true, principalId: 'desktop-local-principal' });

      const capturedScopeOptions = scopeResolverOptions as {
        teamUserId: string;
      };
      expect(capturedScopeOptions.teamUserId).toBe('system_default_user');

      policy.enabled = true;
      Object.defineProperty(process, 'type', { configurable: true, value: 'renderer' });
      const constructionCount = construction.mock.calls.length;
      const getCount = runService.get.mock.calls.length;
      const startCount = runService.start.mock.calls.length;
      const conversationCount = conversationGet.mock.calls.length;
      const rawTeamCount = rawTeamRequest.mock.calls.length;
      await expect(startProvider?.(request() as never)).resolves.toMatchObject({
        ok: false,
        code: 'DESKTOP_REQUIRED',
      });
      await expect(getProvider?.({ conversation_id: CONVERSATION_ID, run_id: RUN_ID } as never)).resolves.toMatchObject(
        { ok: false, code: 'DESKTOP_REQUIRED' }
      );
      expect(construction).toHaveBeenCalledTimes(constructionCount);
      expect(runService.start).toHaveBeenCalledTimes(startCount);
      expect(runService.get).toHaveBeenCalledTimes(getCount);
      expect(conversationGet).toHaveBeenCalledTimes(conversationCount);
      expect(rawTeamRequest).toHaveBeenCalledTimes(rawTeamCount);
    } finally {
      if (originalProcessType === undefined) {
        Reflect.deleteProperty(process, 'type');
      } else {
        Object.defineProperty(process, 'type', originalProcessType);
      }
      vi.doUnmock('electron');
      vi.doUnmock('@/common');
      vi.doUnmock('@/common/adapter/httpBridge');
      vi.doUnmock('@/common/config/constants');
      vi.doUnmock('@process/resources/presentation-templates/index');
      vi.doUnmock('@/process/services/presentation-template/PresentationTemplateService');
      vi.doUnmock('@process/services/presentation-template/run');
      vi.resetModules();
    }
  });
});
