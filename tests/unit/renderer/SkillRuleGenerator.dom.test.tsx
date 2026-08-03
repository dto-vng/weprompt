/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SkillRuleGenerator from '@/renderer/pages/conversation/components/SkillRuleGenerator';
import { ipcBridge } from '@/common';
import { loadLatestConversationMessages } from '@/renderer/utils/chat/messagePagination';

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  responseStreamOn: vi.fn(),
  loadLatestConversationMessages: vi.fn(),
}));

vi.mock('@arco-design/web-react', () => {
  const Button = ({ children, icon, ...props }: any) => (
    <button type='button' {...props}>
      {icon}
      {children}
    </button>
  );
  const Dropdown = ({ children, droplist }: any) => (
    <div>
      {children}
      <div>{droplist}</div>
    </div>
  );
  const Menu = ({ children }: any) => <div>{children}</div>;
  Menu.Item = ({ children, onClick }: any) => (
    <button type='button' onClick={onClick}>
      {children}
    </button>
  );
  const Modal = ({ children, visible, onOk, okText }: any) =>
    visible ? (
      <div role='dialog'>
        {children}
        <button type='button' onClick={onOk}>
          {okText}
        </button>
      </div>
    ) : null;
  const Radio = ({ children }: any) => <label>{children}</label>;
  Radio.Group = ({ children }: any) => <div>{children}</div>;
  const List = ({ dataSource, render }: any) => (
    <div>{(dataSource ?? []).map((item: any, index: number) => render(item, index))}</div>
  );
  List.Item = ({ children, onClick }: any) => (
    <div role='listitem' onClick={onClick}>
      {children}
    </div>
  );

  return {
    Button,
    Dropdown,
    Empty: ({ description }: any) => <div>{description}</div>,
    Input: ({ onChange, placeholder, value }: any) => (
      <input placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />
    ),
    List,
    Menu,
    Message: {
      error: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
    },
    Modal,
    Radio,
    Spin: ({ children }: any) => <div>{children}</div>,
    Typography: {
      Text: ({ children }: any) => <span>{children}</span>,
    },
  };
});

vi.mock('@icon-park/react', () => ({
  FolderOpen: () => <span />,
  Lightning: () => <span />,
  Magic: () => <span />,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      refreshCustomAgents: {
        invoke: vi.fn(),
      },
    },
    assistants: {
      create: {
        invoke: vi.fn(),
      },
    },
    conversation: {
      responseStream: {
        on: mocks.responseStreamOn,
      },
      sendMessage: {
        invoke: mocks.sendMessage,
      },
    },
    fs: {
      getFilesByDir: {
        invoke: vi.fn(),
      },
      readFile: {
        invoke: vi.fn(),
      },
      writeAssistantRule: {
        invoke: vi.fn(),
      },
    },
  },
  uuid: () => 'msg-generated',
}));

vi.mock('@/renderer/utils/chat/messagePagination', () => ({
  loadLatestConversationMessages: mocks.loadLatestConversationMessages,
}));

const loadLatestMessages = vi.mocked(loadLatestConversationMessages);

describe('SkillRuleGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.responseStreamOn.mockReturnValue(() => {});
    mocks.sendMessage.mockResolvedValue(undefined);
    mocks.loadLatestConversationMessages.mockResolvedValue({
      items: [
        {
          id: 'msg-1',
          conversation_id: 'conversation-1',
          msg_id: 'msg-1',
          type: 'text',
          position: 'right',
          content: { content: 'Summarize this repository' },
        },
      ],
      oldest_cursor: null,
      newest_cursor: null,
      has_more_before: false,
      has_more_after: false,
    });
  });

  it('loads the latest compact message window when generating from history', async () => {
    render(<SkillRuleGenerator conversation_id='conversation-1' workspace='/tmp/workspace' />);

    fireEvent.click(screen.getByText('Generate from History'));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(screen.getByPlaceholderText('e.g. Excel Translator'), {
      target: { value: 'Repo Summarizer' },
    });
    fireEvent.click(within(dialog).getByText('Generate'));

    await waitFor(() => {
      expect(loadLatestMessages).toHaveBeenCalledWith('conversation-1', {
        limit: 50,
        contentMode: 'compact',
      });
    });
  });

  it('lists rule files from every level of the workspace, not just the first entry', async () => {
    // getFilesByDir returns a FLAT array of the workspace's direct children
    // (directories first), already camelCase after the ipcBridge mapper.
    vi.mocked(ipcBridge.fs.getFilesByDir.invoke).mockResolvedValue([
      {
        name: 'src',
        fullPath: '/ws/src',
        relativePath: 'src',
        isDir: true,
        isFile: false,
        children: [
          {
            name: 'helper.py',
            fullPath: '/ws/src/helper.py',
            relativePath: 'src/helper.py',
            isDir: false,
            isFile: true,
          },
        ],
      },
      { name: 'README.md', fullPath: '/ws/README.md', relativePath: 'README.md', isDir: false, isFile: true },
    ] as any);

    render(<SkillRuleGenerator conversation_id='conversation-1' workspace='/ws' />);
    fireEvent.click(screen.getByText('Load Rule/Skill'));

    // Nested file (inside the first entry) AND the top-level file must both show.
    expect((await screen.findAllByText('helper.py')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('README.md')).length).toBeGreaterThan(0);
  });

  it('lists top-level rule files when the workspace has no subdirectories', async () => {
    vi.mocked(ipcBridge.fs.getFilesByDir.invoke).mockResolvedValue([
      { name: 'README.md', fullPath: '/ws/README.md', relativePath: 'README.md', isDir: false, isFile: true },
      { name: 'notes.txt', fullPath: '/ws/notes.txt', relativePath: 'notes.txt', isDir: false, isFile: true },
    ] as any);

    render(<SkillRuleGenerator conversation_id='conversation-1' workspace='/ws' />);
    fireEvent.click(screen.getByText('Load Rule/Skill'));

    expect((await screen.findAllByText('README.md')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('notes.txt')).length).toBeGreaterThan(0);
    expect(screen.queryByText('No relevant files found in workspace')).toBeNull();
  });
});
