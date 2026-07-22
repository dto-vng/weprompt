import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PROJECT_STORAGE_KEY } from '@renderer/pages/conversation/projects/projectStorage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@renderer/hooks/context/ConversationHistoryContext', () => ({
  useConversationHistoryContext: () => ({ conversations: [] }),
}));

// ProjectFilesCard (C5) fetches the workspace tree on mount via ipcBridge —
// mock it so this page-level test stays hermetic (no real IPC/network call).
vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      getFilesByDir: {
        invoke: vi.fn().mockResolvedValue([]),
      },
    },
    shell: {
      showItemInFolder: {
        invoke: vi.fn(),
      },
    },
    dialog: {
      showOpen: {
        invoke: vi.fn(),
      },
    },
  },
}));

import ProjectHomePage from '@renderer/pages/project/ProjectHomePage';

const project = { id: 'p1', name: 'Alpha Project', workspace: '/w/alpha', created_at: 1, updated_at: 1 };

const seedProject = () => window.localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify([project]));

const renderAt = (id: string) =>
  render(
    <MemoryRouter initialEntries={[`/project/${id}`]}>
      <Routes>
        <Route path='/project/:id' element={<ProjectHomePage />} />
      </Routes>
    </MemoryRouter>
  );

describe('ProjectHomePage', () => {
  beforeEach(() => window.localStorage.clear());

  it('renders the hub layout with all five region slots for a known project', () => {
    seedProject();
    renderAt('p1');

    expect(screen.getByTestId('project-home')).toBeInTheDocument();
    expect(screen.getByTestId('project-header-slot')).toBeInTheDocument();
    expect(screen.getByTestId('project-composer-slot')).toBeInTheDocument();
    expect(screen.getByTestId('project-chats-slot')).toBeInTheDocument();
    expect(screen.getByTestId('project-instructions-slot')).toBeInTheDocument();
    expect(screen.getByTestId('project-files-slot')).toBeInTheDocument();
    expect(screen.queryByTestId('project-not-found')).not.toBeInTheDocument();
  });

  it('shows a whole-page not-found state for an unknown project id', () => {
    renderAt('missing');

    expect(screen.getByTestId('project-not-found')).toBeInTheDocument();
    expect(screen.getByText('conversation.projectHome.notFoundTitle')).toBeInTheDocument();
    expect(screen.getByText('conversation.projectHome.notFoundBody')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'conversation.projectHome.backHome' })).toBeInTheDocument();
    expect(screen.queryByTestId('project-home')).not.toBeInTheDocument();
  });
});
