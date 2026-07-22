/**
 * @vitest-environment jsdom
 */

import type { TChatConversation } from '@/common/config/storage';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.fn();

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
  beforeEach(() => navigateMock.mockReset());

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

    expect(screen.getByText('Chat one')).toBeInTheDocument();
    // No stray empty snippet node — description content is entirely absent.
    expect(document.querySelector('.arco-list-item-meta-description')).not.toBeInTheDocument();
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
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });
});
