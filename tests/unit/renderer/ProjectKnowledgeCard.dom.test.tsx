/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IKnowledgeSourceDto, IProjectKnowledgeSummary } from '@/common/types/project/knowledgeTypes';
import type { ForgeProject } from '@/common/types/project/projectTypes';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const showOpenMock = vi.fn();
const openFileMock = vi.fn();
const addSourcesMock = vi.fn();
const removeSourceMock = vi.fn();
const retrySourceMock = vi.fn();
const syncNowMock = vi.fn();
const getSourceTextMock = vi.fn();
const updateProjectMock = vi.fn();

type HookState = {
  sources: IKnowledgeSourceDto[];
  summary: IProjectKnowledgeSummary | null;
  loading: boolean;
  error: boolean;
  folderMissing: boolean;
};

let hookState: HookState = { sources: [], summary: null, loading: false, error: false, folderMissing: false };

vi.mock('react-i18next', () => ({
  // Mirrors the neighbouring *.dom.test.tsx convention of returning the raw
  // key, but also interpolates the counts and the file name so progress and
  // confirmation strings stay distinguishable from bare keys.
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (options && typeof options.done === 'number') return `${key}:${options.done}/${String(options.total)}`;
      if (options && typeof options.fileName === 'string') return `${key}:${options.fileName}`;
      return key;
    },
  }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    dialog: { showOpen: { invoke: (...args: unknown[]) => showOpenMock(...args) } },
    shell: { openFile: { invoke: (...args: unknown[]) => openFileMock(...args) } },
  },
}));

// MarkdownView renders into a shadow root, which jsdom queries cannot reach.
// The card's contract is "hand the indexed text to the renderer", so a stub
// that exposes the text keeps the assertion about the card, not the renderer.
vi.mock('@/renderer/components/Markdown', () => ({
  default: ({ children }: { children: string }) => <div data-testid='preview-markdown'>{children}</div>,
}));

vi.mock('@renderer/pages/conversation/projects/projectStorage', () => ({
  updateProject: (...args: unknown[]) => updateProjectMock(...args),
}));

vi.mock('@/renderer/pages/project/hooks/useProjectKnowledge', () => ({
  useProjectKnowledge: () => ({
    ...hookState,
    addSources: addSourcesMock,
    removeSource: removeSourceMock,
    retrySource: retrySourceMock,
    syncNow: syncNowMock,
    getSourceText: getSourceTextMock,
    refetch: vi.fn(),
  }),
}));

import ProjectKnowledgeCard from '@renderer/pages/project/components/ProjectKnowledgeCard';

const project: ForgeProject = {
  id: 'p1',
  name: 'Alpha Project',
  workspace: '/w/alpha',
  created_at: 1,
  updated_at: 1,
};

const readySource: IKnowledgeSourceDto = {
  id: 's-ready',
  fileName: 'readme.md',
  byteSize: 100,
  status: 'ready',
  chunkCount: 5,
  vectorCount: 5,
  addedAt: 1,
  error: null,
  progress: null,
};

const indexingSource: IKnowledgeSourceDto = {
  id: 's-indexing',
  fileName: 'notes.txt',
  byteSize: 50,
  status: 'indexing',
  chunkCount: 0,
  vectorCount: 0,
  addedAt: 2,
  error: null,
  progress: null,
};

const failedSource: IKnowledgeSourceDto = {
  id: 's-failed',
  fileName: 'broken.docx',
  byteSize: 20,
  status: 'failed',
  chunkCount: 0,
  vectorCount: 0,
  addedAt: 3,
  error: 'Could not parse file.',
  progress: null,
};

const unsupportedSource: IKnowledgeSourceDto = {
  id: 's-unsupported',
  fileName: 'archive.zip',
  byteSize: 30,
  status: 'unsupported',
  chunkCount: 0,
  vectorCount: 0,
  addedAt: 4,
  error: 'Unsupported file type.',
  progress: null,
};

const setState = (partial: Partial<HookState>): void => {
  hookState = { sources: [], summary: null, loading: false, error: false, folderMissing: false, ...partial };
};

