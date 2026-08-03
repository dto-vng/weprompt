/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IDirOrFile } from '@/common/adapter/ipcBridge';
import type { ForgeProject } from '@/common/types/project/projectTypes';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateProjectMock = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      getFilesByDir: {
        invoke: vi.fn(),
      },
    },
    shell: {
      openFile: {
        invoke: vi.fn(),
      },
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

vi.mock('@renderer/pages/conversation/projects/projectStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@renderer/pages/conversation/projects/projectStorage')>();
  return {
    ...actual,
    updateProject: (...args: Parameters<typeof actual.updateProject>) => updateProjectMock(...args),
  };
});

import ProjectFilesCard from '@renderer/pages/project/components/ProjectFilesCard';

const getFilesByDir = vi.mocked(ipcBridge.fs.getFilesByDir.invoke);
const openFile = vi.mocked(ipcBridge.shell.openFile.invoke);
const showItemInFolder = vi.mocked(ipcBridge.shell.showItemInFolder.invoke);
const showOpen = vi.mocked(ipcBridge.dialog.showOpen.invoke);

const project: ForgeProject = {
  id: 'p1',
  name: 'Alpha Project',
  workspace: '/w/alpha',
  created_at: 1,
  updated_at: 1,
};

const fixtureTree: IDirOrFile[] = [
  {
    name: 'README.md',
    fullPath: '/w/alpha/README.md',
    relativePath: 'README.md',
    isDir: false,
    isFile: true,
  },
];

describe('ProjectFilesCard', () => {
  beforeEach(() => {
    getFilesByDir.mockReset();
    openFile.mockReset().mockResolvedValue(undefined);
    showItemInFolder.mockReset();
    showOpen.mockReset();
    updateProjectMock.mockReset();
  });

  it('shows a loading indicator while the file tree is being fetched', () => {
    getFilesByDir.mockReturnValue(new Promise<IDirOrFile[]>(() => {}));

    render(<ProjectFilesCard project={project} />);

    expect(screen.getByTestId('project-files-loading')).toBeInTheDocument();
  });

  it('renders the file tree once getFilesByDir resolves', async () => {
    getFilesByDir.mockResolvedValue(fixtureTree);

    render(<ProjectFilesCard project={project} />);

    expect(await screen.findByText('README.md')).toBeInTheDocument();
    expect(screen.getByText('conversation.projectHome.filesReadonly')).toBeInTheDocument();
  });

  it('shows the empty state for a valid, empty workspace folder', async () => {
    getFilesByDir.mockResolvedValue([]);

    render(<ProjectFilesCard project={project} />);

    expect(await screen.findByText('conversation.projectHome.filesEmpty')).toBeInTheDocument();
  });

  it('shows the folder-missing alert with the workspace path when getFilesByDir rejects', async () => {
    getFilesByDir.mockRejectedValue(new Error('ENOENT'));

    render(<ProjectFilesCard project={project} />);

    expect(await screen.findByText('conversation.projectHome.folderMissingTitle')).toBeInTheDocument();
    expect(screen.getByText('/w/alpha')).toBeInTheDocument();
  });

  it('relinks the project to the newly selected folder', async () => {
    getFilesByDir.mockRejectedValue(new Error('ENOENT'));
    showOpen.mockResolvedValue(['/w/new-alpha']);

    render(<ProjectFilesCard project={project} />);
    await screen.findByText('conversation.projectHome.folderMissingTitle');

    fireEvent.click(screen.getByRole('button', { name: 'conversation.projectHome.folderMissingRelink' }));

    await waitFor(() => {
      expect(updateProjectMock).toHaveBeenCalledExactlyOnceWith({ id: 'p1', workspace: '/w/new-alpha' });
    });
  });

  it('opens the file in its default application when a row is clicked', async () => {
    getFilesByDir.mockResolvedValue(fixtureTree);

    render(<ProjectFilesCard project={project} />);

    fireEvent.click(await screen.findByRole('button', { name: /README\.md/ }));

    // A row click used to jump to Finder, which the card's own reveal action
    // already does — the same row means "open this file" in a chat's Workspace tab.
    expect(openFile).toHaveBeenCalledExactlyOnceWith('/w/alpha/README.md');
    expect(showItemInFolder).not.toHaveBeenCalled();
  });

  it('reveals the workspace folder from the card action', async () => {
    getFilesByDir.mockResolvedValue(fixtureTree);

    render(<ProjectFilesCard project={project} />);
    await screen.findByText('README.md');

    fireEvent.click(screen.getByRole('button', { name: 'conversation.projectHome.revealInFolder' }));

    expect(showItemInFolder).toHaveBeenCalledExactlyOnceWith('/w/alpha');
  });
});
