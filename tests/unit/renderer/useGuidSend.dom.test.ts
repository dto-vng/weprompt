/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PRESENTATION_RUN_V2_ENABLED } from '@/common/config/constants';
import type { IMcpServer } from '@/common/config/storage';
import type {
  BindPresentationDraftResult,
  GetPresentationSourceOwnerResult,
  PresentationSourceRef,
} from '@/common/types/office/presentationRun';
import { useGuidSend, type GuidSendDeps } from '@/renderer/pages/guid/hooks/useGuidSend';

const createConversationInvokeMock = vi.fn();
const getConversationInvokeMock = vi.fn();
const removeConversationInvokeMock = vi.fn();
const confirmQueuedSourcesInvokeMock = vi.fn();
const startPresentationRunInvokeMock = vi.fn();
const getPresentationRunInvokeMock = vi.fn();
const claimInitialDispatchInvokeMock = vi.fn();
const renewInitialDispatchInvokeMock = vi.fn();
const dispatchPresentationRunInvokeMock = vi.fn();
const swrMutateMock = vi.fn();
const kbGetSessionMcpServerMock = vi.fn();
const kbSyncFolderMock = vi.fn();
const listAvailableSkillsInvokeMock = vi.fn();
const getAssistantInvokeMock = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      create: {
        invoke: (...args: unknown[]) => createConversationInvokeMock(...args),
      },
      get: {
        invoke: (...args: unknown[]) => getConversationInvokeMock(...args),
      },
      remove: {
        invoke: (...args: unknown[]) => removeConversationInvokeMock(...args),
      },
    },
    presentationSources: {
      confirmQueued: {
        invoke: (...args: unknown[]) => confirmQueuedSourcesInvokeMock(...args),
      },
    },
    fs: {
      listAvailableSkills: {
        invoke: (...args: unknown[]) => listAvailableSkillsInvokeMock(...args),
      },
    },
    assistants: {
      get: {
        invoke: (...args: unknown[]) => getAssistantInvokeMock(...args),
      },
    },
    presentationRuns: {
      start: {
        invoke: (...args: unknown[]) => startPresentationRunInvokeMock(...args),
      },
      get: {
        invoke: (...args: unknown[]) => getPresentationRunInvokeMock(...args),
      },
      claimInitialDispatch: {
        invoke: (...args: unknown[]) => claimInitialDispatchInvokeMock(...args),
      },
      renewInitialDispatch: {
        invoke: (...args: unknown[]) => renewInitialDispatchInvokeMock(...args),
      },
      dispatch: {
        invoke: (...args: unknown[]) => dispatchPresentationRunInvokeMock(...args),
      },
    },
    projectKnowledge: {
      getSessionMcpServer: {
        invoke: (...args: unknown[]) => kbGetSessionMcpServerMock(...args),
      },
      syncFolder: {
        invoke: (...args: unknown[]) => kbSyncFolderMock(...args),
      },
    },
  },
}));

vi.mock('@/renderer/pages/conversation/projects/projectStorage', () => ({
  findProjectById: (id: string) => (id === 'p1' ? { id: 'p1', workspace: '/ws/p1' } : null),
  getWorkspaceBasename: (workspace: string) => workspace.split('/').at(-1) ?? workspace,
  readProjects: () => [],
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: {
    emit: vi.fn(),
  },
}));

vi.mock('swr', () => ({
  default: () => ({ data: null }),
  mutate: (...args: unknown[]) => swrMutateMock(...args),
}));

