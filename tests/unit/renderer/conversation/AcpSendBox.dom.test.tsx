/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { BackendHttpError } from '@/common/adapter/httpBridge';
import type {
  GetPresentationSourceOwnerResult,
  PickPresentationSourcesResult,
  PresentationGrantOwner,
  PresentationSourceDescriptor,
} from '@/common/types/office/presentationRun';
import type { PresentationTemplateSummary } from '@/common/types/office/presentationTemplate';
import AcpSendBox from '@/renderer/pages/conversation/platforms/acp/AcpSendBox';
import type { UseAcpMessageReturn } from '@/renderer/pages/conversation/platforms/acp/useAcpMessage';

const {
  sendMessageInvokeMock,
  addOrUpdateMessageMock,
  resetStateMock,
  emitterEmitMock,
  setSendBoxHandlerMock,
  useAcpConfigOptionsMock,
  useTeamPermissionMock,
  isMobileMock,
  mobileActionSheetEntries,
  contextUsageIndicatorProps,
  sendBoxProps,
  clearFilesMock,
  grantExternalDropMock,
  handleFilesAddedMock,
  clearSelectionMock,
  composeSendMock,
  draftMutateMock,
  draftState,
  featureEnabledState,
  hydrateSourceOwnerMock,
  isElectronDesktopMock,
  legacyOpenFileSelectorMock,
  messageWarningMock,
  pickSourcesMock,
  prepareScratchMock,
  revokeSourceMock,
  resetSourceDraftMock,
  selectedTemplateState,
  sourceDescriptorsState,
  sourceOwnerRevisionState,
  sourceOwnerState,
} = vi.hoisted(() => ({
  sendMessageInvokeMock: vi.fn(),
  addOrUpdateMessageMock: vi.fn(),
  resetStateMock: vi.fn(),
  emitterEmitMock: vi.fn(),
  setSendBoxHandlerMock: vi.fn(),
  useAcpConfigOptionsMock: vi.fn(),
  useTeamPermissionMock: vi.fn(),
  isMobileMock: { current: false },
  mobileActionSheetEntries: {
    current: [] as Array<{
      key: string;
      submenu?: {
        onSelect?: (value: string) => void;
      };
    }>,
  },
  contextUsageIndicatorProps: {
    current: null as {
      budget: {
        source: 'runtime' | 'estimated' | 'unknown';
        totalTokens: number | null;
        contextLimit?: number;
        ratio: number | null;
        status: 'healthy' | 'watch' | 'compress' | 'too_large';
      };
      localUsage: { today: number; weekToDate: number; monthToDate: number };
    } | null,
  },
  sendBoxProps: {
    current: null as {
      tokenUsage?: unknown;
      localUsage?: unknown;
      context_limit?: unknown;
      prefix?: React.ReactNode;
      tools?: React.ReactNode;
      onSlashBuiltinCommand?: (name: string) => void;
      hasPendingAttachments?: boolean;
      onFilesAdded?: (files: unknown[]) => void;
      onManagedDrop?: (files: readonly File[]) => Promise<void> | void;
    } | null,
  },
  clearFilesMock: vi.fn(),
  grantExternalDropMock: vi.fn(),
  handleFilesAddedMock: vi.fn(),
  clearSelectionMock: vi.fn(),
  composeSendMock: vi.fn((input: string, files: string[]) => ({ input, files, injectSkills: [] })),
  draftMutateMock: vi.fn(),
  draftState: {
    current: {
      atPath: [] as Array<string | { path: string; name: string; isFile: boolean; relativePath?: string }>,
      uploadFile: [] as string[],
      content: '',
    },
  },
  featureEnabledState: { current: false },
  hydrateSourceOwnerMock: vi.fn().mockResolvedValue({
    ok: true,
    owner: { owner_type: 'conversation', conversation_id: 'conv-1' },
    ownerRevision: 0,
    grants: [],
  }),
  isElectronDesktopMock: vi.fn(() => true),
  legacyOpenFileSelectorMock: vi.fn(),
  messageWarningMock: vi.fn(),
  pickSourcesMock: vi.fn(),
  prepareScratchMock: vi.fn().mockResolvedValue(undefined),
  revokeSourceMock: vi.fn(),
  resetSourceDraftMock: vi.fn(),
  selectedTemplateState: { current: null as PresentationTemplateSummary | null },
  sourceDescriptorsState: { current: [] as PresentationSourceDescriptor[] },
  sourceOwnerRevisionState: { current: null as number | null },
  sourceOwnerState: { current: null as PresentationGrantOwner | null },
}));

vi.mock('@/common/config/constants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/common/config/constants')>();
  return {
    ...actual,
    get PRESENTATION_RUN_V2_ENABLED() {
      return featureEnabledState.current;
    },
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      sendMessage: {
        invoke: sendMessageInvokeMock,
      },
    },
    conversation: {
      stop: {
        invoke: vi.fn().mockResolvedValue(undefined),
      },
    },
  },
}));

vi.mock('@/renderer/components/chat/SendBox', () => ({
  default: ({
    onSend,
    onChange,
    prefix,
    rightTools,
    ...props
  }: {
    onSend: (message: string) => Promise<void>;
    onChange?: (value: string) => void;
    prefix?: React.ReactNode;
    rightTools?: React.ReactNode;
  }) =>
    (() => {
      sendBoxProps.current = props;
      return (
        <div>
          {rightTools}
          {prefix}
          <button type='button' onClick={() => onChange?.('hello')}>
            change
          </button>
          <button
            type='button'
            onClick={() => {
              void onSend('Hello').catch(() => {});
            }}
          >
            send
          </button>
        </div>
      );
    })(),
}));

