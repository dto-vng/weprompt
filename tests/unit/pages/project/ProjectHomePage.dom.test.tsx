import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PROJECT_STORAGE_KEY } from '@renderer/pages/conversation/projects/projectStorage';

vi.mock('react-i18next', () => ({
  // i18n.language is required alongside t: ProjectNewChatComposer resolves
  // localeKey from it (mirrors GuidPage), so the stub must include it too.
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));

vi.mock('@renderer/hooks/context/ConversationHistoryContext', () => ({
  useConversationHistoryContext: () => ({ conversations: [] }),
}));

// ProjectNewChatComposer now has full parity with GuidPage's composer (model
// + skills/MCP pickers), so it reads its focus-ring colors from ThemeContext
// via useInputFocusRing — mock it so this page-level test doesn't need a
// real ThemeProvider ancestor.
vi.mock('@/renderer/hooks/chat/useInputFocusRing', () => ({
  useInputFocusRing: () => ({
    activeBorderColor: '#000',
    inactiveBorderColor: '#ccc',
    activeShadow: 'none',
  }),
}));

// ProjectNewChatComposer also loads the MCP catalog on mount (mirrors
// GuidPage) — mock it alongside ipcBridge below so this page-level test
// stays hermetic (no real IPC/network call).
vi.mock('@/renderer/hooks/mcp/catalog', () => ({
  ensureBackendMcpCatalog: vi.fn().mockResolvedValue({ allServers: [] }),
}));

// ProjectFilesCard (C5) fetches the workspace tree on mount via ipcBridge,
// ProjectKnowledgeCard's useProjectKnowledge hook fetches sources + subscribes
// to the `updated` push, and ProjectNewChatComposer now fetches the skill
// catalog + (when an assistant is selected) its detail — mock all of them so
// this page-level test stays hermetic (no real IPC/network call).
vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      getFilesByDir: {
        invoke: vi.fn().mockResolvedValue([]),
      },
      listAvailableSkills: {
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
    assistants: {
      get: {
        invoke: vi.fn().mockResolvedValue(null),
      },
    },
    projectKnowledge: {
      listSources: {
        invoke: vi.fn().mockResolvedValue({ sources: [], summary: { fileCount: 0, passageCount: 0, semantic: 'off' } }),
      },
      addSources: {
        invoke: vi.fn(),
      },
      removeSource: {
        invoke: vi.fn(),
      },
      retrySource: {
        invoke: vi.fn(),
      },
      updated: {
        on: vi.fn().mockReturnValue(() => {}),
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

  it('renders the hub layout with all six region slots for a known project', () => {
    seedProject();
    renderAt('p1');

    expect(screen.getByTestId('project-home')).toBeInTheDocument();
    expect(screen.getByTestId('project-header-slot')).toBeInTheDocument();
    expect(screen.getByTestId('project-composer-slot')).toBeInTheDocument();
    expect(screen.getByTestId('project-chats-slot')).toBeInTheDocument();
    expect(screen.getByTestId('project-instructions-slot')).toBeInTheDocument();
    expect(screen.getByTestId('project-knowledge-slot')).toBeInTheDocument();
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
