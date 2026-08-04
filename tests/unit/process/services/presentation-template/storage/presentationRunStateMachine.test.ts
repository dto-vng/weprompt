/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  assertPresentationRunManifestState,
  bindPresentationRunTurn,
  transitionPresentationRunState,
  type PresentationRunManifest,
} from '@/process/services/presentation-template/run/storage/presentationRunStateMachine';
import { PRESENTATION_RUN_LIMITS } from '@/common/config/constants';

const RUN_ID = '434393ce-dd45-44fe-a51c-262b2b181cc5';
const CREATED_AT = '2026-08-04T00:00:00.000Z';

const allocatingRun = (): PresentationRunManifest => ({
  version: 2,
  runId: RUN_ID,
  clientRequestId: '745b7d43-a0aa-4bb7-b0cc-283f2db4873d',
  conversationId: 'ab82a45e-f426-41d0-bdda-4e151a78a399',
  selectedTemplateId: 'business-review',
  revision: 0,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  statusEnteredAt: CREATED_AT,
  committedAt: null,
  retainedAt: null,
  dispatchStatus: 'allocating',
  artifactPhase: 'none',
  disposition: null,
  retainedCandidate: null,
  sourceGrants: [],
  binding: null,
  postInvoked: false,
  retainedBytes: 0,
});