vi.mock('@/renderer/utils/workspace/workspaceHistory', () => ({
  updateWorkspaceTime: vi.fn(),
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    React.createElement('button', props, children),
  ConfigProvider: ({ children }: { children?: React.ReactNode }) => children,
  Message: {
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

const createDeps = (): GuidSendDeps => ({
  input: 'hello',
  setInput: vi.fn(),
  files: [],
  setFiles: vi.fn(),
  dir: '',
  setDir: vi.fn(),
  projectId: undefined,
  setProjectId: vi.fn(),
  setLoading: vi.fn(),
  loading: false,
  selectedAssistantId: 'assistant-1',
  selectedAssistantBackend: 'claude',
  selectedMode: 'bypassPermissions',
  selectedAcpModel: 'claude-opus',
  currentAcpCachedModelInfo: null,
  current_model: undefined,
  guidDisabledBuiltinSkills: undefined,
  guidEnabledSkills: undefined,
  assistantDefaultSkillIds: undefined,
  assistantDefaultDisabledBuiltinSkillIds: undefined,
  availableMcpServers: [{ id: 'mcp-user', name: 'User MCP', enabled: true, builtin: false } as IMcpServer],
  selectedMcpServerIds: ['mcp-user'],
  assistantDefaultMcpIds: undefined,
  isGoogleAuth: false,
  setMentionOpen: vi.fn(),
  setMentionQuery: vi.fn(),
  setMentionSelectorOpen: vi.fn(),
  setMentionActiveIndex: vi.fn(),
  navigate: vi.fn(() => Promise.resolve()) as never,
  t: vi.fn((key: string, options?: { defaultValue?: string }) => options?.defaultValue || key) as never,
  localeKey: 'zh-CN',
});

const SOURCE_REF: PresentationSourceRef = {
  grantId: '11111111-1111-4111-8111-111111111111',
  expectedByteLength: 2048,
  expectedSha256: 'a'.repeat(64),
};

const SOURCE_OWNER_RESULT: GetPresentationSourceOwnerResult = {
  ok: true,
  owner: { owner_type: 'draft', draft_id: '22222222-2222-4222-8222-222222222222' },
  ownerRevision: 3,
  grants: [
    {
      grantId: SOURCE_REF.grantId,
      displayName: 'Quarterly Revenue.xlsx',
      format: 'xlsx',
      sourceKind: 'native-picker',
      byteLength: SOURCE_REF.expectedByteLength,
      sha256: SOURCE_REF.expectedSha256,
      expiresAt: '2026-08-05T10:15:00.000Z',
    },
  ],
};

const BOUND_DRAFT_RESULT: BindPresentationDraftResult = {
  ok: true,
  status: 'bound',
  draftId: '22222222-2222-4222-8222-222222222222',
  conversationId: '33333333-3333-4333-8333-333333333333',
  revision: 4,
  boundAt: '2026-08-05T10:01:00.000Z',
};

const attachManagedPresentation = (
  deps: GuidSendDeps,
  overrides: Partial<NonNullable<GuidSendDeps['managedPresentation']>> = {}
) => {
  const prepareSourceOwner = vi.fn<(recoveryConversationId?: string) => Promise<GetPresentationSourceOwnerResult>>();
  prepareSourceOwner.mockResolvedValue(SOURCE_OWNER_RESULT);
  const bindDraft = vi.fn<(conversationId: string) => Promise<BindPresentationDraftResult | null>>();
  bindDraft.mockImplementation(async (conversationId) => ({
    ...BOUND_DRAFT_RESULT,
    conversationId,
  }));
  const onHandoffAccepted = vi.fn();
  deps.managedPresentation = {
    selectedTemplateId: 'finance-review',
    draftClientRequestId: '44444444-4444-4444-8444-444444444444',
    sourceRefs: [SOURCE_REF],
    prepareSourceOwner,
    bindDraft,
    onHandoffAccepted,
    ...overrides,
  };
  return { bindDraft, onHandoffAccepted, prepareSourceOwner };
};

describe('useGuidSend', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    createConversationInvokeMock.mockReset();
    createConversationInvokeMock.mockResolvedValue({ id: 'conv-1' });
    getConversationInvokeMock.mockReset().mockResolvedValue(null);
    removeConversationInvokeMock.mockReset();
    confirmQueuedSourcesInvokeMock.mockReset().mockResolvedValue({
      ok: true,
      status: 'confirmed',
      ownerRevision: 5,
      expiresAt: '2026-08-06T10:00:00.000Z',
    });
    startPresentationRunInvokeMock.mockReset().mockImplementation(async (request: { conversation_id: string }) => ({
      ok: true,
      run: {
        runId: '55555555-5555-4555-8555-555555555555',
        clientRequestId: '66666666-6666-4666-8666-666666666666',
        conversationId: request.conversation_id,
        selectedTemplateId: 'finance-review',
        revision: 8,
        createdAt: '2026-08-05T10:02:00.000Z',
        updatedAt: '2026-08-05T10:02:00.000Z',
        dispatchStatus: 'committed',
        artifactPhase: 'sources_snapshotted',
        disposition: null,
        retainedCandidate: null,
        actions: { openAllowed: false, discardAllowed: true },
      },
    }));
    getPresentationRunInvokeMock.mockReset();
    claimInitialDispatchInvokeMock.mockReset();
    renewInitialDispatchInvokeMock.mockReset();
    dispatchPresentationRunInvokeMock.mockReset();
    swrMutateMock.mockReset();
    swrMutateMock.mockResolvedValue(undefined);
    kbGetSessionMcpServerMock.mockReset();
    kbSyncFolderMock.mockReset().mockResolvedValue(undefined);
    kbGetSessionMcpServerMock.mockResolvedValue(null);
    listAvailableSkillsInvokeMock.mockReset().mockResolvedValue([]);
    getAssistantInvokeMock.mockReset().mockResolvedValue(null);
  });

  it('passes selected mode into assistant conversation overrides when creating a preset ACP conversation', async () => {
    const deps = createDeps();
    deps.selectedThoughtLevelValue = 'high';

    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    expect(createConversationInvokeMock).toHaveBeenCalledTimes(1);
    const payload = createConversationInvokeMock.mock.calls[0][0];
    expect(payload.type).toBeUndefined();
    expect('model' in payload).toBe(false);
    expect(payload.assistant?.conversation_overrides?.permission).toBe('bypassPermissions');
    expect(payload.assistant?.conversation_overrides?.model).toBe('claude-opus');
    expect(payload.assistant?.conversation_overrides?.thought_level).toBe('high');
    expect(payload.extra.backend).toBeUndefined();
    expect(payload.extra.agent_name).toBeUndefined();
    expect(payload.extra.agent_id).toBeUndefined();
    expect(payload.extra.custom_agent_id).toBeUndefined();
    expect(payload.extra.preset_rules).toBeUndefined();
    expect(payload.extra.preset_context).toBeUndefined();
    expect(payload.extra.session_mode).toBeUndefined();
    expect(payload.extra.current_model_id).toBeUndefined();
    expect(payload.extra.preset_assistant_id).toBeUndefined();
    expect(swrMutateMock).toHaveBeenCalledWith('guid.assistant.detail.assistant-1.zh-CN');
    expect(swrMutateMock).toHaveBeenCalledWith('assistants.list');
  });

  it('falls back to assistant default skill and MCP ids for preset conversations before local Guid overrides exist', async () => {
    const deps = createDeps();
    deps.guidEnabledSkills = undefined;
    deps.guidDisabledBuiltinSkills = undefined;
    deps.assistantDefaultSkillIds = ['assistant-skill'];
    deps.assistantDefaultDisabledBuiltinSkillIds = ['builtin-skill'];
    deps.selectedMcpServerIds = undefined;
    deps.assistantDefaultMcpIds = ['mcp-user'];

    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    const payload = createConversationInvokeMock.mock.calls[0][0];
    expect(payload.assistant?.conversation_overrides?.skill_ids).toEqual(['assistant-skill']);
    expect(payload.assistant?.conversation_overrides?.disabled_builtin_skill_ids).toEqual(['builtin-skill']);
    expect(payload.assistant?.conversation_overrides?.mcp_ids).toEqual(['mcp-user']);
    expect(payload.extra.selected_mcp_server_ids).toEqual(['mcp-user']);
  });

  it('preserves builtin MCP ids in assistant overrides while only sending user MCP ids to runtime selection', async () => {
    const deps = createDeps();
    deps.availableMcpServers = [
      { id: 'mcp-user', name: 'User MCP', enabled: true, builtin: false } as IMcpServer,
      { id: 'builtin-mcp', name: 'Builtin MCP', enabled: true, builtin: true } as IMcpServer,
    ];
    deps.selectedMcpServerIds = ['mcp-user', 'builtin-mcp'];

    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    const payload = createConversationInvokeMock.mock.calls[0][0];
    expect(payload.assistant?.conversation_overrides?.mcp_ids).toEqual(['mcp-user', 'builtin-mcp']);
    expect(payload.extra.selected_mcp_server_ids).toEqual(['mcp-user']);
    expect(payload.extra.selected_session_mcp_servers).toEqual([expect.objectContaining({ id: 'builtin-mcp' })]);
  });

  it('does not write legacy preset_assistant_id for preset assistant sends', async () => {
    const deps = createDeps();

    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    const payload = createConversationInvokeMock.mock.calls[0][0];
    expect(payload.assistant?.id).toBe('assistant-1');
    expect(payload.extra.preset_assistant_id).toBeUndefined();
  });

  it('forwards local skill overrides through assistant conversation overrides for ACP assistants', async () => {
    const deps = createDeps();
    deps.guidEnabledSkills = ['pdf-reader'];
    deps.guidDisabledBuiltinSkills = ['todo-tracker'];

    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    const payload = createConversationInvokeMock.mock.calls[0][0];
    expect(payload.assistant?.id).toBe('assistant-1');
    expect(payload.assistant?.conversation_overrides?.skill_ids).toEqual(['pdf-reader']);
    expect(payload.assistant?.conversation_overrides?.disabled_builtin_skill_ids).toEqual(['todo-tracker']);
  });

  it('forwards local skill overrides for generated Aion CLI assistants through assistant conversation overrides', async () => {
    const deps = createDeps();
    deps.selectedAssistantId = 'bare:aionrs';
    deps.selectedAssistantBackend = 'aionrs';
    deps.current_model = { provider_id: 'openai', model: 'gemini-2.5-pro', use_model: 'gemini-2.5-pro' } as never;
    deps.guidEnabledSkills = ['pdf-reader'];
    deps.guidDisabledBuiltinSkills = ['todo-tracker'];

    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    const payload = createConversationInvokeMock.mock.calls[0][0];
    expect(payload.type).toBeUndefined();
    expect(payload.model).toBe(deps.current_model);
    expect(payload.assistant?.id).toBe('bare:aionrs');
    expect(payload.assistant?.conversation_overrides?.skill_ids).toEqual(['pdf-reader']);
    expect(payload.assistant?.conversation_overrides?.disabled_builtin_skill_ids).toEqual(['todo-tracker']);
    expect(payload.extra.session_mode).toBeUndefined();
  });

  it('does not write legacy preset_assistant_id for generated Aion CLI assistant conversations', async () => {
    const deps = createDeps();
    deps.selectedAssistantId = 'bare:aionrs';
    deps.selectedAssistantBackend = 'aionrs';
    deps.current_model = { provider_id: 'openai', model: 'gemini-2.5-pro', use_model: 'gemini-2.5-pro' } as never;

    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    const payload = createConversationInvokeMock.mock.calls[0][0];
    expect(payload.assistant?.id).toBe('bare:aionrs');
    expect(payload.extra.preset_assistant_id).toBeUndefined();
  });

  it('does not write legacy preset_assistant_id for generated ACP assistant conversations', async () => {
    const deps = createDeps();
    deps.selectedAssistantId = 'bare:claude';
    deps.selectedAssistantBackend = 'claude';
    deps.current_model = { provider_id: 'anthropic', model: 'claude-sonnet', use_model: 'claude-sonnet' } as never;

    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    const payload = createConversationInvokeMock.mock.calls[0][0];
    expect(payload.assistant?.id).toBe('bare:claude');
    expect(payload.type).toBeUndefined();
    expect('model' in payload).toBe(false);
    expect(payload.extra.preset_assistant_id).toBeUndefined();
    expect(payload.extra.backend).toBeUndefined();
  });

  it('keeps all six enabled auto-attach servers on ordinary conversations', async () => {
    const deps = createDeps();
    deps.selectedMcpServerIds = undefined;
    deps.assistantDefaultMcpIds = [];
    deps.availableMcpServers = [
      { id: 'builtin-image-gen', name: 'aionui-image-generation', enabled: true, builtin: true } as IMcpServer,
      { id: 'builtin-idp', name: 'greennode-idp', enabled: true, builtin: true } as IMcpServer,
      { id: 'builtin-vision', name: 'aionui-image-analysis', enabled: true, builtin: true } as IMcpServer,
      { id: 'builtin-chrome-devtools', name: 'chrome-devtools', enabled: true, builtin: true } as IMcpServer,
      { id: 'builtin-memory', name: 'aionui-memory', enabled: true, builtin: true } as IMcpServer,
      { id: 'builtin-tavily', name: 'aionui-web-search', enabled: true, builtin: true } as IMcpServer,
    ];

    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    const payload = createConversationInvokeMock.mock.calls[0][0];
    const expectedIds = [
      'builtin-image-gen',
      'builtin-idp',
      'builtin-vision',
      'builtin-chrome-devtools',
      'builtin-memory',
      'builtin-tavily',
    ];
    expect(payload.assistant?.conversation_overrides?.mcp_ids).toEqual(expectedIds);
    expect(payload.extra.selected_session_mcp_servers?.map((server: IMcpServer) => server.id)).toEqual(expectedIds);
  });

  it('force-attaches an enabled image-gen builtin server on the explicit MCP selection path', async () => {
    const deps = createDeps();
    deps.selectedMcpServerIds = ['mcp-user'];
    deps.availableMcpServers = [
      { id: 'mcp-user', name: 'User MCP', enabled: true, builtin: false } as IMcpServer,
      { id: 'builtin-image-gen', name: 'aionui-image-generation', enabled: true, builtin: true } as IMcpServer,
    ];

    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    const payload = createConversationInvokeMock.mock.calls[0][0];
    expect(payload.assistant?.conversation_overrides?.mcp_ids).toEqual(['mcp-user', 'builtin-image-gen']);
  });

  it('force-attaches an enabled IDP builtin server on the explicit MCP selection path', async () => {
    const deps = createDeps();
    deps.selectedMcpServerIds = ['mcp-user'];
    deps.availableMcpServers = [
      { id: 'mcp-user', name: 'User MCP', enabled: true, builtin: false } as IMcpServer,
      { id: 'builtin-idp', name: 'greennode-idp', enabled: true, builtin: true } as IMcpServer,
    ];

    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    const payload = createConversationInvokeMock.mock.calls[0][0];
    expect(payload.assistant?.conversation_overrides?.mcp_ids).toEqual(['mcp-user', 'builtin-idp']);
  });

  it('force-attaches an enabled IDP builtin server into the session MCP server list for Aion CLI conversations on the explicit selection path', async () => {
    const deps = createDeps();
    deps.selectedAssistantId = 'bare:aionrs';
    deps.selectedAssistantBackend = 'aionrs';
    deps.current_model = { provider_id: 'openai', model: 'gpt-5', use_model: 'gpt-5' } as never;
    deps.selectedMcpServerIds = ['mcp-user'];
    deps.availableMcpServers = [
      { id: 'mcp-user', name: 'User MCP', enabled: true, builtin: false } as IMcpServer,
      { id: 'builtin-idp', name: 'greennode-idp', enabled: true, builtin: true } as IMcpServer,
    ];

    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    const payload = createConversationInvokeMock.mock.calls[0][0];
    expect(payload.assistant?.conversation_overrides?.mcp_ids).toEqual(['mcp-user', 'builtin-idp']);
    expect(payload.extra.selected_session_mcp_servers).toEqual([
      expect.objectContaining({ id: 'mcp-user' }),
      expect.objectContaining({ id: 'builtin-idp' }),
    ]);
  });

  it('does not force-attach a disabled IDP builtin server on the explicit MCP selection path', async () => {
    const deps = createDeps();
    deps.selectedMcpServerIds = ['mcp-user'];
    deps.availableMcpServers = [
      { id: 'mcp-user', name: 'User MCP', enabled: true, builtin: false } as IMcpServer,
      { id: 'builtin-idp', name: 'greennode-idp', enabled: false, builtin: true } as IMcpServer,
    ];

    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    const payload = createConversationInvokeMock.mock.calls[0][0];
    expect(payload.assistant?.conversation_overrides?.mcp_ids).toEqual(['mcp-user']);
    expect(payload.extra.selected_session_mcp_servers).toEqual([]);
  });

  it('force-attaches both enabled image-gen and IDP builtin servers together on the explicit selection path', async () => {
    const deps = createDeps();
    deps.selectedMcpServerIds = ['mcp-user'];
    deps.availableMcpServers = [
      { id: 'mcp-user', name: 'User MCP', enabled: true, builtin: false } as IMcpServer,
      { id: 'builtin-image-gen', name: 'aionui-image-generation', enabled: true, builtin: true } as IMcpServer,
      { id: 'builtin-idp', name: 'greennode-idp', enabled: true, builtin: true } as IMcpServer,
    ];

    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    const payload = createConversationInvokeMock.mock.calls[0][0];
    expect(payload.assistant?.conversation_overrides?.mcp_ids).toEqual([
      'mcp-user',
      'builtin-image-gen',
      'builtin-idp',
    ]);
  });

  it('passes Project id and workspace into ACP conversation creation', async () => {
    const deps = createDeps();
    deps.projectId = 'project-1';
    deps.dir = '/Users/me/Finance Close';

    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    const payload = createConversationInvokeMock.mock.calls[0][0];
    expect(payload.extra.project_id).toBe('project-1');
    expect(payload.extra.workspace).toBe('/Users/me/Finance Close');
    expect(payload.extra.custom_workspace).toBe(true);
  });

  it('passes Project id and workspace into Aion CLI conversation creation', async () => {
    const deps = createDeps();
    deps.selectedAssistantId = 'bare:aionrs';
    deps.selectedAssistantBackend = 'aionrs';
    deps.current_model = { provider_id: 'openai', model: 'gpt-5', use_model: 'gpt-5' } as never;
    deps.projectId = 'project-1';
    deps.dir = '/Users/me/Finance Close';

    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    const payload = createConversationInvokeMock.mock.calls[0][0];
    expect(payload.extra.project_id).toBe('project-1');
    expect(payload.extra.workspace).toBe('/Users/me/Finance Close');
    expect(payload.extra.custom_workspace).toBe(true);
  });

  it('does not create a conversation without assistant identity', async () => {
    const deps = createDeps();
    deps.selectedAssistantId = null;
    deps.selectedAssistantBackend = 'claude';

    const { result } = renderHook(() => useGuidSend(deps));

    expect(result.current.isButtonDisabled).toBe(true);

    await act(async () => {
      await result.current.handleSend();
    });

    expect(createConversationInvokeMock).not.toHaveBeenCalled();
  });

  it('requests managed source re-selection before entering the loading state', () => {
    const deps = createDeps();
    const onPresentationSourceReselectRequired = vi.fn();
    deps.files = ['/legacy/revenue.xlsx'];
    deps.requiresPresentationSourceReselect = true;
    deps.onPresentationSourceReselectRequired = onPresentationSourceReselectRequired;

    const { result } = renderHook(() => useGuidSend(deps));
    act(() => result.current.sendMessageHandler());

    expect(onPresentationSourceReselectRequired).toHaveBeenCalledTimes(1);
    expect(deps.setLoading).not.toHaveBeenCalled();
    expect(createConversationInvokeMock).not.toHaveBeenCalled();
  });

  it('preserves the prompt, files, and selected template when managed source re-selection is required', async () => {
    const deps = createDeps();
    const onPresentationSourceReselectRequired = vi.fn();
    deps.files = ['/legacy/revenue.xlsx'];
    deps.requiresPresentationSourceReselect = true;
    deps.onPresentationSourceReselectRequired = onPresentationSourceReselectRequired;
    deps.onPresentationTemplateConsumed = vi.fn();

    const { result } = renderHook(() => useGuidSend(deps));
    await act(async () => {
      result.current.sendMessageHandler();
      await Promise.resolve();
    });

    expect(onPresentationSourceReselectRequired).toHaveBeenCalledTimes(1);
    expect(
      [deps.setInput, deps.setFiles, deps.onPresentationTemplateConsumed].map((spy) => spy.mock.calls.length)
    ).toEqual([0, 0, 0]);
  });

  it('keeps the exact legacy template send path while the v2 feature flag is false', async () => {
    const deps = createDeps();
    const composed = {
      input: '<presentation-template>legacy</presentation-template>\nhello',
      files: ['/legacy/template/THEME.md', '/legacy/template/reference.pptx', '/legacy/revenue.xlsx'],
      injectSkills: ['slides'],
    };
    deps.files = ['/legacy/revenue.xlsx'];
    deps.composePresentationSend = vi.fn(() => composed);
    deps.onPresentationTemplateConsumed = vi.fn();

    const { result } = renderHook(() => useGuidSend(deps));
    await act(async () => result.current.sendMessageHandler());
    await waitFor(() => expect(deps.setLoading).toHaveBeenLastCalledWith(false));

    expect(PRESENTATION_RUN_V2_ENABLED).toBe(false);
    expect(deps.composePresentationSend).toHaveBeenCalledWith('hello', ['/legacy/revenue.xlsx']);
    expect(createConversationInvokeMock).toHaveBeenCalledWith(
      expect.objectContaining({ extra: expect.objectContaining({ default_files: composed.files }) })
    );
    expect(JSON.parse(sessionStorage.getItem('acp_initial_message_conv-1')!)).toEqual({
      input: composed.input,
      files: composed.files,
    });
    expect(sessionStorage.getItem('guid_presentation_submission_v2')).toBeNull();
    expect(Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))).not.toContainEqual(
      expect.stringMatching(/^presentation-command-queue\/v2\//)
    );
    expect(startPresentationRunInvokeMock).not.toHaveBeenCalled();
    expect(deps.onPresentationTemplateConsumed).toHaveBeenCalledTimes(1);
    expect(deps.navigate).toHaveBeenCalledWith('/conversation/conv-1');
  });

  describe('managed Guid presentation handoff', () => {
    const readManagedQueue = (): Record<string, unknown> => {
      const key = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).find((candidate) =>
        candidate?.startsWith('presentation-command-queue/v2/')
      );
      expect(key).toBeDefined();
      return JSON.parse(localStorage.getItem(key!)!) as Record<string, unknown>;
    };

    it('orders draft grants, durable conversation, one bind, start, committed handoff, and navigation', async () => {
      const events: string[] = [];
      const deps = createDeps();
      deps.onPresentationTemplateConsumed = vi.fn();
      const managed = attachManagedPresentation(deps);
      managed.prepareSourceOwner.mockImplementation(async () => {
        events.push('draft-and-grants');
        return SOURCE_OWNER_RESULT;
      });
      createConversationInvokeMock.mockImplementation(
        async (request: { id: string; extra: { default_files: string[] } }) => {
          events.push('conversation');
          expect(request.extra.default_files).toEqual([]);
          return { id: request.id };
        }
      );
      managed.bindDraft.mockImplementation(async (conversationId) => {
        events.push('bind');
        return { ...BOUND_DRAFT_RESULT, conversationId };
      });
      confirmQueuedSourcesInvokeMock.mockImplementation(async () => {
        events.push('grant-confirm');
        return {
          ok: true,
          status: 'confirmed',
          ownerRevision: 5,
          expiresAt: '2026-08-06T10:00:00.000Z',
        };
      });
      startPresentationRunInvokeMock.mockImplementation(
        async (request: {
          conversation_id: string;
          client_request_id: string;
          selected_template_id: string;
          sources: PresentationSourceRef[];
        }) => {
          events.push('start');
          expect(request).toMatchObject({
            input: 'hello',
            selected_template_id: 'finance-review',
            sources: [SOURCE_REF],
          });
          return {
            ok: true,
            run: {
              runId: '55555555-5555-4555-8555-555555555555',
              clientRequestId: request.client_request_id,
              conversationId: request.conversation_id,
              selectedTemplateId: request.selected_template_id,
              revision: 8,
              createdAt: '2026-08-05T10:02:00.000Z',
              updatedAt: '2026-08-05T10:02:00.000Z',
              dispatchStatus: 'committed',
              artifactPhase: 'sources_snapshotted',
              disposition: null,
              retainedCandidate: null,
              actions: { openAllowed: false, discardAllowed: true },
            },
          };
        }
      );
      deps.navigate = vi.fn(async () => {
        const queue = readManagedQueue() as { items: Array<{ execution: { state: string } }> };
        expect(queue.items[0].execution.state).toBe('committed');
        events.push('navigate');
      }) as never;

      const { result } = renderHook(() => useGuidSend(deps));
      await act(async () => result.current.handleSend());

      expect(events).toEqual(['draft-and-grants', 'conversation', 'bind', 'grant-confirm', 'start', 'navigate']);
      expect(managed.bindDraft).toHaveBeenCalledTimes(1);
      expect(claimInitialDispatchInvokeMock).not.toHaveBeenCalled();
      expect(renewInitialDispatchInvokeMock).not.toHaveBeenCalled();
      expect(dispatchPresentationRunInvokeMock).not.toHaveBeenCalled();
      expect(JSON.stringify(readManagedQueue())).not.toContain('/');
      expect(sessionStorage.getItem('acp_initial_message_33333333-3333-4333-8333-333333333333')).toBeNull();
      expect(sessionStorage.getItem('aionrs_initial_message_33333333-3333-4333-8333-333333333333')).toBeNull();
      expect(managed.onHandoffAccepted).toHaveBeenCalledTimes(1);
    });

    it('creates and binds a valid main draft for prompt-only sends without confirming grants', async () => {
      const deps = createDeps();
      const promptOnlyOwner: GetPresentationSourceOwnerResult = {
        ok: true,
        owner: { owner_type: 'draft', draft_id: '22222222-2222-4222-8222-222222222222' },
        ownerRevision: 0,
        grants: [],
      };
      const managed = attachManagedPresentation(deps, { sourceRefs: [] });
      managed.prepareSourceOwner.mockResolvedValue(promptOnlyOwner);
      createConversationInvokeMock.mockImplementation(async ({ id }: { id: string }) => ({ id }));

      const { result } = renderHook(() => useGuidSend(deps));
      await act(async () => result.current.handleSend());

      expect(managed.prepareSourceOwner).toHaveBeenCalledTimes(1);
      expect(managed.bindDraft).toHaveBeenCalledTimes(1);
      expect(confirmQueuedSourcesInvokeMock).not.toHaveBeenCalled();
      expect(startPresentationRunInvokeMock).toHaveBeenCalledWith(
        expect.objectContaining({ input: 'hello', sources: [] })
      );
    });

    it('fails closed when prompt-only draft binding returns no authoritative result', async () => {
      const deps = createDeps();
      const managed = attachManagedPresentation(deps, { sourceRefs: [] });
      managed.prepareSourceOwner.mockResolvedValue({
        ok: true,
        owner: { owner_type: 'draft', draft_id: '22222222-2222-4222-8222-222222222222' },
        ownerRevision: 0,
        grants: [],
      });
      managed.bindDraft.mockResolvedValue(null);
      createConversationInvokeMock.mockImplementation(async ({ id }: { id: string }) => ({ id }));

      const { result } = renderHook(() => useGuidSend(deps));
      await act(async () => {
        await result.current.handleSend().catch(() => undefined);
      });

      expect(managed.bindDraft).toHaveBeenCalledTimes(1);
      expect(startPresentationRunInvokeMock).not.toHaveBeenCalled();
      expect(deps.navigate).not.toHaveBeenCalled();
      expect(sessionStorage.getItem('guid_presentation_submission_v2')).toContain('hello');
    });

    it('does not treat an empty revision-zero conversation owner as proof of prompt-only draft binding', async () => {
      const deps = createDeps();
      const conversationId = '33333333-3333-4333-8333-333333333333';
      const managed = attachManagedPresentation(deps, {
        conversationId,
        sourceRefs: [],
      });
      managed.prepareSourceOwner.mockResolvedValue({
        ok: true,
        owner: { owner_type: 'conversation', conversation_id: conversationId },
        ownerRevision: 0,
        grants: [],
      });
      getConversationInvokeMock.mockResolvedValue({ id: conversationId });

      const { result } = renderHook(() => useGuidSend(deps));
      await act(async () => {
        await result.current.handleSend().catch(() => undefined);
      });

      expect(managed.bindDraft).not.toHaveBeenCalled();
      expect(startPresentationRunInvokeMock).not.toHaveBeenCalled();
      expect(deps.navigate).not.toHaveBeenCalled();
      expect(sessionStorage.getItem('guid_presentation_submission_v2')).toContain(conversationId);
    });

    it('blocks an expired draft before conversation creation and keeps one stable pending snapshot', async () => {
      const deps = createDeps();
      deps.onPresentationTemplateConsumed = vi.fn();
      const managed = attachManagedPresentation(deps);
      managed.prepareSourceOwner.mockResolvedValue({
        ok: false,
        code: 'DRAFT_EXPIRED',
        messageKey: 'conversation.presentationRun.errors.DRAFT_EXPIRED',
        retryable: false,
        state: 'draft_expired',
        details: { draftId: '22222222-2222-4222-8222-222222222222' },
      });

      const { result } = renderHook(() => useGuidSend(deps));
      await act(async () => result.current.sendMessageHandler());
      await waitFor(() => expect(deps.setLoading).toHaveBeenLastCalledWith(false));
      const stableSnapshot = Array.from({ length: sessionStorage.length }, (_, index) =>
        sessionStorage.getItem(sessionStorage.key(index)!)
      ).find((value) => value?.includes('finance-review'));

      expect(stableSnapshot).toContain('hello');
      await act(async () => result.current.retireManagedPresentationAttemptAfterSourceChange(false));
      expect(
        Array.from({ length: sessionStorage.length }, (_, index) =>
          sessionStorage.getItem(sessionStorage.key(index)!)
        ).find((value) => value?.includes('finance-review'))
      ).toBe(stableSnapshot);
      await act(async () => result.current.retireManagedPresentationAttemptAfterSourceChange(true));
      expect(
        Array.from({ length: sessionStorage.length }, (_, index) =>
          sessionStorage.getItem(sessionStorage.key(index)!)
        ).find((value) => value?.includes('finance-review'))
      ).toBeUndefined();
      expect(createConversationInvokeMock).not.toHaveBeenCalled();
      expect(startPresentationRunInvokeMock).not.toHaveBeenCalled();
      expect(deps.navigate).not.toHaveBeenCalled();
      expect(
        [deps.setInput, deps.setFiles, deps.onPresentationTemplateConsumed].map((spy) => spy.mock.calls.length)
      ).toEqual([0, 0, 0]);
    });

    it('does not start or delete the newly created conversation when draft binding conflicts', async () => {
      const deps = createDeps();
      deps.onPresentationTemplateConsumed = vi.fn();
      const managed = attachManagedPresentation(deps);
      createConversationInvokeMock.mockImplementation(async ({ id }: { id: string }) => ({ id }));
      managed.bindDraft.mockResolvedValue({
        ok: false,
        code: 'DRAFT_ALREADY_BOUND',
        messageKey: 'conversation.presentationRun.errors.DRAFT_ALREADY_BOUND',
        retryable: false,
        state: 'draft_active',
        details: {
          draftId: '22222222-2222-4222-8222-222222222222',
          conversationId: '77777777-7777-4777-8777-777777777777',
        },
      });

      const { result } = renderHook(() => useGuidSend(deps));
      await act(async () => result.current.sendMessageHandler());
      await waitFor(() => expect(deps.setLoading).toHaveBeenLastCalledWith(false));

      expect(managed.bindDraft).toHaveBeenCalledTimes(1);
      expect(startPresentationRunInvokeMock).not.toHaveBeenCalled();
      expect(removeConversationInvokeMock).not.toHaveBeenCalled();
      expect(deps.navigate).not.toHaveBeenCalled();
      expect(deps.onPresentationTemplateConsumed).not.toHaveBeenCalled();
    });

    it('retains the raw submission when source confirmation blocks after durable conversation creation', async () => {
      const deps = createDeps();
      deps.onPresentationTemplateConsumed = vi.fn();
      const managed = attachManagedPresentation(deps);
      createConversationInvokeMock.mockImplementation(async ({ id }: { id: string }) => ({ id }));
      confirmQueuedSourcesInvokeMock.mockResolvedValue({
        ok: false,
        code: 'SOURCE_TAMPERED',
        messageKey: 'conversation.presentationRun.errors.SOURCE_TAMPERED',
        retryable: false,
        state: 'grant_validation',
        details: { grantId: SOURCE_REF.grantId },
      });

      const { result } = renderHook(() => useGuidSend(deps));
      await act(async () => result.current.sendMessageHandler());
      await waitFor(() => expect(deps.setLoading).toHaveBeenLastCalledWith(false));

      expect(createConversationInvokeMock).toHaveBeenCalledTimes(1);
      expect(managed.bindDraft).toHaveBeenCalledTimes(1);
      expect(confirmQueuedSourcesInvokeMock).toHaveBeenCalledTimes(1);
      expect(startPresentationRunInvokeMock).not.toHaveBeenCalled();
      expect(removeConversationInvokeMock).not.toHaveBeenCalled();
      expect(deps.navigate).not.toHaveBeenCalled();
      expect(
        [deps.setInput, deps.setFiles, deps.onPresentationTemplateConsumed].map((spy) => spy.mock.calls.length)
      ).toEqual([0, 0, 0]);
      expect(sessionStorage.getItem('guid_presentation_submission_v2')).toContain('hello');
      expect(JSON.stringify(readManagedQueue())).toContain(SOURCE_REF.grantId);
    });

    it('retains the raw submission when main start returns a definitive preflight block', async () => {
      const deps = createDeps();
      deps.onPresentationTemplateConsumed = vi.fn();
      const managed = attachManagedPresentation(deps);
      createConversationInvokeMock.mockImplementation(async ({ id }: { id: string }) => ({ id }));
      startPresentationRunInvokeMock.mockResolvedValueOnce({
        ok: false,
        code: 'RATE_LIMITED',
        messageKey: 'conversation.presentationRun.errors.RATE_LIMITED',
        retryable: true,
        state: 'preflight',
        details: { retryAfterMs: 5000, postInvoked: false },
      });

      const { result } = renderHook(() => useGuidSend(deps));
      await act(async () => result.current.sendMessageHandler());
      await waitFor(() => expect(deps.setLoading).toHaveBeenLastCalledWith(false));

      expect(startPresentationRunInvokeMock).toHaveBeenCalledTimes(1);
      expect(removeConversationInvokeMock).not.toHaveBeenCalled();
      expect(deps.navigate).not.toHaveBeenCalled();
      expect(
        [deps.setInput, deps.setFiles, deps.onPresentationTemplateConsumed].map((spy) => spy.mock.calls.length)
      ).toEqual([0, 0, 0]);
      expect(sessionStorage.getItem('guid_presentation_submission_v2')).toContain('hello');
      expect(readManagedQueue()).toMatchObject({
        items: [{ input: 'hello', selectedTemplateId: 'finance-review', execution: { state: 'preflight_failed' } }],
      });

      const firstConversationId = createConversationInvokeMock.mock.calls[0][0].id as string;
      await act(async () => result.current.retireManagedPresentationAttemptAfterSourceChange(true));
      expect(sessionStorage.getItem('guid_presentation_submission_v2')).toBeNull();
      expect(
        Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).find((candidate) =>
          candidate?.startsWith('presentation-command-queue/v2/')
        )
      ).toBeUndefined();

      const replacementSource: PresentationSourceRef = {
        grantId: '77777777-7777-4777-8777-777777777777',
        expectedByteLength: 4096,
        expectedSha256: 'b'.repeat(64),
      };
      Object.assign(deps.managedPresentation!, {
        conversationId: firstConversationId,
        sourceRefs: [replacementSource],
      });
      managed.prepareSourceOwner.mockResolvedValue({
        ok: true,
        owner: { owner_type: 'conversation', conversation_id: firstConversationId },
        ownerRevision: 6,
        grants: [
          {
            grantId: replacementSource.grantId,
            displayName: 'Updated Revenue.xlsx',
            format: 'xlsx',
            sourceKind: 'native-picker',
            byteLength: replacementSource.expectedByteLength,
            sha256: replacementSource.expectedSha256,
            expiresAt: '2026-08-06T11:00:00.000Z',
          },
        ],
      });
      getConversationInvokeMock.mockResolvedValue({ id: firstConversationId });

      await act(async () => result.current.handleSend());

      expect(createConversationInvokeMock).toHaveBeenCalledTimes(1);
      expect(managed.bindDraft).toHaveBeenCalledTimes(1);
      expect(startPresentationRunInvokeMock).toHaveBeenCalledTimes(2);
      expect(startPresentationRunInvokeMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ conversation_id: firstConversationId, sources: [replacementSource] })
      );
      expect(deps.navigate).toHaveBeenCalledWith(`/conversation/${firstConversationId}`);
    });

    it('reconciles lost create, bind, and start replies by stable IDs without repeating their mutations', async () => {
      const deps = createDeps();
      const managed = attachManagedPresentation(deps);
      let conversationId = '';
      createConversationInvokeMock.mockImplementation(async ({ id }: { id: string }) => {
        conversationId = id;
        throw new Error('create reply lost');
      });
      getConversationInvokeMock.mockImplementation(async ({ id }: { id: string }) => ({ id }));
      managed.bindDraft.mockRejectedValue(new Error('bind reply lost'));
      managed.prepareSourceOwner
        .mockResolvedValueOnce(SOURCE_OWNER_RESULT)
        .mockImplementation(async (recoveryConversationId) => ({
          ...SOURCE_OWNER_RESULT,
          owner: { owner_type: 'conversation', conversation_id: recoveryConversationId ?? conversationId },
          ownerRevision: 4,
        }));
      startPresentationRunInvokeMock.mockRejectedValue(new Error('start reply lost'));
      getPresentationRunInvokeMock.mockImplementation(
        async (request: { conversation_id: string; client_request_id: string }) => ({
          ok: true,
          run: {
            runId: '55555555-5555-4555-8555-555555555555',
            clientRequestId: request.client_request_id,
            conversationId: request.conversation_id,
            selectedTemplateId: 'finance-review',
            revision: 8,
            createdAt: '2026-08-05T10:02:00.000Z',
            updatedAt: '2026-08-05T10:02:00.000Z',
            dispatchStatus: 'committed',
            artifactPhase: 'sources_snapshotted',
            disposition: null,
            retainedCandidate: null,
            actions: { openAllowed: false, discardAllowed: true },
          },
        })
      );

      const { result } = renderHook(() => useGuidSend(deps));
      await act(async () => result.current.handleSend());

      expect(createConversationInvokeMock).toHaveBeenCalledTimes(1);
      expect(getConversationInvokeMock).toHaveBeenCalledWith({ id: conversationId });
      expect(managed.bindDraft).toHaveBeenCalledTimes(1);
      expect(managed.prepareSourceOwner).toHaveBeenLastCalledWith(conversationId);
      expect(startPresentationRunInvokeMock).toHaveBeenCalledTimes(1);
      expect(getPresentationRunInvokeMock).toHaveBeenCalledWith({
        conversation_id: conversationId,
        client_request_id: expect.any(String),
      });
      expect(deps.navigate).toHaveBeenCalledWith(`/conversation/${conversationId}`);
    });

    it('deduplicates duplicate clicks while the managed draft is pending', async () => {
      const deps = createDeps();
      let releaseDraft!: (value: GetPresentationSourceOwnerResult) => void;
      const draft = new Promise<GetPresentationSourceOwnerResult>((resolve) => {
        releaseDraft = resolve;
      });
      const managed = attachManagedPresentation(deps);
      managed.prepareSourceOwner.mockReturnValue(draft);
      createConversationInvokeMock.mockImplementation(async ({ id }: { id: string }) => ({ id }));
      const { result } = renderHook(() => useGuidSend(deps));

      act(() => {
        result.current.sendMessageHandler();
        result.current.sendMessageHandler();
      });
      expect(result.current.managedPresentationPending).toBe(true);
      await act(async () => releaseDraft(SOURCE_OWNER_RESULT));
      await waitFor(() => expect(deps.navigate).toHaveBeenCalledTimes(1));

      expect(managed.prepareSourceOwner).toHaveBeenCalledTimes(1);
      expect(createConversationInvokeMock).toHaveBeenCalledTimes(1);
      expect(managed.bindDraft).toHaveBeenCalledTimes(1);
      expect(startPresentationRunInvokeMock).toHaveBeenCalledTimes(1);
    });

    it('keeps the same queue and request identity across remount after navigation loses its reply', async () => {
      const deps = createDeps();
      const managed = attachManagedPresentation(deps);
      createConversationInvokeMock.mockImplementation(async ({ id }: { id: string }) => ({ id }));
      const navigate = vi.fn().mockRejectedValueOnce(new Error('navigation reply lost')).mockResolvedValue(undefined);
      deps.navigate = navigate as never;
      const first = renderHook(() => useGuidSend(deps));
      await act(async () => first.result.current.sendMessageHandler());
      await waitFor(() => expect(deps.setLoading).toHaveBeenLastCalledWith(false));
      const firstStartRequest = startPresentationRunInvokeMock.mock.calls[0][0];
      const queueBeforeRemount = readManagedQueue() as {
        items: Array<{
          clientRequestId: string;
          selectedTemplateId: string;
          execution: { state: 'committed'; runId: string; revision: number };
        }>;
      };
      const committed = queueBeforeRemount.items[0];
      await act(async () => first.result.current.retireManagedPresentationAttemptAfterSourceChange(true));
      deps.managedPresentation!.sourceRefs = [
        {
          grantId: '77777777-7777-4777-8777-777777777777',
          expectedByteLength: 4096,
          expectedSha256: 'b'.repeat(64),
        },
      ];
      expect(sessionStorage.getItem('guid_presentation_submission_v2')).toContain(SOURCE_REF.grantId);
      getConversationInvokeMock.mockResolvedValue({ id: firstStartRequest.conversation_id });
      getPresentationRunInvokeMock.mockResolvedValue({
        ok: true,
        run: {
          runId: committed.execution.runId,
          clientRequestId: committed.clientRequestId,
          conversationId: firstStartRequest.conversation_id,
          selectedTemplateId: committed.selectedTemplateId,
          revision: committed.execution.revision,
          createdAt: '2026-08-05T10:02:00.000Z',
          updatedAt: '2026-08-05T10:02:00.000Z',
          dispatchStatus: 'committed',
          artifactPhase: 'sources_snapshotted',
          disposition: null,
          retainedCandidate: null,
          actions: { openAllowed: false, discardAllowed: true },
        },
      });
      first.unmount();

      const second = renderHook(() => useGuidSend(deps));
      await act(async () => second.result.current.handleSend());

      expect(startPresentationRunInvokeMock).toHaveBeenCalledTimes(1);
      expect(managed.bindDraft).toHaveBeenCalledTimes(1);
      expect(createConversationInvokeMock).toHaveBeenCalledTimes(1);
      expect(getConversationInvokeMock).toHaveBeenCalledWith({ id: firstStartRequest.conversation_id });
      expect(getPresentationRunInvokeMock).toHaveBeenCalledWith({
        conversation_id: firstStartRequest.conversation_id,
        client_request_id: committed.clientRequestId,
      });
      expect(navigate).toHaveBeenCalledTimes(2);
      const queue = readManagedQueue() as {
        items: Array<{ queueItemId: string; clientRequestId: string; execution: { state: string } }>;
      };
      expect(queue.items[0]).toMatchObject({
        clientRequestId: firstStartRequest.client_request_id,
        execution: { state: 'committed' },
      });
    });

    it('fails closed on a forged committed queue item when main cannot prove the conversation and run', async () => {
      const deps = createDeps();
      attachManagedPresentation(deps);
      createConversationInvokeMock.mockImplementation(async ({ id }: { id: string }) => ({ id }));
      const navigate = vi.fn().mockRejectedValueOnce(new Error('navigation reply lost')).mockResolvedValue(undefined);
      deps.navigate = navigate as never;
      const first = renderHook(() => useGuidSend(deps));
      await act(async () => first.result.current.sendMessageHandler());
      await waitFor(() => expect(deps.setLoading).toHaveBeenLastCalledWith(false));
      first.unmount();
      getConversationInvokeMock.mockResolvedValue(null);
      getPresentationRunInvokeMock.mockResolvedValue({
        ok: false,
        code: 'RUN_NOT_FOUND',
        messageKey: 'conversation.presentationRun.errors.RUN_NOT_FOUND',
        retryable: false,
        state: 'lookup',
        details: null,
      });

      const second = renderHook(() => useGuidSend(deps));
      await act(async () => {
        await second.result.current.handleSend().catch(() => undefined);
      });

      expect(getConversationInvokeMock).toHaveBeenCalledTimes(1);
      expect(getPresentationRunInvokeMock).not.toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledTimes(1);
      expect(startPresentationRunInvokeMock).toHaveBeenCalledTimes(1);
      expect(
        Array.from({ length: sessionStorage.length }, (_, index) =>
          sessionStorage.getItem(sessionStorage.key(index)!)
        ).some((value) => value?.includes('finance-review'))
      ).toBe(true);
    });

    it.each(['dispatching', 'bound', 'dispatch_uncertain'] as const)(
      'observes authoritative main advancement from local committed to %s without reclaiming or resending',
      async (dispatchStatus) => {
        const deps = createDeps();
        attachManagedPresentation(deps);
        createConversationInvokeMock.mockImplementation(async ({ id }: { id: string }) => ({ id }));
        const navigate = vi.fn().mockRejectedValueOnce(new Error('navigation reply lost')).mockResolvedValue(undefined);
        deps.navigate = navigate as never;
        const first = renderHook(() => useGuidSend(deps));
        await act(async () => first.result.current.sendMessageHandler());
        await waitFor(() => expect(deps.setLoading).toHaveBeenLastCalledWith(false));
        const key = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).find(
          (candidate) => candidate?.startsWith('presentation-command-queue/v2/')
        )!;
        const queue = JSON.parse(localStorage.getItem(key)!) as {
          conversationId: string;
          items: Array<{
            clientRequestId: string;
            selectedTemplateId: string;
            execution: { state: string; runId: string; revision: number };
          }>;
        };
        const item = queue.items[0];
        expect(item.execution.state).toBe('committed');
        getConversationInvokeMock.mockResolvedValue({ id: queue.conversationId });
        getPresentationRunInvokeMock.mockResolvedValue({
          ok: true,
          run: {
            runId: item.execution.runId,
            clientRequestId: item.clientRequestId,
            conversationId: queue.conversationId,
            selectedTemplateId: item.selectedTemplateId,
            revision: item.execution.revision + 1,
            createdAt: '2026-08-05T10:02:00.000Z',
            updatedAt: '2026-08-05T10:03:00.000Z',
            dispatchStatus,
            artifactPhase: 'sources_snapshotted',
            disposition: dispatchStatus === 'dispatch_uncertain' ? 'TRACKING_REQUIRED' : null,
            retainedCandidate: null,
            actions: { openAllowed: false, discardAllowed: false },
          },
        });
        first.unmount();

        const second = renderHook(() => useGuidSend(deps));
        await act(async () => second.result.current.handleSend());

        expect(getConversationInvokeMock).toHaveBeenCalledWith({ id: queue.conversationId });
        expect(getPresentationRunInvokeMock).toHaveBeenCalledWith({
          conversation_id: queue.conversationId,
          client_request_id: item.clientRequestId,
        });
        expect(startPresentationRunInvokeMock).toHaveBeenCalledTimes(1);
        expect(claimInitialDispatchInvokeMock).not.toHaveBeenCalled();
        expect(renewInitialDispatchInvokeMock).not.toHaveBeenCalled();
        expect(dispatchPresentationRunInvokeMock).not.toHaveBeenCalled();
        expect(navigate).toHaveBeenCalledTimes(2);
      }
    );

    it.each([
      ['committed', 'allocating'],
      ['dispatching', 'committed'],
      ['bound', 'committed'],
      ['bound', 'dispatching'],
      ['dispatch_uncertain', 'committed'],
      ['dispatch_uncertain', 'bound'],
    ] as const)(
      'rejects incompatible authoritative state %s -> %s even when identity and revision match',
      async (localState, dispatchStatus) => {
        const deps = createDeps();
        attachManagedPresentation(deps);
        createConversationInvokeMock.mockImplementation(async ({ id }: { id: string }) => ({ id }));
        const navigate = vi.fn().mockRejectedValueOnce(new Error('navigation reply lost')).mockResolvedValue(undefined);
        deps.navigate = navigate as never;
        const first = renderHook(() => useGuidSend(deps));
        await act(async () => first.result.current.sendMessageHandler());
        await waitFor(() => expect(deps.setLoading).toHaveBeenLastCalledWith(false));
        const key = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).find(
          (candidate) => candidate?.startsWith('presentation-command-queue/v2/')
        )!;
        const queue = JSON.parse(localStorage.getItem(key)!) as {
          conversationId: string;
          items: Array<{
            clientRequestId: string;
            selectedTemplateId: string;
            execution: { state: string; runId: string; revision: number; postInvoked?: false };
          }>;
        };
        const item = queue.items[0];
        if (localState !== 'committed') {
          item.execution = {
            state: localState,
            runId: item.execution.runId,
            revision: item.execution.revision + 1,
          };
          localStorage.setItem(key, JSON.stringify(queue));
        }
        getConversationInvokeMock.mockResolvedValue({ id: queue.conversationId });
        getPresentationRunInvokeMock.mockResolvedValue({
          ok: true,
          run: {
            runId: item.execution.runId,
            clientRequestId: item.clientRequestId,
            conversationId: queue.conversationId,
            selectedTemplateId: item.selectedTemplateId,
            revision: item.execution.revision + 1,
            createdAt: '2026-08-05T10:02:00.000Z',
            updatedAt: '2026-08-05T10:03:00.000Z',
            dispatchStatus,
            artifactPhase: dispatchStatus === 'allocating' ? 'none' : 'sources_snapshotted',
            disposition: null,
            retainedCandidate: null,
            actions: { openAllowed: false, discardAllowed: false },
          },
        });
        first.unmount();

        const second = renderHook(() => useGuidSend(deps));
        await act(async () => {
          await second.result.current.handleSend().catch(() => undefined);
        });

        expect(getPresentationRunInvokeMock).toHaveBeenCalledWith({
          conversation_id: queue.conversationId,
          client_request_id: item.clientRequestId,
        });
        expect(startPresentationRunInvokeMock).toHaveBeenCalledTimes(1);
        expect(claimInitialDispatchInvokeMock).not.toHaveBeenCalled();
        expect(renewInitialDispatchInvokeMock).not.toHaveBeenCalled();
        expect(dispatchPresentationRunInvokeMock).not.toHaveBeenCalled();
        expect(navigate).toHaveBeenCalledTimes(1);
        expect(sessionStorage.getItem('guid_presentation_submission_v2')).toContain(item.clientRequestId);
      }
    );

    it('observes an authoritative terminal run that advanced beyond a locally bound handoff', async () => {
      const deps = createDeps();
      attachManagedPresentation(deps);
      createConversationInvokeMock.mockImplementation(async ({ id }: { id: string }) => ({ id }));
      const navigate = vi.fn().mockRejectedValueOnce(new Error('navigation reply lost')).mockResolvedValue(undefined);
      deps.navigate = navigate as never;
      const first = renderHook(() => useGuidSend(deps));
      await act(async () => first.result.current.sendMessageHandler());
      await waitFor(() => expect(deps.setLoading).toHaveBeenLastCalledWith(false));
      const key = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).find((candidate) =>
        candidate?.startsWith('presentation-command-queue/v2/')
      )!;
      const queue = JSON.parse(localStorage.getItem(key)!) as {
        conversationId: string;
        items: Array<{
          clientRequestId: string;
          selectedTemplateId: string;
          execution: { state: string; runId: string; revision: number };
        }>;
      };
      const item = queue.items[0];
      item.execution = {
        state: 'bound',
        runId: item.execution.runId,
        revision: item.execution.revision + 1,
      };
      localStorage.setItem(key, JSON.stringify(queue));
      getConversationInvokeMock.mockResolvedValue({ id: queue.conversationId });
      getPresentationRunInvokeMock.mockResolvedValue({
        ok: true,
        run: {
          runId: item.execution.runId,
          clientRequestId: item.clientRequestId,
          conversationId: queue.conversationId,
          selectedTemplateId: item.selectedTemplateId,
          revision: item.execution.revision + 1,
          createdAt: '2026-08-05T10:02:00.000Z',
          updatedAt: '2026-08-05T10:04:00.000Z',
          dispatchStatus: 'retained',
          artifactPhase: 'candidate_retained',
          disposition: 'REVIEW_REQUIRED',
          retainedCandidate: { sha256: 'b'.repeat(64), byteLength: 4096 },
          actions: { openAllowed: false, discardAllowed: true },
        },
      });
      first.unmount();

      const second = renderHook(() => useGuidSend(deps));
      await act(async () => second.result.current.handleSend());

      expect(getPresentationRunInvokeMock).toHaveBeenCalledWith({
        conversation_id: queue.conversationId,
        client_request_id: item.clientRequestId,
      });
      expect(startPresentationRunInvokeMock).toHaveBeenCalledTimes(1);
      expect(claimInitialDispatchInvokeMock).not.toHaveBeenCalled();
      expect(renewInitialDispatchInvokeMock).not.toHaveBeenCalled();
      expect(dispatchPresentationRunInvokeMock).not.toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledTimes(2);
    });

    it('stops at confirmed queue persistence failure and leaves the raw draft and template intact', async () => {
      const deps = createDeps();
      deps.onPresentationTemplateConsumed = vi.fn();
      attachManagedPresentation(deps);
      createConversationInvokeMock.mockImplementation(async ({ id }: { id: string }) => ({ id }));
      const originalSetItem = Storage.prototype.setItem;
      const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
        if (key.startsWith('presentation-command-queue/v2/')) throw new DOMException('quota', 'QuotaExceededError');
        return originalSetItem.call(this, key, value);
      });

      const { result } = renderHook(() => useGuidSend(deps));
      await act(async () => result.current.sendMessageHandler());
      await waitFor(() => expect(deps.setLoading).toHaveBeenLastCalledWith(false));

      expect(startPresentationRunInvokeMock).not.toHaveBeenCalled();
      expect(deps.navigate).not.toHaveBeenCalled();
      expect(removeConversationInvokeMock).not.toHaveBeenCalled();
      expect(
        [deps.setInput, deps.setFiles, deps.onPresentationTemplateConsumed].map((spy) => spy.mock.calls.length)
      ).toEqual([0, 0, 0]);
      setItem.mockRestore();
    });
  });

  // Nested (not a sibling describe) so these tests run under the outer
  // beforeEach above — it resets createConversationInvokeMock and
  // kbGetSessionMcpServerMock before every test, keeping `.mock.calls[0][0]`
  // and call-count assertions scoped to a single test each.
  describe('project knowledge attach', () => {
    const KB_SERVER = {
      id: 'project-kb-p1',
      name: 'aionui-project-knowledge',
      transport: {
        type: 'stdio',
        command: 'node',
        args: ['/out/main/builtin-mcp-knowledge.js'],
        env: { AIONUI_KB_PROJECT_ID: 'p1', AIONUI_KB_STORE_DIR: '/store/p1' },
      },
    };

    it('does not query the KB descriptor for non-project chats', async () => {
      const deps = createDeps();
      const { result } = renderHook(() => useGuidSend(deps));
      await act(async () => {
        await result.current.handleSend();
      });
      expect(kbGetSessionMcpServerMock).not.toHaveBeenCalled();
      expect(kbSyncFolderMock).not.toHaveBeenCalled();
    });

    // Creating a chat is a sync point: files dropped into the folder since the
    // last sync get indexed for the NEXT chat. It must not be awaited — this
    // chat still uses whatever was ready at creation.
    it('kicks off a folder sync for a project chat without blocking creation', async () => {
      kbGetSessionMcpServerMock.mockResolvedValue(null);
      let releaseSync: (() => void) | null = null;
      kbSyncFolderMock.mockReturnValue(
        new Promise<void>((resolve) => {
          releaseSync = resolve;
        })
      );
      const deps = createDeps();
      deps.projectId = 'p1';
      const { result } = renderHook(() => useGuidSend(deps));

      await act(async () => {
        await result.current.handleSend();
      });

      expect(kbSyncFolderMock).toHaveBeenCalledWith({ projectId: 'p1', workspace: '/ws/p1' });
      expect(createConversationInvokeMock).toHaveBeenCalled(); // creation did not wait on the sync
      releaseSync?.();
    });

    it('still creates the conversation when the folder sync rejects', async () => {
      kbGetSessionMcpServerMock.mockResolvedValue(null);
      kbSyncFolderMock.mockRejectedValue(new Error('sync exploded'));
      const deps = createDeps();
      deps.projectId = 'p1';
      const { result } = renderHook(() => useGuidSend(deps));

      await act(async () => {
        await result.current.handleSend();
      });

      expect(createConversationInvokeMock).toHaveBeenCalled();
    });

    it('appends the KB session server for a project chat (acp path)', async () => {
      kbGetSessionMcpServerMock.mockResolvedValue(KB_SERVER);
      const deps = createDeps();
      deps.projectId = 'p1';
      const { result } = renderHook(() => useGuidSend(deps));
      await act(async () => {
        await result.current.handleSend();
      });
      expect(kbGetSessionMcpServerMock).toHaveBeenCalledWith({ projectId: 'p1' });
      const payload = createConversationInvokeMock.mock.calls[0][0];
      expect(payload.extra.selected_session_mcp_servers).toEqual(expect.arrayContaining([KB_SERVER]));
      // Pure session server: never referenced by repo-row id lists.
      expect(payload.extra.selected_mcp_server_ids ?? []).not.toContain(KB_SERVER.id);
      expect(payload.assistant?.conversation_overrides?.mcp_ids ?? []).not.toContain(KB_SERVER.id);
    });

    it('appends the KB session server for a project chat (aionrs path)', async () => {
      kbGetSessionMcpServerMock.mockResolvedValue(KB_SERVER);
      const deps = createDeps();
      deps.projectId = 'p1';
      deps.selectedAssistantBackend = 'aionrs';
      deps.current_model = {
        id: 'prov',
        platform: 'openai',
        name: 'P',
        base_url: 'https://x',
        api_key: 'k',
        use_model: 'gpt-4o',
      } as never;
      const { result } = renderHook(() => useGuidSend(deps));
      await act(async () => {
        await result.current.handleSend();
      });
      const payload = createConversationInvokeMock.mock.calls[0][0];
      expect(payload.extra.selected_session_mcp_servers).toEqual(expect.arrayContaining([KB_SERVER]));
    });

    it('creates the conversation without the KB server when the descriptor rejects', async () => {
      kbGetSessionMcpServerMock.mockRejectedValue(new Error('ipc down'));
      const deps = createDeps();
      deps.projectId = 'p1';
      const { result } = renderHook(() => useGuidSend(deps));
      await act(async () => {
        await result.current.handleSend();
      });
      expect(createConversationInvokeMock).toHaveBeenCalledTimes(1);
      const payload = createConversationInvokeMock.mock.calls[0][0];
      const servers = (payload.extra.selected_session_mcp_servers ?? []) as Array<{ name: string }>;
      expect(servers.some((s) => s.name === 'aionui-project-knowledge')).toBe(false);
    });
  });

  it('restores a path-free pending submission across real GuidPage remounts and retries with stable IDs', async () => {
    vi.resetModules();
    const originalElectronAPI = window.electronAPI;
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {} });
    const navigate = vi.fn().mockResolvedValue(undefined);
    const conversationId = '33333333-3333-4333-8333-333333333333';
    const queueItemId = '77777777-7777-4777-8777-777777777777';
    const clientRequestId = '66666666-6666-4666-8666-666666666666';
    const draftClientRequestId = '44444444-4444-4444-8444-444444444444';
    const durableDraftId = '22222222-2222-4222-8222-222222222222';
    const durableSource = {
      grantId: SOURCE_REF.grantId,
      displayName: 'Quarterly Revenue.xlsx',
      format: 'xlsx' as const,
      sourceKind: 'native-picker' as const,
      byteLength: SOURCE_REF.expectedByteLength,
      sha256: SOURCE_REF.expectedSha256,
      expiresAt: '2026-08-06T10:00:00.000Z',
    };
    const durableState = { bound: false };
    const createDraft = vi.fn();
    const hydrate = vi.fn();
    const bindDraft = vi.fn();

    sessionStorage.setItem(
      'guid_presentation_submission_v2',
      JSON.stringify({
        version: 2,
        conversationId,
        queueItemId,
        clientRequestId,
        draftClientRequestId,
        input: 'Restore the quarterly board review',
        selectedTemplateId: 'finance-review',
        sources: [SOURCE_REF],
        runtime: 'acp',
        capturedAt: '2026-08-05T10:00:00.000Z',
      })
    );
    sessionStorage.removeItem('guid_presentation_draft_request_v2');
    getConversationInvokeMock.mockResolvedValue({ id: conversationId });
    startPresentationRunInvokeMock.mockImplementation(
      async (request: { client_request_id: string; conversation_id: string; selected_template_id: string }) => ({
        ok: true,
        run: {
          runId: '55555555-5555-4555-8555-555555555555',
          clientRequestId: request.client_request_id,
          conversationId: request.conversation_id,
          selectedTemplateId: request.selected_template_id,
          revision: 8,
          createdAt: '2026-08-05T10:02:00.000Z',
          updatedAt: '2026-08-05T10:02:00.000Z',
          dispatchStatus: 'committed',
          artifactPhase: 'sources_snapshotted',
          disposition: null,
          retainedCandidate: null,
          actions: { openAllowed: false, discardAllowed: true },
        },
      })
    );

    vi.doMock('@/common/config/constants', async () => ({
      ...(await vi.importActual<typeof import('@/common/config/constants')>('@/common/config/constants')),
      PRESENTATION_RUN_V2_ENABLED: true,
    }));
    vi.doMock('react-i18next', () => ({
      useTranslation: () => ({
        t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
        i18n: { language: 'en-US' },
      }),
    }));
    vi.doMock('react-router-dom', () => ({
      useLocation: () => ({ state: null, key: 'guid-recovery', pathname: '/guid', search: '', hash: '' }),
      useNavigate: () => navigate,
    }));
    vi.doMock('@/renderer/hooks/mcp/catalog', () => ({
      ensureBackendMcpCatalog: vi.fn().mockResolvedValue({ allServers: [] }),
      toSessionMcpServer: (server: unknown) => server,
    }));
    vi.doMock('@/renderer/hooks/chat/useInputFocusRing', () => ({
      useInputFocusRing: () => ({ activeBorderColor: '#000', inactiveBorderColor: '#ccc', activeShadow: 'none' }),
    }));
    vi.doMock('@/renderer/hooks/chat/useSlashCommandController', () => ({
      getFuzzyMatchIndices: vi.fn(),
      useSlashCommandController: () => ({
        activeIndex: 0,
        filteredCommands: [],
        isOpen: false,
        query: '',
        onKeyDown: () => false,
        onSelectByIndex: vi.fn(),
        setActiveIndex: vi.fn(),
      }),
    }));
    vi.doMock('@/renderer/hooks/file/selection', () => ({
      useOpenFileSelector: () => ({ onSlashBuiltinCommand: vi.fn() }),
      usePresentationSourceDraft: () => {
        const [owner, setOwner] = React.useState<
          { owner_type: 'draft'; draft_id: string } | { owner_type: 'conversation'; conversation_id: string } | null
        >(null);
        const [ownerRevision, setOwnerRevision] = React.useState<number | null>(null);
        const [descriptors, setDescriptors] = React.useState<(typeof durableSource)[]>([]);
        const hydrateOwner = React.useCallback(
          async (
            requestedOwner:
              | { owner_type: 'draft'; draft_id: string }
              | { owner_type: 'conversation'; conversation_id: string }
          ) => {
            hydrate(requestedOwner);
            if (requestedOwner.owner_type === 'conversation' && !durableState.bound) {
              setOwner(requestedOwner);
              setOwnerRevision(0);
              setDescriptors([]);
              return { ok: true as const, owner: requestedOwner, ownerRevision: 0, grants: [] };
            }
            const nextOwner =
              requestedOwner.owner_type === 'conversation'
                ? requestedOwner
                : { owner_type: 'draft' as const, draft_id: durableDraftId };
            const nextRevision = requestedOwner.owner_type === 'conversation' ? 4 : 3;
            setOwner(nextOwner);
            setOwnerRevision(nextRevision);
            setDescriptors([durableSource]);
            return { ok: true as const, owner: nextOwner, ownerRevision: nextRevision, grants: [durableSource] };
          },
          []
        );
        const createSourceDraft = React.useCallback(async (requestId: string) => {
          createDraft(requestId);
          setOwner({ owner_type: 'draft', draft_id: durableDraftId });
          setOwnerRevision(3);
          setDescriptors([durableSource]);
          return {
            ok: true as const,
            status: 'existing' as const,
            draft: {
              draftId: durableDraftId,
              revision: 3,
              expiresAt: '2026-08-06T10:00:00.000Z',
              grantCount: 1,
            },
          };
        }, []);
        const bindSourceDraft = React.useCallback(
          async (targetConversationId: string) => {
            bindDraft(targetConversationId);
            if (owner?.owner_type !== 'draft') return null;
            durableState.bound = true;
            setOwner({ owner_type: 'conversation', conversation_id: targetConversationId });
            setOwnerRevision(4);
            return {
              ok: true as const,
              status: 'bound' as const,
              draftId: owner.draft_id,
              conversationId: targetConversationId,
              revision: 4,
              boundAt: '2026-08-05T10:01:00.000Z',
            };
          },
          [owner]
        );
        return {
          owner,
          ownerRevision,
          descriptors,
          sourceRefs: descriptors.map((descriptor) => ({
            grantId: descriptor.grantId,
            expectedByteLength: descriptor.byteLength,
            expectedSha256: descriptor.sha256,
          })),
          pending: false,
          hydrate: hydrateOwner,
          createDraft: createSourceDraft,
          pickSources: vi.fn(),
          grantExternalDrop: vi.fn(),
          grantWorkspaceSource: vi.fn(),
          revoke: vi.fn(),
          bindDraft: bindSourceDraft,
          reset: vi.fn(),
        };
      },
    }));
    vi.doMock('@/renderer/components/chat/TemplateGallery', () => ({
      TemplateChipCard: () => null,
      TemplateGalleryButton: () => null,
      TemplateGalleryExpanded: () => null,
      usePresentationTemplates: () => {
        const template = {
          manifest: {
            id: 'finance-review',
            name: 'Finance Review',
            description: 'Finance review deck',
            source: 'builtin' as const,
            format: 'pptx' as const,
          },
        };
        const [selectedTemplate, setSelectedTemplate] = React.useState<typeof template | null>(null);
        return {
          selectedTemplate,
          templates: [template],
          templatesLoading: false,
          galleryOpen: false,
          openGallery: vi.fn(),
          closeGallery: vi.fn(),
          toggleGallery: vi.fn(),
          selectTemplate: setSelectedTemplate,
          clearSelection: () => setSelectedTemplate(null),
          importFromDialog: vi.fn(),
          removeTemplate: vi.fn(),
          composeSend: vi.fn(),
        };
      },
    }));
    vi.doMock('@/renderer/pages/guid/hooks/useGuidInput', () => ({
      useGuidInput: () => {
        const [input, setInput] = React.useState('');
        const [files, setFiles] = React.useState<string[]>([]);
        const [dir, setDir] = React.useState('');
        const [projectId, setProjectId] = React.useState<string | undefined>(undefined);
        const [loading, setLoading] = React.useState(false);
        return {
          input,
          setInput,
          files,
          setFiles,
          dir,
          setDir,
          projectId,
          setProjectId,
          loading,
          setLoading,
          isInputFocused: false,
          isFileDragging: false,
          dragHandlers: {},
          onPaste: vi.fn(),
          handleTextareaFocus: vi.fn(),
          handleTextareaBlur: vi.fn(),
          handleFilesUploaded: vi.fn(),
          handleRemoveFile: vi.fn(),
        };
      },
    }));
    vi.doMock('@/renderer/pages/guid/hooks/useGuidAssistantSelection', () => ({
      useGuidAssistantSelection: () => ({
        selectedAssistantId: 'assistant-acp',
        selectedAssistant: { id: 'assistant-acp', agent: { type: 'acp', source: 'builtin' } },
        selectedAssistantBackend: 'claude',
        selectedMode: 'default',
        setSelectedMode: vi.fn(),
        selectedAcpModel: 'claude-opus',
        setSelectedAcpModel: vi.fn(),
        selectedThoughtLevelValue: '',
        setSelectedThoughtLevelValue: vi.fn(),
        currentAcpCachedModelInfo: null,
        currentAgentAvailableCommands: [],
        currentAgentModeOptions: [],
        currentThoughtLevelOption: null,
        setSelectedAssistantId: vi.fn(),
        assistants: [],
      }),
    }));
    vi.doMock('@/renderer/pages/guid/hooks/useGuidModelSelection', () => ({
      useGuidModelSelection: () => ({
        modelList: [],
        isGoogleAuth: false,
        current_model: undefined,
        setCurrentModel: vi.fn(),
        resetCurrentModel: vi.fn(),
      }),
    }));
    vi.doMock('@/renderer/pages/guid/hooks/useTypewriterPlaceholder', () => ({
      useTypewriterPlaceholder: () => '',
    }));
    vi.doMock('@/renderer/pages/guid/utils/assistantDefaults', () => ({
      resolveGuidAssistantDefaults: () => ({ disabledBuiltinSkillIds: [], skillIds: [], mcpIds: [] }),
    }));
    vi.doMock('@/renderer/components/chat/SlashCommandMenu', () => ({ default: () => null }));
    vi.doMock('@/renderer/components/chat/SpeechInputButton', () => ({ default: () => null }));
    vi.doMock('@/renderer/hooks/system/useLiveTranscriptInsertion', () => ({
      useLiveTranscriptInsertion: () => ({ handleLiveTranscript: vi.fn() }),
    }));
    vi.doMock('@/renderer/hooks/system/useSpeechInput', () => ({
      appendSpeechTranscript: (previous: string, transcript: string) => `${previous}${transcript}`,
    }));
    vi.doMock('@/renderer/pages/guid/components/AssistantSelectionArea', () => ({ default: () => null }));
    vi.doMock('@/renderer/pages/guid/components/GuidModelSelector', () => ({ default: () => null }));
    vi.doMock('@/renderer/pages/guid/components/GuidActionRow', () => ({
      default: (props: { isButtonDisabled: boolean; onSend: () => void }) =>
        React.createElement(
          'button',
          { 'data-testid': 'guid-recovery-send', disabled: props.isButtonDisabled, onClick: props.onSend },
          'Send'
        ),
    }));
    vi.doMock('@/renderer/pages/guid/components/GuidInputCard', () => ({
      default: (props: {
        actionRow: React.ReactNode;
        input: string;
        presentationSourceDescriptors?: Array<{ displayName: string }>;
      }) =>
        React.createElement(
          'div',
          null,
          React.createElement('span', { 'data-testid': 'guid-recovery-input' }, props.input),
          ...(props.presentationSourceDescriptors ?? []).map((descriptor) =>
            React.createElement('span', { key: descriptor.displayName }, descriptor.displayName)
          ),
          props.actionRow
        ),
    }));
    vi.doMock('@icon-park/react', () => ({
      FolderOpen: () => null,
      Layers: () => null,
      Lightning: () => null,
      Paperclip: () => null,
      Star: () => null,
    }));

    const { default: GuidPage } = await import('@/renderer/pages/guid/GuidPage');
    const first = render(React.createElement(GuidPage));
    await waitFor(() => {
      expect(screen.getByTestId('guid-recovery-input')).toHaveTextContent('Restore the quarterly board review');
      expect(screen.getByText('Quarterly Revenue.xlsx')).toBeInTheDocument();
    });
    first.unmount();

    render(React.createElement(GuidPage));
    await waitFor(() => {
      expect(screen.getByTestId('guid-recovery-input')).toHaveTextContent('Restore the quarterly board review');
      expect(screen.getByText('Quarterly Revenue.xlsx')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('guid-recovery-send'));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(`/conversation/${conversationId}`));

    expect(createDraft).toHaveBeenCalledWith(draftClientRequestId);
    expect(bindDraft).toHaveBeenCalledWith(conversationId);
    expect(startPresentationRunInvokeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        client_request_id: clientRequestId,
        conversation_id: conversationId,
        selected_template_id: 'finance-review',
        sources: [SOURCE_REF],
      })
    );
    expect(JSON.stringify(startPresentationRunInvokeMock.mock.calls)).not.toContain('/');
    expect(sessionStorage.getItem('guid_presentation_submission_v2')).toBeNull();
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: originalElectronAPI });
  });
});
