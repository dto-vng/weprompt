/**
 * @vitest-environment jsdom
 */

import type { TChatConversation } from '@/common/config/storage';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.fn();
const updateMock = vi.fn();
const removeMock = vi.fn();
const getMock = vi.fn();
const emitMock = vi.fn();
const modalConfirmMock = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      update: { invoke: (...args: unknown[]) => updateMock(...args) },
      remove: { invoke: (...args: unknown[]) => removeMock(...args) },
      get: { invoke: (...args: unknown[]) => getMock(...args) },
    },
  },
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: { emit: (...args: unknown[]) => emitMock(...args) },
}));

// Modal.confirm and Message are Arco's imperative, portal-based APIs — real
// invocations render outside the testing-library tree, so (matching this
// suite's own precedent for Arco's imperative APIs, e.g.
// tests/unit/pages/project/ProjectHeader.dom.test.tsx mocking Dropdown/Menu)
// Modal.confirm is stubbed to synchronously run its `onOk`, letting these
// tests assert on the resulting ipcBridge call without needing a real popup.
vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  return {
    ...actual,
    Modal: {
      ...actual.Modal,
      confirm: (options: { onOk?: () => void | Promise<void> }) => {
        modalConfirmMock(options);
        return options.onOk?.();
      },
    },
    Message: { success: vi.fn(), error: vi.fn() },
  };
});

import ProjectChatList from '@renderer/pages/project/components/ProjectChatList';

const makeChat = (id: string, name: string, desc?: string, modified_at = Date.now()): TChatConversation =>
  ({
    id,
    name,
    desc,
    modified_at,
    extra: {},
    created_at: 0,
    type: 'acp',
    model: {},
  }) as unknown as TChatConversation;