describe('presentation run state machine', () => {
  it('allows safe pre-POST discard but rejects discard once POST invocation begins', () => {
    const discarded = transitionPresentationRunState(allocatingRun(), {
      expectedRevision: 0,
      dispatchStatus: 'discarded',
      now: '2026-08-04T00:00:01.000Z',
    });
    expect(discarded).toMatchObject({
      revision: 1,
      dispatchStatus: 'discarded',
      artifactPhase: null,
      disposition: null,
    });

    expect(() =>
      transitionPresentationRunState(
        {
          ...allocatingRun(),
          dispatchStatus: 'dispatching',
          committedAt: CREATED_AT,
          postInvoked: true,
        },
        {
          expectedRevision: 0,
          dispatchStatus: 'discarded',
          now: '2026-08-04T00:00:01.000Z',
        }
      )
    ).toThrow('Illegal presentation run dispatch transition');
  });

  it('accepts the declared lifecycle, including safe tracking retention, and rejects skipped states', () => {
    const snapshotted = transitionPresentationRunState(allocatingRun(), {
      expectedRevision: 0,
      dispatchStatus: 'allocating',
      artifactPhase: 'sources_snapshotted',
      now: '2026-08-04T00:00:01.000Z',
    });
    const extracted = transitionPresentationRunState(snapshotted, {
      expectedRevision: 1,
      dispatchStatus: 'committed',
      artifactPhase: 'sources_extracted',
      now: '2026-08-04T00:00:02.000Z',
    });
    const dispatching = transitionPresentationRunState(extracted, {
      expectedRevision: 2,
      dispatchStatus: 'dispatching',
      postInvoked: true,
      now: '2026-08-04T00:00:03.000Z',
    });
    const bound = bindPresentationRunTurn(dispatching, {
      expectedRevision: 3,
      conversationId: dispatching.conversationId,
      turnId: 'turn-1',
      runtime: 'aionrs',
      now: '2026-08-04T00:00:04.000Z',
    }).manifest;
    const tracking = transitionPresentationRunState(bound, {
      expectedRevision: 4,
      dispatchStatus: 'retained',
      disposition: 'TRACKING_REQUIRED',
      now: '2026-08-04T00:01:00.000Z',
    });

    expect(tracking).toMatchObject({
      revision: 5,
      dispatchStatus: 'retained',
      artifactPhase: 'sources_extracted',
      disposition: 'TRACKING_REQUIRED',
      retainedCandidate: null,
    });
    expect(() =>
      transitionPresentationRunState(allocatingRun(), {
        expectedRevision: 0,
        dispatchStatus: 'bound',
        now: '2026-08-04T00:00:01.000Z',
      })
    ).toThrow('Illegal presentation run dispatch transition');
  });

  it('requires exact sequential artifact phases and terminal proof before retaining a candidate', () => {
    const terminal: PresentationRunManifest = {
      ...allocatingRun(),
      revision: 5,
      updatedAt: '2026-08-04T00:00:04.000Z',
      dispatchStatus: 'terminal_verified',
      artifactPhase: 'sources_extracted',
      committedAt: CREATED_AT,
      postInvoked: true,
      binding: {
        conversationId: allocatingRun().conversationId,
        turnId: 'turn-1',
        runtime: 'acp',
        boundAt: '2026-08-04T00:00:04.000Z',
      },
    };

    const candidate = transitionPresentationRunState(terminal, {
      expectedRevision: 5,
      dispatchStatus: 'terminal_verified',
      artifactPhase: 'candidate_retained',
      retainedCandidate: {
        relativePath: 'retained/candidate.pptx',
        sha256: 'a'.repeat(64),
        byteLength: 42,
      },
      now: '2026-08-04T00:00:05.000Z',
    });
    expect(candidate).toMatchObject({
      revision: 6,
      artifactPhase: 'candidate_retained',
      retainedCandidate: { sha256: 'a'.repeat(64), byteLength: 42 },
    });

    expect(() =>
      transitionPresentationRunState(terminal, {
        expectedRevision: 5,
        dispatchStatus: 'terminal_verified',
        artifactPhase: 'structurally_valid',
        now: '2026-08-04T00:00:05.000Z',
      })
    ).toThrow('Illegal presentation run artifact transition');
    expect(() =>
      transitionPresentationRunState(
        { ...terminal, dispatchStatus: 'bound' },
        {
          expectedRevision: 5,
          dispatchStatus: 'bound',
          artifactPhase: 'candidate_retained',
          retainedCandidate: {
            relativePath: 'retained/candidate.pptx',
            sha256: 'a'.repeat(64),
            byteLength: 42,
          },
          now: '2026-08-04T00:00:05.000Z',
        }
      )
    ).toThrow('Candidate retention requires terminal verification');
  });

  it('retains a verified candidate when terminal recovery becomes review-required', () => {
    const terminalWithCandidate: PresentationRunManifest = {
      ...allocatingRun(),
      revision: 6,
      updatedAt: '2026-08-04T00:00:05.000Z',
      dispatchStatus: 'terminal_verified',
      artifactPhase: 'candidate_retained',
      committedAt: CREATED_AT,
      retainedCandidate: {
        relativePath: 'retained/candidate.pptx',
        sha256: 'a'.repeat(64),
        byteLength: 42,
      },
      binding: {
        conversationId: allocatingRun().conversationId,
        turnId: 'turn-1',
        runtime: 'acp',
        boundAt: '2026-08-04T00:00:04.000Z',
      },
      postInvoked: true,
    };

    const failed = transitionPresentationRunState(terminalWithCandidate, {
      expectedRevision: 6,
      dispatchStatus: 'failed_retained',
      disposition: 'REVIEW_REQUIRED',
      now: '2026-08-04T00:00:06.000Z',
    });

    expect(failed).toMatchObject({
      revision: 7,
      dispatchStatus: 'failed_retained',
      artifactPhase: 'candidate_retained',
      disposition: 'REVIEW_REQUIRED',
      retainedAt: '2026-08-04T00:00:06.000Z',
      retainedCandidate: terminalWithCandidate.retainedCandidate,
    });
  });

  it('requires canonical lowercase bounded candidate metadata', () => {
    const candidateRun = (sha256: string, byteLength: number): PresentationRunManifest => ({
      ...allocatingRun(),
      dispatchStatus: 'terminal_verified',
      artifactPhase: 'candidate_retained',
      committedAt: CREATED_AT,
      retainedCandidate: {
        relativePath: 'retained/candidate.pptx',
        sha256,
        byteLength,
      },
      binding: {
        conversationId: allocatingRun().conversationId,
        turnId: 'turn-1',
        runtime: 'aionrs',
        boundAt: CREATED_AT,
      },
      postInvoked: true,
    });

    expect(() =>
      assertPresentationRunManifestState(
        candidateRun('a'.repeat(64), PRESENTATION_RUN_LIMITS.MAX_CANDIDATE_COMPRESSED_BYTES)
      )
    ).not.toThrow();
    expect(() =>
      assertPresentationRunManifestState(
        candidateRun('A'.repeat(64), PRESENTATION_RUN_LIMITS.MAX_CANDIDATE_COMPRESSED_BYTES)
      )
    ).toThrow('Invalid retained presentation candidate');
    expect(() =>
      assertPresentationRunManifestState(
        candidateRun('a'.repeat(64), PRESENTATION_RUN_LIMITS.MAX_CANDIDATE_COMPRESSED_BYTES + 1)
      )
    ).toThrow('Invalid retained presentation candidate');
  });

  it('binds one exact turn idempotently and rejects conflicting turns', () => {
    const dispatching: PresentationRunManifest = {
      ...allocatingRun(),
      dispatchStatus: 'dispatching',
      artifactPhase: 'sources_extracted',
      committedAt: CREATED_AT,
      postInvoked: true,
    };
    const first = bindPresentationRunTurn(dispatching, {
      expectedRevision: 0,
      conversationId: dispatching.conversationId,
      turnId: 'turn-1',
      runtime: 'aionrs',
      now: '2026-08-04T00:00:01.000Z',
    });
    const replay = bindPresentationRunTurn(first.manifest, {
      expectedRevision: 0,
      conversationId: dispatching.conversationId,
      turnId: 'turn-1',
      runtime: 'aionrs',
      now: '2026-08-04T00:00:02.000Z',
    });

    expect(first.status).toBe('bound');
    expect(replay).toEqual({ status: 'already_bound', manifest: first.manifest });
    expect(() =>
      bindPresentationRunTurn(first.manifest, {
        expectedRevision: first.manifest.revision,
        conversationId: dispatching.conversationId,
        turnId: 'turn-2',
        runtime: 'aionrs',
        now: '2026-08-04T00:00:02.000Z',
      })
    ).toThrow('Presentation run is already bound to another turn');
  });

  it('replays the exact binding tuple after lifecycle advancement and still rejects conflicts', () => {
    const dispatching: PresentationRunManifest = {
      ...allocatingRun(),
      dispatchStatus: 'dispatching',
      artifactPhase: 'sources_extracted',
      committedAt: CREATED_AT,
      postInvoked: true,
    };
    const bound = bindPresentationRunTurn(dispatching, {
      expectedRevision: 0,
      conversationId: dispatching.conversationId,
      turnId: 'turn-1',
      runtime: 'aionrs',
      now: '2026-08-04T00:00:01.000Z',
    }).manifest;
    const terminal = transitionPresentationRunState(bound, {
      expectedRevision: 1,
      dispatchStatus: 'terminal_verified',
      now: '2026-08-04T00:00:02.000Z',
    });

    expect(
      bindPresentationRunTurn(terminal, {
        expectedRevision: 0,
        conversationId: dispatching.conversationId,
        turnId: 'turn-1',
        runtime: 'aionrs',
        now: '2026-08-04T00:00:03.000Z',
      })
    ).toEqual({ status: 'already_bound', manifest: terminal });
    expect(() =>
      bindPresentationRunTurn(terminal, {
        expectedRevision: terminal.revision,
        conversationId: dispatching.conversationId,
        turnId: 'turn-2',
        runtime: 'aionrs',
        now: '2026-08-04T00:00:03.000Z',
      })
    ).toThrow('Presentation run is already bound to another turn');
  });

  it('rejects stale revisions without changing state', () => {
    expect(() =>
      transitionPresentationRunState(allocatingRun(), {
        expectedRevision: 1,
        dispatchStatus: 'committed',
        now: '2026-08-04T00:00:01.000Z',
      })
    ).toThrow('Presentation run revision conflict');
  });

  it('records explicit status-entry, committed, and retained timestamps without resetting them on phase-only changes', () => {
    const committed = transitionPresentationRunState(allocatingRun(), {
      expectedRevision: 0,
      dispatchStatus: 'committed',
      now: '2026-08-04T00:00:01.000Z',
    });
    const extracted = transitionPresentationRunState(committed, {
      expectedRevision: 1,
      dispatchStatus: 'committed',
      artifactPhase: 'sources_snapshotted',
      now: '2026-08-04T00:00:02.000Z',
    });
    const failed = transitionPresentationRunState(extracted, {
      expectedRevision: 2,
      dispatchStatus: 'failed_retained',
      disposition: 'TRACKING_REQUIRED',
      now: '2026-08-04T00:00:03.000Z',
    });

    expect(committed).toMatchObject({
      statusEnteredAt: '2026-08-04T00:00:01.000Z',
      committedAt: '2026-08-04T00:00:01.000Z',
      retainedAt: null,
    });
    expect(extracted.statusEnteredAt).toBe(committed.statusEnteredAt);
    expect(failed).toMatchObject({
      statusEnteredAt: '2026-08-04T00:00:03.000Z',
      committedAt: committed.committedAt,
      retainedAt: '2026-08-04T00:00:03.000Z',
    });
  });

  it.each([
    { artifactPhase: 'invented' },
    { dispatchStatus: 'invented' },
    { createdAt: 'not-a-timestamp' },
    { statusEnteredAt: '2026-08-04' },
  ])('rejects unknown enums and malformed timestamps in canonical state %#', (override) => {
    expect(() =>
      assertPresentationRunManifestState({ ...allocatingRun(), ...override } as PresentationRunManifest)
    ).toThrow('Invalid presentation run manifest');
  });

  it.each([
    { dispatchStatus: 'committed', committedAt: null },
    { dispatchStatus: 'retained', disposition: 'TRACKING_REQUIRED', retainedAt: null },
    { updatedAt: '2026-08-03T23:59:59.999Z' },
    { statusEnteredAt: '2026-08-04T00:00:01.000Z' },
  ])('rejects missing lifecycle clocks and time-regressing canonical state %#', (override) => {
    expect(() =>
      assertPresentationRunManifestState({ ...allocatingRun(), ...override } as PresentationRunManifest)
    ).toThrow();
  });

  it('rejects time-regressing transitions and clearing POST invocation proof', () => {
    expect(() =>
      transitionPresentationRunState(allocatingRun(), {
        expectedRevision: 0,
        dispatchStatus: 'allocating',
        now: '2026-08-03T23:59:59.999Z',
      })
    ).toThrow('Presentation run transition timestamp regressed');

    const dispatching: PresentationRunManifest = {
      ...allocatingRun(),
      dispatchStatus: 'dispatching',
      artifactPhase: 'sources_extracted',
      committedAt: CREATED_AT,
      postInvoked: true,
    };
    expect(() =>
      transitionPresentationRunState(dispatching, {
        expectedRevision: 0,
        dispatchStatus: 'dispatching',
        postInvoked: false,
        now: '2026-08-04T00:00:01.000Z',
      })
    ).toThrow('Presentation POST invocation proof is monotonic');
  });
});
