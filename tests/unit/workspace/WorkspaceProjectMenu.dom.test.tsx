import WorkspaceProjectMenu from '@/renderer/pages/conversation/Workspace/components/WorkspaceProjectMenu';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const iconMock = vi.hoisted(() => () => null);

vi.mock('@arco-design/web-react', () => ({
  Button: ({
    children,
    className,
    onClick,
    role,
    ...props
  }: React.PropsWithChildren<{
    className?: string;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
    role?: string;
  }>) => (
    <button className={className} onClick={onClick} role={role} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@icon-park/react', () => {
  return {
    BranchOne: iconMock,
    Down: iconMock,
    FileText: iconMock,
    FolderOpen: iconMock,
    Right: iconMock,
  };
});

const t = (key: string) => key;

describe('WorkspaceProjectMenu', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the standalone menu with a left flyout and compact context metadata', () => {
    const { container } = render(
      <WorkspaceProjectMenu
        t={t}
        open
        activePanel='files'
        changeCount={1}
        contextBudgetLabel='9%'
        showContext
        onToggle={vi.fn()}
        onSelectPanel={vi.fn()}
        filesPanel={<div>files panel</div>}
        changesPanel={<div>changes panel</div>}
        contextPanel={<div>context panel</div>}
      />
    );

    const overlay = container.querySelector('.workspace-project-overlay');
    const overlayChildren = Array.from(overlay?.children ?? []);

    expect(overlayChildren[0]).toHaveClass('workspace-project-flyout');
    expect(overlayChildren[1]).toHaveClass('workspace-project-menu-popover');
    expect(container.querySelector('.workspace-project-flyout-header')).not.toBeInTheDocument();
    expect(container.querySelector('.workspace-project-menu-separator')).toBeInTheDocument();
    expect(screen.queryByText('Temporary Space')).not.toBeInTheDocument();
    expect(screen.queryByText('⇧⌘F')).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /conversation.contextHandoff.sectionTitle.*9%/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /conversation.workspace.changes.tab.*1/ })).toBeInTheDocument();
  });

  it('closes the Project menu when a pointer click lands outside it', () => {
    const onToggle = vi.fn();

    render(
      <WorkspaceProjectMenu
        t={t}
        open
        activePanel='files'
        changeCount={0}
        showContext={false}
        onToggle={onToggle}
        onSelectPanel={vi.fn()}
        filesPanel={<div>files panel</div>}
        changesPanel={<div>changes panel</div>}
      />
    );

    fireEvent.pointerDown(document.body);

    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
