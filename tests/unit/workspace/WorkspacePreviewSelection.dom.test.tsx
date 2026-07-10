/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IDirOrFile } from '@/common/adapter/ipcBridge';
import ChatWorkspace from '@/renderer/pages/conversation/Workspace';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureNodeSelected: vi.fn(),
  handlePreviewFile: vi.fn(),
  writeRendererLogInvoke: vi.fn(),
}));
let titlebarProjectSlot: HTMLDivElement | null = null;

const selectedFile: IDirOrFile = {
  name: 'financial-wechat-miniapp.html',
  relativePath: 'financial-wechat-miniapp.html',
  fullPath: '/workspace/financial-wechat-miniapp.html',
  isDir: false,
  isFile: true,
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      getWorkspace: { invoke: vi.fn() },
    },
    application: {
      writeRendererLog: { invoke: mocks.writeRendererLogInvoke },
    },
  },
}));

vi.mock('@/renderer/components/layout/FlexFullContainer', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({
    children,
    className,
    onClick,
    ...props
  }: React.PropsWithChildren<{ className?: string; onClick?: React.MouseEventHandler<HTMLButtonElement> }>) => (
    <button className={className} onClick={onClick} {...props}>
      {children}
    </button>
  ),
  Collapse: Object.assign(
    ({ children }: { children: React.ReactNode }) => <div data-testid='workspace-sections'>{children}</div>,
    {
      Item: ({ header, name, children }: { header: React.ReactNode; name: string; children: React.ReactNode }) => (
        <section data-testid={`workspace-section-${name}`}>
          <div>{header}</div>
          {children}
        </section>
      ),
    }
  ),
  Empty: () => <div data-testid='empty' />,
  Input: ({
    className,
    onChange,
    placeholder,
    value,
  }: {
    className?: string;
    onChange?: (value: string) => void;
    placeholder?: string;
    value?: string;
  }) => (
    <input
      className={className}
      onChange={(event) => onChange?.(event.currentTarget.value)}
      placeholder={placeholder}
      value={value}
    />
  ),
  Message: {
    useMessage: () => [{ error: vi.fn(), success: vi.fn(), info: vi.fn() }, null],
  },
}));

