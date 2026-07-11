/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mobile: false,
  artifactCollapsed: false,
  resizableSplitOptions: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/renderer/components/agent/AgentBadge', () => ({ AgentLogoIcon: () => null }));

vi.mock('@/renderer/components/layout/FlexFullContainer', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: mocks.mobile, siderCollapsed: false, setSiderCollapsed: vi.fn() }),
}));

vi.mock('@/renderer/hooks/ui/useResizableSplit', () => ({
  useResizableSplit: (options: Record<string, unknown>) => {
    mocks.resizableSplitOptions.push(options);
    let splitRatio = options.defaultWidth as number;
    if (typeof options.storageKey === 'string') {
      try {
        const stored = localStorage.getItem(options.storageKey);
        if (stored) {
          const parsed = parseFloat(stored);
          if (!Number.isNaN(parsed)) {
            splitRatio = parsed;
          }
        }
      } catch {
        // ignore
      }
    }
    return {
      splitRatio,
      setSplitRatio: vi.fn(),
      createDragHandle: () => <div data-testid='split-handle' />,
    };
  },
}));

vi.mock('@/renderer/pages/conversation/components/ChatTitleEditor', () => ({
  default: () => <div data-testid='chat-title' />,
}));

vi.mock('@/renderer/pages/conversation/components/ChatLayout/MobileWorkspaceOverlay', () => ({
  default: () => <div data-testid='mobile-workspace-overlay' />,
}));

vi.mock('@/renderer/pages/conversation/components/ChatLayout/WorkspacePanelHeader', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid='workspace-panel-header'>{children}</div>,
  DesktopWorkspaceToggle: () => null,
}));

vi.mock('@/renderer/pages/conversation/hooks/useContainerWidth', () => ({
  useContainerWidth: () => ({ containerRef: { current: null }, containerWidth: 1200 }),
}));

vi.mock('@/renderer/pages/conversation/hooks/useLayoutConstraints', () => ({ useLayoutConstraints: vi.fn() }));

vi.mock('@/renderer/pages/conversation/hooks/useTitleRename', () => ({
  useTitleRename: () => ({
    editingTitle: false,
    setEditingTitle: vi.fn(),
    titleDraft: '',
    setTitleDraft: vi.fn(),
    renameLoading: false,
    canRenameTitle: false,
    submitTitleRename: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/conversation/hooks/useWorkspaceCollapse', () => ({
  useWorkspaceCollapse: () => ({ rightSiderCollapsed: mocks.artifactCollapsed, setRightSiderCollapsed: vi.fn() }),
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  PreviewPanel: () => <div data-testid='preview-panel' />,
}));

vi.mock('@/renderer/pages/conversation/utils/detectPlatform', () => ({
  isMacEnvironment: () => true,
  isWindowsEnvironment: () => false,
}));

import ChatLayout from '@/renderer/pages/conversation/components/ChatLayout';

const renderLayout = (workspacePresentation: 'panel' | 'project-menu' = 'panel') =>
  render(
    <ChatLayout
      title='Chat'
      sider={<div data-testid='legacy-sider'>workspace</div>}
      workspaceEnabled
      workspacePresentation={workspacePresentation}
    >
      <div data-testid='chat-content'>chat</div>
    </ChatLayout>
  );

describe('ChatLayout chat + artifact two-region split', () => {
  beforeEach(() => {
    mocks.mobile = false;
    mocks.artifactCollapsed = false;
    mocks.resizableSplitOptions.length = 0;
    localStorage.clear();
  });

  afterEach(() => cleanup());

  it('renders the always-open artifact pane without any preview-open flag', () => {
    renderLayout();

    const artifactPane = screen.getByTestId('artifact-pane');
    expect(artifactPane).toBeInTheDocument();
    // The pane opts into the shared drag-handle hover styling.
    expect(artifactPane).toHaveClass('layout-sider');
  });

  it('mounts PreviewPanel inside the artifact pane (not the legacy workspace sider body)', () => {
    renderLayout();

    const artifactPane = screen.getByTestId('artifact-pane');
    const previewPanel = screen.getByTestId('preview-panel');
    expect(previewPanel).toBeInTheDocument();
    expect(artifactPane).toContainElement(previewPanel);
    // props.sider is no longer mounted inside the pane.
    expect(screen.queryByTestId('legacy-sider')).not.toBeInTheDocument();
  });

  it('drives the layout from a single chat<->artifact ratio split', () => {
    renderLayout();

    expect(mocks.resizableSplitOptions).toHaveLength(1);
    expect(mocks.resizableSplitOptions[0]).toEqual(
      expect.objectContaining({ unit: 'ratio', defaultWidth: 50, storageKey: 'chat-artifact-split-ratio' })
    );
  });

  it('initializes the chat width from the persisted chat-artifact-split-ratio', () => {
    localStorage.setItem('chat-artifact-split-ratio', '40');
    renderLayout();

    expect(screen.getByTestId('chat-layout-chat-pane')).toHaveStyle({ flexBasis: '40%' });
  });

  it('removes the artifact pane from the DOM when collapsed and gives chat the full width', () => {
    mocks.artifactCollapsed = true;
    renderLayout();

    expect(screen.queryByTestId('artifact-pane')).not.toBeInTheDocument();
    expect(screen.queryByTestId('preview-panel')).not.toBeInTheDocument();
    expect(screen.getByTestId('chat-layout-chat-pane')).toHaveStyle({ flexGrow: '1', flexBasis: '0px' });
  });

  it('routes the artifact pane through the mobile overlay on mobile', () => {
    mocks.mobile = true;
    renderLayout();

    expect(screen.getByTestId('mobile-workspace-overlay')).toBeInTheDocument();
    // The inline desktop artifact pane is not rendered on mobile.
    expect(screen.queryByTestId('artifact-pane')).not.toBeInTheDocument();
  });
});
