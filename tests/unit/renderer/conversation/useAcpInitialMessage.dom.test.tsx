/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendHttpError } from '@/common/adapter/httpBridge';
import type { PresentationGrantOwner, PresentationSourceDescriptor } from '@/common/types/office/presentationRun';
import type {
  PresentationSubmissionProgress,
  PresentationSubmissionSnapshot,
} from '@/common/types/platform/presentationSubmission';
import { useAcpInitialMessage } from '@/renderer/pages/conversation/platforms/acp/useAcpInitialMessage';

const {
  sendMessageInvokeMock,
  emitterEmitMock,
  presentationStartInvokeMock,
  presentationClaimInvokeMock,
  presentationDispatchInvokeMock,
} = vi.hoisted(() => ({
  sendMessageInvokeMock: vi.fn(),
  emitterEmitMock: vi.fn(),
  presentationStartInvokeMock: vi.fn(),
  presentationClaimInvokeMock: vi.fn(),
  presentationDispatchInvokeMock: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      sendMessage: {
        invoke: sendMessageInvokeMock,
      },
    },
    presentationRuns: {
      start: { invoke: presentationStartInvokeMock },
      claimInitialDispatch: { invoke: presentationClaimInvokeMock },
      dispatch: { invoke: presentationDispatchInvokeMock },
    },
  },
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: {
    emit: emitterEmitMock,
  },
}));

