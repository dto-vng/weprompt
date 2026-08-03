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
const messageSuccessMock = vi.fn();
const messageErrorMock = vi.fn();

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
  const ActualModal = actual.Modal;
  return {
    ...actual,
    // `{ ...actual.Modal }` would drop the component itself — spreading a
    // function yields a plain, non-callable object, so the rename `<Modal>` this
    // file now renders would be an invalid element type. Object.assign keeps the
    // component callable AND carries the statics, with `confirm` still stubbed
    // for the delete flow (Arco's imperative confirm mounts through the legacy
    // ReactDOM.render React 18 removed).
    Modal: Object.assign((props: React.ComponentProps<typeof ActualModal>) => <ActualModal {...props} />, ActualModal, {
      confirm: (options: { onOk?: () => void | Promise<void> }) => {
        modalConfirmMock(options);
        return options.onOk?.();
      },
    }),
    Message: {
      success: (...args: unknown[]) => messageSuccessMock(...args),
      error: (...args: unknown[]) => messageErrorMock(...args),
    },
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
    messageSuccessMock.mockReset();
    messageErrorMock.mockReset();
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

  it('opens the conversation from the keyboard', () => {
    render(<ProjectChatList chats={[makeChat('c1', 'Chat one')]} />);

    const row = screen.getByTestId('project-chat-row-c1');
    expect(row).toHaveAttribute('role', 'button');
    expect(row).toHaveAttribute('tabindex', '0');
    expect(row).toHaveAttribute('aria-label', 'Chat one');

    fireEvent.keyDown(row, { key: 'Enter' });
    expect(navigateMock).toHaveBeenCalledExactlyOnceWith('/conversation/c1');

    fireEvent.keyDown(row, { key: ' ' });
    expect(navigateMock).toHaveBeenCalledTimes(2);
  });

  it('reveals the row actions on keyboard focus, not on hover alone', () => {
    render(<ProjectChatList chats={[makeChat('c1', 'Chat one')]} />);

    // jsdom evaluates no Uno classes, so the reveal contract is asserted on the
    // variant being present — the same way ConversationRow's suite does it. The
    // cluster is `display: none` until the row (which is now focusable) matches
    // `:focus-within`, which is what puts these buttons in the tab order.
    const actions = screen.getByTestId('project-chat-actions-c1');
    expect(actions.className).toContain('group-focus-within:flex');
    expect(screen.getByTestId('project-chat-row-c1').className).toContain('focus-visible:');
  });

  it('does not also open the conversation when a row action is keyed', () => {
    render(<ProjectChatList chats={[makeChat('c1', 'Chat one')]} />);

    fireEvent.keyDown(screen.getByTestId('project-chat-pin-c1'), { key: 'Enter' });

    // Enter on a focused action must not bubble into the row handler and
    // navigate away from the action the user just took.
    expect(navigateMock).not.toHaveBeenCalled();
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

  it('collapses the list again from the same control', () => {
    // The control used to unmount on first use, so expanding was a one-way latch.
    const chats = Array.from({ length: 7 }, (_, index) => makeChat(`c${index}`, `Chat ${index}`));
    render(<ProjectChatList chats={chats} />);

    fireEvent.click(screen.getByText('conversation.projectHome.showAll'));

    expect(screen.getByText('conversation.projectHome.showLess')).toBeInTheDocument();
    expect(screen.queryByText('conversation.projectHome.showAll')).not.toBeInTheDocument();
    expect(screen.getByText('Chat 6')).toBeInTheDocument();

    fireEvent.click(screen.getByText('conversation.projectHome.showLess'));

    expect(screen.getByText('conversation.projectHome.showAll')).toBeInTheDocument();
    expect(screen.getByText('Chat 4')).toBeInTheDocument();
    expect(screen.queryByText('Chat 5')).not.toBeInTheDocument();
    expect(screen.queryByText('Chat 6')).not.toBeInTheDocument();
  });

  it('reports its expanded state to assistive technology', () => {
    const chats = Array.from({ length: 7 }, (_, index) => makeChat(`c${index}`, `Chat ${index}`));
    render(<ProjectChatList chats={chats} />);

    const toggle = screen.getByRole('button', { name: 'conversation.projectHome.showAll' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);

    expect(screen.getByRole('button', { name: 'conversation.projectHome.showLess' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
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

  it('renames a chat from the rename dialog, seeded with the current name', async () => {
    render(<ProjectChatList chats={[makeChat('c1', 'Chat one')]} />);

    fireEvent.click(screen.getByTestId('project-chat-rename-c1'));

    // A declarative Modal, so nothing reaches Modal.confirm any more. Arco
    // portals it to document.body, which `screen` queries reach.
    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('Chat one');

    fireEvent.change(input, { target: { value: 'Renamed chat' } });
    fireEvent.click(screen.getByRole('button', { name: 'conversation.projectHome.save' }));

    await vi.waitFor(() => {
      expect(emitMock).toHaveBeenCalledWith('chat.history.refresh');
    });
    expect(updateMock).toHaveBeenCalledExactlyOnceWith({ id: 'c1', updates: { name: 'Renamed chat' } });
    expect(messageSuccessMock).toHaveBeenCalledWith('conversation.history.renameSuccess');
    expect(modalConfirmMock).not.toHaveBeenCalled();
  });

  it('submits the rename on Enter', async () => {
    render(<ProjectChatList chats={[makeChat('c1', 'Chat one')]} />);

    fireEvent.click(screen.getByTestId('project-chat-rename-c1'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Keyboard rename' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', keyCode: 13 });

    await vi.waitFor(() => {
      expect(updateMock).toHaveBeenCalledExactlyOnceWith({ id: 'c1', updates: { name: 'Keyboard rename' } });
    });
  });

  it('disables Save for an empty or whitespace-only name instead of silently discarding it', () => {
    // The old confirm resolved through its empty-name early return, which made
    // Arco close the dialog — the rename vanished with no feedback at all.
    render(<ProjectChatList chats={[makeChat('c1', 'Chat one')]} />);

    fireEvent.click(screen.getByTestId('project-chat-rename-c1'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } });

    expect(screen.getByRole('button', { name: 'conversation.projectHome.save' })).toBeDisabled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('reports a rename the backend refused, and keeps the dialog open', async () => {
    updateMock.mockResolvedValue(false);
    render(<ProjectChatList chats={[makeChat('c1', 'Chat one')]} />);

    fireEvent.click(screen.getByTestId('project-chat-rename-c1'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Renamed chat' } });
    fireEvent.click(screen.getByRole('button', { name: 'conversation.projectHome.save' }));

    await vi.waitFor(() => {
      expect(messageErrorMock).toHaveBeenCalledWith('conversation.history.renameFailed');
    });
    expect(screen.getByRole('textbox')).toHaveValue('Renamed chat');
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
