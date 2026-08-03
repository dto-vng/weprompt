/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';

const mockListSources = vi.hoisted(() => vi.fn());
const mockGetSourceText = vi.hoisted(() => vi.fn());
const mockOpenFile = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const mockUpdatedOn = vi.hoisted(() => vi.fn(() => () => undefined));
const mockMessageWarning = vi.hoisted(() => vi.fn());

vi.mock('@/common', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/common')>();
  return {
    ...actual,
    ipcBridge: {
      ...actual.ipcBridge,
      projectKnowledge: {
        ...actual.ipcBridge.projectKnowledge,
        listSources: { invoke: (...args: unknown[]) => mockListSources(...args) },
        getSourceText: { invoke: (...args: unknown[]) => mockGetSourceText(...args) },
        updated: { on: (...args: unknown[]) => mockUpdatedOn(...args) },
      },
      shell: {
        ...actual.ipcBridge.shell,
        openFile: { invoke: (...args: unknown[]) => mockOpenFile(...args) },
      },
    },
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: { ...actual.Message, warning: (...args: unknown[]) => mockMessageWarning(...args) },
  };
});

import {
  KnowledgeCitationsProvider,
  useKnowledgeCitationsSafe,
} from '@/renderer/pages/conversation/knowledge/KnowledgeCitationsContext';

const SOURCE = {
  id: 'src-1',
  fileName: 'hop-dong-ctv-scan.pdf',
  contentHash: 'sha256:1',
  byteSize: 10,
  status: 'ready',
  chunkCount: 1,
  vectorCount: 1,
  addedAt: 1,
  error: null,
};

const conversation = {
  id: 'conv-1',
  type: 'acp',
  extra: { project_id: 'proj-1', workspace: '/tmp/ws' },
} as unknown as TChatConversation;

const Probe: React.FC<{ fileName: string; anchor?: string }> = ({ fileName, anchor }) => {
  const citations = useKnowledgeCitationsSafe();
  if (!citations) return <span data-testid='no-citations' />;
  return (
    <button data-testid='open-citation' onClick={() => citations.openCitation(fileName, anchor)}>
      {citations.linkify('see hop-dong-ctv-scan.pdf')}
    </button>
  );
};

beforeEach(() => {
  mockListSources.mockReset().mockResolvedValue({ sources: [SOURCE], summary: null, folderMissing: false });
  mockGetSourceText.mockReset().mockResolvedValue({ text: '## Page 1\n\nbody', truncated: false });
  mockUpdatedOn.mockClear();
  mockMessageWarning.mockClear();
  mockOpenFile.mockClear();
});

describe('KnowledgeCitationsProvider', () => {
  it('provides no context (and fetches nothing) without a project_id', () => {
    const plain = { id: 'c', type: 'acp', extra: { workspace: '/tmp/ws' } } as unknown as TChatConversation;
    render(
      <KnowledgeCitationsProvider conversation={plain}>
        <Probe fileName='hop-dong-ctv-scan.pdf' />
      </KnowledgeCitationsProvider>
    );
    expect(screen.getByTestId('no-citations')).toBeTruthy();
    expect(mockListSources).not.toHaveBeenCalled();
    expect(mockUpdatedOn).not.toHaveBeenCalled();
  });

  it('linkifies known names and opens the drawer with fetched text on click', async () => {
    render(
      <KnowledgeCitationsProvider conversation={conversation}>
        <Probe fileName='hop-dong-ctv-scan.pdf' anchor='Pages 1–3' />
      </KnowledgeCitationsProvider>
    );
    await waitFor(() => expect(mockListSources).toHaveBeenCalledWith({ projectId: 'proj-1' }));
    await waitFor(() =>
      expect(screen.getByTestId('open-citation').textContent).toContain('](weprompt-kb://open?file=')
    );
    fireEvent.click(screen.getByTestId('open-citation'));
    await waitFor(() => expect(mockGetSourceText).toHaveBeenCalledWith({ projectId: 'proj-1', sourceId: 'src-1' }));
    // Drawer title is light-DOM (Arco); the drawer is open when the fileName shows.
    await waitFor(() => expect(screen.getByText('hop-dong-ctv-scan.pdf')).toBeTruthy());
    expect(mockMessageWarning).not.toHaveBeenCalled();
  });

  it('re-checks the source list then toasts when the file is gone', async () => {
    render(
      <KnowledgeCitationsProvider conversation={conversation}>
        <Probe fileName='deleted.pdf' />
      </KnowledgeCitationsProvider>
    );
    await waitFor(() => expect(mockListSources).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('open-citation'));
    await waitFor(() =>
      expect(mockMessageWarning).toHaveBeenCalledWith('conversation.projectHome.knowledgeCitationMissing')
    );
    expect(mockGetSourceText).not.toHaveBeenCalled();
    expect(mockListSources.mock.calls.length).toBeGreaterThanOrEqual(2); // initial + click-time re-check
  });

  it('refreshes the cached list when the updated emitter fires for this project', async () => {
    render(
      <KnowledgeCitationsProvider conversation={conversation}>
        <Probe fileName='hop-dong-ctv-scan.pdf' />
      </KnowledgeCitationsProvider>
    );
    await waitFor(() => expect(mockUpdatedOn).toHaveBeenCalled());
    const listener = mockUpdatedOn.mock.calls[0][0] as (payload: { projectId: string }) => void;
    const initialCalls = mockListSources.mock.calls.length;
    listener({ projectId: 'other-project' });
    listener({ projectId: 'proj-1' });
    await waitFor(() => expect(mockListSources.mock.calls.length).toBe(initialCalls + 1));
  });
});
