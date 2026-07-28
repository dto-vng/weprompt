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
const addSourcesMock = vi.fn();
const removeSourceMock = vi.fn();
const retrySourceMock = vi.fn();

type HookState = {
  sources: IKnowledgeSourceDto[];
  summary: IProjectKnowledgeSummary | null;
  loading: boolean;
  error: boolean;
};

let hookState: HookState = { sources: [], summary: null, loading: false, error: false };

vi.mock('react-i18next', () => ({
  // Mirrors the neighbouring *.dom.test.tsx convention of returning the raw
  // key, but also interpolates `count` so `knowledgePassages` renders
  // distinguishably from other status tags in the same row.
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (options && typeof options.count === 'number') return `${key}:${options.count}`;
      return key;
    },
  }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    dialog: {
      showOpen: {
        invoke: (...args: unknown[]) => showOpenMock(...args),
      },
    },
  },
}));

vi.mock('@/renderer/pages/project/hooks/useProjectKnowledge', () => ({
  useProjectKnowledge: () => ({
    ...hookState,
    addSources: addSourcesMock,
    removeSource: removeSourceMock,
    retrySource: retrySourceMock,
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
};

describe('ProjectKnowledgeCard', () => {
  beforeEach(() => {
    showOpenMock.mockReset();
    addSourcesMock.mockReset().mockResolvedValue(undefined);
    removeSourceMock.mockReset().mockResolvedValue(undefined);
    retrySourceMock.mockReset().mockResolvedValue(undefined);
    hookState = { sources: [], summary: null, loading: false, error: false };
  });

  it('renders the empty state when the project has no knowledge sources', () => {
    render(<ProjectKnowledgeCard project={project} />);

    expect(screen.getByTestId('project-knowledge-card')).toBeInTheDocument();
    expect(screen.getByText('conversation.projectHome.knowledgeEmpty')).toBeInTheDocument();
  });

  it('shows a loading indicator while sources are being fetched', () => {
    hookState = { sources: [], summary: null, loading: true, error: false };

    render(<ProjectKnowledgeCard project={project} />);

    expect(screen.getByTestId('project-knowledge-loading')).toBeInTheDocument();
  });

  it('shows an error message when the knowledge base is unavailable', async () => {
    hookState = { sources: [], summary: null, loading: false, error: true };

    render(<ProjectKnowledgeCard project={project} />);

    expect(await screen.findByText('conversation.projectHome.knowledgeError')).toBeInTheDocument();
  });

  it('renders source rows with status-specific affordances and the summary line', () => {
    hookState = {
      sources: [readySource, indexingSource, failedSource],
      summary: { fileCount: 3, passageCount: 5, semantic: 'on' },
      loading: false,
      error: false,
    };

    render(<ProjectKnowledgeCard project={project} />);

    expect(screen.getByText('readme.md')).toBeInTheDocument();
    expect(screen.getByText('notes.txt')).toBeInTheDocument();
    expect(screen.getByText('broken.docx')).toBeInTheDocument();

    // Ready row: passages count, distinguishable from other counts via the count-aware t() mock.
    expect(screen.getByText('conversation.projectHome.knowledgePassages:5')).toBeInTheDocument();
    // Indexing row.
    expect(screen.getByText('conversation.projectHome.knowledgeStatusIndexing')).toBeInTheDocument();
    // Failed row: status tag plus a retry control.
    expect(screen.getByText('conversation.projectHome.knowledgeStatusFailed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'conversation.projectHome.knowledgeRetry' })).toBeInTheDocument();

    // Summary line concatenates the summary and semantic status into one node — match by substring,
    // not exact text, and scope to <span> so the assertion isn't tripped up by ancestor nodes whose
    // aggregate textContent also happens to contain the same substring.
    const summaryLine = screen.getByText(/knowledgeSummary/, { selector: 'span' });
    expect(summaryLine).toHaveTextContent('conversation.projectHome.knowledgeSemanticOn');
  });

  it('shows the semantic-off summary text when semantic search is off', () => {
    hookState = {
      sources: [readySource],
      summary: { fileCount: 1, passageCount: 5, semantic: 'off' },
      loading: false,
      error: false,
    };

    render(<ProjectKnowledgeCard project={project} />);

    const summaryLine = screen.getByText(/knowledgeSummary/, { selector: 'span' });
    expect(summaryLine).toHaveTextContent('conversation.projectHome.knowledgeSemanticOff');
  });

  it('renders an unsupported source with its status tag', () => {
    hookState = { sources: [unsupportedSource], summary: null, loading: false, error: false };

    render(<ProjectKnowledgeCard project={project} />);

    expect(screen.getByText('archive.zip')).toBeInTheDocument();
    expect(screen.getByText('conversation.projectHome.knowledgeStatusUnsupported')).toBeInTheDocument();
  });

  it('opens a file picker and forwards the selected paths to addSources', async () => {
    showOpenMock.mockResolvedValue(['/tmp/a.md', '/tmp/b.txt']);

    render(<ProjectKnowledgeCard project={project} />);

    fireEvent.click(screen.getByRole('button', { name: 'conversation.projectHome.knowledgeAdd' }));

    await waitFor(() => expect(addSourcesMock).toHaveBeenCalledWith(['/tmp/a.md', '/tmp/b.txt']));
    expect(showOpenMock).toHaveBeenCalledWith({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'conversation.projectHome.knowledge', extensions: ['md', 'txt', 'docx', 'xlsx'] }],
    });
  });

  it('does not call addSources when the file picker is cancelled', async () => {
    showOpenMock.mockResolvedValue(undefined);

    render(<ProjectKnowledgeCard project={project} />);

    fireEvent.click(screen.getByRole('button', { name: 'conversation.projectHome.knowledgeAdd' }));

    await waitFor(() => expect(showOpenMock).toHaveBeenCalled());
    expect(addSourcesMock).not.toHaveBeenCalled();
  });

  it('retries a failed source', () => {
    hookState = { sources: [failedSource], summary: null, loading: false, error: false };

    render(<ProjectKnowledgeCard project={project} />);

    fireEvent.click(screen.getByRole('button', { name: 'conversation.projectHome.knowledgeRetry' }));

    expect(retrySourceMock).toHaveBeenCalledWith('s-failed');
  });

  it('offers retry on a ready source whose chunks are not all embedded', () => {
    // Indexed while no embedding model was configured: searchable via BM25 but
    // vectorless. Without this affordance the only way to embed it later is to
    // remove and re-add the file.
    hookState = {
      sources: [{ ...readySource, id: 's-partial', vectorCount: 0 }],
      summary: { fileCount: 1, passageCount: 5, semantic: 'off' },
      loading: false,
      error: false,
    };

    render(<ProjectKnowledgeCard project={project} />);
    fireEvent.click(screen.getByRole('button', { name: 'conversation.projectHome.knowledgeRetry' }));

    expect(retrySourceMock).toHaveBeenCalledWith('s-partial');
  });

  it('does not offer retry on a fully embedded ready source', () => {
    hookState = { sources: [readySource], summary: null, loading: false, error: false };

    render(<ProjectKnowledgeCard project={project} />);

    expect(screen.queryByRole('button', { name: 'conversation.projectHome.knowledgeRetry' })).not.toBeInTheDocument();
  });

  it('reveals the remove confirmation when the remove control is clicked', async () => {
    hookState = { sources: [readySource], summary: null, loading: false, error: false };

    render(<ProjectKnowledgeCard project={project} />);

    fireEvent.click(screen.getByRole('button', { name: 'conversation.projectHome.knowledgeRemove' }));

    expect(await screen.findByText('conversation.projectHome.knowledgeRemoveConfirm')).toBeInTheDocument();
  });
});