describe('ProjectChatList', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    updateMock.mockReset().mockResolvedValue(true);
    removeMock.mockReset().mockResolvedValue(true);
    getMock.mockReset().mockResolvedValue(null);
    emitMock.mockReset();
    modalConfirmMock.mockReset();
  });

  it('renders a row per chat with its title and snippet', () => {
    render(
      <ProjectChatList chats={[makeChat('c1', 'Chat one', 'Last message preview'), makeChat('c2', 'Chat two')]} />
    );

    expect(screen.getByText('Chat one')).toBeInTheDocument();
    expect(screen.getByText('Last message preview')).toBeInTheDocument();
    expect(screen.getByText('Chat two')).toBeInTheDocument();
  });

  it('omits the snippet line when a chat has no desc', () => {
    render(<ProjectChatList chats={[makeChat('c1', 'Chat one')]} />);

    const title = screen.getByText('Chat one');
    expect(title).toBeInTheDocument();
    // No stray empty snippet node — the title's wrapper has no sibling description element.
    expect(title.parentElement?.children.length).toBe(1);
  });

  it('navigates to the conversation when a row is clicked', () => {
    render(<ProjectChatList chats={[makeChat('c1', 'Chat one')]} />);

    fireEvent.click(screen.getByText('Chat one'));

    expect(navigateMock).toHaveBeenCalledExactlyOnceWith('/conversation/c1');
  });

  it('shows a count badge matching the number of chats', () => {
    render(<ProjectChatList chats={[makeChat('c1', 'Chat one'), makeChat('c2', 'Chat two')]} />);

    expect(screen.getByText('conversation.projectHome.chats')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('shows only the first 5 chats until "Show all" is clicked, then shows all of them', () => {
    const chats = Array.from({ length: 7 }, (_, index) => makeChat(`c${index}`, `Chat ${index}`));
    render(<ProjectChatList chats={chats} />);

    expect(screen.getByText('Chat 4')).toBeInTheDocument();
    expect(screen.queryByText('Chat 5')).not.toBeInTheDocument();
    expect(screen.queryByText('Chat 6')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('conversation.projectHome.showAll'));

    expect(screen.getByText('Chat 4')).toBeInTheDocument();
    expect(screen.getByText('Chat 5')).toBeInTheDocument();
    expect(screen.getByText('Chat 6')).toBeInTheDocument();
  });

  it('hides the "Show all" toggle once all chats are already shown', () => {
    const chats = Array.from({ length: 7 }, (_, index) => makeChat(`c${index}`, `Chat ${index}`));
    render(<ProjectChatList chats={chats} />);

    fireEvent.click(screen.getByText('conversation.projectHome.showAll'));

    expect(screen.queryByText('conversation.projectHome.showAll')).not.toBeInTheDocument();
  });

  it('does not show the "Show all" toggle when there are 5 or fewer chats', () => {
    const chats = Array.from({ length: 5 }, (_, index) => makeChat(`c${index}`, `Chat ${index}`));
    render(<ProjectChatList chats={chats} />);

    expect(screen.queryByText('conversation.projectHome.showAll')).not.toBeInTheDocument();
  });

  it('renders the empty state when there are no chats', () => {
    render(<ProjectChatList chats={[]} />);

    expect(screen.getByText('conversation.projectHome.emptyChatsTitle')).toBeInTheDocument();
    expect(screen.getByText('conversation.projectHome.emptyChatsBody')).toBeInTheDocument();
    expect(screen.queryByTestId(/project-chat-row-/)).not.toBeInTheDocument();
  });

  it('toggles pin via the conversation update API and refreshes history on success', async () => {
    render(<ProjectChatList chats={[makeChat('c1', 'Chat one')]} />);

    fireEvent.click(screen.getByTestId('project-chat-pin-c1'));

    await vi.waitFor(() => {
      expect(emitMock).toHaveBeenCalledWith('chat.history.refresh');
    });
    expect(updateMock).toHaveBeenCalledExactlyOnceWith({
      id: 'c1',
      updates: { extra: { pinned: true, pinned_at: expect.any(Number) } },
      merge_extra: true,
    });
  });

  it('does not navigate the row when the pin action is clicked', () => {
    render(<ProjectChatList chats={[makeChat('c1', 'Chat one')]} />);

    fireEvent.click(screen.getByTestId('project-chat-pin-c1'));

    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('confirms rename via a Modal and calls the conversation update API', async () => {
    render(<ProjectChatList chats={[makeChat('c1', 'Chat one')]} />);

    fireEvent.click(screen.getByTestId('project-chat-rename-c1'));

    expect(modalConfirmMock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ title: 'conversation.projectHome.rename' })
    );
    await vi.waitFor(() => {
      expect(emitMock).toHaveBeenCalledWith('chat.history.refresh');
    });
    expect(updateMock).toHaveBeenCalledExactlyOnceWith({ id: 'c1', updates: { name: 'Chat one' } });
  });

  it('requires confirmation before deleting, then calls the conversation remove API', async () => {
    render(<ProjectChatList chats={[makeChat('c1', 'Chat one')]} />);

    fireEvent.click(screen.getByTestId('project-chat-delete-c1'));

    expect(modalConfirmMock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ title: 'conversation.history.deleteTitle' })
    );
    // Deleting a chat is irreversible, so the confirm reads as danger (red), not
    // warning (orange). Asserted on the options handed to Modal.confirm because
    // Arco portals the dialog and the styling contract lives in okButtonProps —
    // same reasoning as tests/unit/renderer/conversationDeleteDangerStyling.dom.test.tsx.
    expect(modalConfirmMock.mock.calls[0][0]).toMatchObject({ okButtonProps: { status: 'danger' } });
    await vi.waitFor(() => {
      expect(emitMock).toHaveBeenCalledWith('chat.history.refresh');
    });
    expect(removeMock).toHaveBeenCalledExactlyOnceWith({ id: 'c1' });
  });

  it('does not navigate the row when the delete action is clicked', () => {
    render(<ProjectChatList chats={[makeChat('c1', 'Chat one')]} />);

    fireEvent.click(screen.getByTestId('project-chat-delete-c1'));

    expect(navigateMock).not.toHaveBeenCalled();
  });
});
