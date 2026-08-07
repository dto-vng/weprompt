/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ForgeProject } from '@/common/types/project/projectTypes';
import type { TChatConversation } from '@/common/config/storage';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.fn();
const conversationsHarness = vi.hoisted(() => ({
  expandedWorkspaces: [] as string[],
  timelineSections: [] as Array<Record<string, unknown>>,
  handleToggleWorkspace: vi.fn(),
}));
const projectCreateHarness = vi.hoisted(() => ({
  onCreated: undefined as ((project: ForgeProject) => void) | undefined,
  refreshProjects: vi.fn(),
}));

const project: ForgeProject = {
  id: 'p1',
  name: 'Alpha Project',
  workspace: '/w/alpha',
  created_at: 1,
  updated_at: 1,
};

const projectConversation = (id: string): TChatConversation => ({
  id,
  name: `Project chat ${id}`,
  created_at: 1,
  updated_at: 1,
  status: 'finished',
  platform: 'acp',
  extra: { backend: 'codex', project_id: project.id, workspace: project.workspace },
});

const setProjectChats = (conversations: TChatConversation[]): void => {
  conversationsHarness.timelineSections = [
    {
      timeline: 'Today',
      items: [
        {
          type: 'workspace',
          time: 1,
          workspaceGroup: {
            workspace: project.workspace,
            display_name: project.name,
            conversations,
          },
        },
      ],
    },
  ];
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@/renderer/pages/cron', () => ({
  useCronJobsMap: () => ({
    getJobStatus: () => 'none',
    markAsRead: vi.fn(),
    setActiveConversation: vi.fn(),
  }),
}));

vi.mock('@/renderer/components/base/AionModal', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/renderer/components/settings/DirectorySelectionModal', () => ({
  default: () => null,
}));

vi.mock('@/renderer/pages/conversation/GroupedHistory/ConversationRow', () => ({
  default: ({ conversation }: { conversation: TChatConversation }) => (
    <div data-testid={`project-conversation-${conversation.id}`}>{conversation.name}</div>
  ),
}));

vi.mock('@/renderer/pages/conversation/GroupedHistory/SortableConversationRow', () => ({
  default: () => null,
}));

vi.mock('@/renderer/pages/conversation/GroupedHistory/DragOverlayContent', () => ({
  default: () => null,
}));

vi.mock('@/renderer/pages/conversation/projects/ProjectCreateModal', () => ({
  ProjectCreateModal: ({ onCreated }: { onCreated: (project: ForgeProject) => void }) => {
    projectCreateHarness.onCreated = onCreated;
    return null;
  },
}));

vi.mock('@/renderer/pages/conversation/projects/useProjects', () => ({
  useProjects: () => ({ projects: [project], refreshProjects: projectCreateHarness.refreshProjects }),
}));

