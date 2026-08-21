/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMessageText } from '@/common/chat/chatLib';
import { ipcBridge } from '@/common';
import type { PresentationTemplateCandidateFailureCode } from '@/common/types/office/presentationTemplate';
import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';
import MessageText from '@/renderer/pages/conversation/Messages/components/MessageText';
import { TEMPLATE_CREATION_DIRECTIVE } from '@/renderer/components/chat/TemplateGallery/directive';
import { TEMPLATE_REVIEW_MARKER_PREFIX } from '@/renderer/utils/chat/templatedSendParser';

const candidate = {
  name: 'Quarterly Blue',
  tokens: { colors: ['blue'], fonts: ['Inter'] },
  preview_data_url: 'data:image/svg+xml;base64,preview',
  sha256: 'main-minted-digest',
  byte_length: 512,
};

const translations: Record<string, string> = {
  'messages.templateReview.disclosure': 'Theme content is retained locally and used in future templated sends.',
  'messages.templateReview.confirm': 'Install in Template Gallery',
  'messages.templateReview.installing': 'Installing…',
  'messages.templateReview.installed': 'Installed in Template Gallery',
  'messages.templateReview.failure.INVALID_REQUEST': 'The template review request is invalid. Nothing was installed.',
  'messages.templateReview.failure.RUN_NOT_FOUND': 'The presentation run could not be found. Nothing was installed.',
  'messages.templateReview.failure.RUN_FORBIDDEN':
    'This presentation run does not belong to this chat. Nothing was installed.',
  'messages.templateReview.failure.SCOPE_UNAVAILABLE': 'This chat workspace is unavailable. Nothing was installed.',
  'messages.templateReview.failure.TEAM_SCOPE_UNSUPPORTED':
    'Template review is not available in team chats. Nothing was installed.',
  'messages.templateReview.failure.CANDIDATE_OUTSIDE_WORKSPACE':
    'The theme file is outside this chat workspace. Nothing was installed.',
  'messages.templateReview.failure.CANDIDATE_UNSUPPORTED':
    'The theme file is not a supported THEME.md. Nothing was installed.',
  'messages.templateReview.failure.CANDIDATE_TOO_LARGE': 'The theme file is too large. Nothing was installed.',
  'messages.templateReview.failure.CANDIDATE_CHANGED':
    'The theme content changed after you reviewed it. Nothing was installed.',
  'messages.templateReview.failure.CONFIRMATION_NOT_MINTED':
    'This review is no longer valid. Review the theme again before installing it. Nothing was installed.',
  'messages.templateReview.failure.INSTALL_FAILED': 'The theme could not be installed. Nothing was installed.',
  'messages.templateReview.requestFailed': 'The theme could not be reviewed. Nothing was installed.',
};

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      getFileMetadata: { invoke: vi.fn() },
      getImageBase64: { invoke: vi.fn() },
      readFile: { invoke: vi.fn() },
    },
    presentationTemplates: {
      list: { invoke: vi.fn().mockResolvedValue([]) },
      describeSpec: { invoke: vi.fn() },
      importSpecBound: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@/renderer/pages/conversation/Preview/context/PreviewContext', () => ({
  usePreviewContext: () => ({ openPreview: vi.fn() }),
}));

vi.mock('@/renderer/components/chat/CollapsibleContent', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/renderer/components/media/FilePreview', () => ({
  __esModule: true,
  default: ({ path }: { path: string }) => <div>{path}</div>,
}));

vi.mock('@/renderer/components/media/HorizontalFileList', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/renderer/components/Markdown', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/renderer/utils/chat/skillSuggestParser', () => ({
  hasSkillSuggest: () => false,
  stripSkillSuggest: (content: string) => content,
}));

vi.mock('@/renderer/utils/chat/thinkTagFilter', () => ({
  hasThinkTags: () => false,
  splitThinkContent: (content: string) => ({ reasoning: '', answer: content }),
}));

