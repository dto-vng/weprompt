/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ElectronBridgeAPI } from '@/common/types/platform/electron';
import type { IKnowledgeSourceDto, IProjectKnowledgeSummary } from '@/common/types/project/knowledgeTypes';
import type { ForgeProject } from '@/common/types/project/projectTypes';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const showOpenMock = vi.fn();
const openFileMock = vi.fn();
const showItemInFolderMock = vi.fn();
const addSourcesMock = vi.fn();
const removeSourceMock = vi.fn();
const retrySourceMock = vi.fn();
const syncNowMock = vi.fn();
const getSourceTextMock = vi.fn();
const updateProjectMock = vi.fn();
const navigateMock = vi.fn();

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

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    dialog: { showOpen: { invoke: (...args: unknown[]) => showOpenMock(...args) } },
    shell: {
      openFile: { invoke: (...args: unknown[]) => openFileMock(...args) },
      showItemInFolder: { invoke: (...args: unknown[]) => showItemInFolderMock(...args) },
    },
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
  ocr: null,
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
  ocr: null,
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
  ocr: null,
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
  ocr: null,
};

/** A file BM25 made searchable but that no embedding model ever reached. */
const partialSource: IKnowledgeSourceDto = { ...readySource, id: 's-partial', fileName: 'spec.pdf', vectorCount: 0 };

const setState = (partial: Partial<HookState>): void => {
  hookState = { sources: [], summary: null, loading: false, error: false, folderMissing: false, ...partial };
};

// Electron 37 removed `File.path`, so the renderer only learns a dropped
// file's real location through the preload's `getPathForFile`.
const droppedPaths = new Map<File, string>();

const dropFile = (name: string, path?: string): File => {
  const file = new File(['x'], name);
  if (path) droppedPaths.set(file, path);
  return file;
};

const dataTransferOf = (entries: Array<{ file: File; directory?: boolean }>) => ({
  files: entries.map((entry) => entry.file),
  items: entries.map((entry) => ({ webkitGetAsEntry: () => ({ isDirectory: !!entry.directory }) })),
});