vi.mock('@/renderer/pages/conversation/GroupedHistory/hooks/useConversations', () => ({
  useConversations: () => ({
    conversations: [],
    isConversationGenerating: () => false,
    getCompletion: () => undefined,
    getRecentFailureAt: () => undefined,
    getRecentStoppedAt: () => undefined,
    expandedWorkspaces: conversationsHarness.expandedWorkspaces,
    pinnedConversations: [],
    timelineSections: conversationsHarness.timelineSections,
    handleToggleWorkspace: conversationsHarness.handleToggleWorkspace,
    collapsedSections: new Set<string>(),
    toggleSection: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/conversation/GroupedHistory/hooks/useConversationActions', () => ({
  useConversationActions: () => ({
    renameModalVisible: false,
    renameModalName: '',
    setRenameModalName: vi.fn(),
    renameLoading: false,
    dropdownVisibleId: null,
    handleConversationClick: vi.fn(),
    handleDeleteClick: vi.fn(),
    handleBatchDelete: vi.fn(),
    handleEditStart: vi.fn(),
    handleRenameConfirm: vi.fn(),
    handleRenameCancel: vi.fn(),
    handleTogglePin: vi.fn(),
    handleMenuVisibleChange: vi.fn(),
    handleOpenMenu: vi.fn(),
    handleRemoveProject: vi.fn(),
    removeProjectTarget: null,
    removeProjectLoading: false,
    handleRemoveProjectCancel: vi.fn(),
    handleRemoveProjectConfirm: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/conversation/GroupedHistory/hooks/useExport', () => ({
  useExport: () => ({
    exportTask: null,
    exportModalVisible: false,
    exportTargetPath: '',
    exportModalLoading: false,
    showExportDirectorySelector: false,
    setShowExportDirectorySelector: vi.fn(),
    closeExportModal: vi.fn(),
    handleSelectExportDirectoryFromModal: vi.fn(),
    handleSelectExportFolder: vi.fn(),
    handleConfirmExport: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/conversation/GroupedHistory/hooks/useDragAndDrop', () => ({
  useDragAndDrop: () => ({
    sensors: [],
    activeId: null,
    activeConversation: null,
    handleDragStart: vi.fn(),
    handleDragEnd: vi.fn(),
    handleDragCancel: vi.fn(),
    isDragEnabled: false,
  }),
}));

import WorkspaceGroupedHistory from '@/renderer/pages/conversation/GroupedHistory';

const renderSidebar = (): void => {
  render(
    <MemoryRouter>
      <WorkspaceGroupedHistory onBatchModeChange={vi.fn()} />
    </MemoryRouter>
  );
};

const newChatAction = (): HTMLElement => screen.getByLabelText('conversation.history.newConversationInProject');
const menuAction = (): HTMLElement => screen.getByLabelText('conversation.history.projectActions');

/**
 * The project row's hover actions used to render as oversized detached boxes
 * overlapping the row: two 20px buttons crammed into a 22px in-flow slot, with
 * `.arco-btn`'s own `display` beating the `hidden` / `group-hover:flex`
 * utilities so they never hid in the first place. They now mirror
 * `ConversationRow`: absolutely positioned, vertically centred, right-aligned,
 * and revealed on hover.
 */
describe('sidebar project row actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    conversationsHarness.expandedWorkspaces = [];
    conversationsHarness.timelineSections = [];
    conversationsHarness.handleToggleWorkspace.mockReset();
    projectCreateHarness.onCreated = undefined;
    projectCreateHarness.refreshProjects.mockReset();
  });

  it('places both actions in one right-aligned, vertically centred slot', () => {
    renderSidebar();

    const slot = newChatAction().parentElement?.parentElement;

    expect(slot).toHaveClass('absolute', 'right-8px', 'top-1/2', '-translate-y-1/2', 'items-center');
    expect(menuAction().parentElement?.parentElement).toBe(slot);
  });

  it('takes no layout width, so the row cannot be overlapped by its own actions', () => {
    renderSidebar();

    // The fixed 22px slot could not hold two 20px buttons; they spilled left
    // over the project name.
    expect(newChatAction().parentElement?.parentElement).not.toHaveClass('w-22px');
  });

  it('keeps both actions hidden until the row is hovered', () => {
    renderSidebar();

    expect(newChatAction().parentElement).toHaveClass('hidden', 'group-hover:flex');
    expect(menuAction().parentElement).toHaveClass('hidden', 'group-hover:flex');
  });

  it('sizes both actions to the 20px icon-button footprint used elsewhere in the sidebar', () => {
    renderSidebar();

    for (const action of [newChatAction(), menuAction()]) {
      expect(action).toHaveClass('!w-20px', '!h-20px', '!p-0', 'sider-action-btn');
    }
  });

  it('still starts a new chat in the project from the plus action', () => {
    renderSidebar();
    fireEvent.click(newChatAction());

    expect(navigateMock).toHaveBeenCalledExactlyOnceWith('/guid', {
      state: { workspace: '/w/alpha', projectId: 'p1' },
    });
  });

  it('opens the encoded Project Home route after project creation completes', () => {
    renderSidebar();

    act(() => {
      projectCreateHarness.onCreated?.({
        ...project,
        id: 'created/project',
        name: 'Created Project',
        workspace: '/w/created',
      });
    });

    expect(projectCreateHarness.refreshProjects).toHaveBeenCalledOnce();
    expect(navigateMock).toHaveBeenCalledExactlyOnceWith('/project/created%2Fproject');
  });

  it('does not navigate when the row menu is opened', () => {
    renderSidebar();
    fireEvent.click(menuAction());

    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('does not show a chat disclosure for a project with no chats', () => {
    renderSidebar();

    expect(screen.queryByLabelText('conversation.history.expandProjectChats')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('conversation.history.collapseProjectChats')).not.toBeInTheDocument();
  });

  it('shows a dedicated collapsed disclosure for a project with one chat', () => {
    setProjectChats([projectConversation('c1')]);
    renderSidebar();

    const disclosure = screen.getByLabelText('conversation.history.expandProjectChats');
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    expect(disclosure.querySelector('.i-icon-right')).not.toHaveClass('rotate-90');
    expect(screen.queryByTestId('project-conversation-c1')).not.toBeInTheDocument();

    fireEvent.click(disclosure);

    expect(conversationsHarness.handleToggleWorkspace).toHaveBeenCalledExactlyOnceWith(project.workspace);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('shows an expanded disclosure and every chat for a project with multiple chats', () => {
    setProjectChats([projectConversation('c1'), projectConversation('c2')]);
    conversationsHarness.expandedWorkspaces = [project.workspace];
    renderSidebar();

    expect(screen.getByLabelText('conversation.history.collapseProjectChats')).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByLabelText('conversation.history.collapseProjectChats').querySelector('.i-icon-right')
    ).toHaveClass('rotate-90');
    expect(screen.getByTestId('project-conversation-c1')).toBeVisible();
    expect(screen.getByTestId('project-conversation-c2')).toBeVisible();
  });

  it('activates the project chat disclosure from the keyboard without navigating', async () => {
    const user = userEvent.setup();
    setProjectChats([projectConversation('c1')]);
    renderSidebar();

    const disclosure = screen.getByLabelText('conversation.history.expandProjectChats');
    expect(disclosure.className).toContain('focus-visible:[outline:2px_solid_rgb(var(--primary-6))]');
    disclosure.focus();
    await user.keyboard('{Enter}');

    expect(conversationsHarness.handleToggleWorkspace).toHaveBeenCalledExactlyOnceWith(project.workspace);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('continues to open Project Home when the project name is clicked', () => {
    setProjectChats([projectConversation('c1')]);
    renderSidebar();

    fireEvent.click(screen.getByText(project.name));

    expect(navigateMock).toHaveBeenCalledExactlyOnceWith('/project/p1');
    expect(conversationsHarness.handleToggleWorkspace).not.toHaveBeenCalled();
  });
});
