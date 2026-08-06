import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Message } from '@arco-design/web-react';
import { BackendHttpError } from '@/common/adapter/httpBridge';
import type {
  GetPresentationSourceOwnerResult,
  PickPresentationSourcesResult,
  PresentationGrantOwner,
  PresentationSourceDescriptor,
} from '@/common/types/office/presentationRun';
import type { PresentationTemplateSummary } from '@/common/types/office/presentationTemplate';
import AionrsSendBox from '@/renderer/pages/conversation/platforms/aionrs/AionrsSendBox';
import type { AionrsModelSelection } from '@/renderer/pages/conversation/platforms/aionrs/useAionrsModelSelection';

type AionrsMessageStateMock = {
  thought: {
    subject: string;
    description: string;
  };
  running: boolean;
  setActiveMsgId: ReturnType<typeof vi.fn>;
  setWaitingResponse: ReturnType<typeof vi.fn>;
  resetState: ReturnType<typeof vi.fn>;
  tokenUsage: { total_tokens: number } | null;
};

type RuntimeViewStateMock = {
  hydrated: boolean;
  canSendMessage: boolean;
  isProcessing: boolean;
  state: string;
  activeTurnId: string | null;
  markSendStarted: ReturnType<typeof vi.fn>;
  markSendAccepted: ReturnType<typeof vi.fn>;
  markSendFailed: ReturnType<typeof vi.fn>;
  markStopRequested: ReturnType<typeof vi.fn>;
  markStopAcknowledged: ReturnType<typeof vi.fn>;
  resetLocalGate: ReturnType<typeof vi.fn>;
};

type ThoughtDisplayPropsMock = {
  thought?: {
    subject: string;
    description: string;
  };
  running?: boolean;
  onStop?: () => void;
};

const {
  aionrsMessageState,
  checkAndUpdateTitleMock,
  createAionrsMessageState,
  createRuntimeViewState,
  emitMock,
  enqueueMock,
  ensureConversationRuntimeMock,
  messageErrorMock,
  runtimeViewState,
  sendMessageInvokeMock,
  thoughtDisplayProps,
  translateMock,
  useTeamPermissionMock,
  setSendBoxHandlerMock,
  markSendFailedMock,
  markSendStartedMock,
  markSendAcceptedMock,
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
  checkAndUpdateTitleMock: vi.fn(),
  createAionrsMessageState: (): AionrsMessageStateMock => ({
    thought: { subject: '', description: '' },
    running: false,
    setActiveMsgId: vi.fn(),
    setWaitingResponse: vi.fn(),
    resetState: vi.fn(),
    tokenUsage: null,
  }),
  createRuntimeViewState: (): RuntimeViewStateMock => ({
    hydrated: true,
    canSendMessage: true,
    isProcessing: false,
    state: 'idle',
    activeTurnId: null,
    markSendStarted: vi.fn(),
    markSendAccepted: vi.fn(),
    markSendFailed: vi.fn(),
    markStopRequested: vi.fn(),
    markStopAcknowledged: vi.fn(),
    resetLocalGate: vi.fn(),
  }),
  emitMock: vi.fn(),
  enqueueMock: vi.fn(),
  ensureConversationRuntimeMock: vi.fn().mockResolvedValue({ recovered: false, config_options: [], runtime: null }),
  messageErrorMock: vi.fn(),
  aionrsMessageState: { current: undefined as AionrsMessageStateMock | undefined },
  runtimeViewState: { current: undefined as RuntimeViewStateMock | undefined },
  sendMessageInvokeMock: vi.fn().mockResolvedValue(undefined),
  thoughtDisplayProps: { current: null as ThoughtDisplayPropsMock | null },
  translateMock: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  useTeamPermissionMock: vi.fn(),
  setSendBoxHandlerMock: vi.fn(),
  markSendFailedMock: vi.fn(),
  markSendStartedMock: vi.fn(),
  markSendAcceptedMock: vi.fn(),
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
    conversation: {
      sendMessage: {
        invoke: sendMessageInvokeMock,
      },
      stop: {
        invoke: vi.fn().mockResolvedValue(undefined),
      },
    },
  },
}));