vi.mock('@icon-park/react', () => ({
  BranchOne: () => <span />,
  Down: () => <span />,
  FileText: () => <span />,
  FolderOpen: () => <span />,
  Right: () => <span />,
  Search: () => <span />,
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({
    openPreview: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  getConversationOrNull: vi.fn(async () => null),
}));

vi.mock('@/renderer/utils/emitter', () => ({
  useAddEventListener: vi.fn(),
}));

vi.mock('@/renderer/pages/conversation/Workspace/hooks/useWorkspaceCollapse', () => ({
  useWorkspaceCollapse: () => ({
    isWorkspaceCollapsed: false,
    setIsWorkspaceCollapsed: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/conversation/Workspace/hooks/useWorkspaceTree', () => ({
  useWorkspaceTree: () => ({
    files: [{ name: 'workspace', relativePath: '', fullPath: '/workspace', isFile: false, children: [selectedFile] }],
    loading: false,
    treeKey: 1,
    expandedKeys: [],
    selected: [selectedFile.relativePath],
    selectedKeysRef: { current: [selectedFile.relativePath] },
    selectedNodeRef: { current: null },
    setFiles: vi.fn(),
    setLoading: vi.fn(),
    setExpandedKeys: vi.fn(),
    setSelected: vi.fn(),
    setTreeKey: vi.fn(),
    refreshWorkspace: vi.fn(),
    loadWorkspace: vi.fn(),
    ensureNodeSelected: mocks.ensureNodeSelected,
    clearSelection: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/conversation/Workspace/hooks/useWorkspaceFileOps', () => ({
  useWorkspaceFileOps: () => ({
    handlePreviewFile: mocks.handlePreviewFile,
    handleAddToChat: vi.fn(),
    handleDownloadFile: vi.fn(),
    handleOpenNode: vi.fn(),
    handleRevealNode: vi.fn(),
    handleRenameNode: vi.fn(),
    handleDeleteNode: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/conversation/Workspace/hooks/useFileChanges', () => ({
  useFileChanges: () => ({
    staged: [],
    unstaged: [],
    loading: false,
    snapshotInfo: null,
    refreshChanges: vi.fn(),
    stageFile: vi.fn(),
    stageAll: vi.fn(),
    unstageFile: vi.fn(),
    unstageAll: vi.fn(),
    discardFile: vi.fn(),
    resetFile: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/conversation/Workspace/hooks/useWorkspacePaste', () => ({
  useWorkspacePaste: () => ({
    pasteTargetFolder: null,
    pasteConfirm: { visible: false },
    onFocusPaste: vi.fn(),
    handleFilesToAdd: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/conversation/Workspace/hooks/useWorkspaceDragImport', () => ({
  useWorkspaceDragImport: () => ({
    isDragging: false,
    dragHandlers: {},
  }),
}));

vi.mock('@/renderer/pages/conversation/Workspace/hooks/useWorkspaceSearch', () => ({
  useWorkspaceSearch: () => ({
    showSearch: false,
    searchText: '',
    setShowSearch: vi.fn(),
    setSearchText: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/conversation/Workspace/hooks/useWorkspaceModals', () => ({
  useWorkspaceModals: () => ({
    contextMenu: { visible: false, x: 0, y: 0, node: null },
    renameModal: { visible: false, value: '', target: null },
    deleteModal: { visible: false, target: null, loading: false },
    pasteConfirm: { visible: false, file_name: '', filesToPaste: [], doNotAsk: false, targetFolder: null },
    renameLoading: false,
    setContextMenu: vi.fn(),
    setRenameModal: vi.fn(),
    setDeleteModal: vi.fn(),
    setPasteConfirm: vi.fn(),
    setRenameLoading: vi.fn(),
    closeContextMenu: vi.fn(),
    closeRenameModal: vi.fn(),
    closeDeleteModal: vi.fn(),
    closePasteConfirm: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/conversation/Workspace/hooks/useWorkspaceEvents', () => ({
  useWorkspaceEvents: vi.fn(),
}));

vi.mock('@/renderer/hooks/file/useAbortUploadsOnConversationChange', () => ({
  useAbortUploadsOnConversationChange: vi.fn(),
}));

vi.mock('@/renderer/pages/conversation/Workspace/components/WorkspaceToolbar', () => ({
  default: () => <div data-testid='workspace-toolbar' />,
}));

vi.mock('@/renderer/pages/conversation/Workspace/components/WorkspaceTabBar', () => ({
  default: () => <div data-testid='workspace-tabbar' />,
}));

vi.mock('@/renderer/pages/conversation/Workspace/components/WorkspaceContextMenu', () => ({
  default: () => null,
}));

vi.mock('@/renderer/pages/conversation/Workspace/components/WorkspaceDialogs', () => ({
  default: () => null,
}));

vi.mock('@/renderer/pages/conversation/Workspace/components/PasteConfirmModal', () => ({
  default: () => null,
}));

vi.mock('@/renderer/pages/conversation/Workspace/components/FileChangeList', () => ({
  default: () => null,
}));

vi.mock('@/renderer/pages/conversation/Workspace/components/FileTypeIcon', () => ({
  default: () => <span data-testid='file-type-icon' />,
}));

vi.mock('@/renderer/pages/conversation/contextHandoff/ContextHandoffPanel', () => ({
  default: ({ conversationId, workspace }: { conversationId: string; workspace: string }) => (
    <div data-testid='context-handoff-panel'>
      {conversationId}:{workspace}
    </div>
  ),
}));

describe('ChatWorkspace preview selection', () => {
  beforeEach(() => {
    titlebarProjectSlot = document.createElement('div');
    titlebarProjectSlot.id = 'app-titlebar-project-slot';
    document.body.append(titlebarProjectSlot);
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    titlebarProjectSlot?.remove();
    titlebarProjectSlot = null;
  });

  it('opens preview when a file is selected from the compact Project Files flyout', () => {
    render(<ChatWorkspace conversation_id='conversation-1' workspace='/workspace' />);

    const projectTrigger = screen.getByRole('button', { name: /conversation.workspace.projectMenu.trigger/ });
    expect(titlebarProjectSlot?.contains(projectTrigger)).toBe(true);
    expect(document.querySelector('.chat-workspace .workspace-project-trigger')).toBeNull();

    fireEvent.click(projectTrigger);
    fireEvent.click(screen.getByRole('menuitem', { name: /conversation.workspace.changes.filesTab/ }));
    fireEvent.click(screen.getByRole('button', { name: selectedFile.name }));

    expect(mocks.ensureNodeSelected).toHaveBeenCalledWith(selectedFile);
    expect(mocks.writeRendererLogInvoke).toHaveBeenCalledWith({
      level: 'debug',
      tag: 'Workspace',
      message: 'workspace_file_preview_requested',
      data: {
        fileName: selectedFile.name,
        wasSelected: true,
        hasKey: true,
      },
    });
    expect(mocks.handlePreviewFile).toHaveBeenCalledWith(selectedFile);
    expect(screen.queryByRole('menuitem', { name: /conversation.workspace.changes.filesTab/ })).not.toBeInTheDocument();
  });

  it('renders context management in the project panel for Aionrs workspaces', () => {
    render(<ChatWorkspace conversation_id='conversation-1' workspace='/workspace' eventPrefix='aionrs' />);

    expect(screen.queryByTestId('context-handoff-panel')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /conversation.workspace.projectMenu.trigger/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /conversation.contextHandoff.sectionTitle/ }));

    expect(screen.getByTestId('context-handoff-panel')).toHaveTextContent('conversation-1:/workspace');
  });
});
