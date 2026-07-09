import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  createAionrsMessageState,
  createRuntimeViewState,
  ensureConversationRuntimeMock,
  runtimeViewState,
  sendMessageInvokeMock,
  thoughtDisplayProps,
  translateMock,
  useTeamPermissionMock,
  setSendBoxHandlerMock,
} = vi.hoisted(() => ({
  createAionrsMessageState: (): AionrsMessageStateMock => ({
    thought: { subject: '', description: '' },
    running: false,
    setActiveMsgId: vi.fn(),
    setWaitingResponse: vi.fn(),
    resetState: vi.fn(),
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
  ensureConversationRuntimeMock: vi.fn().mockResolvedValue({ recovered: false, config_options: [], runtime: null }),
  aionrsMessageState: { current: undefined as AionrsMessageStateMock | undefined },
  runtimeViewState: { current: undefined as RuntimeViewStateMock | undefined },
  sendMessageInvokeMock: vi.fn().mockResolvedValue(undefined),
  thoughtDisplayProps: { current: null as ThoughtDisplayPropsMock | null },
  translateMock: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  useTeamPermissionMock: vi.fn(),
  setSendBoxHandlerMock: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    aionrsConversation: {
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
    rightTools,
  }: {
    onSend: (message: string) => Promise<void>;
    onChange?: (value: string) => void;
    rightTools?: React.ReactNode;
  }) => (
    <div>
      {rightTools}
      <button type='button' onClick={() => onChange?.('hello')}>
        change
      </button>
      <button type='button' onClick={() => void onSend('Hello').catch(() => {})}>
        send
      </button>
    </div>
  ),
}));

vi.mock('@/renderer/components/agent/AgentModeSelector', () => ({
  default: () => <span data-testid='composer-permission-control' />,
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
  }),
}));
vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));
vi.mock('@/renderer/hooks/chat/useAutoTitle', () => ({
  useAutoTitle: () => ({
    checkAndUpdateTitle: vi.fn(),
  }),
}));
vi.mock('@/renderer/hooks/chat/useSendBoxDraft', () => ({
  getSendBoxDraftHook: () => () => ({
    data: {
      atPath: [],
      uploadFile: [],
      content: '',
    },
    mutate: vi.fn(),
  }),
}));
vi.mock('@/renderer/hooks/chat/useSendBoxFiles', () => ({
  useSendBoxFiles: () => ({
    handleFilesAdded: vi.fn(),
    clearFiles: vi.fn(),
  }),
  createSetUploadFile: () => vi.fn(),
}));
vi.mock('@/renderer/hooks/chat/useSlashCommands', () => ({
  useSlashCommands: () => [],
}));
vi.mock('@/renderer/hooks/file/useOpenFileSelector', () => ({
  useOpenFileSelector: () => ({
    openFileSelector: vi.fn(),
    onSlashBuiltinCommand: vi.fn(),
  }),
}));
vi.mock('@/renderer/hooks/ui/useLatestRef', () => ({
  useLatestRef: <T,>(value: T) => ({ current: value }),
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
vi.mock('@/renderer/utils/emitter', () => ({
  emitter: {
    emit: vi.fn(),
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
  Message: {
    warning: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
  Tag: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
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
    runtimeViewState.current = createRuntimeViewState();
    thoughtDisplayProps.current = null;
    ensureConversationRuntimeMock.mockResolvedValue({ recovered: false, config_options: [], runtime: null });
    useTeamPermissionMock.mockReturnValue(null);
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

  it('uses runtime ensure instead of legacy warmup for standalone runtime preparation', async () => {
    render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);

    await waitFor(() => {
      expect(ensureConversationRuntimeMock).toHaveBeenCalledWith('conv-1');
    });
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
});
