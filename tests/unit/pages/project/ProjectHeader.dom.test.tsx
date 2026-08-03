/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';

const showItemInFolderMock = vi.fn();
const removeStoreMock = vi.fn();
const navigateMock = vi.fn();
const modalConfirmMock = vi.fn();
const conversationUpdateMock = vi.fn();
const showOpenMock = vi.fn();
const updateProjectMock = vi.fn();
const removeProjectMock = vi.fn();
const findProjectByWorkspaceMock = vi.fn();
const messageSuccessMock = vi.fn();
const messageErrorMock = vi.fn();
const conversationHistoryMock = { conversations: [] as TChatConversation[] };

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    shell: {
      showItemInFolder: { invoke: (...args: unknown[]) => showItemInFolderMock(...args) },
    },
    dialog: {
      showOpen: { invoke: (...args: unknown[]) => showOpenMock(...args) },
    },
    conversation: {
      update: { invoke: (...args: unknown[]) => conversationUpdateMock(...args) },
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
  useConversationHistoryContext: () => conversationHistoryMock,
}));

// The header now branches on what projectStorage reports back, and the real
// module reads and writes jsdom's localStorage — where no project 'p1' exists,
// so `removeProject` would answer `false` and every removal would look failed.
// Same importOriginal shape as the sibling ProjectFilesCard/ProjectInstructionsCard suites.
vi.mock('@renderer/pages/conversation/projects/projectStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@renderer/pages/conversation/projects/projectStorage')>();
  return {
    ...actual,
    updateProject: (...args: Parameters<typeof actual.updateProject>) => updateProjectMock(...args),
    removeProject: (...args: Parameters<typeof actual.removeProject>) => removeProjectMock(...args),
    findProjectByWorkspace: (...args: Parameters<typeof actual.findProjectByWorkspace>) =>
      findProjectByWorkspaceMock(...args),
  };
});

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
  const ActualModal = actual.Modal;
  return {
    ...actual,
    Dropdown,
    Menu,
    // `{ ...actual.Modal }` would drop the component itself — spreading a
    // function yields a plain, non-callable object, so the rename `<Modal>` this
    // header now renders would be an invalid element type. Object.assign keeps
    // the component callable AND carries the statics, with `confirm` still
    // stubbed for the Remove flow.
    Modal: Object.assign((props: React.ComponentProps<typeof ActualModal>) => <ActualModal {...props} />, ActualModal, {
      confirm: (options: { onOk?: () => void | Promise<void> }) => {
        modalConfirmMock(options);
        return options.onOk?.();
      },
    }),
    // Arco's imperative Message mounts through the legacy ReactDOM.render React
    // 18 removed, so left real it throws out of the test as an unhandled error.
    Message: {
      ...actual.Message,
      success: (...args: unknown[]) => messageSuccessMock(...args),
      error: (...args: unknown[]) => messageErrorMock(...args),
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
    conversationUpdateMock.mockReset().mockResolvedValue(true);
    showOpenMock.mockReset().mockResolvedValue(undefined);
    // Both storage mutators answer like the real ones on success: the updated
    // project, and `true` for a row that existed.
    updateProjectMock.mockReset().mockReturnValue({ ...project });
    removeProjectMock.mockReset().mockReturnValue(true);
    findProjectByWorkspaceMock.mockReset().mockReturnValue(null);
    messageSuccessMock.mockReset();
    messageErrorMock.mockReset();
    conversationHistoryMock.conversations = [];
  });

  it('renders the project name and the chats/active subline', () => {
    render(<ProjectHeader project={project} />);

    expect(screen.getByText('Alpha Project')).toBeInTheDocument();
    expect(screen.getByText('conversation.projectHome.metaChats')).toBeInTheDocument();
    expect(screen.getByText('conversation.projectHome.metaActive')).toBeInTheDocument();
  });

  it('shows the full workspace path on hover, since the subline truncates it', async () => {
    render(<ProjectHeader project={{ ...project, workspace: '/a/very/long/workspace/path/alpha' }} />);

    fireEvent.mouseEnter(screen.getByText('/a/very/long/workspace/path/alpha'));

    // Arco renders tooltip content into a portal only once hovered, so both the
    // truncated span and the tooltip copy carry the path by the time it opens.
    await vi.waitFor(() => {
      expect(screen.getAllByText('/a/very/long/workspace/path/alpha').length).toBeGreaterThan(1);
    });
  });

  it('shows the exact moment behind the active-duration token on hover', async () => {
    const lastOpened = Date.UTC(2026, 6, 30, 9, 15);
    render(<ProjectHeader project={{ ...project, last_opened_at: lastOpened }} />);

    fireEvent.mouseEnter(screen.getByText('conversation.projectHome.metaActive'));

    expect(await screen.findByText(new Date(lastOpened).toLocaleString())).toBeInTheDocument();
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

  it('detaches chats without resending immutable runtime snapshots', async () => {
    conversationHistoryMock.conversations = [
      {
        id: 'c1',
        name: 'Artifact chat',
        created_at: 1,
        modified_at: 1,
        type: 'aionrs',
        model: {},
        extra: {
          project_id: 'p1',
          workspace: '/w/alpha',
          custom_workspace: true,
          skills: ['officecli'],
          mcp_servers: ['project-knowledge'],
        },
      } as TChatConversation,
    ];
    render(<ProjectHeader project={project} />);

    fireEvent.click(screen.getByRole('button', { name: 'common.more' }));
    fireEvent.click(screen.getByText('conversation.projectHome.remove'));

    await vi.waitFor(() => {
      expect(conversationUpdateMock).toHaveBeenCalledExactlyOnceWith({
        id: 'c1',
        updates: { extra: { project_id: null, custom_workspace: false } },
        merge_extra: true,
      });
    });
  });

  it('reports a removal that did not go through, and stays on the page', async () => {
    // The project row was already gone, so nothing was removed — navigating
    // away would have claimed a deletion that never happened.
    removeProjectMock.mockReturnValue(false);
    render(<ProjectHeader project={project} />);

    fireEvent.click(screen.getByRole('button', { name: 'common.more' }));
    fireEvent.click(screen.getByText('conversation.projectHome.remove'));

    await vi.waitFor(() => {
      expect(messageErrorMock).toHaveBeenCalledWith('conversation.history.removeProjectStateChanged');
    });
    expect(navigateMock).not.toHaveBeenCalled();
    expect(removeStoreMock).not.toHaveBeenCalled();
  });

  it('keeps the project and shows a retry action when a chat cannot detach', async () => {
    conversationHistoryMock.conversations = [
      {
        id: 'c1',
        name: 'Artifact chat',
        created_at: 1,
        modified_at: 1,
        type: 'aionrs',
        model: {},
        extra: { project_id: 'p1', workspace: '/w/alpha', custom_workspace: true },
      } as TChatConversation,
    ];
    conversationUpdateMock.mockResolvedValue(false);
    render(<ProjectHeader project={project} />);

    fireEvent.click(screen.getByRole('button', { name: 'common.more' }));
    fireEvent.click(screen.getByText('conversation.projectHome.remove'));

    await vi.waitFor(() => {
      expect(messageErrorMock).toHaveBeenCalledWith('conversation.history.removeProjectChatDetachFailed');
    });
    expect(removeProjectMock).not.toHaveBeenCalled();
    expect(removeStoreMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('logs a structured detach code but shows only the safe localized recovery message', async () => {
    conversationHistoryMock.conversations = [
      {
        id: 'c1',
        name: 'Artifact chat',
        created_at: 1,
        modified_at: 1,
        type: 'aionrs',
        model: {},
        extra: { project_id: 'p1', workspace: '/w/alpha', custom_workspace: true },
      } as TChatConversation,
    ];
    conversationUpdateMock.mockRejectedValue(
      Object.assign(new Error('Private backend details'), {
        name: 'BackendHttpError',
        status: 409,
        code: 'IMMUTABLE_EXTRA_FIELD',
      })
    );
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ProjectHeader project={project} />);

    fireEvent.click(screen.getByRole('button', { name: 'common.more' }));
    fireEvent.click(screen.getByText('conversation.projectHome.remove'));

    await vi.waitFor(() => {
      expect(messageErrorMock).toHaveBeenCalledWith('conversation.history.removeProjectChatDetachFailed');
    });
    expect(consoleError).toHaveBeenCalledWith('Failed to remove project:', {
      projectId: 'p1',
      reason: 'chat_detach_failed',
      diagnostics: [{ conversationId: 'c1', code: 'IMMUTABLE_EXTRA_FIELD', status: 409 }],
    });
    expect(messageErrorMock).not.toHaveBeenCalledWith(expect.stringContaining('Private backend details'));
    consoleError.mockRestore();
  });

  it('confirms a successful removal before leaving the page', async () => {
    render(<ProjectHeader project={project} />);

    fireEvent.click(screen.getByRole('button', { name: 'common.more' }));
    fireEvent.click(screen.getByText('conversation.projectHome.remove'));

    await vi.waitFor(() => {
      expect(messageSuccessMock).toHaveBeenCalledWith('conversation.history.removeProjectSuccess');
    });
    expect(navigateMock).toHaveBeenCalledExactlyOnceWith('/guid');
  });

  const openRenameDialog = (): HTMLElement => {
    fireEvent.click(screen.getByRole('button', { name: 'common.more' }));
    // The menu entry and the dialog's title share this string, so scope to the menu.
    fireEvent.click(screen.getAllByText('conversation.projectHome.rename')[0]);
    return screen.getByRole('textbox');
  };

  it('renames the project from a dialog seeded with the current name', () => {
    render(<ProjectHeader project={project} />);

    const input = openRenameDialog();
    expect(input).toHaveValue('Alpha Project');

    fireEvent.change(input, { target: { value: 'Renamed Project' } });
    fireEvent.click(screen.getByRole('button', { name: 'conversation.projectHome.save' }));

    expect(updateProjectMock).toHaveBeenCalledExactlyOnceWith({ id: 'p1', name: 'Renamed Project' });
    expect(messageSuccessMock).toHaveBeenCalledExactlyOnceWith('conversation.history.renameSuccess');
  });

  it('submits the project rename on Enter', () => {
    render(<ProjectHeader project={project} />);

    const input = openRenameDialog();
    fireEvent.change(input, { target: { value: 'Keyboard Project' } });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 });

    expect(updateProjectMock).toHaveBeenCalledExactlyOnceWith({ id: 'p1', name: 'Keyboard Project' });
  });

  it('disables Save for a whitespace-only project name', () => {
    // The old Modal.confirm resolved through its empty-name early return, so Arco
    // closed the dialog and the rename disappeared without a word.
    render(<ProjectHeader project={project} />);

    const input = openRenameDialog();
    fireEvent.change(input, { target: { value: '  ' } });

    expect(screen.getByRole('button', { name: 'conversation.projectHome.save' })).toBeDisabled();
    expect(updateProjectMock).not.toHaveBeenCalled();
  });

  it('reports a rename that failed to persist, and keeps the dialog open', () => {
    updateProjectMock.mockReturnValue(null);
    render(<ProjectHeader project={project} />);

    const input = openRenameDialog();
    fireEvent.change(input, { target: { value: 'Renamed Project' } });
    fireEvent.click(screen.getByRole('button', { name: 'conversation.projectHome.save' }));

    expect(messageErrorMock).toHaveBeenCalledExactlyOnceWith('conversation.history.renameFailed');
    expect(messageSuccessMock).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox')).toHaveValue('Renamed Project');
  });

  it('names the project already using a folder when a relink clashes', async () => {
    showOpenMock.mockResolvedValue(['/w/beta']);
    updateProjectMock.mockImplementation(() => {
      throw new Error('PROJECT_WORKSPACE_DUPLICATE');
    });
    findProjectByWorkspaceMock.mockReturnValue({ ...project, id: 'p2', name: 'Beta Project' });
    render(<ProjectHeader project={project} />);

    fireEvent.click(screen.getByRole('button', { name: 'common.more' }));
    fireEvent.click(screen.getByText('conversation.projectHome.relink'));

    await vi.waitFor(() => {
      expect(messageErrorMock).toHaveBeenCalledExactlyOnceWith('conversation.history.projectDuplicateFolder');
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
