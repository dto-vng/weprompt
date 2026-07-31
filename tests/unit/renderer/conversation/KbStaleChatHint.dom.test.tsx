/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BUILTIN_KNOWLEDGE_NAME } from '@/common/knowledge/constants';
import KbStaleChatHint from '@/renderer/pages/conversation/knowledge/KbStaleChatHint';
import { kbStaleHintDismissKey } from '@/renderer/pages/conversation/knowledge/useKbStaleChatHint';

const listSourcesMock = vi.fn();
const navigateMock = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    projectKnowledge: {
      listSources: { invoke: (...args: unknown[]) => listSourcesMock(...args) },
      updated: { on: () => () => undefined },
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

const READY_SOURCE = {
  id: 's1',
  fileName: 'policy.pdf',
  byteSize: 10,
  status: 'ready',
  chunkCount: 4,
  vectorCount: 0,
  addedAt: 0,
  error: null,
  progress: null,
  ocr: null,
};

const STALE_PROPS = {
  conversationId: 'c1',
  projectId: 'p1',
  workspace: '/tmp/project',
  sessionMcpServers: [{ id: 'mcp_1', name: 'greennode-idp', transport: { type: 'stdio' } }],
};

const BODY_KEY = 'conversation.staleKnowledgeHint.body';
const ACTION_KEY = 'conversation.staleKnowledgeHint.action';

beforeEach(() => {
  localStorage.clear();
  listSourcesMock.mockReset().mockResolvedValue({ sources: [READY_SOURCE], summary: null, folderMissing: false });
  navigateMock.mockReset();
});

describe('KbStaleChatHint', () => {
  it('explains the problem and offers a new chat', async () => {
    render(<KbStaleChatHint {...STALE_PROPS} />);
    expect(await screen.findByText(BODY_KEY)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: ACTION_KEY })).toBeInTheDocument();
  });

  it('renders nothing for a chat that already has the knowledge server', async () => {
    render(
      <KbStaleChatHint
        {...STALE_PROPS}
        sessionMcpServers={[{ id: 'project-kb-p1', name: BUILTIN_KNOWLEDGE_NAME, transport: { type: 'stdio' } }]}
      />
    );
    await waitFor(() => expect(listSourcesMock).not.toHaveBeenCalled());
    expect(screen.queryByText(BODY_KEY)).not.toBeInTheDocument();
  });

  it('renders nothing for a non-project chat', async () => {
    render(<KbStaleChatHint {...STALE_PROPS} projectId={undefined} />);
    await waitFor(() => expect(listSourcesMock).not.toHaveBeenCalled());
    expect(screen.queryByText(BODY_KEY)).not.toBeInTheDocument();
  });

  it('renders nothing when the project has no indexed sources', async () => {
    listSourcesMock.mockResolvedValue({ sources: [], summary: null, folderMissing: false });
    render(<KbStaleChatHint {...STALE_PROPS} />);
    await waitFor(() => expect(listSourcesMock).toHaveBeenCalled());
    expect(screen.queryByText(BODY_KEY)).not.toBeInTheDocument();
  });

  it('renders nothing once dismissed', async () => {
    localStorage.setItem(kbStaleHintDismissKey('c1'), '1');
    render(<KbStaleChatHint {...STALE_PROPS} />);
    await waitFor(() => expect(listSourcesMock).toHaveBeenCalled());
    expect(screen.queryByText(BODY_KEY)).not.toBeInTheDocument();
  });

  it('navigates to the project-scoped new chat with the project carried in router state', async () => {
    render(<KbStaleChatHint {...STALE_PROPS} />);
    fireEvent.click(await screen.findByRole('button', { name: ACTION_KEY }));
    expect(navigateMock).toHaveBeenCalledWith('/guid', { state: { workspace: '/tmp/project', projectId: 'p1' } });
  });

  it('closing it hides the notice and remembers the choice', async () => {
    const { container } = render(<KbStaleChatHint {...STALE_PROPS} />);
    expect(await screen.findByText(BODY_KEY)).toBeInTheDocument();
    const close = container.querySelector('.arco-alert-close-btn');
    expect(close).not.toBeNull();
    fireEvent.click(close as Element);
    await waitFor(() => expect(screen.queryByText(BODY_KEY)).not.toBeInTheDocument());
    expect(localStorage.getItem(kbStaleHintDismissKey('c1'))).toBe('1');
  });
});
