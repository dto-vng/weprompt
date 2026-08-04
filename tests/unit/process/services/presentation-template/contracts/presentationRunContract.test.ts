/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  PRESENTATION_RUN_ARTIFACT_PHASES,
  PRESENTATION_RUN_DIRECTIVE_PREFIX,
  PRESENTATION_RUN_DISPATCH_STATUSES,
  PRESENTATION_RUN_DISPOSITIONS,
  PRESENTATION_RUN_FAILURE_STATES,
  PRESENTATION_RUN_V2_ENABLED,
} from '@/common/config/constants';

const presentationRunTypeFile = resolve(process.cwd(), 'packages/desktop/src/common/types/office/presentationRun.ts');

const compileFixture = (source: (moduleSpecifier: string) => string): string => {
  const fixtureDirectory = mkdtempSync(join(tmpdir(), 'presentation-run-contract-'));
  const fixturePath = join(fixtureDirectory, 'fixture.ts');
  const relativeModulePath = relative(fixtureDirectory, presentationRunTypeFile).split(sep).join('/');
  const moduleSpecifier = relativeModulePath.startsWith('.') ? relativeModulePath : `./${relativeModulePath}`;

  try {
    writeFileSync(fixturePath, source(moduleSpecifier), 'utf8');
    const program = ts.createProgram([fixturePath], {
      allowImportingTsExtensions: true,
      lib: ['lib.es2023.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      skipLibCheck: true,
      strict: true,
      target: ts.ScriptTarget.ES2023,
      types: [],
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => process.cwd(),
      getNewLine: () => '\n',
    });
  } finally {
    rmSync(fixtureDirectory, { force: true, recursive: true });
  }
};

describe('managed presentation public contract', () => {
  it('accepts every public request and success discriminant', () => {
    const diagnostics = compileFixture(
      (moduleSpecifier) => `
        import type {
          BindPresentationDraftRequest,
          BindPresentationDraftResult,
          ClaimInitialPresentationDispatchRequest,
          ClaimInitialPresentationDispatchResult,
          CreatePresentationDraftRequest,
          CreatePresentationDraftResult,
          DiscardPresentationRunRequest,
          DiscardPresentationRunResult,
          DispatchInitialPresentationRunRequest,
          DispatchInitialPresentationRunResult,
          GetPresentationRunRequest,
          GetPresentationRunResult,
          GrantPresentationExternalDropRequest,
          GrantPresentationExternalDropResult,
          GrantPresentationWorkspaceSourceRequest,
          GrantPresentationWorkspaceSourceResult,
          ListRecoverablePresentationRunsRequest,
          ListRecoverablePresentationRunsResult,
          OpenPresentationRunRequest,
          OpenPresentationRunResult,
          PickPresentationSourcesRequest,
          PickPresentationSourcesResult,
          PresentationRunPublicDto,
          PresentationSourceDescriptor,
          PresentationSourceRef,
          RenewInitialPresentationDispatchRequest,
          RenewInitialPresentationDispatchResult,
          RevokePresentationSourceRequest,
          RevokePresentationSourceResult,
          StartPresentationRunRequest,
          StartPresentationRunResult,
        } from '${moduleSpecifier}';

        const descriptor = {
          grantId: '229ca31e-1150-4ad1-ad62-1c3368330adc',
          displayName: 'source.pdf',
          format: 'pdf',
          sourceKind: 'native-picker',
          byteLength: 128,
          sha256: 'a'.repeat(64),
          expiresAt: '2026-08-04T00:15:00.000Z',
        } satisfies PresentationSourceDescriptor;
        const sourceRef = {
          grantId: descriptor.grantId,
          expectedByteLength: descriptor.byteLength,
          expectedSha256: descriptor.sha256,
        } satisfies PresentationSourceRef;
        const startRequest = {
          conversation_id: '2be7b8fc-6af5-42b8-aed5-03644735c730',
          client_request_id: 'c9426c09-4352-4c7c-88ca-039bfcaaf0d8',
          input: 'Build the quarterly review.',
          selected_template_id: 'business-review',
          sources: [sourceRef],
        } satisfies StartPresentationRunRequest;
        const publicBase = {
          runId: '434393ce-dd45-44fe-a51c-262b2b181cc5',
          clientRequestId: startRequest.client_request_id,
          conversationId: startRequest.conversation_id,
          selectedTemplateId: startRequest.selected_template_id,
          revision: 1,
          createdAt: '2026-08-04T00:00:00.000Z',
          updatedAt: '2026-08-04T00:00:01.000Z',
        } as const;
        const startResult = {
          ok: true,
          run: {
            ...publicBase,
            dispatchStatus: 'committed',
            artifactPhase: 'sources_snapshotted',
            disposition: null,
            retainedCandidate: null,
            actions: { openAllowed: false, discardAllowed: true },
          },
        } satisfies StartPresentationRunResult;
        const getByRun = {
          conversation_id: publicBase.conversationId,
          run_id: publicBase.runId,
        } satisfies GetPresentationRunRequest;
        const getByRequest = {
          conversation_id: publicBase.conversationId,
          client_request_id: publicBase.clientRequestId,
        } satisfies GetPresentationRunRequest;
        const retainedRun = {
          ...publicBase,
          dispatchStatus: 'retained',
          artifactPhase: 'rendered_exact_hash',
          disposition: 'REVIEW_REQUIRED',
          retainedCandidate: { sha256: 'b'.repeat(64), byteLength: 4096 },
          actions: { openAllowed: true, discardAllowed: true },
        } satisfies PresentationRunPublicDto;
        const getResult = { ok: true, run: retainedRun } satisfies GetPresentationRunResult;
        const listRequest = {
          conversation_id: publicBase.conversationId,
          cursor: 'opaque-cursor',
          limit: 20,
        } satisfies ListRecoverablePresentationRunsRequest;
        const listResult = {
          ok: true,
          items: [retainedRun],
          nextCursor: null,
        } satisfies ListRecoverablePresentationRunsResult;
        const openRequest = {
          conversation_id: publicBase.conversationId,
          run_id: publicBase.runId,
          expected_sha256: retainedRun.retainedCandidate.sha256,
        } satisfies OpenPresentationRunRequest;
        const openResult = {
          ok: true,
          runId: publicBase.runId,
          sha256: retainedRun.retainedCandidate.sha256,
        } satisfies OpenPresentationRunResult;
        const discardRequest = {
          conversation_id: publicBase.conversationId,
          run_id: publicBase.runId,
          expected_revision: 1,
        } satisfies DiscardPresentationRunRequest;
        const discardResult = {
          ok: true,
          runId: publicBase.runId,
          discardedAt: '2026-08-04T00:05:00.000Z',
          alreadyDiscarded: false,
        } satisfies DiscardPresentationRunResult;
        const createDraftRequest = {
          client_request_id: publicBase.clientRequestId,
        } satisfies CreatePresentationDraftRequest;
        const createDraftResult = {
          ok: true,
          status: 'created',
          draft: {
            draftId: 'd9b6195d-bab0-4662-b88c-1675772bb24d',
            revision: 0,
            expiresAt: descriptor.expiresAt,
            grantCount: 0,
          },
        } satisfies CreatePresentationDraftResult;
        const bindDraftRequest = {
          draft_id: createDraftResult.draft.draftId,
          conversation_id: publicBase.conversationId,
          expected_revision: 0,
        } satisfies BindPresentationDraftRequest;
        const bindDraftResult = {
          ok: true,
          status: 'bound',
          draftId: createDraftResult.draft.draftId,
          conversationId: publicBase.conversationId,
          revision: 1,
          boundAt: publicBase.updatedAt,
        } satisfies BindPresentationDraftResult;
        const pickRequest = {
          owner: { owner_type: 'conversation', conversation_id: publicBase.conversationId },
          expected_owner_revision: 1,
        } satisfies PickPresentationSourcesRequest;
        const pickCancelled = {
          ok: true,
          status: 'cancelled',
          grants: [],
          ownerRevision: 1,
        } satisfies PickPresentationSourcesResult;
        const pickSelected = {
          ok: true,
          status: 'selected',
          grants: [descriptor],
          ownerRevision: 2,
        } satisfies PickPresentationSourcesResult;
        const workspaceRequest = {
          conversation_id: publicBase.conversationId,
          relative_path: 'sources/source.pdf',
          expected_owner_revision: 2,
        } satisfies GrantPresentationWorkspaceSourceRequest;
        const workspaceResult = {
          ok: true,
          status: 'granted',
          grant: { ...descriptor, sourceKind: 'workspace-relative' },
          ownerRevision: 3,
        } satisfies GrantPresentationWorkspaceSourceResult;
        const revokeRequest = {
          owner: { owner_type: 'draft', draft_id: createDraftResult.draft.draftId },
          grant_id: descriptor.grantId,
          expected_owner_revision: 3,
        } satisfies RevokePresentationSourceRequest;
        const revokeResult = {
          ok: true,
          status: 'revoked',
          grantId: descriptor.grantId,
          ownerRevision: 4,
          revokedAt: publicBase.updatedAt,
        } satisfies RevokePresentationSourceResult;
        declare const nativeFile: File;
        const dropRequest = {
          owner: { owner_type: 'conversation', conversation_id: publicBase.conversationId },
          files: [nativeFile],
          expected_owner_revision: 4,
        } satisfies GrantPresentationExternalDropRequest;
        const dropResult = {
          ok: true,
          status: 'granted',
          grants: [{ ...descriptor, sourceKind: 'external-drop' }],
          ownerRevision: 5,
        } satisfies GrantPresentationExternalDropResult;
        const claimRequest = {
          conversation_id: publicBase.conversationId,
          run_id: publicBase.runId,
          holder_id: 'renderer-1',
          expected_revision: 1,
        } satisfies ClaimInitialPresentationDispatchRequest;
        const claimResult = {
          ok: true,
          status: 'claimed',
          runId: publicBase.runId,
          leaseToken: 'opaque-lease-token',
          revision: 2,
          expiresAt: descriptor.expiresAt,
          renewAfterMs: 10_000,
        } satisfies ClaimInitialPresentationDispatchResult;
        const renewRequest = {
          conversation_id: publicBase.conversationId,
          run_id: publicBase.runId,
          lease_token: claimResult.leaseToken,
          expected_revision: claimResult.revision,
        } satisfies RenewInitialPresentationDispatchRequest;
        const renewResult = {
          ok: true,
          status: 'renewed',
          runId: publicBase.runId,
          revision: 3,
          expiresAt: descriptor.expiresAt,
          renewAfterMs: 10_000,
        } satisfies RenewInitialPresentationDispatchResult;
        const dispatchRequest = {
          conversation_id: publicBase.conversationId,
          run_id: publicBase.runId,
          lease_token: claimResult.leaseToken,
          expected_revision: renewResult.revision,
        } satisfies DispatchInitialPresentationRunRequest;
        const dispatchResult = {
          ok: true,
          status: 'bound',
          runId: publicBase.runId,
          conversationId: publicBase.conversationId,
          revision: 4,
          dispatchStatus: 'bound',
        } satisfies DispatchInitialPresentationRunResult;

        void [
          startResult, getByRun, getByRequest, getResult, listRequest, listResult,
          openRequest, openResult, discardRequest, discardResult, createDraftRequest,
          createDraftResult, bindDraftRequest, bindDraftResult, pickRequest, pickCancelled,
          pickSelected, workspaceRequest, workspaceResult, revokeRequest, revokeResult,
          dropRequest, dropResult, claimRequest, claimResult, renewRequest, renewResult,
          dispatchRequest, dispatchResult,
        ];
      `
    );

    expect(diagnostics).toBe('');
  });

  it('rejects paths, nonexclusive selectors, and impossible public run combinations', () => {
    const diagnostics = compileFixture(
      (moduleSpecifier) => `
        import type {
          GetPresentationRunRequest,
          GrantPresentationExternalDropRequest,
          PresentationRunPublicDto,
          PresentationSourceDescriptor,
          PresentationSourceRef,
          StartPresentationRunRequest,
        } from '${moduleSpecifier}';

        // @ts-expect-error managed start requests never accept renderer paths
        const pathBearingStart: StartPresentationRunRequest = { conversation_id: 'c', client_request_id: 'r', input: 'x', selected_template_id: 't', sources: [], files: ['/tmp/source.pdf'] };
        // @ts-expect-error descriptors never expose source paths
        const pathBearingDescriptor: PresentationSourceDescriptor = { grantId: 'g', displayName: 's.pdf', format: 'pdf', sourceKind: 'native-picker', byteLength: 1, sha256: 'a', expiresAt: 'now', path: '/tmp/source.pdf' };
        // @ts-expect-error refs carry only an opaque grant and expected byte identity
        const pathBearingRef: PresentationSourceRef = { grantId: 'g', expectedByteLength: 1, expectedSha256: 'a', snapshotPath: '/tmp/snapshot.pdf' };
        // @ts-expect-error get selectors are mutually exclusive
        const bothSelectors: GetPresentationRunRequest = { conversation_id: 'c', run_id: 'run', client_request_id: 'request' };
        // @ts-expect-error get requires exactly one selector
        const noSelector: GetPresentationRunRequest = { conversation_id: 'c' };
        declare const file: File;
        // @ts-expect-error external-drop callers cannot supply native paths
        const dropWithPath: GrantPresentationExternalDropRequest = { owner: { owner_type: 'conversation', conversation_id: 'c' }, files: [file], expected_owner_revision: 0, nativePath: '/tmp/source.pdf' };
        // @ts-expect-error uncertain runs never expose a retained candidate or actions
        const openUncertain: PresentationRunPublicDto = { runId: 'r', clientRequestId: 'q', conversationId: 'c', selectedTemplateId: 't', revision: 1, createdAt: 'now', updatedAt: 'now', dispatchStatus: 'dispatch_uncertain', artifactPhase: 'sources_extracted', disposition: 'TRACKING_REQUIRED', retainedCandidate: { sha256: 'a', byteLength: 1 }, actions: { openAllowed: true, discardAllowed: true } };
        // @ts-expect-error retained review results require a retained candidate
        const retainedWithoutCandidate: PresentationRunPublicDto = { runId: 'r', clientRequestId: 'q', conversationId: 'c', selectedTemplateId: 't', revision: 1, createdAt: 'now', updatedAt: 'now', dispatchStatus: 'retained', artifactPhase: 'rendered_exact_hash', disposition: 'REVIEW_REQUIRED', retainedCandidate: null, actions: { openAllowed: true, discardAllowed: true } };
        // @ts-expect-error terminal verification cannot claim rendered evidence
        const terminalRendered: PresentationRunPublicDto = { runId: 'r', clientRequestId: 'q', conversationId: 'c', selectedTemplateId: 't', revision: 1, createdAt: 'now', updatedAt: 'now', dispatchStatus: 'terminal_verified', artifactPhase: 'rendered_exact_hash', disposition: null, retainedCandidate: null, actions: { openAllowed: false, discardAllowed: false } };
        // @ts-expect-error discarded DTOs clear artifact state
        const discardedWithPhase: PresentationRunPublicDto = { runId: 'r', clientRequestId: 'q', conversationId: 'c', selectedTemplateId: 't', revision: 1, createdAt: 'now', updatedAt: 'now', dispatchStatus: 'discarded', artifactPhase: 'none', disposition: null, retainedCandidate: null, actions: { openAllowed: false, discardAllowed: false } };

        void [pathBearingStart, pathBearingDescriptor, pathBearingRef, bothSelectors, noSelector, dropWithPath, openUncertain, retainedWithoutCandidate, terminalRendered, discardedWithPhase];
      `
    );

    expect(diagnostics).toBe('');
  });
});

describe('managed presentation stable constants', () => {
  it('keeps the managed path disabled and shares the existing PPTX directive prefix', () => {
    expect({ enabled: PRESENTATION_RUN_V2_ENABLED, prefix: PRESENTATION_RUN_DIRECTIVE_PREFIX }).toEqual({
      enabled: false,
      prefix: 'Create a presentation from the request below.',
    });
  });

  it('publishes the complete dispatch, artifact, disposition, and failure-state names', () => {
    expect({
      dispatch: PRESENTATION_RUN_DISPATCH_STATUSES,
      artifact: PRESENTATION_RUN_ARTIFACT_PHASES,
      disposition: PRESENTATION_RUN_DISPOSITIONS,
      failure: PRESENTATION_RUN_FAILURE_STATES,
    }).toEqual({
      dispatch: [
        'allocating',
        'committed',
        'dispatching',
        'bound',
        'terminal_verified',
        'retained',
        'failed_retained',
        'dispatch_uncertain',
        'discarded',
      ],
      artifact: [
        'none',
        'sources_snapshotted',
        'sources_extracted',
        'candidate_retained',
        'candidate_copied',
        'structurally_valid',
        'ooxml_inspected',
        'rendered_exact_hash',
      ],
      disposition: ['TRACKING_REQUIRED', 'REVIEW_REQUIRED'],
      failure: [
        'preflight',
        'lookup',
        'draft_expired',
        'draft_active',
        'grant_validation',
        'grant_expired',
        'committed',
        'dispatch_uncertain',
        'bound',
        'retained',
      ],
    });
  });
});
