/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import SendBox from '@/renderer/components/chat/SendBox';
import deDEConversation from '@/renderer/services/i18n/locales/de-DE/conversation.json';
import enUSConversation from '@/renderer/services/i18n/locales/en-US/conversation.json';
import esESConversation from '@/renderer/services/i18n/locales/es-ES/conversation.json';
import faIRConversation from '@/renderer/services/i18n/locales/fa-IR/conversation.json';
import jaJPConversation from '@/renderer/services/i18n/locales/ja-JP/conversation.json';
import koKRConversation from '@/renderer/services/i18n/locales/ko-KR/conversation.json';
import ptBRConversation from '@/renderer/services/i18n/locales/pt-BR/conversation.json';
import ruRUConversation from '@/renderer/services/i18n/locales/ru-RU/conversation.json';
import trTRConversation from '@/renderer/services/i18n/locales/tr-TR/conversation.json';
import ukUAConversation from '@/renderer/services/i18n/locales/uk-UA/conversation.json';
import zhCNConversation from '@/renderer/services/i18n/locales/zh-CN/conversation.json';
import zhTWConversation from '@/renderer/services/i18n/locales/zh-TW/conversation.json';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

const sourceRefs = [
  {
    grantId: '229ca31e-1150-4ad1-ad62-1c3368330adc',
    expectedByteLength: 128,
    expectedSha256: 'a'.repeat(64),
  },
];

type SubmissionSnapshot = {
  queueItemId: string;
  clientRequestId: string;
  input: string;
  selectedTemplateId: string;
  sources: typeof sourceRefs;
  capturedAt: string;
};

type SubmissionProgress =
  | { state: 'persisting' }
  | { state: 'queued' }
  | { state: 'committed'; runId: string; revision: number }
  | { state: 'dispatching'; runId: string; revision: number }
  | { state: 'bound'; runId: string; revision: number }
  | { state: 'preflight_failed'; code: string }
  | { state: 'dispatch_uncertain'; runId: string; revision: number | null };

type SubmissionProgressObservation = {
  queueItemId: string;
  progress: SubmissionProgress;
};

type ManagedSubmissionProp = {
  selectedTemplateId: string;
  sources: typeof sourceRefs;
  onSubmit: (snapshot: SubmissionSnapshot) => Promise<SubmissionProgress>;
  onRestore?: (snapshot: SubmissionSnapshot) => Promise<void>;
  progress?: SubmissionProgressObservation | null;
};

