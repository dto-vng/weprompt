/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Message } from '@arco-design/web-react';

const { conversationUpdateMock, navigateMock, removeProjectMock, removeStoreMock, requestPrefillMock, routeState } =
  vi.hoisted(() => ({
    conversationUpdateMock: vi.fn(),
    navigateMock: vi.fn(),
    removeProjectMock: vi.fn(),
    removeStoreMock: vi.fn(),
    requestPrefillMock: vi.fn(),
    routeState: { id: 'current-conversation' as string | undefined },
  }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => (key === 'cron.status.defaultPrompt' ? 'Create with /cron in AionUi' : key),
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useParams: () => ({ id: routeState.id }),
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      remove: { invoke: vi.fn() },
      update: { invoke: (...args: unknown[]) => conversationUpdateMock(...args) },
    },
    projectKnowledge: { removeStore: { invoke: (...args: unknown[]) => removeStoreMock(...args) } },
  },
}));

vi.mock('@/renderer/pages/conversation/projects/projectStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/renderer/pages/conversation/projects/projectStorage')>();
  return { ...actual, removeProject: (...args: unknown[]) => removeProjectMock(...args) };
});

vi.mock('@/renderer/hooks/chat/useSendBoxDraft', () => ({
  requestConversationSendBoxPrefill: requestPrefillMock,
}));

vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  refreshConversationCache: vi.fn(),
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: { emit: vi.fn() },
}));

vi.mock('@/renderer/utils/ui/focus', () => ({
  blockMobileInputFocus: vi.fn(),
  blurActiveElement: vi.fn(),
}));

import { useConversationActions } from '@/renderer/pages/conversation/GroupedHistory/hooks/useConversationActions';

const makeConversation = (id: string, type: TChatConversation['type']): TChatConversation =>
  ({
    id,
    type,
    name: id,
    created_at: 1,
    modified_at: 1,
    extra: type === 'acp' ? { backend: 'claude' } : {},
    model: {},
  }) as TChatConversation;

const renderActions = (onSessionClick?: () => void) =>
  renderHook(() =>
    useConversationActions({
      batchMode: false,
      onSessionClick,
      selectedConversationIds: new Set(),
      setSelectedConversationIds: vi.fn(),
      toggleSelectedConversation: vi.fn(),
      markAsRead: vi.fn(),
    })
  );

describe('create scheduled task conversation action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeState.id = 'current-conversation';
  });

  it('prefills the current editable conversation without navigating', () => {
    const { result } = renderActions();

    act(() => result.current.handleCreateCronTask(makeConversation('current-conversation', 'acp')));

    expect(requestPrefillMock).toHaveBeenCalledWith('current-conversation', 'Create with /cron in AionUi');
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('queues the target-scoped prefill before navigating to a background conversation', () => {
    const onSessionClick = vi.fn();
    const { result } = renderActions(onSessionClick);

    act(() => result.current.handleCreateCronTask(makeConversation('background-conversation', 'aionrs')));

    expect(requestPrefillMock).toHaveBeenCalledWith('background-conversation', 'Create with /cron in AionUi');
    expect(navigateMock).toHaveBeenCalledWith('/conversation/background-conversation');
    expect(requestPrefillMock.mock.invocationCallOrder[0]).toBeLessThan(navigateMock.mock.invocationCallOrder[0]);
    expect(onSessionClick).toHaveBeenCalledOnce();
  });

  it.each(['openclaw-gateway', 'nanobot', 'remote', 'gemini', 'codex'])(
    'routes the read-only %s conversation to a draft-preserving Guid prefill',
    (type) => {
      const { result } = renderActions();

      act(() => result.current.handleCreateCronTask(makeConversation(`readonly-${type}`, type)));

      expect(requestPrefillMock).not.toHaveBeenCalled();
      expect(navigateMock).toHaveBeenCalledWith('/guid', {
        state: {
          prefillPrompt: 'Create with /cron in AionUi',
          preservePrefillDraft: true,
          focusPrefill: true,
        },
      });
    }
  );
});

describe('remove project conversation action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    conversationUpdateMock.mockResolvedValue(false);
    removeProjectMock.mockReturnValue(true);
    removeStoreMock.mockResolvedValue(undefined);
  });

  it('keeps project metadata and shows the detach recovery action in the sidebar flow', async () => {
    const messageError = vi.spyOn(Message, 'error').mockReturnValue(undefined as never);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const projectConversation = {
      ...makeConversation('project-chat', 'aionrs'),
      extra: { project_id: 'project-1', workspace: '/workspace/project', custom_workspace: true },
    } as TChatConversation;
    const { result } = renderActions();

    act(() => result.current.handleRemoveProject('Project One', [projectConversation], 'project-1'));
    await act(async () => result.current.handleRemoveProjectConfirm());

    expect(removeProjectMock).not.toHaveBeenCalled();
    expect(removeStoreMock).not.toHaveBeenCalled();
    expect(messageError).toHaveBeenCalledWith('conversation.history.removeProjectChatDetachFailed');
    expect(consoleError).toHaveBeenCalledWith('Failed to remove project:', {
      projectId: 'project-1',
      reason: 'chat_detach_failed',
      diagnostics: [{ conversationId: 'project-chat', code: 'DETACH_REJECTED' }],
    });

    messageError.mockRestore();
    consoleError.mockRestore();
  });
});