const dropOnCard = (entries: Array<{ file: File; directory?: boolean }>): void => {
  fireEvent.drop(screen.getByTestId('project-knowledge-card'), { dataTransfer: dataTransferOf(entries) });
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
    showItemInFolderMock.mockReset().mockResolvedValue(undefined);
    navigateMock.mockReset();
    droppedPaths.clear();
    window.electronAPI = {
      getPathForFile: (file: File) => droppedPaths.get(file) as string,
    } as unknown as ElectronBridgeAPI;
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

  // Transcribing a scan is the slowest thing ingestion does — one model call per
  // page, minutes for a capped document — so this label is the one that most
  // needs to move. A motionless tag for that long reads as a hang.
  it('shows the page being transcribed while a scan is being read by the model', () => {
    setState({
      sources: [{ ...indexingSource, fileName: 'scan.pdf', progress: { stage: 'transcribing', done: 7, total: 20 } }],
    });

    render(<ProjectKnowledgeCard project={project} />);

    expect(screen.getByText('conversation.projectHome.knowledgeProgressTranscribing:7/20')).toBeInTheDocument();
    expect(screen.queryByText('conversation.projectHome.knowledgeStatusIndexing')).not.toBeInTheDocument();
  });

  it('marks a transcribed source, so a doubted answer can be traced to the scan', () => {
    setState({
      sources: [
        {
          ...readySource,
          fileName: 'contract.pdf',
          ocr: { model: 'google/gemma-4-31b-it', skippedPages: [3, 4] },
        },
      ],
    });

    render(<ProjectKnowledgeCard project={project} />);

    // Present on a HEALTHY ready row, where the card otherwise stays silent:
    // transcription can be wrong in ways reading a file cannot, so this is not
    // a "needs attention" tag but a permanent provenance marker.
    expect(screen.getByTestId('knowledge-ocr-s-ready')).toHaveTextContent('conversation.projectHome.knowledgeOcrTag');
  });

  it('leaves an ordinary source unmarked', () => {
    setState({ sources: [readySource] });

    render(<ProjectKnowledgeCard project={project} />);

    expect(screen.queryByTestId('knowledge-ocr-s-ready')).not.toBeInTheDocument();
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

  // ---- row tooltip: what happened to the file, plus any note ---------------

  it('explains on hover what an indexed file was split into', async () => {
    setState({ sources: [readySource] });

    render(<ProjectKnowledgeCard project={project} />);
    fireEvent.mouseEnter(screen.getByText('readme.md'));

    expect(await screen.findByText('conversation.projectHome.knowledgePassagesTooltip')).toBeInTheDocument();
  });

  // The standalone Note tag was clutter beside the file name, but the note
  // itself is the only record of a partial extraction — it moves, not goes.
  it('folds a ready source note into the row tooltip instead of tagging the row', async () => {
    setState({ sources: [{ ...readySource, error: 'Only the first 200 pages were indexed.' }] });

    render(<ProjectKnowledgeCard project={project} />);
    expect(screen.queryByText('conversation.projectHome.knowledgeStatusNote')).not.toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByText('readme.md'));

    expect(await screen.findByText('Only the first 200 pages were indexed.')).toBeInTheDocument();
  });

  it('keeps a failed source note on its own red tag, not in the passages line', async () => {
    setState({ sources: [failedSource] });

    render(<ProjectKnowledgeCard project={project} />);
    fireEvent.mouseEnter(screen.getByText('broken.docx'));

    await waitFor(() =>
      expect(screen.queryByText('conversation.projectHome.knowledgePassagesTooltip')).not.toBeInTheDocument()
    );
  });

  // ---- Embed all: backfill for files indexed before a model existed -------

  it('offers Embed all when a ready source never got its vectors', () => {
    setState({ sources: [partialSource] });

    render(<ProjectKnowledgeCard project={project} />);

    expect(screen.getByTestId('knowledge-embed-all')).toBeInTheDocument();
  });

  it('hides Embed all when every ready source is fully embedded', () => {
    setState({ sources: [readySource] });

    render(<ProjectKnowledgeCard project={project} />);

    expect(screen.queryByTestId('knowledge-embed-all')).not.toBeInTheDocument();
  });

  it('backfills every source missing vectors, not just the first', async () => {
    setState({
      sources: [partialSource, readySource, { ...partialSource, id: 's-partial-2', fileName: 'notes.md' }],
    });

    render(<ProjectKnowledgeCard project={project} />);
    fireEvent.click(screen.getByTestId('knowledge-embed-all'));

    await waitFor(() => expect(retrySourceMock).toHaveBeenCalledTimes(2));
    expect(retrySourceMock).toHaveBeenCalledWith('s-partial');
    expect(retrySourceMock).toHaveBeenCalledWith('s-partial-2');
  });

  it('leaves the ready source alone when backfilling', async () => {
    setState({ sources: [partialSource, readySource] });

    render(<ProjectKnowledgeCard project={project} />);
    fireEvent.click(screen.getByTestId('knowledge-embed-all'));

    await waitFor(() => expect(retrySourceMock).toHaveBeenCalledTimes(1));
    expect(retrySourceMock).not.toHaveBeenCalledWith('s-ready');
  });

  // An embed pass already holds the queue; a second wave would only stack up.
  it('disables Embed all while a source is still indexing', () => {
    setState({ sources: [partialSource, indexingSource] });

    render(<ProjectKnowledgeCard project={project} />);

    expect(screen.getByTestId('knowledge-embed-all')).toBeDisabled();
  });

  it('disables Embed all while an embed pass is already reporting progress', () => {
    setState({
      sources: [partialSource, { ...readySource, progress: { stage: 'embedding', done: 3, total: 9 } }],
    });

    render(<ProjectKnowledgeCard project={project} />);

    expect(screen.getByTestId('knowledge-embed-all')).toBeDisabled();
  });

  // ---- semantic off is a state with a fix, not just a diagnosis ----------

  it('sends the user to the model settings page from the semantic-off note', () => {
    setState({ sources: [readySource], summary: { fileCount: 1, passageCount: 5, semantic: 'off' } });

    render(<ProjectKnowledgeCard project={project} />);
    fireEvent.click(screen.getByTestId('knowledge-semantic-off-action'));

    expect(navigateMock).toHaveBeenCalledExactlyOnceWith('/settings/model');
  });

  it('offers no model-settings link while semantic search is healthy', () => {
    setState({ sources: [readySource], summary: { fileCount: 1, passageCount: 5, semantic: 'on' } });

    render(<ProjectKnowledgeCard project={project} />);

    expect(screen.queryByTestId('knowledge-semantic-off-action')).not.toBeInTheDocument();
  });

  // ---- reveal the folder the card is a view of ---------------------------

  it('reveals the Knowledge Base folder from the header', async () => {
    setState({ sources: [readySource] });

    render(<ProjectKnowledgeCard project={project} />);
    fireEvent.click(screen.getByTestId('knowledge-reveal-folder'));

    await waitFor(() => expect(showItemInFolderMock).toHaveBeenCalledExactlyOnceWith('/w/alpha/Knowledge Base'));
  });

  it('hides the reveal action when there is no folder to reveal', () => {
    setState({ sources: [readySource], folderMissing: true });

    render(<ProjectKnowledgeCard project={project} />);

    expect(screen.queryByTestId('knowledge-reveal-folder')).not.toBeInTheDocument();
  });

  // ---- drag & drop -------------------------------------------------------

  it('adds a supported file dropped onto the card', async () => {
    render(<ProjectKnowledgeCard project={project} />);
    dropOnCard([{ file: dropFile('notes.md', '/drop/notes.md') }]);

    await waitFor(() => expect(addSourcesMock).toHaveBeenCalledExactlyOnceWith(['/drop/notes.md']));
  });

  it('drops only the supported files out of a mixed selection', async () => {
    render(<ProjectKnowledgeCard project={project} />);
    dropOnCard([
      { file: dropFile('notes.md', '/drop/notes.md') },
      { file: dropFile('archive.zip', '/drop/archive.zip') },
      { file: dropFile('report.PDF', '/drop/report.PDF') },
    ]);

    await waitFor(() => expect(addSourcesMock).toHaveBeenCalledExactlyOnceWith(['/drop/notes.md', '/drop/report.PDF']));
  });

  it('ignores a dropped folder', async () => {
    render(<ProjectKnowledgeCard project={project} />);
    dropOnCard([{ file: dropFile('Docs', '/drop/Docs'), directory: true }]);

    await waitFor(() => expect(addSourcesMock).not.toHaveBeenCalled());
  });

  it('ignores a drop whose files carry no resolvable path', async () => {
    render(<ProjectKnowledgeCard project={project} />);
    dropOnCard([{ file: dropFile('notes.md') }]);

    await waitFor(() => expect(addSourcesMock).not.toHaveBeenCalled());
  });

  it('takes no drops while the Knowledge Base folder is missing', async () => {
    setState({ sources: [readySource], folderMissing: true });

    render(<ProjectKnowledgeCard project={project} />);
    dropOnCard([{ file: dropFile('notes.md', '/drop/notes.md') }]);

    await waitFor(() => expect(addSourcesMock).not.toHaveBeenCalled());
  });
});