vi.mock('@/renderer/utils/file/messageFiles', () => ({
  buildDisplayMessage: (input: string) => input,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

describe('useAcpInitialMessage', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it('keeps the false-flag legacy payload and storage-removal behavior unchanged', async () => {
    sessionStorage.setItem(
      'acp_initial_message_conv-1',
      JSON.stringify({ input: 'legacy directive', files: ['/private/legacy.xlsx'] })
    );
    sendMessageInvokeMock.mockResolvedValue({ turn_id: 'turn-1', runtime: null, msg_id: 'msg-1' });

    renderHook(() =>
      useAcpInitialMessage({
        conversation_id: 'conv-1',
        backend: 'codex',
        workspacePath: '/tmp/workspace',
        setAiProcessing: vi.fn(),
        resetState: vi.fn(),
        checkAndUpdateTitle: vi.fn(),
        addOrUpdateMessage: vi.fn(),
        managedPresentationEnabled: false,
      })
    );

    expect(sessionStorage.getItem('acp_initial_message_conv-1')).toBeNull();
    await waitFor(() => expect(sendMessageInvokeMock).toHaveBeenCalledTimes(1));
    expect(sendMessageInvokeMock).toHaveBeenCalledWith({
      input: 'legacy directive',
      conversation_id: 'conv-1',
      files: ['/private/legacy.xlsx'],
    });
  });

  it('keeps a managed handoff until durable queue acceptance and never sends it through ACP', async () => {
    sessionStorage.setItem(
      'acp_initial_message_conv-1',
      JSON.stringify({
        input: 'Create a presentation from the request below. Managed rules.\n\nInitial deck',
        files: [
          '/private/presentation-templates/business-review/THEME.md',
          '/private/presentation-templates/business-review/reference.pptx',
        ],
      })
    );
    let resolveEnqueue!: (progress: PresentationSubmissionProgress) => void;
    const enqueueManagedPresentation = vi.fn(
      () =>
        new Promise<PresentationSubmissionProgress>((resolve) => {
          resolveEnqueue = resolve;
        })
    );

    renderHook(() =>
      useAcpInitialMessage({
        conversation_id: 'conv-1',
        backend: 'codex',
        setAiProcessing: vi.fn(),
        resetState: vi.fn(),
        checkAndUpdateTitle: vi.fn(),
        addOrUpdateMessage: vi.fn(),
        managedPresentationEnabled: true,
        hydratePresentationSources: vi.fn().mockResolvedValue({
          ok: true,
          owner: { owner_type: 'conversation', conversation_id: 'conv-1' },
          ownerRevision: 0,
          grants: [],
        }),
        enqueueManagedPresentation,
      })
    );

    await waitFor(() => expect(enqueueManagedPresentation).toHaveBeenCalledTimes(1));
    const storedWhilePending = JSON.parse(sessionStorage.getItem('acp_initial_message_conv-1') ?? '{}') as Record<
      string,
      unknown
    >;
    expect(storedWhilePending.queueItemId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(storedWhilePending.clientRequestId).toMatch(/^[0-9a-f-]{36}$/i);
    const [snapshot, owner, revision] = enqueueManagedPresentation.mock.calls[0] as [
      PresentationSubmissionSnapshot,
      PresentationGrantOwner | null,
      number | null,
    ];
    expect(snapshot).toMatchObject({ input: 'Initial deck', selectedTemplateId: 'business-review', sources: [] });
    expect(owner).toBeNull();
    expect(revision).toBeNull();
    expect(sendMessageInvokeMock).not.toHaveBeenCalled();

    resolveEnqueue({ state: 'queued' });
    await waitFor(() => expect(sessionStorage.getItem('acp_initial_message_conv-1')).toBeNull());
    expect(sendMessageInvokeMock).not.toHaveBeenCalled();
  });

  it('passes only opaque hydrated grants into a managed initial queue item', async () => {
    const source: PresentationSourceDescriptor = {
      grantId: '44444444-4444-4444-8444-444444444444',
      displayName: 'revenue.xlsx',
      format: 'xlsx',
      sourceKind: 'native-picker',
      byteLength: 42,
      sha256: 'a'.repeat(64),
      expiresAt: '2026-08-05T00:15:00.000Z',
    };
    sessionStorage.setItem(
      'acp_initial_message_conv-1',
      JSON.stringify({
        input: 'Create a presentation from the request below. Managed rules.\n\nSourced deck',
        files: [
          '/private/presentation-templates/business-review/THEME.md',
          '/private/presentation-templates/business-review/reference.pptx',
        ],
      })
    );
    const enqueueManagedPresentation = vi.fn().mockResolvedValue({ state: 'dispatch_uncertain' });

    renderHook(() =>
      useAcpInitialMessage({
        conversation_id: 'conv-1',
        backend: 'codex',
        setAiProcessing: vi.fn(),
        resetState: vi.fn(),
        checkAndUpdateTitle: vi.fn(),
        addOrUpdateMessage: vi.fn(),
        managedPresentationEnabled: true,
        hydratePresentationSources: vi.fn().mockResolvedValue({
          ok: true,
          owner: { owner_type: 'conversation', conversation_id: 'conv-1' },
          ownerRevision: 11,
          grants: [source],
        }),
        enqueueManagedPresentation,
      })
    );

    await waitFor(() => expect(enqueueManagedPresentation).toHaveBeenCalledTimes(1));
    expect(enqueueManagedPresentation).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: [
          {
            grantId: source.grantId,
            expectedByteLength: 42,
            expectedSha256: 'a'.repeat(64),
          },
        ],
      }),
      { owner_type: 'conversation', conversation_id: 'conv-1' },
      11
    );
    expect(JSON.stringify(enqueueManagedPresentation.mock.calls[0])).not.toContain('/private/');
    expect(sendMessageInvokeMock).not.toHaveBeenCalled();
    await waitFor(() => expect(sessionStorage.getItem('acp_initial_message_conv-1')).toBeNull());
  });

  it.each([
    {
      name: 'the handoff still contains a raw user attachment',
      files: [
        '/private/presentation-templates/business-review/THEME.md',
        '/private/presentation-templates/business-review/reference.pptx',
        '/private/user/revenue.xlsx',
      ],
      hydrateRejects: false,
    },
    {
      name: 'source authority hydration fails',
      files: [
        '/private/presentation-templates/business-review/THEME.md',
        '/private/presentation-templates/business-review/reference.pptx',
      ],
      hydrateRejects: true,
    },
  ])('preserves the managed handoff without a fallback when $name', async ({ files, hydrateRejects }) => {
    sessionStorage.setItem(
      'acp_initial_message_conv-1',
      JSON.stringify({
        input: 'Create a presentation from the request below. Managed rules.\n\nInitial deck',
        files,
      })
    );
    const enqueueManagedPresentation = vi.fn();
    const hydratePresentationSources = hydrateRejects
      ? vi.fn().mockResolvedValue({ ok: false, code: 'INTERNAL_ERROR' })
      : vi.fn();

    renderHook(() =>
      useAcpInitialMessage({
        conversation_id: 'conv-1',
        backend: 'codex',
        setAiProcessing: vi.fn(),
        resetState: vi.fn(),
        checkAndUpdateTitle: vi.fn(),
        addOrUpdateMessage: vi.fn(),
        managedPresentationEnabled: true,
        hydratePresentationSources,
        enqueueManagedPresentation,
      })
    );

    await waitFor(() => expect(sessionStorage.getItem('acp_initial_message_conv-1')).not.toBeNull());
    expect(enqueueManagedPresentation).not.toHaveBeenCalled();
    expect(sendMessageInvokeMock).not.toHaveBeenCalled();
  });

  it('preserves the stable managed handoff when queue acceptance rejects', async () => {
    sessionStorage.setItem(
      'acp_initial_message_conv-1',
      JSON.stringify({
        input: 'Create a presentation from the request below. Managed rules.\n\nInitial deck',
        files: [
          '/private/presentation-templates/business-review/THEME.md',
          '/private/presentation-templates/business-review/reference.pptx',
        ],
      })
    );
    const enqueueManagedPresentation = vi.fn().mockRejectedValue(new Error('localStorage quota'));

    renderHook(() =>
      useAcpInitialMessage({
        conversation_id: 'conv-1',
        backend: 'codex',
        setAiProcessing: vi.fn(),
        resetState: vi.fn(),
        checkAndUpdateTitle: vi.fn(),
        addOrUpdateMessage: vi.fn(),
        managedPresentationEnabled: true,
        hydratePresentationSources: vi.fn().mockResolvedValue({
          ok: true,
          owner: { owner_type: 'conversation', conversation_id: 'conv-1' },
          ownerRevision: 0,
          grants: [],
        }),
        enqueueManagedPresentation,
      })
    );

    await waitFor(() => expect(enqueueManagedPresentation).toHaveBeenCalledTimes(1));
    expect(sessionStorage.getItem('acp_initial_message_conv-1')).toContain('queueItemId');
    expect(sendMessageInvokeMock).not.toHaveBeenCalled();
  });

  it.each([
    { failure: 'hydrate', expectedHydrates: 1, expectedEnqueues: 0 },
    { failure: 'enqueue', expectedHydrates: 1, expectedEnqueues: 1 },
  ])(
    'attempts a stored managed record only once per mount after $failure rejection despite unstable rerenders',
    async ({ failure, expectedHydrates, expectedEnqueues }) => {
      sessionStorage.setItem(
        'acp_initial_message_conv-1',
        JSON.stringify({
          input: 'Create a presentation from the request below. Managed rules.\n\nInitial deck',
          files: [
            '/private/presentation-templates/business-review/THEME.md',
            '/private/presentation-templates/business-review/reference.pptx',
          ],
        })
      );
      const hydratePresentationSources = vi.fn().mockResolvedValue(
        failure === 'hydrate'
          ? { ok: false, code: 'INTERNAL_ERROR' }
          : {
              ok: true,
              owner: { owner_type: 'conversation', conversation_id: 'conv-1' },
              ownerRevision: 0,
              grants: [],
            }
      );
      const enqueueManagedPresentation = vi.fn().mockRejectedValue(new Error('durable enqueue rejected'));

      const { rerender } = renderHook(
        ({ renderId }: { renderId: number }) =>
          useAcpInitialMessage({
            conversation_id: 'conv-1',
            backend: 'codex',
            setAiProcessing: vi.fn(),
            resetState: vi.fn(),
            checkAndUpdateTitle: vi.fn(),
            addOrUpdateMessage: vi.fn(),
            managedPresentationEnabled: true,
            hydratePresentationSources: () => {
              void renderId;
              return hydratePresentationSources();
            },
            enqueueManagedPresentation: (...args) => {
              void renderId;
              return enqueueManagedPresentation(...args);
            },
          }),
        { initialProps: { renderId: 1 } }
      );

      await waitFor(() => expect(hydratePresentationSources).toHaveBeenCalledTimes(expectedHydrates));
      if (expectedEnqueues > 0) {
        await waitFor(() => expect(enqueueManagedPresentation).toHaveBeenCalledTimes(expectedEnqueues));
      }
      const stableRecord = sessionStorage.getItem('acp_initial_message_conv-1');
      expect(stableRecord).toContain('queueItemId');
      expect(stableRecord).toContain('clientRequestId');

      rerender({ renderId: 2 });
      rerender({ renderId: 3 });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(hydratePresentationSources).toHaveBeenCalledTimes(expectedHydrates);
      expect(enqueueManagedPresentation).toHaveBeenCalledTimes(expectedEnqueues);
      expect(sessionStorage.getItem('acp_initial_message_conv-1')).toBe(stableRecord);
      expect(sendMessageInvokeMock).not.toHaveBeenCalled();
      expect(presentationStartInvokeMock).not.toHaveBeenCalled();
      expect(presentationClaimInvokeMock).not.toHaveBeenCalled();
      expect(presentationDispatchInvokeMock).not.toHaveBeenCalled();
    }
  );

  it('retries once on a new mount with the same stable IDs after a preserved rejection', async () => {
    sessionStorage.setItem(
      'acp_initial_message_conv-1',
      JSON.stringify({
        input: 'Create a presentation from the request below. Managed rules.\n\nInitial deck',
        files: [
          '/private/presentation-templates/business-review/THEME.md',
          '/private/presentation-templates/business-review/reference.pptx',
        ],
      })
    );
    const hydratePresentationSources = vi.fn().mockResolvedValue({
      ok: true,
      owner: { owner_type: 'conversation', conversation_id: 'conv-1' },
      ownerRevision: 0,
      grants: [],
    });
    const enqueueManagedPresentation = vi.fn().mockRejectedValue(new Error('durable enqueue rejected'));
    const props = {
      conversation_id: 'conv-1',
      backend: 'codex',
      setAiProcessing: vi.fn(),
      resetState: vi.fn(),
      checkAndUpdateTitle: vi.fn(),
      addOrUpdateMessage: vi.fn(),
      managedPresentationEnabled: true,
      hydratePresentationSources,
      enqueueManagedPresentation,
    };

    const first = renderHook(() => useAcpInitialMessage(props));
    await waitFor(() => expect(enqueueManagedPresentation).toHaveBeenCalledTimes(1));
    const firstSnapshot = enqueueManagedPresentation.mock.calls[0]?.[0] as PresentationSubmissionSnapshot;
    first.unmount();

    renderHook(() => useAcpInitialMessage(props));
    await waitFor(() => expect(enqueueManagedPresentation).toHaveBeenCalledTimes(2));
    const secondSnapshot = enqueueManagedPresentation.mock.calls[1]?.[0] as PresentationSubmissionSnapshot;

    expect(secondSnapshot.queueItemId).toBe(firstSnapshot.queueItemId);
    expect(secondSnapshot.clientRequestId).toBe(firstSnapshot.clientRequestId);
    expect(sessionStorage.getItem('acp_initial_message_conv-1')).toContain(firstSnapshot.queueItemId);
    expect(sendMessageInvokeMock).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'string files value', files: '/private/template/THEME.md' },
    { name: 'object files value', files: { path: '/private/template/THEME.md' } },
    {
      name: 'mixed files array',
      files: ['/private/template/THEME.md', { path: '/private/template/reference.pptx' }],
    },
    { name: 'missing files value', files: undefined },
  ])('fails closed for a managed-prefixed record with $name', async ({ files }) => {
    const record: Record<string, unknown> = {
      input: 'Create a presentation from the request below. Managed rules.\n\nInitial deck',
    };
    if (files !== undefined) record.files = files;
    const serialized = JSON.stringify(record);
    sessionStorage.setItem('acp_initial_message_conv-1', serialized);
    const hydratePresentationSources = vi.fn();
    const enqueueManagedPresentation = vi.fn();

    renderHook(() =>
      useAcpInitialMessage({
        conversation_id: 'conv-1',
        backend: 'codex',
        setAiProcessing: vi.fn(),
        resetState: vi.fn(),
        checkAndUpdateTitle: vi.fn(),
        addOrUpdateMessage: vi.fn(),
        managedPresentationEnabled: true,
        hydratePresentationSources,
        enqueueManagedPresentation,
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sessionStorage.getItem('acp_initial_message_conv-1')).toBe(serialized);
    expect(hydratePresentationSources).not.toHaveBeenCalled();
    expect(enqueueManagedPresentation).not.toHaveBeenCalled();
    expect(sendMessageInvokeMock).not.toHaveBeenCalled();
    expect(presentationStartInvokeMock).not.toHaveBeenCalled();
    expect(presentationClaimInvokeMock).not.toHaveBeenCalled();
    expect(presentationDispatchInvokeMock).not.toHaveBeenCalled();
  });

  it('suppresses tips and reset when initial ACP send hits active-turn busy', async () => {
    sessionStorage.setItem('acp_initial_message_conv-1', JSON.stringify({ input: 'hello', files: [] }));
    sendMessageInvokeMock.mockRejectedValue(
      new BackendHttpError({
        method: 'POST',
        path: '/api/conversations/conv-1/messages',
        status: 409,
        body: { success: false, code: 'CONFLICT', error: 'conversation conv-1 is already running' },
      })
    );

    const markSendFailed = vi.fn();
    const addOrUpdateMessage = vi.fn();
    const resetState = vi.fn();
    const setAiProcessing = vi.fn();

    renderHook(() =>
      useAcpInitialMessage({
        conversation_id: 'conv-1',
        backend: 'codex',
        workspacePath: '/tmp/workspace',
        setAiProcessing,
        resetState,
        markSendStarted: vi.fn(),
        markSendAccepted: vi.fn(),
        markSendFailed,
        checkAndUpdateTitle: vi.fn(),
        addOrUpdateMessage,
      })
    );

    await waitFor(() => expect(sendMessageInvokeMock).toHaveBeenCalledTimes(1));
    expect(markSendFailed).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'busy_conflict', busyKind: 'active_turn' })
    );
    expect(addOrUpdateMessage).not.toHaveBeenCalled();
    expect(resetState).not.toHaveBeenCalled();
    expect(setAiProcessing).not.toHaveBeenCalledWith(false);
  });

  it('keeps ordinary initial ACP send failures visible and resets loading state', async () => {
    sessionStorage.setItem('acp_initial_message_conv-1', JSON.stringify({ input: 'hello', files: [] }));
    sendMessageInvokeMock.mockRejectedValue(new Error('boom'));

    const markSendFailed = vi.fn();
    const addOrUpdateMessage = vi.fn();
    const resetState = vi.fn();
    const setAiProcessing = vi.fn();

    renderHook(() =>
      useAcpInitialMessage({
        conversation_id: 'conv-1',
        backend: 'codex',
        workspacePath: '/tmp/workspace',
        setAiProcessing,
        resetState,
        markSendStarted: vi.fn(),
        markSendAccepted: vi.fn(),
        markSendFailed,
        checkAndUpdateTitle: vi.fn(),
        addOrUpdateMessage,
      })
    );

    await waitFor(() => expect(sendMessageInvokeMock).toHaveBeenCalledTimes(1));
    expect(markSendFailed).toHaveBeenCalledWith({ kind: 'ordinary', reason: 'boom' });
    expect(addOrUpdateMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tips',
        content: expect.objectContaining({ type: 'error' }),
      }),
      true
    );
    expect(resetState).toHaveBeenCalledTimes(1);
    expect(setAiProcessing).toHaveBeenCalledWith(false);
  });
});