const { layoutState } = vi.hoisted(() => ({
  layoutState: { current: { isMobile: false } },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      listAvailableSkills: { invoke: vi.fn().mockResolvedValue([]) },
      listWorkspaceFiles: { invoke: vi.fn().mockResolvedValue([]) },
    },
  },
}));
vi.mock('@/renderer/components/chat/AtFileMenu', () => ({ default: () => null }));
vi.mock('@/renderer/components/chat/BtwOverlay', () => ({ default: () => null }));
vi.mock('@/renderer/components/chat/BtwOverlay/useBtwCommand', () => ({
  useBtwCommand: () => ({ ask: vi.fn(), answer: null, dismiss: vi.fn(), isLoading: false, isOpen: false }),
}));
vi.mock('@/renderer/components/chat/SlashCommandMenu', () => ({ default: () => null }));
vi.mock('@/renderer/components/chat/SpeechInputButton', () => ({ default: () => null }));
vi.mock('@/renderer/components/media/UploadProgressBar', () => ({ default: () => null }));
vi.mock('@/renderer/hooks/chat/useCompositionInput', () => ({
  useCompositionInput: () => ({
    createCompositionValueSync: () => vi.fn(),
    compositionHandlers: {},
    createKeyDownHandler: () => vi.fn(),
    isComposingState: false,
  }),
}));
vi.mock('@/renderer/hooks/chat/useInputFocusRing', () => ({
  useInputFocusRing: () => ({
    activeBorderColor: 'transparent',
    activeShadow: 'none',
    inactiveBorderColor: 'transparent',
  }),
}));
vi.mock('@/renderer/hooks/chat/useSlashCommandController', () => ({
  getFuzzyMatchIndices: () => null,
  useSlashCommandController: () => ({ filteredCommands: [], isOpen: false, onKeyDown: () => false, query: '' }),
}));
vi.mock('@/renderer/hooks/context/ConversationContext', () => ({
  useConversationContextSafe: () => null,
}));
vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => layoutState.current,
}));
vi.mock('@/renderer/hooks/file/useAbortUploadsOnConversationChange', () => ({
  useAbortUploadsOnConversationChange: vi.fn(),
}));
vi.mock('@/renderer/hooks/file/useConversationExport', () => ({
  useConversationExport: () => ({
    closeExportFlow: vi.fn(),
    filename: '',
    handleKeyDown: () => false,
    isOpen: false,
    loading: false,
    openExportFlow: vi.fn(),
    pathPreview: '',
    setFilename: vi.fn(),
    showMenu: vi.fn(),
    submitFilename: vi.fn(),
  }),
}));
vi.mock('@/renderer/hooks/file/useDragUpload', () => ({
  useDragUpload: () => ({ dragHandlers: {}, isFileDragging: false }),
}));
vi.mock('@/renderer/hooks/file/usePasteService', () => ({
  usePasteService: () => ({ onFocus: vi.fn(), onPaste: vi.fn() }),
}));
vi.mock('@/renderer/hooks/file/useUploadState', () => ({
  useUploadState: () => ({ isUploading: false }),
}));
vi.mock('@/renderer/hooks/system/useLiveTranscriptInsertion', () => ({
  createChainedDispatch: () => ({ dispatch: vi.fn(), reset: vi.fn() }),
  useLiveTranscriptInsertion: () => ({ handleLiveTranscript: vi.fn() }),
}));
vi.mock('@/renderer/pages/conversation/Messages/hooks', () => ({ useMessageList: () => [] }));
vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({
    clearDomSnippets: vi.fn(),
    domSnippets: [],
    removeDomSnippet: vi.fn(),
    setSendBoxHandler: vi.fn(),
  }),
}));
vi.mock('@/renderer/services/FileService', () => ({ allSupportedExts: [] }));
vi.mock('@/renderer/utils/emitter', () => ({ emitter: { emit: vi.fn() }, useAddEventListener: vi.fn() }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => {
      const translations: Record<string, string> = {
        'common.send': 'Send',
        'conversation.presentationSubmission.pending': 'Presentation submission pending',
        'conversation.presentationSubmission.restore': 'Restore',
        'conversation.presentationSubmission.persistenceFailure': 'Submission was not saved',
        'conversation.presentationSubmission.queued': 'Presentation queued',
        'conversation.presentationSubmission.uncertainTracking': 'Submission status requires tracking',
      };
      return translations[key] ?? options?.defaultValue ?? key;
    },
  }),
}));

const ManagedHarness = ({
  onSubmit,
  onRestore,
  progress,
  initialValue = 'Create a concise board update',
  refs = sourceRefs,
  onSend = vi.fn().mockResolvedValue(undefined),
}: {
  onSubmit: ManagedSubmissionProp['onSubmit'];
  onRestore?: ManagedSubmissionProp['onRestore'];
  progress?: SubmissionProgressObservation | null;
  initialValue?: string;
  refs?: typeof sourceRefs;
  onSend?: (message: string) => Promise<void>;
}) => {
  const [value, setValue] = useState(initialValue);
  const managedPresentationSubmission: ManagedSubmissionProp = {
    selectedTemplateId: 'business-review',
    sources: refs,
    onSubmit,
    onRestore,
    progress,
  };
  const managedProps = { managedPresentationSubmission } as unknown as Partial<React.ComponentProps<typeof SendBox>>;
  return <SendBox value={value} onChange={setValue} onSend={onSend} {...managedProps} />;
};

const conversationLocales = [
  ['de-DE', deDEConversation],
  ['en-US', enUSConversation],
  ['es-ES', esESConversation],
  ['fa-IR', faIRConversation],
  ['ja-JP', jaJPConversation],
  ['ko-KR', koKRConversation],
  ['pt-BR', ptBRConversation],
  ['ru-RU', ruRUConversation],
  ['tr-TR', trTRConversation],
  ['uk-UA', ukUAConversation],
  ['zh-CN', zhCNConversation],
  ['zh-TW', zhTWConversation],
] as const;

const presentationSubmissionKeys = ['pending', 'restore', 'persistenceFailure', 'queued', 'uncertainTracking'] as const;

