/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const showItemInFolderMock = vi.fn();
const removeStoreMock = vi.fn();
const navigateMock = vi.fn();
const modalConfirmMock = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    shell: {
      showItemInFolder: { invoke: (...args: unknown[]) => showItemInFolderMock(...args) },
    },
    dialog: {
      showOpen: { invoke: vi.fn() },
    },
    conversation: {
      update: { invoke: vi.fn() },
    },
    projectKnowledge: {
      removeStore: { invoke: (...args: unknown[]) => removeStoreMock(...args) },
    },
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@renderer/hooks/context/ConversationHistoryContext', () => ({
  useConversationHistoryContext: () => ({ conversations: [] }),
}));

// Dropdown/Menu are mocked so the droplist is always present in the DOM —
// mirrors the proven pattern in tests/unit/chat/CommandQueuePanel.dom.test.tsx,
// avoiding flaky reliance on Arco's real popup/portal open-state under jsdom.
// Modal.confirm is stubbed to synchronously run its `onOk` — matching the
// precedent in tests/unit/pages/project/ProjectChatList.dom.test.tsx for
// Arco's imperative, portal-based confirm API.
vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  const Dropdown = ({ children, droplist }: React.PropsWithChildren<{ droplist: React.ReactNode }>) => (
    <div>
      {children}
      {droplist}
    </div>
  );
  const Menu = ({ children }: React.PropsWithChildren) => <div>{children}</div>;
  Menu.Item = ({
    children,
    onClick,
    className,
  }: React.PropsWithChildren<{ onClick?: () => void; className?: string }>) => (
    <button type='button' onClick={onClick} className={className}>
      {children}
    </button>
  );
  return {
    ...actual,
    Dropdown,
    Menu,
    Modal: {
      ...actual.Modal,
      confirm: (options: { onOk?: () => void | Promise<void> }) => {
        modalConfirmMock(options);
        return options.onOk?.();
      },
    },
  };
});

import ProjectHeader from '@renderer/pages/project/components/ProjectHeader';

const project = {
  id: 'p1',
  name: 'Alpha Project',
  workspace: '/w/alpha',
  created_at: 1,
  updated_at: 1,
};

describe('ProjectHeader', () => {
  beforeEach(() => {
    showItemInFolderMock.mockReset();
    removeStoreMock.mockReset().mockResolvedValue(undefined);
    navigateMock.mockReset();
    modalConfirmMock.mockReset();
  });

  it('renders the project name and the chats/active subline', () => {
    render(<ProjectHeader project={project} />);

    expect(screen.getByText('Alpha Project')).toBeInTheDocument();
    expect(screen.getByText('conversation.projectHome.metaChats')).toBeInTheDocument();
    expect(screen.getByText('conversation.projectHome.metaActive')).toBeInTheDocument();
  });

  it('reveals the project folder from the overflow menu', () => {
    render(<ProjectHeader project={project} />);

    fireEvent.click(screen.getByRole('button', { name: 'common.more' }));
    fireEvent.click(screen.getByText('conversation.projectHome.reveal'));

    expect(showItemInFolderMock).toHaveBeenCalledExactlyOnceWith('/w/alpha');
  });

  it('cleans up the project knowledge store after removing the project', async () => {
    render(<ProjectHeader project={project} />);

    fireEvent.click(screen.getByRole('button', { name: 'common.more' }));
    fireEvent.click(screen.getByText('conversation.projectHome.remove'));

    await vi.waitFor(() => {
      expect(removeStoreMock).toHaveBeenCalledExactlyOnceWith({ projectId: 'p1' });
    });
  });

  it('still completes the project deletion when knowledge-store cleanup rejects', async () => {
    // The cleanup call is fire-and-forget: the project row is already gone by
    // the time it fires, so a rejection here must never throw out of the
    // onOk handler or stop the deletion (navigation away) from completing.
    removeStoreMock.mockRejectedValueOnce(new Error('disk full'));
    render(<ProjectHeader project={project} />);

    fireEvent.click(screen.getByRole('button', { name: 'common.more' }));
    fireEvent.click(screen.getByText('conversation.projectHome.remove'));

    await vi.waitFor(() => {
      expect(navigateMock).toHaveBeenCalledExactlyOnceWith('/guid');
    });
    expect(removeStoreMock).toHaveBeenCalledExactlyOnceWith({ projectId: 'p1' });
  });
});