vi.mock('@/renderer/utils/model/agentLogo', () => ({
  useAgentLogos: () => ({}),
  resolveAgentLogo: () => null,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/TeammateMessageAvatar', () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock('@/renderer/utils/ui/clipboard', () => ({
  copyText: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@arco-design/web-react', () => ({
  Alert: () => null,
  Message: { error: vi.fn() },
  Button: ({
    children,
    icon,
    loading: _loading,
    ...props
  }: React.ComponentProps<'button'> & { icon?: React.ReactNode; loading?: boolean }) => (
    <button type='button' {...props}>
      {icon}
      {children}
    </button>
  ),
  Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  Tag: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('@icon-park/react', () => ({
  Copy: () => null,
  Brain: () => null,
  Right: () => null,
  AddOne: () => null,
  CheckOne: () => null,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => translations[key] ?? options?.defaultValue ?? key,
  }),
}));

const marker = (filePath: string) => `${TEMPLATE_REVIEW_MARKER_PREFIX}${JSON.stringify({ file_path: filePath })} -->`;

const renderMessage = (content: string, conversationId = 'conv-context') => {
  const message: IMessageText = {
    id: 'assistant-template-review',
    msg_id: 'assistant-template-review',
    conversation_id: 'marker-must-not-control-this',
    type: 'text',
    position: 'left',
    createdAt: Date.now(),
    content: { content },
  };

  return render(
    <ConversationProvider value={{ conversation_id: conversationId, workspace: '/workspace', type: 'acp' }}>
      <MessageText message={message} />
    </ConversationProvider>
  );
};

const renderUserMessage = (content: string) => {
  const message: IMessageText = {
    id: 'user-template-request',
    msg_id: 'user-template-request',
    conversation_id: 'conv-context',
    type: 'text',
    position: 'right',
    createdAt: Date.now(),
    content: { content },
  };

  return render(
    <ConversationProvider value={{ conversation_id: 'conv-context', workspace: '/workspace', type: 'acp' }}>
      <MessageText message={message} />
    </ConversationProvider>
  );
};

describe('user template-creation sends', () => {
  it('hides the assistant-only directive and keeps the original request visible', () => {
    const request = 'Save this look as a reusable template';
    renderUserMessage(`${TEMPLATE_CREATION_DIRECTIVE}\n\n${request}`);

    expect(screen.getByTestId('message-text-content')).toHaveTextContent(request);
    expect(screen.getByTestId('message-text-content')).not.toHaveTextContent('Template creation instructions');
  });
});

describe('assistant template review messages', () => {
  beforeEach(() => {
    vi.mocked(ipcBridge.presentationTemplates.describeSpec.invoke).mockReset();
    vi.mocked(ipcBridge.presentationTemplates.importSpecBound.invoke).mockReset();
    vi.mocked(ipcBridge.presentationTemplates.describeSpec.invoke).mockResolvedValue({ ok: true, candidate });
    vi.mocked(ipcBridge.presentationTemplates.importSpecBound.invoke).mockResolvedValue({
      ok: true,
      template: {
        manifest: {
          id: 'quarterly-blue',
          name: candidate.name,
          description: '',
          format: 'pptx',
          kind: 'deck',
          source: 'user',
          themeFile: 'THEME.md',
          referenceFile: null,
          preview: 'preview.svg',
          version: 1,
          createdAt: 'now',
        },
        themePath: '/templates/quarterly-blue/THEME.md',
        referencePath: null,
        previewDataUrl: candidate.preview_data_url,
      },
    });
  });

  it('detects and fully hides the terminal marker while leaving the assistant prose visible', async () => {
    const rawMarker = marker('/workspace/THEME.md');
    renderMessage(`I wrote a theme for your review.\n\n${rawMarker}`);

    expect(screen.getByTestId('message-text-content')).toHaveTextContent('I wrote a theme for your review.');
    expect(screen.getByTestId('message-text-content')).not.toHaveTextContent(rawMarker);
    expect(await screen.findByTestId('template-review-card')).toBeInTheDocument();
  });

  it('leaves a message without a marker untouched', () => {
    const content = 'I wrote THEME.md, but this is ordinary prose.';
    renderMessage(content);

    expect(screen.getByTestId('message-text-content')).toHaveTextContent(content);
    expect(screen.queryByTestId('template-review-card')).not.toBeInTheDocument();
  });

  it('does not recognize marker-shaped text inside a fenced code block', () => {
    const rawMarker = marker('/workspace/THEME.md');
    renderMessage(`Example:\n\n\`\`\`markdown\n${rawMarker}\n\`\`\``);

    expect(screen.getByTestId('message-text-content')).toHaveTextContent(rawMarker);
    expect(screen.queryByTestId('template-review-card')).not.toBeInTheDocument();
  });

  it('renders the main-described name, preview, disclosure, and explicit install action', async () => {
    renderMessage(`Ready.\n\n${marker('/workspace/THEME.md')}`);

    expect(await screen.findByText(candidate.name)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: candidate.name })).toHaveAttribute('src', candidate.preview_data_url);
    expect(screen.getByText(translations['messages.templateReview.disclosure'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: translations['messages.templateReview.confirm'] })).toBeEnabled();
  });

  it('takes conversation_id from context and confirms with the digest minted by describeSpec', async () => {
    const untrustedMarker = `${TEMPLATE_REVIEW_MARKER_PREFIX}${JSON.stringify({
      file_path: '/workspace/THEME.md',
      conversation_id: 'attacker-conversation',
      expected_sha256: 'attacker-digest',
    })} -->`;
    renderMessage(`Ready.\n\n${untrustedMarker}`, 'context-conversation');

    await waitFor(() =>
      expect(ipcBridge.presentationTemplates.describeSpec.invoke).toHaveBeenCalledWith({
        conversation_id: 'context-conversation',
        file_path: '/workspace/THEME.md',
      })
    );
    fireEvent.click(await screen.findByRole('button', { name: translations['messages.templateReview.confirm'] }));

    await waitFor(() =>
      expect(ipcBridge.presentationTemplates.importSpecBound.invoke).toHaveBeenCalledWith({
        conversation_id: 'context-conversation',
        file_path: '/workspace/THEME.md',
        expected_sha256: candidate.sha256,
      })
    );
  });

  it('discards an old describe result after the conversation switches', async () => {
    let resolveOldDescribe:
      | ((value: Awaited<ReturnType<typeof ipcBridge.presentationTemplates.describeSpec.invoke>>) => void)
      | undefined;
    vi.mocked(ipcBridge.presentationTemplates.describeSpec.invoke)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOldDescribe = resolve;
        })
      )
      .mockResolvedValueOnce({ ok: true, candidate: { ...candidate, name: 'Current Theme' } });

    const content = `Ready.\n\n${marker('/workspace/THEME.md')}`;
    const message: IMessageText = {
      id: 'assistant-template-switch',
      msg_id: 'assistant-template-switch',
      conversation_id: 'message-conversation',
      type: 'text',
      position: 'left',
      createdAt: Date.now(),
      content: { content },
    };
    const { rerender } = render(
      <ConversationProvider value={{ conversation_id: 'old-conversation', workspace: '/workspace', type: 'acp' }}>
        <MessageText message={message} />
      </ConversationProvider>
    );

    rerender(
      <ConversationProvider value={{ conversation_id: 'current-conversation', workspace: '/workspace', type: 'acp' }}>
        <MessageText message={message} />
      </ConversationProvider>
    );
    expect(await screen.findByText('Current Theme')).toBeInTheDocument();

    resolveOldDescribe?.({ ok: true, candidate: { ...candidate, name: 'Stale Theme' } });
    await waitFor(() => expect(screen.queryByText('Stale Theme')).not.toBeInTheDocument());
    expect(ipcBridge.presentationTemplates.describeSpec.invoke).toHaveBeenLastCalledWith({
      conversation_id: 'current-conversation',
      file_path: '/workspace/THEME.md',
    });
  });

  it('reports changed content distinctly and says that nothing was installed', async () => {
    vi.mocked(ipcBridge.presentationTemplates.importSpecBound.invoke).mockResolvedValue({
      ok: false,
      code: 'CANDIDATE_CHANGED',
    });
    renderMessage(`Ready.\n\n${marker('/workspace/THEME.md')}`);

    fireEvent.click(await screen.findByRole('button', { name: translations['messages.templateReview.confirm'] }));

    expect(
      await screen.findByText(translations['messages.templateReview.failure.CANDIDATE_CHANGED'])
    ).toBeInTheDocument();
    expect(screen.queryByText(translations['messages.templateReview.installed'])).not.toBeInTheDocument();
  });

  it.each<PresentationTemplateCandidateFailureCode>([
    'INVALID_REQUEST',
    'RUN_NOT_FOUND',
    'RUN_FORBIDDEN',
    'SCOPE_UNAVAILABLE',
    'TEAM_SCOPE_UNSUPPORTED',
    'CANDIDATE_OUTSIDE_WORKSPACE',
    'CANDIDATE_UNSUPPORTED',
    'CANDIDATE_TOO_LARGE',
    'CANDIDATE_CHANGED',
    'CONFIRMATION_NOT_MINTED',
    'INSTALL_FAILED',
  ])('renders a distinct localized message for %s', async (code) => {
    vi.mocked(ipcBridge.presentationTemplates.describeSpec.invoke).mockResolvedValue({ ok: false, code });
    renderMessage(`Ready.\n\n${marker('/workspace/THEME.md')}`);

    expect(await screen.findByText(translations[`messages.templateReview.failure.${code}`])).toBeInTheDocument();
  });

  it('prevents a double confirm from implying or performing two installs', async () => {
    let resolveImport:
      | ((value: Awaited<ReturnType<typeof ipcBridge.presentationTemplates.importSpecBound.invoke>>) => void)
      | undefined;
    vi.mocked(ipcBridge.presentationTemplates.importSpecBound.invoke).mockReturnValue(
      new Promise((resolve) => {
        resolveImport = resolve;
      })
    );
    renderMessage(`Ready.\n\n${marker('/workspace/THEME.md')}`);
    const confirm = await screen.findByRole('button', { name: translations['messages.templateReview.confirm'] });

    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(ipcBridge.presentationTemplates.importSpecBound.invoke).toHaveBeenCalledTimes(1);

    resolveImport?.({
      ok: true,
      template: {
        manifest: {
          id: 'quarterly-blue',
          name: candidate.name,
          description: '',
          format: 'pptx',
          kind: 'deck',
          source: 'user',
          themeFile: 'THEME.md',
          referenceFile: null,
          preview: 'preview.svg',
          version: 1,
          createdAt: 'now',
        },
        themePath: '/templates/quarterly-blue/THEME.md',
        referencePath: null,
        previewDataUrl: candidate.preview_data_url,
      },
    });

    expect(await screen.findByText(translations['messages.templateReview.installed'])).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: translations['messages.templateReview.confirm'] })
    ).not.toBeInTheDocument();
  });
});