describe('SendBox managed presentation pending submission', () => {
  it.each(conversationLocales)('defines all five nonempty managed submission messages in %s', (_locale, value) => {
    for (const key of presentationSubmissionKeys) {
      expect(value.presentationSubmission[key].trim()).not.toBe('');
    }
  });

  it('captures an immutable stable snapshot before clearing and keeps new typing separate', async () => {
    let resolveSubmit: ((progress: SubmissionProgress) => void) | undefined;
    const onSubmit = vi.fn(
      () =>
        new Promise<SubmissionProgress>((resolve) => {
          resolveSubmit = resolve;
        })
    );
    const mutableRefs = structuredClone(sourceRefs);
    render(<ManagedHarness onSubmit={onSubmit} refs={mutableRefs} />);

    fireEvent.click(screen.getByTestId('sendbox-send-btn'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    const snapshot = onSubmit.mock.calls[0]?.[0];
    const textarea = screen.getByTestId('sendbox-input');

    expect(snapshot).toMatchObject({
      input: 'Create a concise board update',
      selectedTemplateId: 'business-review',
      sources: sourceRefs,
    });
    expect(snapshot?.queueItemId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(snapshot?.clientRequestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(snapshot?.capturedAt).toBe(new Date(snapshot?.capturedAt ?? '').toISOString());
    expect(textarea).toHaveValue('');

    mutableRefs[0]!.expectedByteLength = 999;
    fireEvent.change(textarea, { target: { value: 'A separate new draft' } });
    expect(snapshot?.sources[0]?.expectedByteLength).toBe(128);
    expect(textarea).toHaveValue('A separate new draft');
    await act(async () => {
      resolveSubmit?.({ state: 'committed', runId: '5a68fccc-7b90-49b4-88f9-d78bb88255ed', revision: 4 });
    });
  });

  it('does not overwrite the pending snapshot with a second managed submission', async () => {
    const onSubmit = vi.fn(() => new Promise<SubmissionProgress>(() => undefined));
    render(<ManagedHarness onSubmit={onSubmit} />);
    const textarea = screen.getByTestId('sendbox-input');

    fireEvent.click(screen.getByTestId('sendbox-send-btn'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    const firstSnapshot = onSubmit.mock.calls[0]?.[0];
    fireEvent.change(textarea, { target: { value: 'Do not lose this newer draft' } });

    expect(screen.queryByTestId('sendbox-send-btn')).toBeNull();
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit.mock.calls[0]?.[0]).toBe(firstSnapshot);
    expect(textarea).toHaveValue('Do not lose this newer draft');
  });

  it('fails closed without clearing the draft when the platform cannot provide a strict UUID', () => {
    const invalidUuid = '0'.repeat(36) as ReturnType<Crypto['randomUUID']>;
    const randomUuid = vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(invalidUuid);
    const onSubmit = vi.fn(async (): Promise<SubmissionProgress> => ({ state: 'queued' }));
    render(<ManagedHarness onSubmit={onSubmit} />);

    fireEvent.click(screen.getByTestId('sendbox-send-btn'));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId('sendbox-input')).toHaveValue('Create a concise board update');
    expect(screen.queryByTestId('presentation-pending-submission')).toBeNull();
    randomUuid.mockRestore();
  });

  it('clears pending only after confirmed queued persistence', async () => {
    let resolveSubmit: ((progress: SubmissionProgress) => void) | undefined;
    const onSubmit = vi.fn(
      () =>
        new Promise<SubmissionProgress>((resolve) => {
          resolveSubmit = resolve;
        })
    );
    render(<ManagedHarness onSubmit={onSubmit} />);

    fireEvent.click(screen.getByTestId('sendbox-send-btn'));
    await waitFor(() => expect(screen.getByTestId('presentation-pending-submission')).toBeInTheDocument());
    resolveSubmit?.({ state: 'queued' });

    await waitFor(() => expect(screen.queryByTestId('presentation-pending-submission')).toBeNull());
  });

  it('retains committed work until a later bound observation clears it', async () => {
    const onSubmit = vi.fn(
      async (): Promise<SubmissionProgress> => ({
        state: 'committed',
        runId: '5a68fccc-7b90-49b4-88f9-d78bb88255ed',
        revision: 4,
      })
    );
    const { rerender } = render(<ManagedHarness onSubmit={onSubmit} />);

    fireEvent.click(screen.getByTestId('sendbox-send-btn'));
    await waitFor(() => expect(screen.getByText('Presentation submission pending')).toBeInTheDocument());
    const queueItemId = onSubmit.mock.calls[0]?.[0].queueItemId;

    rerender(
      <ManagedHarness
        onSubmit={onSubmit}
        progress={{
          queueItemId,
          progress: { state: 'bound', runId: '5a68fccc-7b90-49b4-88f9-d78bb88255ed', revision: 6 },
        }}
      />
    );
    await waitFor(() => expect(screen.queryByTestId('presentation-pending-submission')).toBeNull());
  });

  it('retains rejected submission tracking until its correlated durable observation arrives', async () => {
    const onSubmit = vi.fn(async (): Promise<SubmissionProgress> => {
      throw new Error('lost IPC reply');
    });
    const { rerender } = render(<ManagedHarness onSubmit={onSubmit} />);
    const textarea = screen.getByTestId('sendbox-input');

    fireEvent.click(screen.getByTestId('sendbox-send-btn'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    await act(async () => Promise.resolve());

    expect(screen.getByText('Presentation submission pending')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull();
    fireEvent.change(textarea, { target: { value: 'Do not resend this draft' } });
    fireEvent.click(screen.getByTestId('sendbox-send-btn'));
    expect(onSubmit).toHaveBeenCalledOnce();

    const queueItemId = onSubmit.mock.calls[0]?.[0].queueItemId;
    rerender(<ManagedHarness onSubmit={onSubmit} progress={{ queueItemId, progress: { state: 'queued' } }} />);

    await waitFor(() => expect(screen.queryByTestId('presentation-pending-submission')).toBeNull());
    expect(textarea).toHaveValue('Do not resend this draft');
  });

  it('ignores a stale queue observation while another stable submission is pending', async () => {
    let resolveSecond: ((progress: SubmissionProgress) => void) | undefined;
    const onSubmit = vi
      .fn<(snapshot: SubmissionSnapshot) => Promise<SubmissionProgress>>()
      .mockResolvedValueOnce({ state: 'queued' })
      .mockImplementationOnce(
        () =>
          new Promise<SubmissionProgress>((resolve) => {
            resolveSecond = resolve;
          })
      );
    const { rerender } = render(<ManagedHarness onSubmit={onSubmit} initialValue='Submission A' />);
    const textarea = screen.getByTestId('sendbox-input');

    fireEvent.click(screen.getByTestId('sendbox-send-btn'));
    await waitFor(() => expect(screen.queryByTestId('presentation-pending-submission')).toBeNull());
    const queueItemIdA = onSubmit.mock.calls[0]?.[0].queueItemId;

    fireEvent.change(textarea, { target: { value: 'Submission B' } });
    fireEvent.click(screen.getByTestId('sendbox-send-btn'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    const queueItemIdB = onSubmit.mock.calls[1]?.[0].queueItemId;

    rerender(
      <ManagedHarness
        onSubmit={onSubmit}
        initialValue='Submission A'
        progress={{
          queueItemId: queueItemIdA,
          progress: { state: 'bound', runId: '5a68fccc-7b90-49b4-88f9-d78bb88255ed', revision: 6 },
        }}
      />
    );
    expect(screen.getByTestId('presentation-pending-submission')).toBeInTheDocument();

    rerender(
      <ManagedHarness
        onSubmit={onSubmit}
        initialValue='Submission A'
        progress={{ queueItemId: queueItemIdB, progress: { state: 'queued' } }}
      />
    );
    await waitFor(() => expect(screen.queryByTestId('presentation-pending-submission')).toBeNull());
    await act(async () => resolveSecond?.({ state: 'queued' }));
  });

  it('restores a failed submission only into an exactly empty newer draft', async () => {
    const onSubmit = vi.fn(
      async (): Promise<SubmissionProgress> => ({
        state: 'preflight_failed',
        code: 'PERSISTENCE_FAILED',
      })
    );
    render(<ManagedHarness onSubmit={onSubmit} />);
    const textarea = screen.getByTestId('sendbox-input');

    fireEvent.click(screen.getByTestId('sendbox-send-btn'));
    const restore = await screen.findByRole('button', { name: 'Restore' });
    expect(textarea).toHaveValue('');

    fireEvent.change(textarea, { target: { value: 'Newer text wins' } });
    expect(restore).toBeDisabled();
    fireEvent.click(restore);
    expect(textarea).toHaveValue('Newer text wins');

    fireEvent.change(textarea, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(textarea).toHaveValue('Create a concise board update');
    expect(screen.queryByTestId('presentation-pending-submission')).toBeNull();
  });

  it('awaits successful queue cleanup before restoring and clearing a persisted failure', async () => {
    let resolveCleanup: (() => void) | undefined;
    const onRestore = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCleanup = resolve;
        })
    );
    const onSubmit = vi.fn(
      async (): Promise<SubmissionProgress> => ({
        state: 'preflight_failed',
        code: 'FEATURE_DISABLED',
      })
    );
    render(<ManagedHarness onSubmit={onSubmit} onRestore={onRestore} />);

    fireEvent.click(screen.getByTestId('sendbox-send-btn'));
    await waitFor(() => expect(screen.getByText('Submission was not saved')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    expect(onRestore).toHaveBeenCalledWith(onSubmit.mock.calls[0]?.[0]);
    expect(screen.getByTestId('sendbox-input')).toHaveValue('');
    expect(screen.getByTestId('presentation-pending-submission')).toBeInTheDocument();
    await act(async () => resolveCleanup?.());
    await waitFor(() => expect(screen.getByTestId('sendbox-input')).toHaveValue('Create a concise board update'));
    expect(screen.queryByTestId('presentation-pending-submission')).toBeNull();
  });

  it('does not repeat successful cleanup when newer typing delays restoring the pending snapshot', async () => {
    let resolveCleanup: (() => void) | undefined;
    const onRestore = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCleanup = resolve;
        })
    );
    const onSubmit = vi.fn(
      async (): Promise<SubmissionProgress> => ({
        state: 'preflight_failed',
        code: 'FEATURE_DISABLED',
      })
    );
    render(<ManagedHarness onSubmit={onSubmit} onRestore={onRestore} />);
    const textarea = screen.getByTestId('sendbox-input');

    fireEvent.click(screen.getByTestId('sendbox-send-btn'));
    await waitFor(() => expect(screen.getByText('Submission was not saved')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    fireEvent.change(textarea, { target: { value: 'Keep this newer draft' } });
    await act(async () => resolveCleanup?.());

    expect(textarea).toHaveValue('Keep this newer draft');
    expect(screen.getByTestId('presentation-pending-submission')).toBeInTheDocument();
    expect(onRestore).toHaveBeenCalledOnce();

    fireEvent.change(textarea, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(textarea).toHaveValue('Create a concise board update'));
    expect(screen.queryByTestId('presentation-pending-submission')).toBeNull();
    expect(onRestore).toHaveBeenCalledOnce();
  });

  it('retains both pending snapshot and empty draft when persisted-failure cleanup rejects', async () => {
    const onRestore = vi.fn(async () => {
      throw new Error('cleanup failed');
    });
    const onSubmit = vi.fn(
      async (): Promise<SubmissionProgress> => ({
        state: 'preflight_failed',
        code: 'FEATURE_DISABLED',
      })
    );
    render(<ManagedHarness onSubmit={onSubmit} onRestore={onRestore} />);

    fireEvent.click(screen.getByTestId('sendbox-send-btn'));
    await waitFor(() => expect(screen.getByText('Submission was not saved')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(onRestore).toHaveBeenCalledOnce());
    expect(screen.getByTestId('sendbox-input')).toHaveValue('');
    expect(screen.getByTestId('presentation-pending-submission')).toBeInTheDocument();
  });

  it('shows tracking-only copy for uncertainty without Restore or resend', async () => {
    const onSubmit = vi.fn(
      async (): Promise<SubmissionProgress> => ({
        state: 'dispatch_uncertain',
        runId: '5a68fccc-7b90-49b4-88f9-d78bb88255ed',
        revision: null,
      })
    );
    render(<ManagedHarness onSubmit={onSubmit} />);

    fireEvent.click(screen.getByTestId('sendbox-send-btn'));

    expect(await screen.findByText('Submission status requires tracking')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull();
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('keeps the unmanaged immediate-clear onSend behavior unchanged', async () => {
    const onSend = vi.fn(() => new Promise<void>(() => undefined));

    const Harness = () => {
      const [value, setValue] = useState('Legacy send');
      return <SendBox value={value} onChange={setValue} onSend={onSend} />;
    };
    render(<Harness />);

    fireEvent.click(screen.getByTestId('sendbox-send-btn'));

    expect(onSend).toHaveBeenCalledWith('Legacy send');
    expect(screen.getByTestId('sendbox-input')).toHaveValue('');
    expect(screen.queryByTestId('presentation-pending-submission')).toBeNull();
  });
});
