/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StartPresentationRunRequest } from '@/common/types/office/presentationRun';
import {
  createPresentationRunRequestFingerprint,
  PresentationRunService,
  type PresentationRunServiceOptions,
} from '@/process/services/presentation-template/run/service/PresentationRunService';
import {
  PresentationJournalTransactionError,
  PresentationRunSimulatedProcessCrashError,
  PresentationRunStoreError,
} from '@/process/services/presentation-template/run/storage';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const CONVERSATION_ID = '22222222-2222-4222-8222-222222222222';
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const GRANT_ID = '44444444-4444-4444-8444-444444444444';
const NOW = '2026-08-04T00:00:00.000Z';

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
  const options = {
    files,
    store,
    templates,
    isFeatureEnabled: () => true,
    isDesktopRuntime: () => true,
    resolveAuthority,
    extractSources,
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
