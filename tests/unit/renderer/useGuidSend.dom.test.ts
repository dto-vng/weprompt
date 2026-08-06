/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMcpServer } from '@/common/config/storage';
import { useGuidSend, type GuidSendDeps } from '@/renderer/pages/guid/hooks/useGuidSend';

const createConversationInvokeMock = vi.fn();
const swrMutateMock = vi.fn();
const kbGetSessionMcpServerMock = vi.fn();
const kbSyncFolderMock = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      create: {
        invoke: (...args: unknown[]) => createConversationInvokeMock(...args),
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
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: {
    emit: vi.fn(),
  },
}));

vi.mock('swr', () => ({
  mutate: (...args: unknown[]) => swrMutateMock(...args),
}));

vi.mock('@/renderer/utils/workspace/workspaceHistory', () => ({
  updateWorkspaceTime: vi.fn(),
}));

vi.mock('@arco-design/web-react', () => ({
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

describe('useGuidSend', () => {
  beforeEach(() => {
    createConversationInvokeMock.mockReset();
    createConversationInvokeMock.mockResolvedValue({ id: 'conv-1' });
    swrMutateMock.mockReset();
    swrMutateMock.mockResolvedValue(undefined);
    kbGetSessionMcpServerMock.mockReset();
    kbSyncFolderMock.mockReset().mockResolvedValue(undefined);
    kbGetSessionMcpServerMock.mockResolvedValue(null);
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
});
