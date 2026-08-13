/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { PRESENTATION_RUN_V2_ENABLED } from '@/common/config/constants';
import type { StartPresentationRunRequest } from '@/common/types/office/presentationRun';
import { PRESENTATION_RUN_LIMITS } from '@/common/types/office/presentationRunPolicy';
import type {
  PresentationRunDurableBoundary,
  PresentationRunFileDurableBoundary,
} from '@/process/services/presentation-template/run/storage';

import {
  createManagedPresentationIntegrationContext,
  createSyntheticPptxBytes,
  createSyntheticPresentationSourceBytes,
  verifySyntheticCandidateCrashRecovery,
  verifySyntheticJournalCrashRecovery,
  verifySyntheticSourceCrashRecovery,
  type ManagedPresentationIntegrationContext,
} from './helpers';

const SOURCE_FORMATS = ['pdf', 'docx', 'xlsx', 'pptx', 'txt', 'md', 'csv'] as const;
const QUEUE_ITEM_ID = '66666666-6666-4666-8666-666666666666';
const DRAFT_REQUEST_ID = '77777777-7777-4777-8777-777777777777';
const SECOND_REQUEST_ID = '88888888-8888-4888-8888-888888888888';
const THIRD_REQUEST_ID = '99999999-9999-4999-8999-999999999999';
const LEGACY_RUN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FORGED_TURN_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const FAULT_RUN_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const JOURNAL_BOUNDARIES = [
  'before-intent-append',
  'after-intent-append',
  'before-intent-fsync',
  'after-intent-fsync',
  'before-manifest-write',
  'after-manifest-write',
  'before-manifest-fsync',
  'after-manifest-fsync',
  'before-manifest-rename',
  'after-manifest-rename',
  'before-manifest-directory-fsync',
  'after-manifest-directory-fsync',
  'before-commit-append',
  'after-commit-append',
  'before-commit-fsync',
  'after-commit-fsync',
  'before-index-write',
  'after-index-write',
  'before-index-fsync',
  'after-index-fsync',
  'before-index-rename',
  'after-index-rename',
  'before-index-directory-fsync',
  'after-index-directory-fsync',
] as const satisfies readonly PresentationRunDurableBoundary[];
const SOURCE_FILE_BOUNDARIES = [
  'before-grant-source-resolution',
  'before-grant-source-open',
  'before-grant-temp-create',
  'before-grant-temp-write',
  'after-grant-temp-write',
  'before-grant-temp-fsync',
  'after-grant-temp-fsync',
  'after-grant-ooxml-validation',
  'before-grant-temp-directory-fsync',
  'after-grant-temp-directory-fsync',
  'before-grant-promotion-rename',
  'after-grant-promotion-rename',
  'before-grant-promotion-directory-fsync',
  'after-grant-promotion-directory-fsync',
] as const satisfies readonly PresentationRunFileDurableBoundary[];
const CANDIDATE_FILE_BOUNDARIES = [
  'before-candidate-source-open',
  'before-candidate-temp-create',
  'before-candidate-temp-write',
  'after-candidate-temp-write',
  'before-candidate-temp-fsync',
  'after-candidate-temp-fsync',
  'before-candidate-temp-directory-fsync',
  'after-candidate-temp-directory-fsync',
  'before-candidate-promotion-rename',
  'after-candidate-promotion-rename',
  'before-candidate-promotion-directory-fsync',
  'after-candidate-promotion-directory-fsync',
  'before-run-cleanup',
] as const satisfies readonly PresentationRunFileDurableBoundary[];
type MissingJournalBoundary = Exclude<PresentationRunDurableBoundary, (typeof JOURNAL_BOUNDARIES)[number]>;
type MissingFileBoundary = Exclude<
  PresentationRunFileDurableBoundary,
  (typeof SOURCE_FILE_BOUNDARIES)[number] | (typeof CANDIDATE_FILE_BOUNDARIES)[number]
>;
const JOURNAL_BOUNDARIES_EXHAUSTIVE: MissingJournalBoundary extends never ? true : false = true;
const FILE_BOUNDARIES_EXHAUSTIVE: MissingFileBoundary extends never ? true : false = true;

