/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMessageAcpToolCall, IMessageToolCall, IMessageToolGroup } from '@/common/chat/chatLib';
import MessageToolGroupSummary from '@/renderer/pages/conversation/Messages/components/MessageToolGroupSummary';
import enUsMessages from '@/renderer/services/i18n/locales/en-US/messages.json';
import type { WorkJournalSourceMessage } from '@/renderer/pages/conversation/Messages/types';

const mockDownloadFileFromPath = vi.fn().mockResolvedValue(undefined);
const mockMessageSuccess = vi.fn();
const mockMessageError = vi.fn();
const translationMockState = vi.hoisted(() => ({
  language: 'en-US',
  translate: undefined as undefined | ((key: string, values?: Record<string, unknown>) => string),
}));

const createMessagesInstance = async (locale: string, messages: Record<string, unknown>) => {
  const instance = createInstance();
  await instance.init({
    lng: locale,
    fallbackLng: false,
    resources: { [locale]: { translation: { messages } } },
    interpolation: { escapeValue: false },
  });
  return instance;
};

const useRealMessages = async (locale: string, messages: Record<string, unknown>): Promise<void> => {
  const instance = await createMessagesInstance(locale, messages);
  translationMockState.language = locale;
  translationMockState.translate = (key, values) => instance.t(key, values);
};

vi.mock('@/renderer/components/media/LocalImageView', () => ({
  __esModule: true,
  default: ({ src, alt, className }: { src: string; alt: string; className?: string }) => (
    <img src={src} alt={alt} className={className} data-testid='local-image' />
  ),
}));

vi.mock('@/renderer/utils/file/download', () => ({
  downloadFileFromPath: (...args: unknown[]) => mockDownloadFileFromPath(...args),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => {
      if (translationMockState.translate) return translationMockState.translate(key, values);
      if (key.startsWith('messages.toolActivity.recap.category') && typeof values?.count === 'number') {
        return `${key} (${values.count})`;
      }
      if (key === 'messages.toolActivity.recap.overflow' && typeof values?.count === 'number') {
        return `${key} [other:${values.count}]`;
      }
      return key.startsWith('messages.toolActivity.recap') && values ? `${key} ${JSON.stringify(values)}` : key;
    },
    i18n: {
      language: translationMockState.language,
      resolvedLanguage: translationMockState.language,
    },
  }),
}));

beforeEach(() => {
  translationMockState.language = 'en-US';
  translationMockState.translate = undefined;
});

vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');

  return {
    ...actual,
    Message: {
      useMessage: () => [{ success: mockMessageSuccess, error: mockMessageError }, null],
    },
  };
});