describe('ProjectKnowledgeCard', () => {
  beforeEach(() => {
    showOpenMock.mockReset();
    openFileMock.mockReset().mockResolvedValue(undefined);
    addSourcesMock.mockReset().mockResolvedValue(undefined);
    removeSourceMock.mockReset().mockResolvedValue(undefined);
    retrySourceMock.mockReset().mockResolvedValue(undefined);
    syncNowMock.mockReset().mockResolvedValue(undefined);
    getSourceTextMock.mockReset().mockResolvedValue({ text: '# Indexed\n\nbody text', truncated: false });
    updateProjectMock.mockReset();
    setState({});
  });

  it('renders the empty state explaining the folder', () => {
    render(<ProjectKnowledgeCard project={project} />);

    expect(screen.getByTestId('project-knowledge-card')).toBeInTheDocument();
    expect(screen.getByText('conversation.projectHome.knowledgeEmpty')).toBeInTheDocument();
    expect(screen.getByText('conversation.projectHome.knowledgeFolderHint')).toBeInTheDocument();
  });

  it('shows a loading indicator while sources are being fetched', () => {
    setState({ loading: true });
    render(<ProjectKnowledgeCard project={project} />);
    expect(screen.getByTestId('project-knowledge-loading')).toBeInTheDocument();
  });

  it('shows an error message when the knowledge base is unavailable', async () => {
    setState({ error: true });
    render(<ProjectKnowledgeCard project={project} />);
    expect(await screen.findByText('conversation.projectHome.knowledgeError')).toBeInTheDocument();
  });

  // The passage count was retrieval jargon on a row the user just wants to
  // read; a ready file is simply quiet now.
  it('leaves a ready row free of status jargon', () => {
    setState({ sources: [readySource], summary: { fileCount: 1, passageCount: 5, semantic: 'on' } });

    render(<ProjectKnowledgeCard project={project} />);

    expect(screen.getByText('readme.md')).toBeInTheDocument();
    expect(screen.queryByText(/passages/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/knowledgePassages/)).not.toBeInTheDocument();
  });

  it('says nothing in the footer while everything is healthy', () => {
    setState({ sources: [readySource], summary: { fileCount: 1, passageCount: 5, semantic: 'on' } });
    render(<ProjectKnowledgeCard project={project} />);
    expect(screen.queryByTestId('knowledge-degraded-note')).not.toBeInTheDocument();
  });

  it('warns only when semantic search is degraded', () => {
    setState({ sources: [readySource], summary: { fileCount: 1, passageCount: 5, semantic: 'off' } });

    render(<ProjectKnowledgeCard project={project} />);

    expect(screen.getByTestId('knowledge-degraded-note')).toHaveTextContent(
      'conversation.projectHome.knowledgeSemanticOff'
    );
  });

  it('still shows indexing, failed and unsupported states', () => {
    setState({ sources: [indexingSource, failedSource, unsupportedSource] });

    render(<ProjectKnowledgeCard project={project} />);

    expect(screen.getByText('conversation.projectHome.knowledgeStatusIndexing')).toBeInTheDocument();
    expect(screen.getByText('conversation.projectHome.knowledgeStatusFailed')).toBeInTheDocument();
    expect(screen.getByText('conversation.projectHome.knowledgeStatusUnsupported')).toBeInTheDocument();
  });

  it('replaces the bare indexing tag with the page being read', () => {
    setState({
      sources: [{ ...indexingSource, fileName: 'contract.pdf', progress: { stage: 'reading', done: 12, total: 50 } }],
    });

    render(<ProjectKnowledgeCard project={project} />);

    expect(screen.getByText('conversation.projectHome.knowledgeProgressReading:12/50')).toBeInTheDocument();
    expect(screen.queryByText('conversation.projectHome.knowledgeStatusIndexing')).not.toBeInTheDocument();
  });

  // BM25 marks a source ready before embedding starts, so the embed pass always
  // runs against an already-`ready` row — this is the only place its progress
  // can surface.
  it('shows embedding progress on a ready source, in place of Retry', () => {
    setState({
      sources: [
        { ...readySource, chunkCount: 200, vectorCount: 64, progress: { stage: 'embedding', done: 64, total: 200 } },
      ],
    });

    render(<ProjectKnowledgeCard project={project} />);

    expect(screen.getByText('conversation.projectHome.knowledgeProgressEmbedding:64/200')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'conversation.projectHome.knowledgeRetry' })).not.toBeInTheDocument();
  });

  it('offers retry on a ready source whose chunks are not all embedded', () => {
    setState({ sources: [{ ...readySource, id: 's-partial', vectorCount: 0 }] });

    render(<ProjectKnowledgeCard project={project} />);
    fireEvent.click(screen.getByRole('button', { name: 'conversation.projectHome.knowledgeRetry' }));

    expect(retrySourceMock).toHaveBeenCalledWith('s-partial');
  });

  it('retries a failed source', () => {
    setState({ sources: [failedSource] });

    render(<ProjectKnowledgeCard project={project} />);
    fireEvent.click(screen.getByRole('button', { name: 'conversation.projectHome.knowledgeRetry' }));

    expect(retrySourceMock).toHaveBeenCalledWith('s-failed');
  });

  // ---- folder actions -------------------------------------------------

  it('opens the original file from the Knowledge Base folder', async () => {
    setState({ sources: [readySource] });

    render(<ProjectKnowledgeCard project={project} />);
    fireEvent.click(screen.getByTestId('knowledge-open-s-ready'));

    await waitFor(() => expect(openFileMock).toHaveBeenCalledWith('/w/alpha/Knowledge Base/readme.md'));
  });

  it('confirms by name before deleting a file', async () => {
    setState({ sources: [readySource] });

    render(<ProjectKnowledgeCard project={project} />);
    fireEvent.click(screen.getByTestId('knowledge-delete-s-ready'));

    expect(await screen.findByText('conversation.projectHome.knowledgeDeleteConfirm:readme.md')).toBeInTheDocument();
    expect(removeSourceMock).not.toHaveBeenCalled();
  });

  it('deletes the file once the confirmation is accepted', async () => {
    setState({ sources: [readySource] });

    render(<ProjectKnowledgeCard project={project} />);
    fireEvent.click(screen.getByTestId('knowledge-delete-s-ready'));
    await screen.findByText('conversation.projectHome.knowledgeDeleteConfirm:readme.md');

    // The row's icon trigger carries the same accessible name as the
    // confirmation's OK button, so pick the one that is not the trigger.
    const confirmButton = screen
      .getAllByRole('button', { name: 'conversation.projectHome.knowledgeDeleteFile' })
      .find((button) => button.getAttribute('data-testid') !== 'knowledge-delete-s-ready');
    fireEvent.click(confirmButton!);

    await waitFor(() => expect(removeSourceMock).toHaveBeenCalledWith('s-ready'));
  });

  it('re-scans the folder when Refresh is used', async () => {
    setState({ sources: [readySource] });

    render(<ProjectKnowledgeCard project={project} />);
    fireEvent.click(screen.getByRole('button', { name: 'conversation.projectHome.knowledgeRefresh' }));

    await waitFor(() => expect(syncNowMock).toHaveBeenCalled());
  });

  it('opens a file picker and forwards the selected paths to addSources', async () => {
    showOpenMock.mockResolvedValue(['/tmp/a.md', '/tmp/b.txt']);

    render(<ProjectKnowledgeCard project={project} />);
    fireEvent.click(screen.getByRole('button', { name: 'conversation.projectHome.knowledgeAdd' }));

    await waitFor(() => expect(addSourcesMock).toHaveBeenCalledWith(['/tmp/a.md', '/tmp/b.txt']));
  });

  it('does not call addSources when the file picker is cancelled', async () => {
    showOpenMock.mockResolvedValue(undefined);

    render(<ProjectKnowledgeCard project={project} />);
    fireEvent.click(screen.getByRole('button', { name: 'conversation.projectHome.knowledgeAdd' }));

    await waitFor(() => expect(showOpenMock).toHaveBeenCalled());
    expect(addSourcesMock).not.toHaveBeenCalled();
  });

  // ---- folderMissing: an error state, never a deletion --------------------

  it('warns about a missing folder while still listing the preserved index', () => {
    setState({ sources: [readySource], folderMissing: true });

    render(<ProjectKnowledgeCard project={project} />);

    expect(screen.getByText('conversation.projectHome.knowledgeFolderMissingTitle')).toBeInTheDocument();
    expect(screen.getByText('readme.md')).toBeInTheDocument(); // index survives
  });

  it('relinks the workspace and re-syncs from the missing-folder warning', async () => {
    setState({ sources: [readySource], folderMissing: true });
    showOpenMock.mockResolvedValue(['/w/moved']);

    render(<ProjectKnowledgeCard project={project} />);
    fireEvent.click(screen.getByRole('button', { name: 'conversation.projectHome.folderMissingRelink' }));

    await waitFor(() => expect(updateProjectMock).toHaveBeenCalledWith({ id: 'p1', workspace: '/w/moved' }));
    await waitFor(() => expect(syncNowMock).toHaveBeenCalled());
  });

  // ---- preview drawer ----------------------------------------------------

  it('previews the indexed text when a row is clicked', async () => {
    setState({ sources: [readySource] });

    render(<ProjectKnowledgeCard project={project} />);
    fireEvent.click(screen.getByText('readme.md'));

    await waitFor(() => expect(getSourceTextMock).toHaveBeenCalledWith('s-ready'));
    expect(await screen.findByTestId('preview-markdown')).toHaveTextContent('body text');
    expect(screen.getByText('conversation.projectHome.knowledgePreviewNote')).toBeInTheDocument();
  });

  it('flags a truncated preview', async () => {
    setState({ sources: [readySource] });
    getSourceTextMock.mockResolvedValue({ text: 'partial', truncated: true });

    render(<ProjectKnowledgeCard project={project} />);
    fireEvent.click(screen.getByText('readme.md'));

    expect(await screen.findByText('conversation.projectHome.knowledgePreviewTruncated')).toBeInTheDocument();
  });

  it('reports a preview that cannot be loaded', async () => {
    setState({ sources: [readySource] });
    getSourceTextMock.mockRejectedValue(new Error('no converted.md'));

    render(<ProjectKnowledgeCard project={project} />);
    fireEvent.click(screen.getByText('readme.md'));

    expect(await screen.findByText('conversation.projectHome.knowledgePreviewError')).toBeInTheDocument();
  });

  it('does not preview a source that has no indexed text yet', () => {
    setState({ sources: [unsupportedSource] });

    render(<ProjectKnowledgeCard project={project} />);
    fireEvent.click(screen.getByText('archive.zip'));

    expect(getSourceTextMock).not.toHaveBeenCalled();
  });
});