vi.mock('@/renderer/components/chat/TemplateGallery', () => ({
  TemplateChipCard: ({ template }: { template: PresentationTemplateSummary }) => (
    <span data-testid='template-chip-card'>{template.manifest.name}</span>
  ),
  TemplateGalleryButton: () => null,
  TemplateGalleryPanel: () => null,
  usePresentationTemplates: () => ({
    templates: [],
    templatesLoading: false,
    galleryOpen: false,
    openGallery: vi.fn(),
    closeGallery: vi.fn(),
    toggleGallery: vi.fn(),
    selectedTemplate: selectedTemplateState.current,
    selectTemplate: vi.fn(),
    clearSelection: clearSelectionMock,
    importFromDialog: vi.fn(),
    removeTemplate: vi.fn(),
    prepareScratch: prepareScratchMock,
    composeSend: composeSendMock,
    registerScratchTurn: vi.fn(),
    retainScratchRun: vi.fn().mockResolvedValue(undefined),
    handleScratchTerminal: vi.fn(),
    interruptScratchTurn: vi.fn(),
    discardScratch: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@/renderer/components/agent/AgentModeSelector', () => ({
  default: () => <span data-testid='composer-permission-control' />,
}));
vi.mock('@/renderer/components/agent/ContextUsageIndicator', () => ({
  default: (props: {
    budget: {
      source: 'runtime' | 'estimated' | 'unknown';
      totalTokens: number | null;
      contextLimit?: number;
      ratio: number | null;
      status: 'healthy' | 'watch' | 'compress' | 'too_large';
    };
    localUsage: { today: number; weekToDate: number; monthToDate: number };
  }) => {
    contextUsageIndicatorProps.current = props;
    return <span data-testid='context-usage-indicator' />;
  },
}));
vi.mock('@/renderer/components/chat/CommandQueuePanel', () => ({ default: () => null }));
vi.mock('@/renderer/components/chat/MobileActionSheet', () => ({
  default: ({
    entries,
  }: {
    entries?: Array<{
      key: string;
      submenu?: {
        onSelect?: (value: string) => void;
      };
    }>;
  }) => {
    mobileActionSheetEntries.current = entries ?? [];
    return null;
  },
  useAttachEntry: () => ({ entries: [], hiddenFileInput: null }),
}));
vi.mock('@/renderer/components/chat/ThoughtDisplay', () => ({ default: () => null }));
vi.mock('@/renderer/components/media/FileAttachButton', () => ({ default: () => null }));
vi.mock('@/renderer/components/media/FilePreview', () => ({ default: () => null }));
vi.mock('@/renderer/components/media/HorizontalFileList', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/renderer/hooks/agent/useAcpModelInfo', () => ({
  useAcpModelInfo: () => ({
    model_info: null,
    canSwitch: false,
    selectModel: vi.fn(),
  }),
}));
vi.mock('@/renderer/hooks/agent/useAcpConfigOptions', () => ({
  classifyConfigSetError: () => 'unknown',
  useAcpConfigOptions: useAcpConfigOptionsMock,
}));
vi.mock('@/renderer/hooks/chat/useSendBoxDraft', () => ({
  getSendBoxDraftHook: () => () => ({
    data: draftState.current,
    mutate: draftMutateMock,
  }),
}));
vi.mock('@/renderer/hooks/chat/useSendBoxFiles', () => ({
  useSendBoxFiles: () => ({
    handleFilesAdded: handleFilesAddedMock,
    clearFiles: clearFilesMock,
  }),
  createSetUploadFile: () => vi.fn(),
}));
vi.mock('@/renderer/hooks/chat/useAutoTitle', () => ({
  useAutoTitle: () => ({
    checkAndUpdateTitle: vi.fn(),
  }),
}));
vi.mock('@/renderer/hooks/context/ConversationContext', () => ({
  useConversationContextSafe: () => ({
    conversation: {
      id: 'conv-1',
      name: 'ACP budget fixture',
      type: 'acp',
      created_at: 1,
      modified_at: 1,
      extra: { backend: 'codex' },
    },
    loadedSkills: [],
    loadedMcpStatuses: [],
  }),
}));
vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: isMobileMock.current }),
}));
vi.mock('@/renderer/hooks/useLocalTokenUsage', () => ({
  useLocalTokenUsage: () => ({ today: 120, weekToDate: 560, monthToDate: 1_240 }),
}));
vi.mock('@/renderer/hooks/file/selection', () => ({
  useOpenFileSelector: () => ({
    openFileSelector: legacyOpenFileSelectorMock,
    onSlashBuiltinCommand: (name: string) => {
      if (name === 'open') legacyOpenFileSelectorMock();
    },
  }),
  usePresentationSourceDraft: () => ({
    owner: sourceOwnerState.current,
    ownerRevision: sourceOwnerRevisionState.current,
    descriptors: sourceDescriptorsState.current,
    sourceRefs: [],
    pending: false,
    hydrate: hydrateSourceOwnerMock,
    createDraft: vi.fn(),
    pickSources: pickSourcesMock,
    grantExternalDrop: grantExternalDropMock,
    grantWorkspaceSource: vi.fn(),
    revoke: revokeSourceMock,
    bindDraft: vi.fn(),
    reset: resetSourceDraftMock,
  }),
}));
vi.mock('@/renderer/hooks/ui/useLatestRef', () => ({
  useLatestRef: <T,>(value: T) => {
    const ref = React.useRef(value);
    ref.current = value;
    return ref;
  },
}));
vi.mock('@/renderer/pages/conversation/Messages/hooks', () => ({
  useAddOrUpdateMessage: () => addOrUpdateMessageMock,
  useMessageList: () => [],
}));
vi.mock('@/renderer/pages/conversation/platforms/useConversationCommandQueue', () => ({
  shouldEnqueueConversationCommand: () => false,
  useConversationCommandQueue: () => ({
    items: [],
    isPaused: false,
    isInteractionLocked: false,
    hasPendingCommands: false,
    enqueue: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
    reorder: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    lockInteraction: vi.fn(),
    unlockInteraction: vi.fn(),
    resetActiveExecution: vi.fn(),
  }),
}));
vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({
    setSendBoxHandler: setSendBoxHandlerMock,
  }),
}));
vi.mock('@/renderer/pages/team/hooks/TeamPermissionContext', () => ({
  useTeamPermission: useTeamPermissionMock,
}));
vi.mock('@/renderer/services/FileService', () => ({
  allSupportedExts: [],
}));
vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: isElectronDesktopMock,
}));
vi.mock('@/renderer/utils/emitter', () => ({
  emitter: {
    emit: emitterEmitMock,
  },
  useAddEventListener: vi.fn(),
}));
vi.mock('@/renderer/utils/file/fileSelection', () => ({
  mergeFileSelectionItems: vi.fn(),
}));
vi.mock('@/renderer/utils/file/messageFiles', () => ({
  buildDisplayMessage: (input: string) => input,
}));
vi.mock('@/renderer/pages/conversation/platforms/acp/useAcpInitialMessage', () => ({
  useAcpInitialMessage: vi.fn(),
}));
vi.mock('@arco-design/web-react', () => ({
  Button: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) => (
    <button type='button' onClick={onClick}>
      {children}
    </button>
  ),
  Message: {
    success: vi.fn(),
    error: vi.fn(),
    warning: messageWarningMock,
  },
  Tag: ({ children, onClose }: { children?: React.ReactNode; onClose?: () => void }) => (
    <span>
      {children}
      {onClose && (
        <button type='button' aria-label={`Remove ${String(children)}`} onClick={onClose}>
          remove
        </button>
      )}
    </span>
  ),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

const pptxTemplate: PresentationTemplateSummary = {
  manifest: {
    id: 'business-review',
    name: 'Business Review',
    description: 'Quarterly results',
    format: 'pptx',
    kind: 'deck',
    source: 'builtin',
    themeFile: 'SKILL.md',
    referenceFile: 'reference.pptx',
    preview: 'preview.svg',
    version: 1,
    createdAt: '2026-08-04T00:00:00.000Z',
  },
  themePath: '/private/template/SKILL.md',
  referencePath: '/private/template/reference.pptx',
  previewDataUrl: 'data:image/svg+xml,preview',
};

const sourceDescriptor: PresentationSourceDescriptor = {
  grantId: 'grant-1',
  displayName: 'quarterly-results.xlsx',
  format: 'xlsx',
  sourceKind: 'native-picker',
  byteLength: 42,
  sha256: 'a'.repeat(64),
  expiresAt: '2026-08-04T00:15:00.000Z',
};

const currentConversationOwner: PresentationGrantOwner = {
  owner_type: 'conversation',
  conversation_id: 'conv-1',
};

const hydratedOwnerResult: GetPresentationSourceOwnerResult = {
  ok: true,
  owner: currentConversationOwner,
  ownerRevision: 0,
  grants: [],
};

const failedOwnerHydration: GetPresentationSourceOwnerResult = {
  ok: false,
  code: 'INTERNAL_ERROR',
  messageKey: 'conversation.presentationRun.errors.INTERNAL_ERROR',
  retryable: false,
  state: 'preflight',
  details: null,
};

const createDeferred = <Value,>() => {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const makeMessageState = (overrides: Partial<UseAcpMessageReturn> = {}): UseAcpMessageReturn => ({
  thought: { subject: '', description: '' },
  setThought: vi.fn(),
  running: true,
  hasHydratedRunningState: true,
  acpStatus: null,
  aiProcessing: false,
  setAiProcessing: vi.fn(),
  resetState: resetStateMock,
  tokenUsage: null,
  context_limit: 0,
  hasThinkingMessage: false,
  slashCommands: [],
  fetchSlashCommands: vi.fn(),
  ...overrides,
});

describe('AcpSendBox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isMobileMock.current = false;
    mobileActionSheetEntries.current = [];
    contextUsageIndicatorProps.current = null;
    sendBoxProps.current = null;
    draftState.current = { atPath: [], uploadFile: [], content: '' };
    draftMutateMock.mockImplementation((updater: unknown) => {
      if (typeof updater === 'function') {
        draftState.current = (updater as (previous: typeof draftState.current) => typeof draftState.current)(
          draftState.current
        );
      }
      return Promise.resolve(draftState.current);
    });
    featureEnabledState.current = false;
    isElectronDesktopMock.mockReturnValue(true);
    selectedTemplateState.current = null;
    sourceDescriptorsState.current = [];
    sourceOwnerState.current = null;
    sourceOwnerRevisionState.current = null;
    hydrateSourceOwnerMock.mockResolvedValue(hydratedOwnerResult);
    pickSourcesMock.mockResolvedValue({
      ok: true,
      status: 'cancelled',
      grants: [],
      ownerRevision: 0,
    });
    grantExternalDropMock.mockResolvedValue({
      ok: true,
      status: 'granted',
      grants: [sourceDescriptor],
      ownerRevision: 1,
    });
    prepareScratchMock.mockResolvedValue(undefined);
    composeSendMock.mockImplementation((input: string, files: string[]) => ({ input, files, injectSkills: [] }));
    useTeamPermissionMock.mockReturnValue(null);
    useAcpConfigOptionsMock.mockReturnValue({
      setStatus: { state: 'idle' },
      mode: null,
      model: null,
      thoughtLevel: null,
      reload: vi.fn(),
      setConfigOption: vi.fn(),
    });
  });

  it('blocks managed preparation for a legacy attachment while preserving the submitted draft', async () => {
    featureEnabledState.current = true;
    selectedTemplateState.current = pptxTemplate;
    draftState.current = { atPath: [], uploadFile: ['/private/legacy.xlsx'], content: 'Draft request' };

    render(
      <AcpSendBox
        conversation_id='conv-1'
        backend='codex'
        workspacePath='/tmp/workspace'
        messageState={makeMessageState()}
      />
    );
    await act(async () => {
      screen.getByRole('button', { name: 'send' }).click();
    });

    expect(draftState.current.content).toBe('Hello');
    expect(screen.getByRole('alert')).toHaveTextContent('conversation.presentationTemplates.sources.reselectRequired');
    expect(messageWarningMock).not.toHaveBeenCalled();
    expect(clearFilesMock).not.toHaveBeenCalled();
    expect(prepareScratchMock).not.toHaveBeenCalled();
    expect(sendMessageInvokeMock).not.toHaveBeenCalled();
    expect(clearSelectionMock).not.toHaveBeenCalled();
  });

  it('keeps legacy attachments when managed source reselect is cancelled', async () => {
    featureEnabledState.current = true;
    selectedTemplateState.current = pptxTemplate;
    draftState.current = { atPath: [], uploadFile: ['/private/legacy.xlsx'], content: 'Draft request' };

    render(
      <AcpSendBox
        conversation_id='conv-1'
        backend='codex'
        workspacePath='/tmp/workspace'
        messageState={makeMessageState()}
      />
    );
    await act(async () => {
      screen.getByRole('button', { name: 'send' }).click();
    });

    await act(async () => {
      screen.getByRole('button', { name: 'conversation.presentationTemplates.sources.reselectAction' }).click();
    });

    expect(pickSourcesMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(clearFilesMock).not.toHaveBeenCalled();
    expect(emitterEmitMock).not.toHaveBeenCalledWith('acp.selected.file.clear');
    expect(draftState.current.uploadFile).toEqual(['/private/legacy.xlsx']);
  });

  it('clears legacy attachments only after managed source reselect is confirmed', async () => {
    featureEnabledState.current = true;
    selectedTemplateState.current = pptxTemplate;
    draftState.current = { atPath: [], uploadFile: ['/private/legacy.xlsx'], content: 'Draft request' };
    pickSourcesMock.mockResolvedValue({
      ok: true,
      status: 'selected',
      grants: [sourceDescriptor],
      ownerRevision: 1,
    });

    render(
      <AcpSendBox
        conversation_id='conv-1'
        backend='codex'
        workspacePath='/tmp/workspace'
        messageState={makeMessageState()}
      />
    );
    await act(async () => {
      screen.getByRole('button', { name: 'send' }).click();
    });

    await act(async () => {
      screen.getByRole('button', { name: 'conversation.presentationTemplates.sources.reselectAction' }).click();
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(clearFilesMock).toHaveBeenCalledTimes(1);
    expect(emitterEmitMock).toHaveBeenCalledWith('acp.selected.file.clear');
    expect(sendMessageInvokeMock).not.toHaveBeenCalled();
  });

  it('allows a prompt-only managed-eligible draft to continue', async () => {
    featureEnabledState.current = true;
    selectedTemplateState.current = pptxTemplate;
    sendMessageInvokeMock.mockResolvedValue({ turn_id: 'turn-1', runtime: null, msg_id: 'msg-1' });

    render(
      <AcpSendBox
        conversation_id='conv-1'
        backend='codex'
        workspacePath='/tmp/workspace'
        messageState={makeMessageState()}
      />
    );
    await act(async () => {
      screen.getByRole('button', { name: 'send' }).click();
    });

    await waitFor(() => expect(sendMessageInvokeMock).toHaveBeenCalledTimes(1));
    expect(messageWarningMock).not.toHaveBeenCalled();
    expect(prepareScratchMock).toHaveBeenCalledWith('conv-1');
  });

  it('keeps the raw legacy send when the managed feature flag is false', async () => {
    featureEnabledState.current = false;
    selectedTemplateState.current = pptxTemplate;
    draftState.current = { atPath: [], uploadFile: ['/private/legacy.xlsx'], content: 'Draft request' };
    sendMessageInvokeMock.mockResolvedValue({ turn_id: 'turn-1', runtime: null, msg_id: 'msg-1' });

    render(
      <AcpSendBox
        conversation_id='conv-1'
        backend='codex'
        workspacePath='/tmp/workspace'
        messageState={makeMessageState()}
      />
    );
    await act(async () => {
      screen.getByRole('button', { name: 'send' }).click();
    });

    await waitFor(() => expect(sendMessageInvokeMock).toHaveBeenCalledTimes(1));
    expect(clearFilesMock).toHaveBeenCalledTimes(1);
    expect(messageWarningMock).not.toHaveBeenCalled();
  });

  it('routes managed attachment selection through opaque grants and renders only descriptor display names', async () => {
    featureEnabledState.current = true;
    selectedTemplateState.current = pptxTemplate;
    sourceDescriptorsState.current = [sourceDescriptor];

    render(
      <AcpSendBox
        conversation_id='conv-1'
        backend='codex'
        workspacePath='/tmp/workspace'
        messageState={makeMessageState()}
      />
    );

    await waitFor(() =>
      expect(hydrateSourceOwnerMock).toHaveBeenCalledWith({
        owner_type: 'conversation',
        conversation_id: 'conv-1',
      })
    );
    await act(async () => {
      sendBoxProps.current?.onSlashBuiltinCommand?.('open');
    });
    expect(pickSourcesMock).toHaveBeenCalledTimes(1);
    expect(legacyOpenFileSelectorMock).not.toHaveBeenCalled();
    expect(screen.getByText('quarterly-results.xlsx')).toBeInTheDocument();
    expect(screen.queryByText(sourceDescriptor.sha256)).not.toBeInTheDocument();

    screen.getByRole('button', { name: 'Remove quarterly-results.xlsx' }).click();
    expect(revokeSourceMock).toHaveBeenCalledWith('grant-1');
  });

  it('routes eligible dropped files through opaque grants without creating legacy file metadata', async () => {
    featureEnabledState.current = true;
    selectedTemplateState.current = pptxTemplate;
    sourceOwnerState.current = currentConversationOwner;
    sourceOwnerRevisionState.current = 0;
    const droppedFile = new File(['quarterly results'], 'quarterly-results.xlsx');

    render(
      <AcpSendBox
        conversation_id='conv-1'
        backend='codex'
        workspacePath='/tmp/workspace'
        messageState={makeMessageState()}
      />
    );

    await act(async () => {
      await sendBoxProps.current?.onManagedDrop?.([droppedFile]);
    });

    expect(grantExternalDropMock).toHaveBeenCalledWith([droppedFile]);
    expect(handleFilesAddedMock).not.toHaveBeenCalled();
    expect(draftState.current.atPath).toEqual([]);
    expect(draftState.current.uploadFile).toEqual([]);
  });

  it('preserves legacy attachments when an eligible managed drop is rejected', async () => {
    featureEnabledState.current = true;
    selectedTemplateState.current = pptxTemplate;
    sourceOwnerState.current = currentConversationOwner;
    sourceOwnerRevisionState.current = 0;
    draftState.current = { atPath: [], uploadFile: ['/private/legacy.xlsx'], content: 'Draft request' };
    grantExternalDropMock.mockResolvedValueOnce({ ok: false });
    const droppedFile = new File(['quarterly results'], 'quarterly-results.xlsx');

    render(
      <AcpSendBox
        conversation_id='conv-1'
        backend='codex'
        workspacePath='/tmp/workspace'
        messageState={makeMessageState()}
      />
    );

    await act(async () => {
      await sendBoxProps.current?.onManagedDrop?.([droppedFile]);
    });

    expect(grantExternalDropMock).toHaveBeenCalledWith([droppedFile]);
    expect(clearFilesMock).not.toHaveBeenCalled();
    expect(emitterEmitMock).not.toHaveBeenCalledWith('acp.selected.file.clear');
    expect(draftState.current.uploadFile).toEqual(['/private/legacy.xlsx']);
  });

  it('ignores a completed managed drop after eligibility changes', async () => {
    featureEnabledState.current = true;
    selectedTemplateState.current = pptxTemplate;
    sourceOwnerState.current = currentConversationOwner;
    sourceOwnerRevisionState.current = 0;
    draftState.current = { atPath: [], uploadFile: ['/private/legacy.xlsx'], content: 'Draft request' };
    const dropResult = createDeferred<Awaited<ReturnType<typeof grantExternalDropMock>>>();
    grantExternalDropMock.mockReturnValueOnce(dropResult.promise);
    const droppedFile = new File(['quarterly results'], 'quarterly-results.xlsx');

    const { rerender } = render(
      <AcpSendBox
        conversation_id='conv-1'
        backend='codex'
        workspacePath='/tmp/workspace'
        messageState={makeMessageState()}
      />
    );
    let pendingDrop: Promise<void> | void = undefined;
    act(() => {
      pendingDrop = sendBoxProps.current?.onManagedDrop?.([droppedFile]);
    });

    featureEnabledState.current = false;
    rerender(
      <AcpSendBox
        conversation_id='conv-1'
        backend='codex'
        workspacePath='/tmp/workspace'
        messageState={makeMessageState()}
      />
    );
    await act(async () => {
      dropResult.resolve({ ok: true, status: 'granted', grants: [sourceDescriptor], ownerRevision: 1 });
      await pendingDrop;
    });

    expect(clearFilesMock).not.toHaveBeenCalled();
    expect(emitterEmitMock).not.toHaveBeenCalledWith('acp.selected.file.clear');
    expect(draftState.current.uploadFile).toEqual(['/private/legacy.xlsx']);
  });

  it('keeps shared legacy drop handling when managed presentation input is ineligible', () => {
    featureEnabledState.current = false;
    selectedTemplateState.current = pptxTemplate;

    render(
      <AcpSendBox
        conversation_id='conv-1'
        backend='codex'
        workspacePath='/tmp/workspace'
        messageState={makeMessageState()}
      />
    );

    expect(sendBoxProps.current?.onManagedDrop).toBeUndefined();
    expect(sendBoxProps.current?.onFilesAdded).toBe(handleFilesAddedMock);
  });

  it('re-hydrates a prior conversation owner before opening the managed picker', async () => {
    featureEnabledState.current = true;
    selectedTemplateState.current = pptxTemplate;
    sourceOwnerState.current = { owner_type: 'conversation', conversation_id: 'previous-conversation' };
    sourceOwnerRevisionState.current = 4;
    const effectHydration = createDeferred<GetPresentationSourceOwnerResult>();
    const pickerHydration = createDeferred<GetPresentationSourceOwnerResult>();
    hydrateSourceOwnerMock.mockImplementationOnce(() => effectHydration.promise);
    hydrateSourceOwnerMock.mockImplementationOnce(() => pickerHydration.promise);

    render(
      <AcpSendBox
        conversation_id='conv-1'
        backend='codex'
        workspacePath='/tmp/workspace'
        messageState={makeMessageState()}
      />
    );
    await waitFor(() => expect(hydrateSourceOwnerMock).toHaveBeenCalledTimes(1));

    act(() => {
      sendBoxProps.current?.onSlashBuiltinCommand?.('open');
    });

    expect(hydrateSourceOwnerMock).toHaveBeenCalledTimes(2);
    expect(pickSourcesMock).not.toHaveBeenCalled();
    expect(legacyOpenFileSelectorMock).not.toHaveBeenCalled();

    await act(async () => {
      pickerHydration.resolve(hydratedOwnerResult);
      await pickerHydration.promise;
    });
    await waitFor(() => expect(pickSourcesMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      effectHydration.resolve(hydratedOwnerResult);
      await effectHydration.promise;
    });
  });

  it('keeps raw attachments when current-owner hydration fails during reselect', async () => {
    featureEnabledState.current = true;
    selectedTemplateState.current = pptxTemplate;
    draftState.current = { atPath: [], uploadFile: ['/private/legacy.xlsx'], content: 'Draft request' };
    hydrateSourceOwnerMock.mockResolvedValue(failedOwnerHydration);

    render(
      <AcpSendBox
        conversation_id='conv-1'
        backend='codex'
        workspacePath='/tmp/workspace'
        messageState={makeMessageState()}
      />
    );
    await act(async () => {
      screen.getByRole('button', { name: 'send' }).click();
    });

    await act(async () => {
      screen.getByRole('button', { name: 'conversation.presentationTemplates.sources.reselectAction' }).click();
    });

    expect(pickSourcesMock).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(clearFilesMock).not.toHaveBeenCalled();
    expect(legacyOpenFileSelectorMock).not.toHaveBeenCalled();
    expect(draftState.current.uploadFile).toEqual(['/private/legacy.xlsx']);
  });

  it('removes a stale reselect notice and preserves raw files when navigation changes during the picker', async () => {
    featureEnabledState.current = true;
    selectedTemplateState.current = pptxTemplate;
    sourceOwnerState.current = currentConversationOwner;
    sourceOwnerRevisionState.current = 0;
    draftState.current = { atPath: [], uploadFile: ['/private/legacy.xlsx'], content: 'Draft request' };
    const pickerResult = createDeferred<PickPresentationSourcesResult>();
    pickSourcesMock.mockReturnValueOnce(pickerResult.promise);

    const { rerender } = render(
      <AcpSendBox
        conversation_id='conv-1'
        backend='codex'
        workspacePath='/tmp/workspace'
        messageState={makeMessageState()}
      />
    );
    await act(async () => {
      screen.getByRole('button', { name: 'send' }).click();
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    act(() => {
      screen.getByRole('button', { name: 'conversation.presentationTemplates.sources.reselectAction' }).click();
    });
    expect(pickSourcesMock).toHaveBeenCalledTimes(1);

    rerender(
      <AcpSendBox
        conversation_id='conv-2'
        backend='codex'
        workspacePath='/tmp/workspace'
        messageState={makeMessageState()}
      />
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await act(async () => {
      pickerResult.resolve({
        ok: true,
        status: 'selected',
        grants: [sourceDescriptor],
        ownerRevision: 1,
      });
      await pickerResult.promise;
    });

    expect(clearFilesMock).not.toHaveBeenCalled();
    expect(emitterEmitMock).not.toHaveBeenCalledWith('acp.selected.file.clear');
    expect(resetSourceDraftMock).toHaveBeenCalled();
    expect(draftState.current.uploadFile).toEqual(['/private/legacy.xlsx']);
  });

  it('hides opaque source tags when eligibility turns off without revoking hook state', () => {
    featureEnabledState.current = true;
    selectedTemplateState.current = pptxTemplate;
    sourceDescriptorsState.current = [sourceDescriptor];

    const { rerender } = render(
      <AcpSendBox
        conversation_id='conv-1'
        backend='codex'
        workspacePath='/tmp/workspace'
        messageState={makeMessageState()}
      />
    );
    expect(screen.getByText('quarterly-results.xlsx')).toBeInTheDocument();
    expect(sendBoxProps.current?.hasPendingAttachments).toBe(true);

    featureEnabledState.current = false;
    rerender(
      <AcpSendBox
        conversation_id='conv-1'
        backend='codex'
        workspacePath='/tmp/workspace'
        messageState={makeMessageState()}
      />
    );

    expect(screen.queryByText('quarterly-results.xlsx')).not.toBeInTheDocument();
    expect(sendBoxProps.current?.hasPendingAttachments).toBe(false);
    expect(revokeSourceMock).not.toHaveBeenCalled();
    expect(sourceDescriptorsState.current).toEqual([sourceDescriptor]);
  });

  it('resets ACP loading state when sendMessage fails before any stream error arrives', async () => {
    sendMessageInvokeMock.mockRejectedValue(
      new BackendHttpError({
        method: 'POST',
        path: '/api/conversations/conv-1/messages',
        status: 400,
        body: {
          success: false,
          code: 'WORKSPACE_PATH_RUNTIME_UNAVAILABLE',
          error: 'Workspace path is unavailable during execution: /tmp/missing',
          details: { workspace_path: '/tmp/missing' },
        },
      })
    );

    render(
      <AcpSendBox
        conversation_id='conv-1'
        backend='claude'
        workspacePath='/tmp/missing'
        messageState={makeMessageState()}
      />
    );

    await act(async () => {
      screen.getByRole('button', { name: 'send' }).click();
    });

    await waitFor(() => {
      expect(resetStateMock).toHaveBeenCalledTimes(1);
    });
  });

  it('suppresses internal error cards and loading reset for active-turn busy conflicts', async () => {
    sendMessageInvokeMock.mockRejectedValue(
      new BackendHttpError({
        method: 'POST',
        path: '/api/conversations/conv-1/messages',
        status: 409,
        body: {
          success: false,
          code: 'CONFLICT',
          error: 'conversation conv-1 is already running',
        },
      })
    );

    render(
      <AcpSendBox
        conversation_id='conv-1'
        backend='codex'
        workspacePath='/tmp/workspace'
        messageState={makeMessageState()}
      />
    );

    await act(async () => {
      screen.getByRole('button', { name: 'send' }).click();
    });

    await waitFor(() => {
      expect(sendMessageInvokeMock).toHaveBeenCalledTimes(1);
    });
    expect(addOrUpdateMessageMock).not.toHaveBeenCalled();
    expect(resetStateMock).not.toHaveBeenCalled();
  });

  it('uses container-responsive fluid width instead of a fixed max width', () => {
    render(
      <AcpSendBox
        conversation_id='conv-1'
        backend='codex'
        workspacePath='/tmp/workspace'
        messageState={makeMessageState()}
      />
    );

    const wrapper = screen.getByRole('button', { name: 'send' }).parentElement?.parentElement;
    expect(wrapper?.className).toContain('chat-surface-fluid');
    expect(wrapper?.className).not.toContain('w-[calc(100%-24px)]');
    expect(wrapper?.className).not.toContain('md:w-[calc(100%-clamp(80px,10vw,240px))]');
    expect(wrapper?.className).not.toContain('max-w-800px');
  });

  it('uses the full available width in team mode', () => {
    useTeamPermissionMock.mockReturnValue({
      isTeamMode: true,
      isLeaderAgent: true,
      leaderConversationId: 'conv-1',
      allConversationIds: ['conv-1'],
      propagateMode: vi.fn(),
      warmupSession: vi.fn().mockResolvedValue(undefined),
    });

    render(
      <AcpSendBox
        conversation_id='conv-1'
        backend='codex'
        workspacePath='/tmp/workspace'
        messageState={makeMessageState()}
      />
    );

    const wrapper = screen.getByRole('button', { name: 'send' }).parentElement?.parentElement;
    expect(wrapper?.className).toContain('w-full');
    expect(wrapper?.className).toContain('max-w-full');
    expect(wrapper?.className).not.toContain('w-[calc(100%-24px)]');
    expect(wrapper?.className).not.toContain('md:w-[calc(100%-clamp(80px,10vw,240px))]');
  });

  it('does not warm up team session on mount or draft content changes', async () => {
    const warmupSession = vi.fn().mockResolvedValue(undefined);
    useTeamPermissionMock.mockReturnValue({
      isTeamMode: true,
      isLeaderAgent: true,
      leaderConversationId: 'conv-1',
      allConversationIds: ['conv-1'],
      propagateMode: vi.fn(),
      warmupSession,
    });

    render(
      <AcpSendBox
        conversation_id='conv-1'
        backend='codex'
        workspacePath='/tmp/workspace'
        messageState={makeMessageState()}
      />
    );

    expect(warmupSession).not.toHaveBeenCalled();

    await act(async () => {
      screen.getByRole('button', { name: 'change' }).click();
    });

    expect(warmupSession).not.toHaveBeenCalled();
  });

  it('does not warm up team session when config options prepare runtime runs', async () => {
    const warmupSession = vi.fn().mockResolvedValue(undefined);
    useTeamPermissionMock.mockReturnValue({
      isTeamMode: true,
      isLeaderAgent: true,
      leaderConversationId: 'conv-1',
      allConversationIds: ['conv-1'],
      propagateMode: vi.fn(),
      warmupSession,
    });

    render(
      <AcpSendBox
        conversation_id='conv-1'
        backend='codex'
        workspacePath='/tmp/workspace'
        messageState={makeMessageState()}
      />
    );

    const configOptionsArgs = useAcpConfigOptionsMock.mock.calls[0]?.[0] as
      | { prepareRuntime?: () => Promise<void> }
      | undefined;
    await configOptionsArgs?.prepareRuntime?.();

    expect(warmupSession).not.toHaveBeenCalled();
  });

  it('still warms up team session before sending a message', async () => {
    sendMessageInvokeMock.mockResolvedValue({ turn_id: 'turn-1', runtime: null, msg_id: 'msg-1' });
    const warmupSession = vi.fn().mockResolvedValue(undefined);
    useTeamPermissionMock.mockReturnValue({
      isTeamMode: true,
      isLeaderAgent: true,
      leaderConversationId: 'conv-1',
      allConversationIds: ['conv-1'],
      propagateMode: vi.fn(),
      warmupSession,
    });

    render(
      <AcpSendBox
        conversation_id='conv-1'
        backend='codex'
        workspacePath='/tmp/workspace'
        messageState={makeMessageState()}
      />
    );

    await act(async () => {
      screen.getByRole('button', { name: 'send' }).click();
    });

    await waitFor(() => {
      expect(warmupSession).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps ACP config options enabled on desktop without rendering a standalone thought selector', () => {
    useAcpConfigOptionsMock.mockReturnValue({
      setStatus: { state: 'idle' },
      mode: null,
      model: null,
      thoughtLevel: {
        id: 'reasoning_effort',
        category: 'thought_level',
        currentValue: 'high',
        options: [{ value: 'high', label: 'High' }],
      },
      reload: vi.fn(),
      setConfigOption: vi.fn(),
    });

    render(
      <AcpSendBox
        conversation_id='conv-1'
        backend='codex'
        workspacePath='/tmp/workspace'
        messageState={makeMessageState()}
      />
    );

    expect(useAcpConfigOptionsMock).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    expect(screen.queryByTestId('mock-thought-selector')).not.toBeInTheDocument();
  });

  it('renders model and permission controls in the composer action row', () => {
    render(
      <AcpSendBox
        conversation_id='conv-1'
        backend='codex'
        workspacePath='/tmp/workspace'
        messageState={makeMessageState()}
        modelSelector={<span data-testid='composer-model-selector'>Model</span>}
      />
    );

    expect(screen.getByTestId('composer-model-selector')).toBeInTheDocument();
    expect(screen.getByTestId('composer-permission-control')).toBeInTheDocument();
  });

  it('renders the context usage meter in right tools with ACP usage data', () => {
    render(
      <AcpSendBox
        conversation_id='conv-1'
        backend='codex'
        messageState={makeMessageState({
          tokenUsage: { total_tokens: 12_000 },
          context_limit: 32_000,
        })}
      />
    );

    expect(screen.getByTestId('context-usage-indicator')).toBeInTheDocument();
    expect(contextUsageIndicatorProps.current).toEqual({
      budget: {
        source: 'runtime',
        totalTokens: 12_000,
        contextLimit: 32_000,
        ratio: 12_000 / 32_000,
        status: 'watch',
      },
      localUsage: { today: 120, weekToDate: 560, monthToDate: 1_240 },
    });
    expect(screen.getByRole('button', { name: 'send' })).toBeInTheDocument();
    expect(sendBoxProps.current).not.toHaveProperty('tokenUsage');
    expect(sendBoxProps.current).not.toHaveProperty('localUsage');
    expect(sendBoxProps.current).not.toHaveProperty('context_limit');
  });

  it('does not invent a context limit when ACP reports zero', () => {
    render(
      <AcpSendBox
        conversation_id='conv-1'
        backend='codex'
        messageState={makeMessageState({
          tokenUsage: { total_tokens: 12_000 },
          context_limit: 0,
        })}
      />
    );

    expect(contextUsageIndicatorProps.current).toEqual({
      budget: {
        source: 'runtime',
        totalTokens: 12_000,
        contextLimit: undefined,
        ratio: null,
        status: 'healthy',
      },
      localUsage: { today: 120, weekToDate: 560, monthToDate: 1_240 },
    });
  });

  it('keeps an unknown-state context usage meter when ACP capacity is unavailable', () => {
    render(<AcpSendBox conversation_id='conv-1' backend='codex' messageState={makeMessageState()} />);

    expect(screen.getByTestId('context-usage-indicator')).toBeInTheDocument();
    expect(contextUsageIndicatorProps.current?.budget.source).toBe('estimated');
    expect(contextUsageIndicatorProps.current?.budget.contextLimit).toBeUndefined();
    expect(contextUsageIndicatorProps.current?.budget.ratio).toBeNull();
  });

  it('applies runtime thought level from the mobile action sheet without persisting a global preference', async () => {
    isMobileMock.current = true;
    const setConfigOption = vi.fn().mockResolvedValue([]);
    useAcpConfigOptionsMock.mockReturnValue({
      mode: null,
      model: null,
      thoughtLevel: {
        id: 'reasoning_effort',
        category: 'thought_level',
        currentValue: 'medium',
        options: [
          { value: 'medium', label: 'Medium' },
          { value: 'high', label: 'High' },
        ],
      },
      setStatus: { state: 'idle' },
      setConfigOption,
      reload: vi.fn(),
      isLoading: false,
      configOptions: [],
    });

    render(
      <AcpSendBox
        conversation_id='conv-1'
        backend='codex'
        workspacePath='/tmp/workspace'
        messageState={makeMessageState()}
      />
    );

    await act(async () => {
      mobileActionSheetEntries.current.find((entry) => entry.key === 'thought-level')?.submenu?.onSelect?.('high');
    });

    // This branch dropped global-preference persistence: only the runtime
    // config option is set; nothing is saved to a global agent preference.
    await waitFor(() => {
      expect(setConfigOption).toHaveBeenCalledWith('reasoning_effort', 'high');
    });
  });

  it('does not apply runtime thought level when observed confirmation fails', async () => {
    isMobileMock.current = true;
    const setConfigOption = vi.fn().mockRejectedValue(new Error('command_ack'));
    useAcpConfigOptionsMock.mockReturnValue({
      mode: null,
      model: null,
      thoughtLevel: {
        id: 'reasoning_effort',
        category: 'thought_level',
        currentValue: 'medium',
        options: [{ value: 'high', label: 'High' }],
      },
      setStatus: { state: 'idle' },
      setConfigOption,
      reload: vi.fn(),
      isLoading: false,
      configOptions: [],
    });

    render(
      <AcpSendBox
        conversation_id='conv-1'
        backend='codex'
        workspacePath='/tmp/workspace'
        messageState={makeMessageState()}
      />
    );

    await act(async () => {
      mobileActionSheetEntries.current.find((entry) => entry.key === 'thought-level')?.submenu?.onSelect?.('high');
    });

    await waitFor(() => {
      expect(setConfigOption).toHaveBeenCalledWith('reasoning_effort', 'high');
    });
  });
});
