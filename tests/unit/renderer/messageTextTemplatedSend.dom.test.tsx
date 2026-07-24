/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import type { IMessageText } from '@/common/chat/chatLib';
import { AIONUI_FILES_MARKER } from '@/common/config/constants';
import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';
import MessageText from '@/renderer/pages/conversation/Messages/components/MessageText';

// Mocks below mirror tests/unit/chat/messageText.dom.test.tsx's harness — it
// already solves rendering MessageText outside a full app shell — trimmed to
// this file's needs and extended with the presentationTemplates ipcBridge
// call the new TemplateMessageCard uses.
vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      getFileMetadata: { invoke: vi.fn() },
      getImageBase64: { invoke: vi.fn() },
      readFile: { invoke: vi.fn() },
    },
    presentationTemplates: {
      list: {
        invoke: vi.fn().mockResolvedValue([
          {
            manifest: {
              id: 'business-review',
              name: 'Business Review',
              description: 'd',
              format: 'pptx',
              kind: 'deck',
              source: 'builtin',
              themeFile: 'THEME.md',
              referenceFile: 'reference.pptx',
              preview: 'preview.svg',
              version: 1,
              createdAt: 'now',
            },
            themePath: '/abs/presentation-templates/business-review/THEME.md',
            referencePath: '/abs/presentation-templates/business-review/reference.pptx',
            previewDataUrl: 'data:image/svg+xml;base64,x',
          },
        ]),
      },
    },
  },
}));

vi.mock('@/renderer/pages/conversation/Preview/context/PreviewContext', () => ({
  usePreviewContext: () => ({
    openPreview: vi.fn(),
  }),
}));

vi.mock('@/renderer/components/chat/CollapsibleContent', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/renderer/components/media/FilePreview', () => ({
  __esModule: true,
  default: ({ path }: { path: string }) => <div data-testid='file-preview'>{path}</div>,
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
  stripThinkTags: (content: string) => content,
}));

vi.mock('@/renderer/utils/model/agentLogo', () => ({
  useAgentLogos: () => ({}),
  resolveAgentLogo: () => null,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/TeammateMessageAvatar', () => ({
  __esModule: true,
  default: ({ senderName }: { senderName?: string }) => <span data-testid='teammate-avatar'>{senderName}</span>,
}));

vi.mock('@/renderer/utils/ui/clipboard', () => ({
  copyText: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@arco-design/web-react', () => ({
  Alert: () => null,
  Message: {
    error: vi.fn(),
  },
  Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  Tag: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('@icon-park/react', () => ({
  Copy: () => <span data-testid='copy-icon' />,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

const renderMessage = (content: string) => {
  const message: IMessageText = {
    id: 'msg-templated',
    msg_id: 'msg-templated',
    conversation_id: 'conv-1',
    type: 'text',
    position: 'right',
    createdAt: Date.now(),
    content: { content },
  };

  render(
    <ConversationProvider value={{ conversationId: 'conv-1', workspace: '/workspace/demo', type: 'acp' }}>
      <MessageText message={message} />
    </ConversationProvider>
  );
};

describe('MessageText templated presentation sends', () => {
  const directive = 'Create a presentation from the request below. officecli is a command-line program…';
  const theme = '/abs/presentation-templates/business-review/THEME.md';

  it('folds the directive: shows the template card + user text, hides the directive and the theme file chip', async () => {
    const content = `${directive}\n\ncan we demo 2 slides\n${AIONUI_FILES_MARKER}\n${theme}`;

    renderMessage(content);

    expect(await screen.findByTestId('template-message-card')).toBeTruthy();
    expect(screen.getByTestId('message-text-content')).toHaveTextContent('can we demo 2 slides');
    expect(screen.queryByText(/Create a presentation from the request below/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('file-preview')).not.toBeInTheDocument();
  });

  it('renders a control message without the marker/theme file unchanged', () => {
    const content = 'just a regular message with no directive';

    renderMessage(content);

    expect(screen.queryByTestId('template-message-card')).not.toBeInTheDocument();
    expect(screen.getByTestId('message-text-content')).toHaveTextContent(content);
  });
});
