import type { IDirOrFile } from '@/common/adapter/ipcBridge';
import WorkspaceProjectFilesFlyout from '@/renderer/pages/conversation/Workspace/components/WorkspaceProjectFilesFlyout';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const iconMock = vi.hoisted(() => () => null);

vi.mock('@arco-design/web-react', () => ({
  Button: ({
    children,
    className,
    onClick,
    ...props
  }: React.PropsWithChildren<{
    className?: string;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
  }>) => (
    <button className={className} onClick={onClick} {...props}>
      {children}
    </button>
  ),
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
}));

vi.mock('@icon-park/react', () => {
  return {
    Down: iconMock,
    FileText: iconMock,
    FolderOpen: iconMock,
    Right: iconMock,
    Search: iconMock,
  };
});

const contextFile: IDirOrFile = {
  name: 'Context.md',
  fullPath: '/workspace/Context.md',
  relativePath: 'Context.md',
  isDir: false,
  isFile: true,
};

const aionrsFolder: IDirOrFile = {
  name: '.aionrs',
  fullPath: '/workspace/.aionrs',
  relativePath: '.aionrs',
  isDir: true,
  isFile: false,
  children: [],
};

const t = (key: string) => key;

describe('WorkspaceProjectFilesFlyout', () => {
  afterEach(() => {
    cleanup();
  });

  it('opens a selected file in the existing Preview flow without exposing workspace controls', () => {
    const onOpenFile = vi.fn();

    render(
      <WorkspaceProjectFilesFlyout
        t={t}
        workspaceDisplayName='Temporary Space'
        files={[aionrsFolder, contextFile]}
        expandedKeys={[]}
        onToggleFolder={vi.fn()}
        onOpenFile={onOpenFile}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Context.md' }));

    expect(onOpenFile).toHaveBeenCalledWith(contextFile);
    expect(screen.queryByLabelText('conversation.workspace.refresh')).not.toBeInTheDocument();
    expect(screen.queryByText('conversation.workspace.addFile')).not.toBeInTheDocument();
  });

  it('filters the browse-only file list and shows the existing empty-search message when nothing matches', () => {
    render(
      <WorkspaceProjectFilesFlyout
        t={t}
        workspaceDisplayName='Temporary Space'
        files={[aionrsFolder, contextFile]}
        expandedKeys={[]}
        onToggleFolder={vi.fn()}
        onOpenFile={vi.fn()}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('conversation.workspace.searchPlaceholder'), {
      target: { value: 'missing-file' },
    });

    expect(screen.queryByRole('button', { name: 'Context.md' })).not.toBeInTheDocument();
    expect(screen.getByText('conversation.workspace.search.empty')).toBeInTheDocument();
  });
});