vi.mock('@/renderer/components/chat/SendBox', () => ({
  default: ({
    enableContextCommand,
    onSend,
    onChange,
    prefix,
    rightTools,
    ...props
  }: {
    enableContextCommand?: boolean;
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
          <span data-testid='context-command-enabled'>{String(Boolean(enableContextCommand))}</span>
          <button type='button' onClick={() => onChange?.('hello')}>
            change
          </button>
          <button type='button' onClick={() => void onSend('Hello').catch(() => {})}>
            send
          </button>
          <button type='button' onClick={() => void onSend('/context compact').catch(() => {})}>
            compact context
          </button>
          <button type='button' onClick={() => void onSend('/context pin').catch(() => {})}>
            invalid context
          </button>
        </div>
      );
    })(),
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
vi.mock('@/renderer/components/chat/CommandQueuePanel', () => ({ default: () => null }));
vi.mock('@/renderer/components/chat/MobileActionSheet', () => ({
  default: () => null,
  useAttachEntry: () => ({ entries: [], hiddenFileInput: null }),
}));
vi.mock('@/renderer/components/chat/ThoughtDisplay', () => ({
  default: (props: ThoughtDisplayPropsMock) => {
    thoughtDisplayProps.current = props;
    if (!props.running && !props.thought?.subject) {
      return null;
    }
    return <div data-testid='thought-display'>processing</div>;
  },
}));
vi.mock('@/renderer/components/media/FileAttachButton', () => ({ default: () => null }));
vi.mock('@/renderer/components/media/FilePreview', () => ({ default: () => null }));
vi.mock('@/renderer/components/media/HorizontalFileList', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/renderer/hooks/agent/useAcpConfigOptions', () => ({
  classifyConfigSetError: () => 'unknown',
  useAcpConfigOptions: () => ({
    setStatus: { state: 'idle' },
    mode: null,
    model: null,
    thoughtLevel: null,
    reload: vi.fn(),
    setConfigOption: vi.fn(),
  }),
}));
vi.mock('@/renderer/hooks/context/ConversationContext', () => ({
  useConversationContextSafe: () => ({
    loadedSkills: [],
    loadedMcpStatuses: [],
    conversation: {
      id: 'conv-1',
      name: 'AionRS budget fixture',
      type: 'aionrs',
      created_at: 1,
      modified_at: 1,
      extra: { backend: 'aionrs', workspace: '/tmp/aionrs-budget' },
      model: {
        id: 'provider-1',
        name: 'Provider',
        platform: 'openai',
        base_url: '',
        api_key: '',
        use_model: 'gpt-4.1',
      },
    },
  }),
}));
vi.mock('@/renderer/pages/conversation/Messages/hooks', () => ({
  useMessageList: () => [],
}));
vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));
vi.mock('@/renderer/hooks/useLocalTokenUsage', () => ({
  useLocalTokenUsage: () => ({ today: 120, weekToDate: 560, monthToDate: 1_240 }),
}));
vi.mock('@/renderer/hooks/chat/useAutoTitle', () => ({
  useAutoTitle: () => ({
    checkAndUpdateTitle: checkAndUpdateTitleMock,
  }),
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
vi.mock('@/renderer/hooks/chat/useSlashCommands', () => ({
  useSlashCommands: () => [],
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
vi.mock('@/renderer/pages/conversation/platforms/useConversationCommandQueue', () => ({
  shouldEnqueueConversationCommand: () => false,
  useConversationCommandQueue: () => ({
    items: [],
    isPaused: false,
    isInteractionLocked: false,
    hasPendingCommands: false,
    enqueue: enqueueMock,
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
vi.mock('@/renderer/pages/conversation/runtime/useConversationRuntimeView', () => ({
  useConversationRuntimeView: () => runtimeViewState.current,
}));
vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  getConversationOrNull: vi.fn().mockResolvedValue({
    extra: {
      workspace: '/tmp/workspace',
    },
  }),
}));
vi.mock('@/renderer/pages/conversation/utils/conversationCreateError', () => ({
  getConversationRuntimeWorkspaceErrorMessage: () => 'workspace failed',
}));
vi.mock('@/renderer/pages/conversation/utils/ensureConversationRuntime', () => ({
  ensureConversationRuntime: ensureConversationRuntimeMock,
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
    emit: emitMock,
  },
  useAddEventListener: vi.fn(),
}));
vi.mock('@/renderer/utils/file/fileSelection', () => ({
  mergeFileSelectionItems: vi.fn((items: unknown[]) => items),
}));
vi.mock('@/renderer/utils/file/messageFiles', () => ({
  buildDisplayMessage: (input: string) => input,
  collectSelectedFiles: () => [],
}));
vi.mock('@arco-design/web-react', () => ({
  Button: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) => (
    <button type='button' onClick={onClick}>
      {children}
    </button>
  ),
  Message: {
    warning: messageWarningMock,
    error: messageErrorMock,
    success: vi.fn(),
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
vi.mock('@icon-park/react', () => ({
  Brain: () => null,
  MagicHat: () => null,
  Shield: () => null,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: translateMock }),
}));
vi.mock('@/renderer/pages/conversation/platforms/aionrs/useAionrsMessage', () => ({
  useAionrsMessage: () => aionrsMessageState.current,
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

const modelSelection = {
  current_model: {
    provider_id: 'openai',
    model: 'gpt-4.1',
    use_model: 'openai/gpt-4.1',
  },
} as AionrsModelSelection;

describe('AionrsSendBox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    aionrsMessageState.current = createAionrsMessageState();
    runtimeViewState.current = {
      ...createRuntimeViewState(),
      markSendStarted: markSendStartedMock,
      markSendAccepted: markSendAcceptedMock,
      markSendFailed: markSendFailedMock,
    };
    thoughtDisplayProps.current = null;
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
    ensureConversationRuntimeMock.mockResolvedValue({ recovered: false, config_options: [], runtime: null });
    useTeamPermissionMock.mockReturnValue(null);
  });

  it('blocks managed preparation for a legacy attachment while preserving the submitted draft', async () => {
    featureEnabledState.current = true;
    selectedTemplateState.current = pptxTemplate;
    draftState.current = { atPath: [], uploadFile: ['/private/legacy.xlsx'], content: 'Draft request' };

    render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);

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

    render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);
    await act(async () => {
      screen.getByRole('button', { name: 'send' }).click();
    });

    await act(async () => {
      screen.getByRole('button', { name: 'conversation.presentationTemplates.sources.reselectAction' }).click();
    });

    expect(pickSourcesMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(clearFilesMock).not.toHaveBeenCalled();
    expect(emitMock).not.toHaveBeenCalledWith('aionrs.selected.file.clear');
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

    render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);
    await act(async () => {
      screen.getByRole('button', { name: 'send' }).click();
    });

    await act(async () => {
      screen.getByRole('button', { name: 'conversation.presentationTemplates.sources.reselectAction' }).click();
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(clearFilesMock).toHaveBeenCalledTimes(1);
    expect(emitMock).toHaveBeenCalledWith('aionrs.selected.file.clear');
    expect(sendMessageInvokeMock).not.toHaveBeenCalled();
  });

  it('allows a prompt-only managed-eligible draft to continue', async () => {
    featureEnabledState.current = true;
    selectedTemplateState.current = pptxTemplate;
    sendMessageInvokeMock.mockResolvedValue({ turn_id: 'turn-1', runtime: null, msg_id: 'msg-1' });

    render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);
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

    render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);
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

    render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);

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

    render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);

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

    render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);

    await act(async () => {
      await sendBoxProps.current?.onManagedDrop?.([droppedFile]);
    });

    expect(grantExternalDropMock).toHaveBeenCalledWith([droppedFile]);
    expect(clearFilesMock).not.toHaveBeenCalled();
    expect(emitMock).not.toHaveBeenCalledWith('aionrs.selected.file.clear');
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

    const { rerender } = render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);
    let pendingDrop: Promise<void> | void = undefined;
    act(() => {
      pendingDrop = sendBoxProps.current?.onManagedDrop?.([droppedFile]);
    });

    featureEnabledState.current = false;
    rerender(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);
    await act(async () => {
      dropResult.resolve({ ok: true, status: 'granted', grants: [sourceDescriptor], ownerRevision: 1 });
      await pendingDrop;
    });

    expect(clearFilesMock).not.toHaveBeenCalled();
    expect(emitMock).not.toHaveBeenCalledWith('aionrs.selected.file.clear');
    expect(draftState.current.uploadFile).toEqual(['/private/legacy.xlsx']);
  });

  it('keeps shared legacy drop handling when managed presentation input is ineligible', () => {
    featureEnabledState.current = false;
    selectedTemplateState.current = pptxTemplate;

    render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);

    expect(sendBoxProps.current?.onManagedDrop).toBeUndefined();
    expect(sendBoxProps.current?.onFilesAdded).toBe(handleFilesAddedMock);
  });

  it('waits for current-owner hydration before opening the managed picker', async () => {
    featureEnabledState.current = true;
    selectedTemplateState.current = pptxTemplate;
    const effectHydration = createDeferred<GetPresentationSourceOwnerResult>();
    const pickerHydration = createDeferred<GetPresentationSourceOwnerResult>();
    hydrateSourceOwnerMock.mockImplementationOnce(() => effectHydration.promise);
    hydrateSourceOwnerMock.mockImplementationOnce(() => pickerHydration.promise);

    render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);
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

    render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);
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

  it('does not continue an old picker request after navigation during owner hydration', async () => {
    featureEnabledState.current = true;
    selectedTemplateState.current = pptxTemplate;
    const effectHydration = createDeferred<GetPresentationSourceOwnerResult>();
    const pickerHydration = createDeferred<GetPresentationSourceOwnerResult>();
    hydrateSourceOwnerMock.mockImplementationOnce(() => effectHydration.promise);
    hydrateSourceOwnerMock.mockImplementationOnce(() => pickerHydration.promise);

    const { rerender } = render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);
    await waitFor(() => expect(hydrateSourceOwnerMock).toHaveBeenCalledTimes(1));
    act(() => {
      sendBoxProps.current?.onSlashBuiltinCommand?.('open');
    });
    expect(hydrateSourceOwnerMock).toHaveBeenCalledTimes(2);

    rerender(<AionrsSendBox conversation_id='conv-2' modelSelection={modelSelection} />);
    await act(async () => {
      pickerHydration.resolve(hydratedOwnerResult);
      await pickerHydration.promise;
    });

    expect(pickSourcesMock).not.toHaveBeenCalled();
    expect(legacyOpenFileSelectorMock).not.toHaveBeenCalled();
    expect(resetSourceDraftMock).toHaveBeenCalled();

    await act(async () => {
      effectHydration.resolve(hydratedOwnerResult);
      await effectHydration.promise;
    });
  });

  it('removes a stale reselect notice and preserves raw files when eligibility changes during the picker', async () => {
    featureEnabledState.current = true;
    selectedTemplateState.current = pptxTemplate;
    sourceOwnerState.current = currentConversationOwner;
    sourceOwnerRevisionState.current = 0;
    draftState.current = { atPath: [], uploadFile: ['/private/legacy.xlsx'], content: 'Draft request' };
    const pickerResult = createDeferred<PickPresentationSourcesResult>();
    pickSourcesMock.mockReturnValueOnce(pickerResult.promise);

    const { rerender } = render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);
    await act(async () => {
      screen.getByRole('button', { name: 'send' }).click();
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    act(() => {
      screen.getByRole('button', { name: 'conversation.presentationTemplates.sources.reselectAction' }).click();
    });
    expect(pickSourcesMock).toHaveBeenCalledTimes(1);

    featureEnabledState.current = false;
    rerender(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);
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
    expect(emitMock).not.toHaveBeenCalledWith('aionrs.selected.file.clear');
    expect(draftState.current.uploadFile).toEqual(['/private/legacy.xlsx']);
  });

  it('hides opaque source tags when eligibility turns off without revoking hook state', () => {
    featureEnabledState.current = true;
    selectedTemplateState.current = pptxTemplate;
    sourceDescriptorsState.current = [sourceDescriptor];

    const { rerender } = render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);
    expect(screen.getByText('quarterly-results.xlsx')).toBeInTheDocument();
    expect(sendBoxProps.current?.hasPendingAttachments).toBe(true);

    featureEnabledState.current = false;
    rerender(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);

    expect(screen.queryByText('quarterly-results.xlsx')).not.toBeInTheDocument();
    expect(sendBoxProps.current?.hasPendingAttachments).toBe(false);
    expect(revokeSourceMock).not.toHaveBeenCalled();
    expect(sourceDescriptorsState.current).toEqual([sourceDescriptor]);
  });

  it('does not warm up team session when draft content changes', async () => {
    const warmupSession = vi.fn().mockResolvedValue(undefined);
    useTeamPermissionMock.mockReturnValue({
      isTeamMode: true,
      isLeaderAgent: true,
      leaderConversationId: 'conv-1',
      allConversationIds: ['conv-1'],
      propagateMode: vi.fn(),
      warmupSession,
    });

    render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);
    await waitFor(() => {
      expect(warmupSession).toHaveBeenCalled();
    });
    warmupSession.mockClear();

    await act(async () => {
      screen.getByRole('button', { name: 'change' }).click();
    });

    expect(warmupSession).not.toHaveBeenCalled();
  });

  it('still warms up team session before sending', async () => {
    const warmupSession = vi.fn().mockResolvedValue(undefined);
    useTeamPermissionMock.mockReturnValue({
      isTeamMode: true,
      isLeaderAgent: true,
      leaderConversationId: 'conv-1',
      allConversationIds: ['conv-1'],
      propagateMode: vi.fn(),
      warmupSession,
    });

    render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);
    await waitFor(() => {
      expect(warmupSession).toHaveBeenCalled();
    });
    warmupSession.mockClear();

    await act(async () => {
      screen.getByRole('button', { name: 'send' }).click();
    });

    await waitFor(() => {
      expect(warmupSession).toHaveBeenCalledTimes(1);
    });
  });

  it('does not start standalone runtime while preparing a team conversation', async () => {
    const warmupSession = vi.fn().mockResolvedValue(undefined);
    useTeamPermissionMock.mockReturnValue({
      isTeamMode: true,
      isLeaderAgent: true,
      leaderConversationId: 'conv-1',
      allConversationIds: ['conv-1'],
      propagateMode: vi.fn(),
      warmupSession,
    });

    render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);

    await waitFor(() => {
      expect(warmupSession).toHaveBeenCalled();
    });
    expect(ensureConversationRuntimeMock).not.toHaveBeenCalled();
  });

  it('uses runtime ensure instead of legacy warmup for standalone runtime preparation', async () => {
    render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);

    await waitFor(() => {
      expect(ensureConversationRuntimeMock).toHaveBeenCalledWith('conv-1');
    });
  });

  it('suppresses visible error and preserves runtime gate for active-turn busy conflicts', async () => {
    sendMessageInvokeMock.mockRejectedValue(
      new BackendHttpError({
        method: 'POST',
        path: '/api/conversations/conv-1/messages',
        status: 409,
        body: { success: false, code: 'CONFLICT', error: 'conversation conv-1 is already running' },
      })
    );

    render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);
    await waitFor(() => expect(ensureConversationRuntimeMock).toHaveBeenCalledWith('conv-1'));

    await act(async () => {
      screen.getByRole('button', { name: 'send' }).click();
    });

    await waitFor(() => {
      expect(sendMessageInvokeMock).toHaveBeenCalledTimes(1);
    });
    expect(markSendFailedMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'busy_conflict', busyKind: 'active_turn' })
    );
    expect(Message.error).not.toHaveBeenCalled();
  });

  it('renders model and permission controls in the composer action row', () => {
    render(
      <AionrsSendBox
        conversation_id='conv-1'
        modelSelection={modelSelection}
        modelSelector={<span data-testid='composer-model-selector'>Model</span>}
      />
    );

    expect(screen.getByTestId('composer-model-selector')).toBeInTheDocument();
    expect(screen.getByTestId('composer-permission-control')).toBeInTheDocument();
  });

  it('renders the context usage meter in right tools with AionRS usage data', () => {
    aionrsMessageState.current = {
      ...createAionrsMessageState(),
      tokenUsage: { total_tokens: 12_000 },
    };

    const miniMaxSelection = {
      current_model: {
        provider_id: 'minimax',
        model: 'MiniMax-M2.5',
        use_model: 'minimax/MiniMax-M2.5',
      },
    } as AionrsModelSelection;

    render(<AionrsSendBox conversation_id='conv-1' modelSelection={miniMaxSelection} />);

    expect(screen.getByTestId('context-usage-indicator')).toBeInTheDocument();
    expect(contextUsageIndicatorProps.current).toEqual({
      budget: {
        source: 'runtime',
        totalTokens: 12_000,
        contextLimit: 204_800,
        ratio: 12_000 / 204_800,
        status: 'healthy',
      },
      localUsage: { today: 120, weekToDate: 560, monthToDate: 1_240 },
    });
    expect(screen.getByRole('button', { name: 'send' })).toBeInTheDocument();
    expect(sendBoxProps.current).not.toHaveProperty('tokenUsage');
    expect(sendBoxProps.current).not.toHaveProperty('localUsage');
    expect(sendBoxProps.current).not.toHaveProperty('context_limit');
  });

  it('renders an estimated context usage meter when AionRS runtime usage is unavailable', () => {
    render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);

    expect(screen.getByTestId('context-usage-indicator')).toBeInTheDocument();
    expect(contextUsageIndicatorProps.current?.budget.source).toBe('estimated');
    expect(contextUsageIndicatorProps.current?.budget.contextLimit).toBe(1_047_576);
    expect(contextUsageIndicatorProps.current?.budget.totalTokens).toBeGreaterThan(0);
  });

  it('resolves the AionRS context window from the raw backend model field', () => {
    const rawModelSelection = {
      current_model: {
        provider_id: 'minimax',
        model: 'minimax/minimax-m2.5',
        use_model: null,
      },
    } as unknown as AionrsModelSelection;

    render(<AionrsSendBox conversation_id='conv-1' modelSelection={rawModelSelection} />);

    expect(contextUsageIndicatorProps.current?.budget.contextLimit).toBe(204_800);
    expect(contextUsageIndicatorProps.current?.budget.source).toBe('estimated');
  });
  it('hides stale processing when the hydrated runtime view is idle', () => {
    aionrsMessageState.current = {
      ...createAionrsMessageState(),
      running: true,
    };
    runtimeViewState.current = {
      ...createRuntimeViewState(),
      hydrated: true,
      isProcessing: false,
      canSendMessage: true,
      state: 'idle',
    };

    render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);

    expect(screen.queryByTestId('thought-display')).not.toBeInTheDocument();
    expect(thoughtDisplayProps.current?.running).toBe(false);
  });

  it('shows processing while the hydrated runtime view is processing', () => {
    aionrsMessageState.current = createAionrsMessageState();
    runtimeViewState.current = {
      ...createRuntimeViewState(),
      hydrated: true,
      isProcessing: true,
      canSendMessage: false,
      state: 'running',
    };

    render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);

    expect(screen.getByTestId('thought-display')).toBeInTheDocument();
    expect(thoughtDisplayProps.current?.running).toBe(true);
  });

  it('advertises the native context command in the shared slash menu', () => {
    render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);

    expect(screen.getByTestId('context-command-enabled')).toHaveTextContent('true');
  });

  it('intercepts valid context commands before queueing or sending a chat turn', async () => {
    render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);

    await act(async () => {
      screen.getByRole('button', { name: 'compact context' }).click();
    });

    expect(emitMock).toHaveBeenCalledWith('aionrs.context-command', {
      conversationId: 'conv-1',
      command: { action: 'compact' },
    });
    expect(enqueueMock).not.toHaveBeenCalled();
    expect(sendMessageInvokeMock).not.toHaveBeenCalled();
    expect(checkAndUpdateTitleMock).not.toHaveBeenCalled();
  });

  it('shows a localized validation error without sending invalid context commands', async () => {
    render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);

    await act(async () => {
      screen.getByRole('button', { name: 'invalid context' }).click();
    });

    expect(messageErrorMock).toHaveBeenCalledWith('conversation.contextHandoff.command.missingPinText');
    expect(emitMock).not.toHaveBeenCalledWith('aionrs.context-command', expect.anything());
    expect(enqueueMock).not.toHaveBeenCalled();
    expect(sendMessageInvokeMock).not.toHaveBeenCalled();
  });
});