describe('MessageToolGroupSummary ACP image output', () => {
  beforeEach(() => {
    mockDownloadFileFromPath.mockReset();
    mockDownloadFileFromPath.mockResolvedValue(undefined);
    mockMessageSuccess.mockClear();
    mockMessageError.mockClear();
  });

  it('renders generated image preview when an ACP image tool call is expanded', () => {
    const message: IMessageAcpToolCall = {
      id: 'ig_test_image',
      conversation_id: 'conv-1',
      type: 'acp_tool_call',
      content: {
        sessionId: 'sess-1',
        update: {
          sessionUpdate: 'tool_call_update',
          tool_call_id: 'ig_test_image',
          status: 'completed',
          title: 'Image generation',
          kind: 'execute',
          raw_output: {
            image: {
              path: '/Users/test/.codex/generated_images/session/ig_test_image.png',
            },
          },
          content: [
            {
              type: 'content',
              content: {
                type: 'text',
                text: 'Revised prompt: 一张小猫照片',
              },
            },
          ],
        },
      },
    };

    render(<MessageToolGroupSummary messages={[message]} />);
    fireEvent.click(screen.getByText('common.technical_details'));

    const image = screen.getByTestId('local-image');
    expect(image).toHaveAttribute('src', '/Users/test/.codex/generated_images/session/ig_test_image.png');
    expect(image).toHaveAttribute('alt', 'ig_test_image.png');
  });

  it('downloads the generated image from its local path', () => {
    const imagePath = '/Users/test/.codex/generated_images/session/ig_test_image.png';
    const message: IMessageAcpToolCall = {
      id: 'ig_test_image',
      conversation_id: 'conv-1',
      type: 'acp_tool_call',
      content: {
        sessionId: 'sess-1',
        update: {
          sessionUpdate: 'tool_call_update',
          tool_call_id: 'ig_test_image',
          status: 'completed',
          title: 'Image generation',
          kind: 'execute',
          raw_output: {
            image: {
              path: imagePath,
            },
          },
        },
      },
    };

    render(<MessageToolGroupSummary messages={[message]} />);
    fireEvent.click(screen.getByText('common.technical_details'));
    fireEvent.click(screen.getByLabelText('acp.image.download_aria'));

    expect(mockDownloadFileFromPath).toHaveBeenCalledWith(imagePath, 'ig_test_image.png');
  });

  it('shows an error when generated image download fails', async () => {
    const imagePath = '/Users/test/.codex/generated_images/session/ig_test_image.png';
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockDownloadFileFromPath.mockRejectedValueOnce(new Error('denied'));
    const message: IMessageAcpToolCall = {
      id: 'ig_test_image',
      conversation_id: 'conv-1',
      type: 'acp_tool_call',
      content: {
        sessionId: 'sess-1',
        update: {
          sessionUpdate: 'tool_call_update',
          tool_call_id: 'ig_test_image',
          status: 'completed',
          title: 'Image generation',
          kind: 'execute',
          raw_output: {
            image: {
              path: imagePath,
            },
          },
        },
      },
    };

    render(<MessageToolGroupSummary messages={[message]} />);
    fireEvent.click(screen.getByText('common.technical_details'));
    fireEvent.click(screen.getByLabelText('acp.image.download_aria'));

    await waitFor(() => {
      expect(mockMessageError).toHaveBeenCalledWith('acp.image.download_error');
    });
    expect(consoleError).toHaveBeenCalledWith('[MessageToolGroupSummary] Failed to download image:', expect.any(Error));
    expect(mockMessageSuccess).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('uses i18n keys for the image download control', () => {
    const message: IMessageAcpToolCall = {
      id: 'ig_test_image',
      conversation_id: 'conv-1',
      type: 'acp_tool_call',
      content: {
        sessionId: 'sess-1',
        update: {
          sessionUpdate: 'tool_call_update',
          tool_call_id: 'ig_test_image',
          status: 'completed',
          title: 'Image generation',
          kind: 'execute',
          raw_output: {
            image: {
              path: '/Users/test/.codex/generated_images/session/ig_test_image.png',
            },
          },
        },
      },
    };

    render(<MessageToolGroupSummary messages={[message]} />);
    fireEvent.click(screen.getByText('common.technical_details'));

    expect(screen.getByLabelText('acp.image.download_aria')).toBeInTheDocument();
  });

  it('does not render image controls for tool calls without image output', () => {
    const message: IMessageToolCall = {
      id: 'tool-1',
      conversation_id: 'conv-1',
      type: 'tool_call',
      content: {
        call_id: 'tool-1',
        name: 'Shell Command',
        args: {},
        status: 'completed',
      },
    };

    render(<MessageToolGroupSummary messages={[message]} />);
    fireEvent.click(screen.getByText('common.technical_details'));

    expect(screen.queryByTestId('local-image')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('acp.image.download_aria')).not.toBeInTheDocument();
  });
});

describe('MessageToolGroupSummary plain-language activity', () => {
  const acpStep = (status: string, toolCallId: string): IMessageAcpToolCall =>
    ({
      id: toolCallId,
      conversation_id: 'conv-1',
      type: 'acp_tool_call',
      content: {
        sessionId: 'sess-1',
        update: {
          sessionUpdate: 'tool_call_update',
          tool_call_id: toolCallId,
          status,
          title: 'forge-reports_render_report',
          kind: 'execute',
        },
      },
    }) as unknown as IMessageAcpToolCall;

  it('does not show token watermark telemetry in technical details', () => {
    const diagnosticStep: IMessageAcpToolCall = {
      id: 'token-watermark-1',
      conversation_id: 'conv-1',
      type: 'acp_tool_call',
      content: {
        sessionId: 'sess-1',
        update: {
          sessionUpdate: 'tool_call_update',
          tool_call_id: 'token-watermark-1',
          status: 'completed',
          title: 'Token watermark override: provider=0, local_estimate=19756, using=19756',
          kind: 'info',
        },
      },
    };

    render(<MessageToolGroupSummary messages={[acpStep('completed', 't1'), diagnosticStep]} />);
    fireEvent.click(screen.getByText('common.technical_details'));

    expect(screen.queryByText(/Token watermark override/)).not.toBeInTheDocument();
  });

  const commandStep = (status: string, toolCallId: string, command: string): IMessageAcpToolCall =>
    ({
      id: toolCallId,
      conversation_id: 'conv-1',
      type: 'acp_tool_call',
      content: {
        sessionId: 'sess-1',
        update: {
          sessionUpdate: 'tool_call_update',
          tool_call_id: toolCallId,
          status,
          title: 'exec_command',
          kind: 'execute',
          rawInput: { command },
        },
      },
    }) as unknown as IMessageAcpToolCall;

  it('defines verification narration without raw command labels', () => {
    expect(enUsMessages.toolActivity.categories.verify).toEqual({
      running: "I'm checking the changes to make sure everything still works.",
      done: 'Checked the changes for regressions.',
      failedTitle: "I couldn't finish checking the changes",
    });
    expect(JSON.stringify(enUsMessages.toolActivity)).not.toContain('Running a command');
    expect(JSON.stringify(enUsMessages.toolActivity)).not.toContain('Command finished');
  });

  it('defines the exact English recovery sentence', () => {
    expect(enUsMessages.toolActivity.status.recovered).toBe('Recovered after retry.');
  });

  it('keeps completed phases visible while the latest phase is running', () => {
    render(
      <MessageToolGroupSummary
        isActive
        messages={[
          commandStep('completed', 'search-1', 'rg -n needle .'),
          commandStep('in_progress', 'verify-1', 'bun run test tests/unit/chat'),
        ]}
      />
    );

    // Narration rows are now always visible — no click needed, and there is no
    // live "status" role for the active headline anymore (that copy is retired).
    expect(screen.getByText('messages.toolActivity.categories.search.done')).toBeInTheDocument();
    expect(screen.getByText('messages.toolActivity.categories.verify.running')).toBeInTheDocument();
  });

  it('shows no live status region while active, only the plain narration', () => {
    render(<MessageToolGroupSummary isActive messages={[commandStep('in_progress', 'verify-1', 'bun run test')]} />);

    // Under the redesign the close (which carries role="status") only renders once
    // the turn settles, so nothing announces via a live region while still active.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('messages.toolActivity.categories.verify.running')).toBeInTheDocument();
  });

  it('shows the done label and a technical-details toggle when settled', () => {
    render(<MessageToolGroupSummary messages={[acpStep('completed', 't1')]} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(document.querySelector('[aria-live]')).toBeNull();
    const disclosure = screen.getByRole('button', { name: 'common.technical_details' });
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(disclosure);
    expect(screen.getByText('messages.toolActivity.tools.render_report.done')).toBeInTheDocument();
  });

  it('shows the reviewed-files narration immediately and keeps the raw command behind Technical Details', () => {
    render(<MessageToolGroupSummary messages={[commandStep('completed', 'read-1', 'sed -n 1,10p file.txt')]} />);

    // The friendly narration is part of the always-visible journal now.
    expect(screen.getByText('messages.toolActivity.categories.fileRead.done')).toBeInTheDocument();

    const disclosure = screen.getByRole('button', { name: 'common.technical_details' });
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('sed -n 1,10p file.txt')).not.toBeInTheDocument();

    fireEvent.click(disclosure);

    expect(disclosure).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('sed -n 1,10p file.txt')).toBeInTheDocument();
  });

  it('offers one Technical Details disclosure while work is running', () => {
    render(<MessageToolGroupSummary messages={[commandStep('in_progress', 'verify-1', 'bun run test')]} />);

    const disclosure = screen.getByRole('button', { name: 'common.technical_details' });
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(disclosure);
    expect(disclosure).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByText('common.technical_details')).toHaveLength(1);
  });

  it('toggles expandable tool details from the keyboard while leaving detail-less rows static', async () => {
    const user = userEvent.setup();
    const expandableTool: IMessageToolCall = {
      id: 'tool-expandable',
      conversation_id: 'conv-1',
      type: 'tool_call',
      content: {
        call_id: 'tool-expandable',
        name: 'Shell Command',
        description: 'Check current folder',
        args: { command: 'pwd' },
        output: '/workspace',
        status: 'completed',
      },
    };
    const staticTool: IMessageToolCall = {
      id: 'tool-static',
      conversation_id: 'conv-1',
      type: 'tool_call',
      content: {
        call_id: 'tool-static',
        name: 'Status Marker',
        description: 'No details available',
        args: {},
        status: 'completed',
      },
    };

    render(<MessageToolGroupSummary messages={[expandableTool, staticTool]} />);

    await user.click(screen.getByRole('button', { name: 'common.technical_details' }));
    const toolDisclosure = screen.getByRole('button', { name: 'Shell Command Check current folder' });
    expect(screen.queryByRole('button', { name: 'Status Marker No details available' })).not.toBeInTheDocument();

    await user.tab();
    expect(toolDisclosure).toHaveFocus();
    expect(toolDisclosure).toHaveAttribute('aria-expanded', 'false');
    const detailPanelId = toolDisclosure.getAttribute('aria-controls');
    expect(detailPanelId).toBeTruthy();

    await user.keyboard('{Enter}');
    const detailPanel = document.getElementById(detailPanelId!);
    expect(toolDisclosure).toHaveAttribute('aria-expanded', 'true');
    expect(detailPanel).toBeVisible();
    expect(within(detailPanel!).getByText('/workspace')).toBeVisible();

    await user.keyboard(' ');
    expect(toolDisclosure).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById(detailPanelId!)).not.toBeInTheDocument();
    expect(screen.getByText('Status Marker')).toBeVisible();
  });

  it('keeps repetitive search commands with distinct call ids as separate journal rows', () => {
    render(
      <MessageToolGroupSummary
        messages={[
          commandStep('completed', 'search-1', 'rg -n needle .'),
          commandStep('completed', 'search-2', 'find . -name needle'),
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'common.technical_details' }));
    expect(screen.getAllByText('messages.toolActivity.categories.search.done')).toHaveLength(2);
  });

  it('shows a safe thinking subject but not raw thinking content', () => {
    render(
      <MessageToolGroupSummary
        messages={
          [
            {
              id: 'thinking-1',
              conversation_id: 'conv-1',
              type: 'thinking',
              position: 'left',
              content: {
                subject: 'Reviewing the conversation activity',
                content: 'raw private reasoning must stay hidden',
                status: 'thinking',
              },
            },
          ] as WorkJournalSourceMessage[]
        }
      />
    );

    // Narration is always visible now — no "Technical details" click required.
    expect(screen.getByText('Reviewing the conversation activity')).toBeInTheDocument();
    expect(screen.queryByText(/raw private reasoning/)).not.toBeInTheDocument();
  });

  it('keeps safe trimmed plan narration visible', () => {
    render(
      <MessageToolGroupSummary
        messages={
          [
            {
              id: 'plan-1',
              conversation_id: 'conv-1',
              type: 'plan',
              position: 'left',
              content: {
                session_id: 'sess-1',
                entries: [{ content: '  Reviewing the activity flow  ', status: 'completed' }],
              },
            },
          ] as WorkJournalSourceMessage[]
        }
      />
    );

    // Narration is always visible now — no "Technical details" click required.
    expect(screen.getByText('Reviewing the activity flow')).toBeInTheDocument();
  });

  it('replaces unsafe plan narration with one localized fallback row', () => {
    const unsafeEntries = [
      'Microcompact local_estimate=1200 token watermark',
      'bun run test',
      'Run: git status',
      '`git diff`',
      '/Users/test/project/package.json',
      'C:\\workspace\\project\\package.json',
      'packages/desktop/src/renderer/App.tsx',
    ];
    render(
      <MessageToolGroupSummary
        isActive
        messages={
          [
            {
              id: 'plan-1',
              conversation_id: 'conv-1',
              type: 'plan',
              position: 'left',
              content: {
                session_id: 'sess-1',
                entries: unsafeEntries.map((content, index) => ({
                  content,
                  status: index === 0 ? ('completed' as const) : ('in_progress' as const),
                })),
              },
            },
          ] as WorkJournalSourceMessage[]
        }
      />
    );

    // Narration is always visible now — no "Technical details" click required.
    expect(screen.getAllByText('messages.toolActivity.generic.done')).toHaveLength(1);
    expect(screen.getAllByText('messages.toolActivity.generic.running')).toHaveLength(1);
    unsafeEntries.forEach((entry) => expect(screen.queryByText(entry)).not.toBeInTheDocument());
  });

  it('replaces technical provider narration shapes with one localized fallback row', () => {
    const unsafeEntries = [
      'bash -lc pwd',
      'docker compose up',
      'Run bun test',
      'Finished echo CUSTOMER_SECRET',
      "I'm running echo CUSTOMER_SECRET",
      'Running command: echo CUSTOMER_SECRET',
      'Completed command: git status',
      'Running the command: echo CUSTOMER_SECRET',
      'The command finished: git status',
      "I'm checking progress with git status",
      'src/App.tsx',
      'request_id=abc',
      'conversation_id: abc',
      'trace id: abc',
      'sh -c pwd',
      'zsh -lc pwd',
      'fish -c pwd',
      'podman compose up',
      'deno test',
      'python3 script.py',
      'pip install package',
      'Reviewing changes && git status',
      'https://example.com/status',
      'MODE=debug',
      '{"request_id":"abc"}',
      'session_id: abc',
      'provider=openai',
      'token id: abc',
      '```sh\npwd\n```',
    ];
    render(
      <MessageToolGroupSummary
        isActive
        messages={
          [
            {
              id: 'plan-technical',
              conversation_id: 'conv-1',
              type: 'plan',
              position: 'left',
              content: {
                session_id: 'sess-1',
                entries: unsafeEntries.map((content) => ({ content, status: 'in_progress' as const })),
              },
            },
          ] as WorkJournalSourceMessage[]
        }
      />
    );

    // Narration is always visible now — no "Technical details" click required.
    expect(screen.getAllByText('messages.toolActivity.generic.running')).toHaveLength(1);
    unsafeEntries.forEach((entry) => expect(screen.queryByText(entry)).not.toBeInTheDocument());
  });

  it('replaces terse command-shaped narration even when the executable is not labeled', () => {
    const unsafeEntries = [
      'pwd',
      'ls -la',
      'echo hello',
      'swift test',
      'pytest tests',
      'vitest run',
      'kubectl get pods',
      'Acme build release',
    ];
    render(
      <MessageToolGroupSummary
        isActive
        messages={
          [
            {
              id: 'plan-terse-commands',
              conversation_id: 'conv-1',
              type: 'plan',
              position: 'left',
              content: {
                session_id: 'sess-1',
                entries: unsafeEntries.map((content) => ({ content, status: 'in_progress' as const })),
              },
            },
          ] as WorkJournalSourceMessage[]
        }
      />
    );

    // Narration is always visible now — no "Technical details" click required.
    expect(screen.getAllByText('messages.toolActivity.generic.running')).toHaveLength(1);
    unsafeEntries.forEach((entry) => expect(screen.queryByText(entry)).not.toBeInTheDocument());
  });

  it('keeps ordinary sentence-shaped plan narration visible', () => {
    const safeEntries = [
      'Run the focused checks to confirm behavior',
      'Next: review the activity flow',
      'Reviewing input/output behavior',
      'Checking request ID validation',
      'Understand the current implementation before making changes',
      'We will review the implementation before changing it',
      'Find the relevant project files',
      'Test the changes to confirm behavior',
      'Echo the result to the user',
    ];
    render(
      <MessageToolGroupSummary
        isActive
        messages={
          [
            {
              id: 'plan-safe-sentences',
              conversation_id: 'conv-1',
              type: 'plan',
              position: 'left',
              content: {
                session_id: 'sess-1',
                entries: safeEntries.map((content) => ({ content, status: 'in_progress' as const })),
              },
            },
          ] as WorkJournalSourceMessage[]
        }
      />
    );

    // Narration is always visible now — no "Technical details" click required.
    safeEntries.forEach((entry) => expect(screen.getByText(entry)).toBeInTheDocument());
    expect(screen.queryByText('messages.toolActivity.generic.running')).not.toBeInTheDocument();
  });

  it('rejects command and path shaped thinking subjects without exposing raw content', () => {
    render(
      <MessageToolGroupSummary
        isActive
        messages={
          [
            {
              id: 'thinking-command',
              conversation_id: 'conv-1',
              type: 'thinking',
              position: 'left',
              content: { subject: 'Execute: npm test', content: 'raw command reasoning', status: 'thinking' },
            },
            {
              id: 'thinking-path',
              conversation_id: 'conv-1',
              type: 'thinking',
              position: 'left',
              content: {
                subject: 'Review packages/desktop/src/renderer/App.tsx',
                content: 'raw path reasoning',
                status: 'thinking',
              },
            },
          ] as WorkJournalSourceMessage[]
        }
      />
    );

    expect(screen.queryByText(/Execute: npm test/)).not.toBeInTheDocument();
    expect(screen.queryByText(/packages\/desktop\/src/)).not.toBeInTheDocument();
    expect(screen.queryByText(/raw .* reasoning/)).not.toBeInTheDocument();
  });

  it('rejects diagnostic thinking subjects', () => {
    render(
      <MessageToolGroupSummary
        messages={
          [
            {
              id: 'thinking-1',
              conversation_id: 'conv-1',
              type: 'thinking',
              position: 'left',
              content: {
                subject: 'Microcompact: internal activity telemetry',
                content: 'private detail',
                status: 'done',
              },
            },
          ] as WorkJournalSourceMessage[]
        }
      />
    );

    expect(screen.queryByText(/Microcompact/)).not.toBeInTheDocument();
  });

  it('truncates long thinking subjects to 180 characters with an ellipsis', () => {
    const subject = `Reviewing ${'a'.repeat(220)}`;
    render(
      <MessageToolGroupSummary
        messages={
          [
            {
              id: 'thinking-1',
              conversation_id: 'conv-1',
              type: 'thinking',
              position: 'left',
              content: { subject, content: 'private detail', status: 'done' },
            },
          ] as WorkJournalSourceMessage[]
        }
      />
    );

    // Narration is always visible now — no "Technical details" click required.
    const visibleSubject = screen.getByText((text) => text.startsWith('Reviewing'));
    expect(visibleSubject.textContent).toHaveLength(180);
    expect(visibleSubject.textContent).toMatch(/…$/);
  });

  it('truncates long plan narration to 180 characters with an ellipsis', () => {
    const content = `Reviewing ${'a'.repeat(220)}`;
    render(
      <MessageToolGroupSummary
        messages={
          [
            {
              id: 'plan-1',
              conversation_id: 'conv-1',
              type: 'plan',
              position: 'left',
              content: { session_id: 'sess-1', entries: [{ content, status: 'completed' }] },
            },
          ] as WorkJournalSourceMessage[]
        }
      />
    );

    // Narration is always visible now — no "Technical details" click required.
    const visibleContent = screen.getByText((text) => text.startsWith('Reviewing'));
    expect(visibleContent.textContent).toHaveLength(180);
    expect(visibleContent.textContent).toMatch(/…$/);
  });

  it('keeps only the final plan, thinking, or tool phase live in an active summary', () => {
    render(
      <MessageToolGroupSummary
        isActive
        messages={
          [
            {
              id: 'plan-1',
              conversation_id: 'conv-1',
              type: 'plan',
              position: 'left',
              content: { session_id: 'sess-1', entries: [{ content: 'Planning changes', status: 'in_progress' }] },
            },
            {
              id: 'thinking-1',
              conversation_id: 'conv-1',
              type: 'thinking',
              position: 'left',
              content: { subject: 'Reviewing options', content: 'private detail', status: 'thinking' },
            },
            commandStep('in_progress', 'verify-1', 'bun run test'),
          ] as WorkJournalSourceMessage[]
        }
      />
    );

    // No live status region while active, and narration is always visible now.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('Planning changes').closest('[data-status]')).toHaveAttribute('data-status', 'completed');
    expect(screen.getByText('Reviewing options').closest('[data-status]')).toHaveAttribute('data-status', 'completed');
    expect(
      screen.getByText('messages.toolActivity.categories.verify.running').closest('[data-status]')
    ).toHaveAttribute('data-status', 'running');
  });

  it('settles an earlier tool step and uses its done narration when thinking follows it', () => {
    render(
      <MessageToolGroupSummary
        isActive
        messages={
          [
            commandStep('in_progress', 'search-1', 'rg -n needle .'),
            {
              id: 'thinking-1',
              conversation_id: 'conv-1',
              type: 'thinking',
              position: 'left',
              content: { subject: 'Choosing the next change', content: 'private detail', status: 'thinking' },
            },
          ] as WorkJournalSourceMessage[]
        }
      />
    );

    // No live status region while active, and narration is always visible now.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('messages.toolActivity.categories.search.done')).toBeInTheDocument();
    expect(screen.queryByText('messages.toolActivity.categories.search.running')).not.toBeInTheDocument();
  });

  it('settles every pending or running row in an inactive summary', () => {
    render(
      <MessageToolGroupSummary
        isActive={false}
        messages={
          [
            {
              id: 'plan-1',
              conversation_id: 'conv-1',
              type: 'plan',
              position: 'left',
              content: {
                session_id: 'sess-1',
                entries: [
                  { content: 'Queued work', status: 'pending' },
                  { content: 'Active work', status: 'in_progress' },
                ],
              },
            },
            commandStep('in_progress', 'verify-1', 'bun run test'),
          ] as WorkJournalSourceMessage[]
        }
      />
    );

    // Narration is always visible now — no "Technical details" click required.
    expect(screen.getByText('Queued work').closest('[data-status]')).toHaveAttribute('data-status', 'canceled');
    expect(screen.getByText('Active work').closest('[data-status]')).toHaveAttribute('data-status', 'completed');
    expect(screen.getByText('messages.toolActivity.categories.verify.done')).toBeInTheDocument();
    // The turn is settled (not active, and not trivial), so the warm close renders
    // with role="status" — the inverse of the old active-only live region.
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/^messages\.toolActivity\.close\.canceled\.v\d$/)).toBeInTheDocument();
  });

  it('switches an unsafe plan fallback to done narration when the summary settles', () => {
    render(
      <MessageToolGroupSummary
        isActive={false}
        messages={
          [
            {
              id: 'plan-1',
              conversation_id: 'conv-1',
              type: 'plan',
              position: 'left',
              content: {
                session_id: 'sess-1',
                entries: [{ content: 'bun run test', status: 'in_progress' }],
              },
            },
          ] as WorkJournalSourceMessage[]
        }
      />
    );

    // Narration is always visible now — no "Technical details" click required.
    const row = screen.getByText('messages.toolActivity.generic.done').closest('[data-status]');
    expect(row).toHaveAttribute('data-status', 'completed');
    expect(row?.querySelector('[data-status-icon="completed"]')).toBeInTheDocument();
    expect(screen.queryByText('messages.toolActivity.generic.running')).not.toBeInTheDocument();
  });

  it('renders plan, thinking, and tool rows in source order', () => {
    render(
      <MessageToolGroupSummary
        messages={
          [
            {
              id: 'plan-1',
              conversation_id: 'conv-1',
              type: 'plan',
              position: 'left',
              content: {
                session_id: 'sess-1',
                entries: [{ content: 'Review the activity flow', status: 'completed' }],
              },
            },
            {
              id: 'thinking-1',
              conversation_id: 'conv-1',
              type: 'thinking',
              position: 'left',
              content: { subject: 'Choosing a safe approach', content: 'private detail', status: 'done' },
            },
            commandStep('completed', 'search-1', 'rg -n needle .'),
          ] as WorkJournalSourceMessage[]
        }
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'common.technical_details' }));
    const plan = screen.getByText('Review the activity flow');
    const thinking = screen.getByText('Choosing a safe approach');
    const tool = screen.getByText('messages.toolActivity.categories.search.done');
    expect(plan.compareDocumentPosition(thinking)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(thinking.compareDocumentPosition(tool)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('maps plan entry statuses to pending, running, and completed rows', () => {
    render(
      <MessageToolGroupSummary
        isActive
        messages={
          [
            {
              id: 'plan-1',
              conversation_id: 'conv-1',
              type: 'plan',
              position: 'left',
              content: {
                session_id: 'sess-1',
                entries: [
                  { content: 'Queued work', status: 'pending' },
                  { content: 'Finished work', status: 'completed' },
                  { content: 'Active work', status: 'in_progress' },
                ],
              },
            },
          ] as WorkJournalSourceMessage[]
        }
      />
    );

    // Narration is always visible now — no "Technical details" click required.
    expect(screen.getByText('Queued work').closest('[data-status]')).toHaveAttribute('data-status', 'pending');
    expect(screen.getByText('Active work').closest('[data-status]')).toHaveAttribute('data-status', 'running');
    expect(screen.getByText('Finished work').closest('[data-status]')).toHaveAttribute('data-status', 'completed');
  });

  it('renders canceled work as a warning and never as success', () => {
    const canceled: IMessageToolGroup = {
      id: 'canceled-1',
      conversation_id: 'conv-1',
      type: 'tool_group',
      position: 'left',
      content: [
        {
          call_id: 'canceled-1',
          description: 'Canceled command',
          name: 'Shell Command',
          render_output_as_markdown: false,
          status: 'Canceled',
        },
      ],
    };

    render(<MessageToolGroupSummary messages={[canceled]} />);

    fireEvent.click(screen.getByRole('button', { name: 'common.technical_details' }));
    const row = screen.getByText('messages.toolActivity.status.stopped').closest('[data-status]');
    expect(row).toHaveAttribute('data-status', 'canceled');
    expect(row?.querySelector('[data-status-icon="completed"]')).not.toBeInTheDocument();
  });

  it('keeps distinct failed and running calls separate without inventing a retry chain', () => {
    render(
      <MessageToolGroupSummary
        isActive
        messages={[acpStep('failed', 't1'), acpStep('failed', 't2'), acpStep('in_progress', 't3')]}
      />
    );
    expect(screen.queryByText('messages.toolActivity.tools.render_report.failedTitle')).not.toBeInTheDocument();
    expect(screen.queryByText('messages.toolActivity.error.suggestion')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'common.technical_details' }));
    expect(screen.getByText(/messages\.toolActivity\.tools\.render_report\.running/)).toBeInTheDocument();
    expect(screen.getAllByText('forge-reports_render_report')).toHaveLength(3);
    expect(screen.queryByText(/messages\.toolActivity\.attempt/)).not.toBeInTheDocument();
  });

  it('reports distinct failed and completed calls as partial work rather than recovery', () => {
    render(<MessageToolGroupSummary messages={[acpStep('failed', 't1'), acpStep('completed', 't2')]} />);

    expect(screen.getByText(/^messages\.toolActivity\.close\.partial\.v\d$/)).toBeInTheDocument();
    expect(screen.queryByText('messages.toolActivity.tools.render_report.failedTitle')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'common.technical_details' }));
    expect(screen.getByText('messages.toolActivity.tools.render_report.done')).toBeInTheDocument();
    expect(screen.getAllByText('forge-reports_render_report')).toHaveLength(2);
    expect(screen.queryByText(/messages\.toolActivity\.status\.recovered/)).not.toBeInTheDocument();
  });

  it('coalesces one stable tool call across intervening plan narration', () => {
    render(
      <MessageToolGroupSummary
        messages={
          [
            acpStep('failed', 'retry-1'),
            {
              id: 'plan-between-retries',
              conversation_id: 'conv-1',
              type: 'plan',
              position: 'left',
              content: {
                session_id: 'sess-1',
                entries: [{ content: 'Reviewing the retry result', status: 'completed' }],
              },
            },
            acpStep('completed', 'retry-1'),
          ] as WorkJournalSourceMessage[]
        }
      />
    );

    expect(screen.getByText(/^messages\.toolActivity\.close\.recovered\.v\d$/)).toBeInTheDocument();
    expect(screen.queryByText(/^messages\.toolActivity\.close\.partial\.v\d$/)).not.toBeInTheDocument();
  });

  it('does not claim recovery when a separate in-progress call is synthetically settled', () => {
    render(<MessageToolGroupSummary messages={[acpStep('failed', 't1'), acpStep('in_progress', 't2')]} />);

    expect(screen.getByText(/^messages\.toolActivity\.close\.partial\.v\d$/)).toBeInTheDocument();
    expect(screen.queryByText('messages.toolActivity.tools.render_report.failedTitle')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'common.technical_details' }));
    expect(screen.getByText('messages.toolActivity.tools.render_report.done')).toBeInTheDocument();
    expect(screen.getAllByText('forge-reports_render_report')).toHaveLength(2);
    expect(screen.queryByText(/messages\.toolActivity\.status\.recovered/)).not.toBeInTheDocument();
  });

  it('keeps a failed tool in technical inspection without duplicating its timeline error card', () => {
    render(<MessageToolGroupSummary messages={[acpStep('failed', 't1')]} />);

    expect(screen.queryByText('messages.toolActivity.tools.render_report.failedTitle')).not.toBeInTheDocument();
    expect(screen.queryByText('messages.toolActivity.error.suggestion')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'common.technical_details' }));
    expect(screen.getByText('forge-reports_render_report')).toBeInTheDocument();
    expect(screen.queryByText('messages.toolActivity.error.suggestion')).not.toBeInTheDocument();
  });

  describe('turn recap', () => {
    const activityStep = (
      status: string,
      toolCallId: string,
      title: string,
      kind: string,
      rawInput?: Record<string, string>
    ): IMessageAcpToolCall =>
      ({
        id: toolCallId,
        conversation_id: 'conv-1',
        type: 'acp_tool_call',
        content: {
          sessionId: 'sess-1',
          update: {
            sessionUpdate: 'tool_call_update',
            tool_call_id: toolCallId,
            status,
            title,
            kind,
            rawInput,
          },
        },
      }) as unknown as IMessageAcpToolCall;

    it('counts repeated completed generic steps with distinct call ids', () => {
      render(
        <MessageToolGroupSummary
          messages={[
            activityStep('completed', 'generic-1', 'Task', 'info'),
            activityStep('completed', 'generic-2', 'Task', 'info'),
            activityStep('completed', 'generic-3', 'Task', 'info'),
          ]}
        />
      );

      // The old count-only headline/activity/outcome summary is retired in favor of
      // a full narration row per distinct action, so all 3 render individually.
      expect(screen.getAllByText('messages.toolActivity.categories.generic.done')).toHaveLength(3);
      expect(screen.getByText(/^messages\.toolActivity\.close\.completed\.v\d$/)).toBeInTheDocument();
    });

    it('shows every distinct work category in source order without truncation', () => {
      render(
        <MessageToolGroupSummary
          messages={[
            commandStep('completed', 'search-1', 'rg -n needle .'),
            commandStep('completed', 'read-1', 'sed -n 1,10p file.txt'),
            activityStep('completed', 'write-1', 'write_file', 'edit'),
            commandStep('completed', 'verify-1', 'bun run test'),
          ]}
        />
      );

      // The redesign replaces the old top-3-plus-overflow category summary with a
      // full narration row per action, in source order, so nothing is truncated.
      const search = screen.getByText('messages.toolActivity.categories.search.done');
      const fileRead = screen.getByText('messages.toolActivity.categories.fileRead.done');
      const fileWrite = screen.getByText('messages.toolActivity.categories.fileWrite.done');
      const verify = screen.getByText('messages.toolActivity.categories.verify.done');
      expect(search.compareDocumentPosition(fileRead)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(fileRead.compareDocumentPosition(fileWrite)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(fileWrite.compareDocumentPosition(verify)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    it('keeps completed work visible alongside what is still underway while active', () => {
      render(
        <MessageToolGroupSummary
          isActive
          messages={[
            commandStep('completed', 'search-1', 'rg -n needle .'),
            commandStep('in_progress', 'verify-1', 'bun run test'),
          ]}
        />
      );

      // The count-based "Completed: N of M" outcome sentence is retired — the
      // per-row narration and status now carry this instead.
      expect(screen.getByText('messages.toolActivity.categories.search.done').closest('[data-status]')).toHaveAttribute(
        'data-status',
        'completed'
      );
      expect(
        screen.getByText('messages.toolActivity.categories.verify.running').closest('[data-status]')
      ).toHaveAttribute('data-status', 'running');
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('keeps a failed step out of the active narration while other work continues', () => {
      render(
        <MessageToolGroupSummary
          isActive
          messages={[acpStep('failed', 'failed-1'), commandStep('in_progress', 'verify-1', 'bun run test')]}
        />
      );

      // The richer "activeWithFailure" outcome sentence is retired with no direct
      // replacement — a failed step stays out of the visible narration (as before)
      // and is only reachable via Technical Details, with no live-region nuance
      // while the turn is still active.
      expect(screen.queryByText('messages.toolActivity.tools.render_report.failedTitle')).not.toBeInTheDocument();
      expect(screen.getByText('messages.toolActivity.categories.verify.running')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'common.technical_details' }));
      expect(screen.getByText('forge-reports_render_report')).toBeInTheDocument();
    });

    it('does not report inactive pending work as active', () => {
      render(
        <MessageToolGroupSummary
          messages={
            [
              {
                id: 'pending-plan',
                conversation_id: 'conv-1',
                type: 'plan',
                position: 'left',
                content: { session_id: 'sess-1', entries: [{ content: 'Queued work', status: 'pending' }] },
              },
            ] as WorkJournalSourceMessage[]
          }
        />
      );

      expect(screen.getByText('Queued work').closest('[data-status]')).toHaveAttribute('data-status', 'canceled');
      expect(screen.getByText(/^messages\.toolActivity\.close\.canceled\.v\d$/)).toBeInTheDocument();
    });

    it('keeps pending work active while the turn remains active', () => {
      render(
        <MessageToolGroupSummary
          isActive
          messages={
            [
              {
                id: 'pending-plan',
                conversation_id: 'conv-1',
                type: 'plan',
                position: 'left',
                content: { session_id: 'sess-1', entries: [{ content: 'Queued work', status: 'pending' }] },
              },
            ] as WorkJournalSourceMessage[]
          }
        />
      );

      expect(screen.getByText('Queued work').closest('[data-status]')).toHaveAttribute('data-status', 'pending');
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('shows each repeated-category action as its own narration row', () => {
      render(
        <MessageToolGroupSummary
          messages={[
            commandStep('completed', 'search-1', 'rg -n needle .'),
            activityStep('completed', 'write-1', 'write_file', 'edit'),
            commandStep('completed', 'search-2', 'rg -n other .'),
          ]}
        />
      );

      // The old "(2)" count-safe category label is retired — two distinct search
      // actions now each render their own narration row.
      expect(screen.getAllByText('messages.toolActivity.categories.search.done')).toHaveLength(2);
    });

    it('keeps every recap headline count-aware and locale-formatted', () => {
      expect(
        Object.values(enUsMessages.toolActivity.recap.headline).every((headline) =>
          headline.includes('{{total, number}}')
        )
      ).toBe(true);
    });

    it('shows the safe narration subject directly, with no separate "Focus" echo', () => {
      render(
        <MessageToolGroupSummary
          messages={
            [
              {
                id: 'safe-plan',
                conversation_id: 'conv-1',
                type: 'plan',
                position: 'left',
                content: {
                  session_id: 'sess-1',
                  entries: [{ content: 'Reviewing the account settings', status: 'completed' }],
                },
              },
            ] as WorkJournalSourceMessage[]
          }
        />
      );

      // The narration row itself carries this text now; the old separate
      // "Focus: ..." echo of the safe subject is retired as redundant.
      expect(screen.getByText('Reviewing the account settings')).toBeInTheDocument();
      expect(screen.queryByText(/^messages\.toolActivity\.recap\.subject/)).not.toBeInTheDocument();
    });

    it('does not claim recovery for distinct failed and successful calls', () => {
      render(<MessageToolGroupSummary messages={[acpStep('failed', 'retry-1'), acpStep('completed', 'retry-2')]} />);

      expect(screen.getByText(/^messages\.toolActivity\.close\.partial\.v\d$/)).toBeInTheDocument();
      expect(screen.queryByText(/^messages\.toolActivity\.close\.recovered\.v\d$/)).not.toBeInTheDocument();
    });

    it('keeps multiple distinct failures visible instead of treating them as retries', () => {
      render(
        <MessageToolGroupSummary
          messages={[
            acpStep('failed', 'retry-1'),
            acpStep('failed', 'retry-2'),
            acpStep('failed', 'retry-3'),
            acpStep('completed', 'retry-4'),
          ]}
        />
      );

      expect(screen.getByText(/^messages\.toolActivity\.close\.partial\.v\d$/)).toBeInTheDocument();
      expect(screen.queryByText('messages.toolActivity.tools.render_report.failedTitle')).not.toBeInTheDocument();
      expect(screen.queryByText(/^messages\.toolActivity\.close\.recovered\.v\d$/)).not.toBeInTheDocument();
    });

    it('renders grammatical active English outcomes for one and many actions through i18next', async () => {
      const instance = await createMessagesInstance('en-US', enUsMessages);

      expect(instance.t('messages.toolActivity.recap.outcome.active', { completed: 1, total: 2, pending: 1 })).toBe(
        "I'm making steady progress. Completed: 1 of 2. Actions still underway: 1."
      );
      expect(
        instance.t('messages.toolActivity.recap.outcome.active', { completed: 1234, total: 1500, pending: 266 })
      ).toBe("I'm making steady progress. Completed: 1,234 of 1,500. Actions still underway: 266.");
    });

    it('renders grammatical partial English outcomes for one and many actions through i18next', async () => {
      const instance = await createMessagesInstance('en-US', enUsMessages);

      expect(instance.t('messages.toolActivity.recap.outcome.partial', { completed: 1, total: 2, failed: 1 })).toBe(
        'I completed part of the planned work. Completed: 1 of 2. Actions needing another attempt: 1.'
      );
      expect(
        instance.t('messages.toolActivity.recap.outcome.partial', { completed: 1234, total: 1500, failed: 266 })
      ).toBe('I completed part of the planned work. Completed: 1,234 of 1,500. Actions needing another attempt: 266.');
    });

    it('renders grammatical canceled English outcomes for one and many actions through i18next', async () => {
      const instance = await createMessagesInstance('en-US', enUsMessages);

      expect(instance.t('messages.toolActivity.recap.outcome.canceled', { total: 1, unfinished: 1, canceled: 1 })).toBe(
        'I stopped this turn before the planned work was complete. Planned actions: 1. Actions left unfinished: 1. Actions stopped: 1.'
      );
      expect(
        instance.t('messages.toolActivity.recap.outcome.canceled', {
          total: 1500,
          unfinished: 266,
          canceled: 266,
        })
      ).toBe(
        'I stopped this turn before the planned work was complete. Planned actions: 1,500. Actions left unfinished: 266. Actions stopped: 266.'
      );
    });

    it('keeps completed and recovered English outcomes natural', () => {
      const outcome = enUsMessages.toolActivity.recap.outcome;

      expect(outcome.completed).toBe('I completed everything planned for this turn.');
      expect(outcome.recovered).toBe('I completed everything planned for this turn after retrying the work.');
      expect(outcome.recovered).not.toContain('{{retries}}');
    });

    it('reports partial completion while leaving the failed tool inside technical inspection', () => {
      render(
        <MessageToolGroupSummary
          messages={[
            commandStep('completed', 'search-1', 'rg -n needle .'),
            activityStep('failed', 'report-1', 'forge-reports_render_report', 'execute'),
          ]}
        />
      );

      expect(screen.getByText(/^messages\.toolActivity\.close\.partial\.v\d$/)).toBeInTheDocument();
      expect(screen.queryByText('messages.toolActivity.tools.render_report.failedTitle')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'common.technical_details' }));
      expect(screen.getByText('forge-reports_render_report')).toBeInTheDocument();
    });

    it('reports canceled work as stopped', () => {
      const canceled: IMessageToolGroup = {
        id: 'canceled-1',
        conversation_id: 'conv-1',
        type: 'tool_group',
        position: 'left',
        content: [
          {
            call_id: 'canceled-1',
            description: 'Canceled command',
            name: 'Shell Command',
            render_output_as_markdown: false,
            status: 'Canceled',
          },
        ],
      };

      render(<MessageToolGroupSummary messages={[canceled]} />);

      expect(screen.getByText(/^messages\.toolActivity\.close\.canceled\.v\d$/)).toBeInTheDocument();
    });

    it('accounts for failed and canceled terminal work together', () => {
      const canceled: IMessageToolGroup = {
        id: 'canceled-1',
        conversation_id: 'conv-1',
        type: 'tool_group',
        position: 'left',
        content: [
          {
            call_id: 'canceled-1',
            description: 'Canceled command',
            name: 'Shell Command',
            render_output_as_markdown: false,
            status: 'Canceled',
          },
        ],
      };

      render(<MessageToolGroupSummary messages={[acpStep('failed', 'failed-1'), canceled]} />);

      // The exact failed/canceled/unfinished tallies no longer surface in the UI —
      // only the qualitative "failed" close status is now observable here.
      expect(screen.getByText(/^messages\.toolActivity\.close\.failed\.v\d$/)).toBeInTheDocument();
    });

    it('accounts for active and failed work together', () => {
      render(
        <MessageToolGroupSummary
          isActive
          messages={[acpStep('failed', 'failed-1'), commandStep('in_progress', 'verify-1', 'bun run test')]}
        />
      );

      // While active there is no outcome sentence at all (and no close, since the
      // turn hasn't settled) — the failed step stays out of the narration list.
      expect(screen.queryByText('messages.toolActivity.tools.render_report.failedTitle')).not.toBeInTheDocument();
      expect(screen.getByText('messages.toolActivity.categories.verify.running')).toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('keeps raw command, path, output, telemetry, and provider narration out of the recap', () => {
      const unsafePlan = 'Run: bun test packages/desktop/src/renderer/App.tsx request_id=secret';
      render(
        <MessageToolGroupSummary
          messages={
            [
              {
                id: 'unsafe-plan',
                conversation_id: 'conv-1',
                type: 'plan',
                position: 'left',
                content: { session_id: 'sess-1', entries: [{ content: unsafePlan, status: 'completed' }] },
              },
              commandStep('completed', 'command-1', 'rg -n secret /private/project'),
            ] as WorkJournalSourceMessage[]
          }
        />
      );

      expect(screen.queryByText(/rg -n secret/)).not.toBeInTheDocument();
      expect(screen.queryByText(/packages\/desktop\/src/)).not.toBeInTheDocument();
      expect(screen.queryByText(/request_id=secret/)).not.toBeInTheDocument();
      expect(screen.queryByText(/messages\.toolActivity\.recap\.subject/)).not.toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'common.technical_details' })).toHaveLength(1);
    });
  });
});

describe('MessageToolGroupSummary narration-first journal', () => {
  beforeEach(async () => {
    await useRealMessages('en-US', enUsMessages as Record<string, unknown>);
  });

  const planMessage = (): WorkJournalSourceMessage =>
    ({
      id: 'plan-1',
      conversation_id: 'conv-1',
      type: 'plan',
      position: 'left',
      created_at: 1,
      content: {
        entries: [
          { content: 'Enable the Google Drive API', status: 'completed' },
          { content: 'Verify authentication', status: 'completed' },
        ],
      },
    }) as unknown as WorkJournalSourceMessage;

  it('shows the plan narration without expanding Technical details', () => {
    render(<MessageToolGroupSummary messages={[planMessage()]} isActive={false} />);
    expect(screen.getByText('Enable the Google Drive API')).toBeInTheDocument();
    expect(screen.getByText('Verify authentication')).toBeInTheDocument();
  });

  it('renders a warm close and none of the retired count/headline copy', () => {
    render(<MessageToolGroupSummary messages={[planMessage()]} isActive={false} />);
    expect(screen.getByText(/done|finished|came together/i)).toBeInTheDocument();
    expect(screen.queryByText(/Work completed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/This turn covered/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Completed: \d+ of \d+/i)).not.toBeInTheDocument();
  });

  it('shows no close while the turn is active', () => {
    const active: WorkJournalSourceMessage = {
      id: 'plan-1',
      conversation_id: 'conv-1',
      type: 'plan',
      position: 'left',
      created_at: 1,
      content: { entries: [{ content: 'Enable the Google Drive API', status: 'in_progress' }] },
    } as unknown as WorkJournalSourceMessage;
    render(<MessageToolGroupSummary messages={[active]} isActive={true} />);
    expect(screen.queryByText(/done|finished|came together/i)).not.toBeInTheDocument();
  });

  it('shows no Technical details toggle when there are no raw tool calls', () => {
    render(<MessageToolGroupSummary messages={[planMessage()]} isActive={false} />);
    expect(screen.queryByText(/technical details/i)).not.toBeInTheDocument();
  });

  it('renders a close for a single completed action that carries a safe subject', () => {
    // A lone action is normally "trivial" and gets no close (see buildTurnClose.test.ts).
    // A safe narration subject makes it notable enough to close — this proves that path.
    const singleActionWithSubject: WorkJournalSourceMessage = {
      id: 'plan-1',
      conversation_id: 'conv-1',
      type: 'plan',
      position: 'left',
      created_at: 1,
      content: { entries: [{ content: 'Enable the Google Drive API', status: 'completed' }] },
    } as unknown as WorkJournalSourceMessage;
    render(<MessageToolGroupSummary messages={[singleActionWithSubject]} isActive={false} />);
    expect(screen.getByText(/done|finished|came together/i)).toBeInTheDocument();
  });

  it('does not show the red failure banner for a recovered step', () => {
    const recovered: WorkJournalSourceMessage = {
      id: 'tg-1',
      conversation_id: 'conv-1',
      type: 'tool_group',
      position: 'left',
      created_at: 1,
      content: [
        {
          call_id: 'c1',
          name: 'ExecCommand',
          status: 'Success',
          startTime: 1,
        },
      ],
    } as unknown as WorkJournalSourceMessage;
    render(<MessageToolGroupSummary messages={[recovered]} isActive={false} />);
    expect(screen.queryByText(/I couldn't complete the project step/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/error details are available below/i)).not.toBeInTheDocument();
  });

  it('renders the amber warm close with the text-warning class for a fully failed turn', () => {
    // A tool_group whose single call errored: normalizeToolGroupStatus maps
    // status 'Error' to the 'error' NormalizedToolStatus (see
    // packages/desktop/src/common/chat/normalizeToolCall.ts), which makes
    // buildTurnWorkRecap report status 'failed' and buildTurnClose render a
    // close.failed.* line with tone 'attention'.
    const failedTurn: WorkJournalSourceMessage = {
      id: 'tg-failed',
      conversation_id: 'conv-1',
      type: 'tool_group',
      position: 'left',
      created_at: 1,
      content: [
        {
          call_id: 'c1',
          name: 'ExecCommand',
          status: 'Error',
        },
      ],
    } as unknown as WorkJournalSourceMessage;
    render(<MessageToolGroupSummary messages={[failedTurn]} isActive={false} />);

    const close = screen.getByText(/wasn't able to finish|didn't go through/i);
    expect(close).toBeInTheDocument();
    expect(close).toHaveClass('text-warning');
  });

  it('renders the amber warm close with the text-warning class for a partial turn', () => {
    // One completed call plus one errored call in the same tool_group: failed > 0
    // and completed > 0 makes buildTurnWorkRecap report status 'partial', so
    // buildTurnClose renders a close.partial.* line with tone 'attention'.
    const partialTurn: WorkJournalSourceMessage = {
      id: 'tg-partial',
      conversation_id: 'conv-1',
      type: 'tool_group',
      position: 'left',
      created_at: 1,
      content: [
        {
          call_id: 'c1',
          name: 'ExecCommand',
          status: 'Success',
        },
        {
          call_id: 'c2',
          name: 'ExecCommand',
          status: 'Error',
        },
      ],
    } as unknown as WorkJournalSourceMessage;
    render(<MessageToolGroupSummary messages={[partialTurn]} isActive={false} />);

    const close = screen.getByText(/got most of this done|Good progress/i);
    expect(close).toBeInTheDocument();
    expect(close).toHaveClass('text-warning');
  });
});