describe('managed presentation synthetic lifecycle integration', () => {
  let context: ManagedPresentationIntegrationContext | undefined;

  afterEach(async () => {
    await context?.cleanup();
    context = undefined;
  });

  it('retains exact inspected bytes for review and discovers hash-bound recovery after restart', async () => {
    context = await createManagedPresentationIntegrationContext();
    const candidateBytes = createSyntheticPptxBytes();
    const candidateSha256 = createHash('sha256').update(candidateBytes).digest('hex');
    const sourcePath = context.workspacePath('board-notes.txt');
    await writeFile(sourcePath, 'Revenue grew 12 percent.\n', { mode: 0o600 });

    const granted = await context.grants.grantWorkspaceSource({
      conversation_id: context.conversationId,
      relative_path: 'board-notes.txt',
      expected_owner_revision: 0,
    });
    if (!granted.ok) throw new Error(`Synthetic source grant failed: ${granted.code}`);

    const startRequest = context.startRequest([
      {
        grantId: granted.grant.grantId,
        expectedByteLength: granted.grant.byteLength,
        expectedSha256: granted.grant.sha256,
      },
    ]);
    const started = await context.runs.start(startRequest);
    if (!started.ok) throw new Error(`Synthetic run start failed: ${started.code}`);
    const startedInternal = await context.store.getRun(started.run.runId);
    if (startedInternal === null) throw new Error('Synthetic committed run was not stored');
    expect(started).toEqual({
      ok: true,
      run: {
        runId: started.run.runId,
        clientRequestId: startRequest.client_request_id,
        conversationId: startRequest.conversation_id,
        selectedTemplateId: startRequest.selected_template_id,
        revision: startedInternal.revision,
        createdAt: startedInternal.createdAt,
        updatedAt: startedInternal.updatedAt,
        dispatchStatus: 'committed',
        artifactPhase: 'sources_extracted',
        disposition: null,
        retainedCandidate: null,
        actions: { openAllowed: false, discardAllowed: true },
      },
    });

    await context.lifecycle.backendReady(context.backendCredentials);
    const claimed = await context.runs.claimInitialDispatch({
      conversation_id: context.conversationId,
      run_id: started.run.runId,
      holder_id: context.holderId,
      expected_revision: started.run.revision,
    });
    if (!claimed.ok) throw new Error(`Synthetic dispatch claim failed: ${claimed.code}`);

    const dispatched = await context.runs.dispatch({
      conversation_id: context.conversationId,
      run_id: started.run.runId,
      lease_token: claimed.leaseToken,
      expected_revision: claimed.revision,
    });
    if (!dispatched.ok) throw new Error(`Synthetic dispatch failed: ${dispatched.code}`);

    await writeFile(
      context.files.getStagingRunPaths(started.run.runId).planPath,
      JSON.stringify([{ sourceRefs: [granted.grant.grantId] }]),
      { mode: 0o600 }
    );
    await expect(
      context.lifecycle.handleTerminalEvent(
        {
          conversationId: context.conversationId,
          turnId: context.turnId,
          status: 'finished',
          runtime: null,
          observedAt: context.now().toISOString(),
        },
        context.terminalAuthority
      )
    ).resolves.toBe('handled');

    const retained = await context.runs.get({
      conversation_id: context.conversationId,
      run_id: started.run.runId,
    });
    const retainedInternal = await context.store.getRun(started.run.runId);
    if (retainedInternal === null || retainedInternal.retainedCandidate === null) {
      throw new Error('Synthetic retained run was not stored');
    }
    const retainedBytes = await context.files.withAuthorizedRetainedCandidate(
      started.run.runId,
      retainedInternal.retainedCandidate,
      async (reader) => reader.readAt(0, reader.byteLength)
    );
    expect(retainedBytes).toEqual(candidateBytes);
    expect(retainedInternal.retainedCandidate).toEqual({
      relativePath: 'retained/candidate.pptx',
      sha256: candidateSha256,
      byteLength: candidateBytes.byteLength,
    });
    if (retainedInternal.readiness?.status !== 'passed') throw new Error('Synthetic readiness did not pass');
    expect(retainedInternal.readiness.evidence.candidate).toEqual({
      sha256: candidateSha256,
      byteLength: candidateBytes.byteLength,
    });
    expect(retainedInternal.readiness.evidence.hashChain).toEqual({
      stagingBeforeRetain: candidateSha256,
      retainedTemp: candidateSha256,
      stagingAfterRetain: candidateSha256,
      manifestRetained: candidateSha256,
      inspectionCopy: candidateSha256,
      retainedAfterStructuralValidation: candidateSha256,
      retainedAfterOoxmlInspection: candidateSha256,
      retainedAfterEachSlideRender: [candidateSha256],
    });
    expect(retainedInternal.readiness.evidence.renders.map(({ candidateSha256: hash }) => hash)).toEqual([
      candidateSha256,
    ]);
    const expectedPublicRun = {
      runId: started.run.runId,
      clientRequestId: retainedInternal.clientRequestId,
      conversationId: retainedInternal.conversationId,
      selectedTemplateId: retainedInternal.selectedTemplateId,
      revision: retainedInternal.revision,
      createdAt: retainedInternal.createdAt,
      updatedAt: retainedInternal.updatedAt,
      dispatchStatus: 'retained',
      artifactPhase: 'rendered_exact_hash',
      disposition: 'REVIEW_REQUIRED',
      retainedCandidate: { sha256: candidateSha256, byteLength: candidateBytes.byteLength },
      actions: { openAllowed: false, discardAllowed: true },
    } as const;
    expect(retained).toEqual({
      ok: true,
      run: expectedPublicRun,
    });
    const matchingOpen = await context.traceOpenRecoveryHashGuard({
      conversation_id: context.conversationId,
      run_id: started.run.runId,
      expected_sha256: candidateSha256,
    });
    const mismatchingOpen = await context.traceOpenRecoveryHashGuard({
      conversation_id: context.conversationId,
      run_id: started.run.runId,
      expected_sha256: 'f'.repeat(64),
    });
    const unsafeOpen = {
      ok: false,
      code: 'UNSAFE_TO_OPEN',
      messageKey: 'conversation.presentationRun.UNSAFE_TO_OPEN',
      retryable: false,
      state: 'retained',
      details: { runId: started.run.runId },
    } as const;
    expect(matchingOpen.result).toEqual(unsafeOpen);
    expect(mismatchingOpen).toEqual({ candidateHashReads: 1, result: unsafeOpen });
    expect(matchingOpen.candidateHashReads).toBeGreaterThan(mismatchingOpen.candidateHashReads);
    expect(context.backendPosts).toHaveLength(1);
    expect(context.validationPaths).toHaveLength(1);
    expect(context.inspectionPaths).toEqual(context.validationPaths);
    expect(context.renderInputPaths).toEqual(context.validationPaths);
    expect(context.validationPaths[0]).not.toBe(context.files.getStagingCandidatePath(started.run.runId));
    expect(context.validationPaths[0]).not.toBe(
      join(context.files.roots.runRoot, started.run.runId, 'retained', 'candidate.pptx')
    );
    expect(context.validationPaths[0]?.startsWith(context.files.roots.inspectionRoot)).toBe(true);
    expect(context.validationCandidateHashes).toEqual([candidateSha256]);
    expect(context.inspectionCandidateHashes).toEqual([candidateSha256]);
    expect(context.renderCandidateHashes).toEqual([candidateSha256]);
    expect(context.renderedSlides).toEqual([1]);

    const restarted = await context.restart();
    const discovered = await restarted.runs.listRecoverable({ conversation_id: context.conversationId });
    expect(discovered).toEqual({
      ok: true,
      items: [expectedPublicRun],
      nextCursor: null,
    });
    if (!discovered.ok || discovered.items[0]?.retainedCandidate === null || discovered.items[0] === undefined) {
      throw new Error('Synthetic retained candidate was not recovered');
    }

    await expect(
      restarted.runs.openRecovery({
        conversation_id: context.conversationId,
        run_id: started.run.runId,
        expected_sha256: discovered.items[0].retainedCandidate.sha256,
      })
    ).resolves.toMatchObject({ ok: false, code: 'UNSAFE_TO_OPEN' });
    await expect(
      restarted.runs.discard({
        conversation_id: context.conversationId,
        run_id: started.run.runId,
        expected_revision: discovered.items[0].revision,
      })
    ).resolves.toMatchObject({ ok: true, alreadyDiscarded: false });
  }, 60_000);

  it('prepares a prompt-only run without inventing a source or publishing an artifact', async () => {
    context = await createManagedPresentationIntegrationContext();

    const started = await context.runs.start(context.startRequest());
    if (!started.ok) throw new Error(`Synthetic prompt-only start failed: ${started.code}`);
    const grounding = await readFile(context.files.getStagingRunPaths(started.run.runId).groundingPath, 'utf8');

    expect(grounding).toContain('No managed source documents were supplied.');
    expect(context.backendPosts).toEqual([]);
    await expect(
      context.runs.get({ conversation_id: context.conversationId, run_id: started.run.runId })
    ).resolves.toMatchObject({
      ok: true,
      run: {
        dispatchStatus: 'committed',
        disposition: null,
        retainedCandidate: null,
        actions: { openAllowed: false, discardAllowed: true },
      },
    });
  });

  it('rejects legacy raw-path request injection before allocation', async () => {
    context = await createManagedPresentationIntegrationContext();
    const request = context.startRequest();
    const unsafeRequest = {
      ...request,
      source_path: '/private/forged-presentation-source.pdf',
    } as unknown as StartPresentationRunRequest;

    await expect(context.runs.start(unsafeRequest)).resolves.toMatchObject({ ok: false, code: 'INVALID_REQUEST' });
    expect(context.backendPosts).toEqual([]);
    await expect(context.store.getByRequest(request.conversation_id, request.client_request_id)).resolves.toBeNull();
  });

  it('never treats a v1 delivery marker or staging candidate as v2 retained authority', async () => {
    context = await createManagedPresentationIntegrationContext();
    const layout = await context.files.createRunLayout(LEGACY_RUN_ID);
    await Promise.all([
      writeFile(join(layout.stagingDirectory, '.aionui-delivery-ready'), 'ready\n', { mode: 0o600 }),
      writeFile(context.files.getStagingCandidatePath(LEGACY_RUN_ID), 'legacy candidate', { mode: 0o600 }),
    ]);
    let consumed = false;

    await expect(
      context.files.withAuthorizedRetainedCandidate(LEGACY_RUN_ID, null, async () => {
        consumed = true;
        return 'unexpected';
      })
    ).resolves.toBeNull();
    expect(consumed).toBe(false);
  });

  it('snapshots every supported source format from private drop paths without grounding native paths', async () => {
    context = await createManagedPresentationIntegrationContext();
    const paths = await Promise.all(
      SOURCE_FORMATS.map(async (format) => {
        const filePath = context!.workspacePath(`synthetic-source.${format}`);
        await writeFile(filePath, createSyntheticPresentationSourceBytes(format), { mode: 0o600 });
        return filePath;
      })
    );
    const granted = await context.grants.grantExternalDropPaths({
      owner: { owner_type: 'conversation', conversation_id: context.conversationId },
      native_paths: paths,
      expected_owner_revision: 0,
    });
    if (!granted.ok) throw new Error(`Synthetic source matrix grant failed: ${granted.code}`);

    const started = await context.runs.start(
      context.startRequest(
        granted.grants.map((grant) => ({
          grantId: grant.grantId,
          expectedByteLength: grant.byteLength,
          expectedSha256: grant.sha256,
        }))
      )
    );
    if (!started.ok) throw new Error(`Synthetic source matrix start failed: ${started.code}`);
    const grounding = await readFile(context.files.getStagingRunPaths(started.run.runId).groundingPath, 'utf8');

    expect(granted.grants.map(({ format }) => format)).toEqual(SOURCE_FORMATS);
    for (const format of SOURCE_FORMATS) expect(grounding).toContain(`- Format: ${format}`);
    for (const sourcePath of paths) expect(grounding).not.toContain(sourcePath);
  });

  it('persists native-picker queue extension and Guid draft binding across restart', async () => {
    context = await createManagedPresentationIntegrationContext();
    const sourcePath = context.workspacePath('queued-source.md');
    await writeFile(sourcePath, '# Queued source\n', { mode: 0o600 });
    context.setNativeSourcePaths([sourcePath]);

    const draft = await context.grants.createDraft({ client_request_id: DRAFT_REQUEST_ID });
    if (!draft.ok) throw new Error(`Synthetic draft creation failed: ${draft.code}`);
    const owner = { owner_type: 'draft' as const, draft_id: draft.draft.draftId };
    const picked = await context.grants.pickSources({ owner, expected_owner_revision: draft.draft.revision });
    if (!picked.ok || picked.status !== 'selected') throw new Error('Synthetic draft source selection failed');
    const confirmed = await context.grants.confirmQueued({
      owner,
      queue_item_id: QUEUE_ITEM_ID,
      sources: picked.grants.map((grant) => ({
        grantId: grant.grantId,
        expectedByteLength: grant.byteLength,
        expectedSha256: grant.sha256,
      })),
      expected_owner_revision: picked.ownerRevision,
    });
    if (!confirmed.ok) throw new Error(`Synthetic queued confirmation failed: ${confirmed.code}`);
    const bound = await context.grants.bindDraft({
      draft_id: draft.draft.draftId,
      conversation_id: context.conversationId,
      expected_revision: confirmed.ownerRevision,
    });
    if (!bound.ok) throw new Error(`Synthetic draft bind failed: ${bound.code}`);

    expect(Date.parse(confirmed.expiresAt) - context.now().getTime()).toBe(PRESENTATION_RUN_LIMITS.QUEUED_GRANT_TTL_MS);
    const restarted = await context.restart();
    await expect(
      restarted.store.getPresentationSourceOwner(
        { owner_type: 'conversation', conversation_id: context.conversationId },
        context.principalId
      )
    ).resolves.toMatchObject({ ownerRevision: 1, grants: [{ grantId: picked.grants[0]!.grantId }] });
  });

  it('keeps the production presentation flag false', () => {
    expect(PRESENTATION_RUN_V2_ENABLED).toBe(false);
  });

  it.each([
    ['false flag', { featureEnabled: false, scope: 'individual' as const }, 'FEATURE_DISABLED'],
    ['team scope', { featureEnabled: true, scope: 'team' as const }, 'TEAM_SCOPE_UNSUPPORTED'],
    ['unavailable scope', { featureEnabled: true, scope: 'unavailable' as const }, 'SCOPE_UNAVAILABLE'],
  ] as const)('rejects %s without any allocation or policy mutation', async (_label, options, code) => {
    context = await createManagedPresentationIntegrationContext(options);
    const request = context.startRequest();
    const before = await context.captureAllocationState(request);

    await expect(context.runs.start(request)).resolves.toEqual({
      ok: false,
      code,
      messageKey: `conversation.presentationRun.${code}`,
      retryable: false,
      state: 'preflight',
      details: null,
    });
    await expect(context.captureAllocationState(request)).resolves.toEqual(before);
    expect(context.backendPosts).toEqual([]);
    context.setFeatureEnabled(true);
    context.setScope('individual');
    const permitted = await context.runs.start(request);
    if (!permitted.ok) throw new Error(`Synthetic policy release unexpectedly failed: ${permitted.code}`);
  });

  it.each(['aionrs', 'acp'] as const)(
    'dispatches exactly one initial %s message and durably binds its turn',
    async (runtime) => {
      context = await createManagedPresentationIntegrationContext({ runtime });
      const started = await context.runs.start(context.startRequest());
      if (!started.ok) throw new Error(`Synthetic ${runtime} start failed: ${started.code}`);
      await context.lifecycle.backendReady(context.backendCredentials);
      const claimed = await context.runs.claimInitialDispatch({
        conversation_id: context.conversationId,
        run_id: started.run.runId,
        holder_id: context.holderId,
        expected_revision: started.run.revision,
      });
      if (!claimed.ok) throw new Error(`Synthetic ${runtime} claim failed: ${claimed.code}`);

      await expect(
        context.runs.dispatch({
          conversation_id: context.conversationId,
          run_id: started.run.runId,
          lease_token: claimed.leaseToken,
          expected_revision: claimed.revision,
        })
      ).resolves.toMatchObject({ ok: true, status: 'bound' });
      expect(context.backendPosts).toHaveLength(1);
      await expect(context.store.getRun(started.run.runId)).resolves.toMatchObject({
        dispatchStatus: 'bound',
        binding: { conversationId: context.conversationId, turnId: context.turnId, runtime },
        postInvoked: true,
      });
    }
  );

  it('rejects a forged terminal tuple and keeps a missed authoritative runtime pending without retention', async () => {
    context = await createManagedPresentationIntegrationContext({ observeRuntime: async () => null });
    const started = await context.runs.start(context.startRequest());
    if (!started.ok) throw new Error(`Synthetic terminal seed failed: ${started.code}`);
    await context.lifecycle.backendReady(context.backendCredentials);
    const claimed = await context.runs.claimInitialDispatch({
      conversation_id: context.conversationId,
      run_id: started.run.runId,
      holder_id: context.holderId,
      expected_revision: started.run.revision,
    });
    if (!claimed.ok) throw new Error(`Synthetic terminal claim failed: ${claimed.code}`);
    const dispatched = await context.runs.dispatch({
      conversation_id: context.conversationId,
      run_id: started.run.runId,
      lease_token: claimed.leaseToken,
      expected_revision: claimed.revision,
    });
    if (!dispatched.ok) throw new Error(`Synthetic terminal dispatch failed: ${dispatched.code}`);
    const terminalEvent = {
      conversationId: context.conversationId,
      turnId: context.turnId,
      status: 'finished' as const,
      runtime: null,
      observedAt: context.now().toISOString(),
    };

    await expect(
      context.lifecycle.handleTerminalEvent({ ...terminalEvent, turnId: FORGED_TURN_ID }, context.terminalAuthority)
    ).resolves.toBe('forged');
    await expect(context.lifecycle.handleTerminalEvent(terminalEvent, context.terminalAuthority)).resolves.toBe(
      'pending'
    );
    const stored = await context.store.getRun(started.run.runId);
    expect(stored).toMatchObject({
      dispatchStatus: 'bound',
      retainedCandidate: null,
    });
    expect(stored).not.toHaveProperty('terminalProof');
    expect(context.validationPaths).toEqual([]);
  });

  it('never resends an acknowledgement-loss dispatch and alerts while retaining uncertainty indefinitely', async () => {
    context = await createManagedPresentationIntegrationContext({
      postInitialMessage: async () => {
        throw new Error('synthetic acknowledgement reply loss');
      },
    });
    const started = await context.runs.start(context.startRequest());
    if (!started.ok) throw new Error(`Synthetic uncertain start failed: ${started.code}`);
    await context.lifecycle.backendReady(context.backendCredentials);
    const claimed = await context.runs.claimInitialDispatch({
      conversation_id: context.conversationId,
      run_id: started.run.runId,
      holder_id: context.holderId,
      expected_revision: started.run.revision,
    });
    if (!claimed.ok) throw new Error(`Synthetic uncertain claim failed: ${claimed.code}`);

    await expect(
      context.runs.dispatch({
        conversation_id: context.conversationId,
        run_id: started.run.runId,
        lease_token: claimed.leaseToken,
        expected_revision: claimed.revision,
      })
    ).resolves.toMatchObject({ ok: false, code: 'DISPATCH_UNCERTAIN', details: { postInvoked: true } });
    await context.lifecycle.backendReady(context.backendCredentials);
    expect(context.backendPosts).toHaveLength(1);

    context.setNow(new Date(context.now().getTime() + PRESENTATION_RUN_LIMITS.UNCERTAIN_OPERATOR_ALERT_MS));
    const swept = await context.store.sweepExpiredRuns();
    expect(swept.operatorAlerts).toEqual([started.run.runId]);
    await expect(context.store.getRun(started.run.runId)).resolves.toMatchObject({
      dispatchStatus: 'dispatch_uncertain',
      disposition: 'TRACKING_REQUIRED',
    });
  });

  it('enforces the disk reservation before allocating synthetic bytes', async () => {
    context = await createManagedPresentationIntegrationContext({ freeDiskBytes: 0 });
    await expect(context.runs.start(context.startRequest())).resolves.toMatchObject({
      ok: false,
      code: 'DISK_RESERVE_EXCEEDED',
    });
  });

  it('enforces owner grant count and garbage-collects every expired private snapshot', async () => {
    context = await createManagedPresentationIntegrationContext();
    const paths = await Promise.all(
      Array.from({ length: PRESENTATION_RUN_LIMITS.MAX_UNBOUND_GRANTS_PER_OWNER }, async (_value, index) => {
        const filePath = context!.workspacePath(`quota-${index}.txt`);
        await writeFile(filePath, `quota source ${index}\n`, { mode: 0o600 });
        return filePath;
      })
    );
    const owner = { owner_type: 'conversation' as const, conversation_id: context.conversationId };
    const granted = await context.grants.grantExternalDropPaths({
      owner,
      native_paths: paths,
      expected_owner_revision: 0,
    });
    if (!granted.ok) throw new Error(`Synthetic quota seed failed: ${granted.code}`);
    const overflowPath = context.workspacePath('quota-overflow.txt');
    await writeFile(overflowPath, 'overflow\n', { mode: 0o600 });

    await expect(
      context.grants.grantExternalDropPaths({
        owner,
        native_paths: [overflowPath],
        expected_owner_revision: granted.ownerRevision,
      })
    ).resolves.toMatchObject({ ok: false, code: 'GRANT_LIMIT_EXCEEDED' });

    context.setNow(new Date(context.now().getTime() + PRESENTATION_RUN_LIMITS.GRANT_TTL_MS));
    const swept = await context.grants.sweep();
    expect(swept.expiredGrants.toSorted()).toEqual(granted.grants.map(({ grantId }) => grantId).toSorted());
    await expect(context.grants.getSourceOwner({ owner })).resolves.toMatchObject({
      ok: true,
      grants: [],
    });
  }, 60_000);

  it('distinguishes rate limiting from the predispatch-count limit without a backend dispatch', async () => {
    context = await createManagedPresentationIntegrationContext({ freeDiskBytes: 64 * 1_024 * 1_024 * 1_024 });
    const first = await context.runs.start(context.startRequest());
    if (!first.ok) throw new Error(`Synthetic rate seed failed: ${first.code}`);
    const secondRequest = { ...context.startRequest(), client_request_id: SECOND_REQUEST_ID };

    await expect(context.runs.start(secondRequest)).resolves.toMatchObject({
      ok: false,
      code: 'RATE_LIMITED',
      details: { postInvoked: false },
    });

    context.setNow(new Date(context.now().getTime() + PRESENTATION_RUN_LIMITS.START_RATE_WINDOW_MS));
    await expect(
      context.runs.start({ ...context.startRequest(), client_request_id: THIRD_REQUEST_ID })
    ).resolves.toMatchObject({ ok: true });

    for (let index = 0; index < PRESENTATION_RUN_LIMITS.MAX_PREDISPATCH_INTENTS_PER_APP - 2; index += 1) {
      context.setNow(new Date(context.now().getTime() + PRESENTATION_RUN_LIMITS.START_RATE_WINDOW_MS));
      // eslint-disable-next-line no-await-in-loop -- each durable intent advances one shared rate window and store count
      const seeded = await context.runs.start({
        ...context.startRequest(),
        conversation_id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, '0')}`,
        client_request_id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(index).padStart(12, '0')}`,
      });
      if (!seeded.ok) throw new Error(`Synthetic predispatch seed ${index} failed: ${seeded.code}`);
    }

    context.setNow(new Date(context.now().getTime() + PRESENTATION_RUN_LIMITS.START_RATE_WINDOW_MS));
    await expect(
      context.runs.start({
        ...context.startRequest(),
        conversation_id: 'cccccccc-cccc-4ccc-8ccc-000000000000',
        client_request_id: 'dddddddd-dddd-4ddd-8ddd-000000000000',
      })
    ).resolves.toMatchObject({ ok: false, code: 'RESOURCE_LIMIT_EXCEEDED' });
    expect(context.backendPosts).toEqual([]);
  }, 60_000);

  it.each(JOURNAL_BOUNDARIES)('recovers canonical store and dispatch state after %s', async (boundary) => {
    expect(JOURNAL_BOUNDARIES_EXHAUSTIVE).toBe(true);
    const expectedRun = boundary === 'before-intent-append' ? null : FAULT_RUN_ID;
    await expect(verifySyntheticJournalCrashRecovery(boundary)).resolves.toEqual(
      boundary.includes('index')
        ? {
            injected: true,
            outcome: 'index-rebuilt',
            canonical: { runId: FAULT_RUN_ID, dispatchStatus: 'allocating', revision: 0 },
            index: {
              requestRunId: FAULT_RUN_ID,
              conversationRunIds: [FAULT_RUN_ID],
              directoryEntries: ['index.json'],
            },
          }
        : {
            injected: true,
            outcome: expectedRun === null ? 'canonical-absent' : 'canonical-recovered',
            canonical: expectedRun === null ? null : { runId: FAULT_RUN_ID, dispatchStatus: 'allocating', revision: 0 },
            index: {
              requestRunId: expectedRun,
              conversationRunIds: expectedRun === null ? [] : [FAULT_RUN_ID],
              directoryEntries: ['index.json'],
            },
          }
    );
  });

  it.each(SOURCE_FILE_BOUNDARIES)('recovers or safely removes a grant snapshot after %s', async (boundary) => {
    expect(FILE_BOUNDARIES_EXHAUSTIVE).toBe(true);
    const sourceBytes = createSyntheticPptxBytes();
    const promoted = boundary.includes('promotion');
    await expect(verifySyntheticSourceCrashRecovery(boundary)).resolves.toEqual({
      injected: true,
      outcome: promoted ? 'source-promoted' : 'source-abandoned-removed',
      source: {
        sha256: promoted ? createHash('sha256').update(sourceBytes).digest('hex') : null,
        byteLength: promoted ? sourceBytes.byteLength : null,
        grantDirectoryPresent: promoted,
        directoryEntries: promoted ? ['source.pptx'] : [],
        temporaryPresent: false,
        finalPresent: promoted,
      },
    });
  });

  it.each(CANDIDATE_FILE_BOUNDARIES)('recovers or safely removes retained bytes after %s', async (boundary) => {
    expect(FILE_BOUNDARIES_EXHAUSTIVE).toBe(true);
    const candidateBytes = createSyntheticPptxBytes();
    const promoted = boundary.includes('promotion');
    await expect(verifySyntheticCandidateCrashRecovery(boundary)).resolves.toEqual({
      injected: true,
      outcome: promoted
        ? 'candidate-promoted'
        : boundary === 'before-run-cleanup'
          ? 'run-removed'
          : 'candidate-abandoned-removed',
      candidate: {
        sha256: promoted ? createHash('sha256').update(candidateBytes).digest('hex') : null,
        byteLength: promoted ? candidateBytes.byteLength : null,
        runDirectoryPresent: promoted,
        stagingDirectoryPresent: promoted,
        retainedDirectoryEntries: promoted ? ['candidate.pptx'] : [],
        stagingDirectoryEntries: promoted ? ['candidate.pptx'] : [],
        inspectionDirectoryPresent: false,
        temporaryPresent: false,
        finalPresent: promoted,
      },
    });
  });
});
