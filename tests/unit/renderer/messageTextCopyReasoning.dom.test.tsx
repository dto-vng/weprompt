/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageText } from '@/common/chat/chatLib';
import MessageText from '@/renderer/pages/conversation/Messages/components/MessageText';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const copyTextMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@/renderer/utils/ui/clipboard', () => ({ copyText: copyTextMock }));
vi.mock('@/renderer/components/Markdown', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/renderer/hooks/context/ConversationContext', () => ({ useConversationContextSafe: () => null }));
vi.mock('@/renderer/hooks/context/LayoutContext', () => ({ useLayoutContext: () => ({ isMobile: false }) }));
// CollapsibleContent reads the theme for its fade mask; MessageText already mounts it on the
// JSON branch, so in the app it is always under ThemeProvider.
vi.mock('@/renderer/hooks/context/ThemeContext', () => ({ useThemeContext: () => ({ theme: 'light' }) }));
vi.mock('@/renderer/pages/conversation/knowledge/KnowledgeCitationsContext', () => ({
  useKnowledgeCitationsSafe: () => null,
}));
vi.mock('@/renderer/pages/conversation/Preview/hooks/useLocalFilePreview', () => ({
  useLocalFilePreview: () => vi.fn(),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

const buildMessage = (content: string): IMessageText =>
  ({
    id: 'msg-1',
    msg_id: 'msg-1',
    conversation_id: 'c1',
    type: 'text',
    position: 'left',
    created_at: 1_760_000_000_000,
    content: { content },
  }) as IMessageText;

beforeAll(() => {
  // CollapsibleContent measures with ResizeObserver; jsdom has none.
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

describe('MessageText copy control', () => {
  beforeEach(() => {
    copyTextMock.mockClear();
  });

  it('is a focusable button with an accessible name, not a click-only div', async () => {
    render(<MessageText message={buildMessage('the answer')} showCopyRow />);

    const copy = screen.getByRole('button', { name: 'Copy' });
    copy.focus();
    expect(document.activeElement).toBe(copy);

    // pointer-events-none would have made a focused control unactivatable.
    expect(copy.className).not.toContain('pointer-events-none');
    expect(copy.className).toContain('focus-visible:opacity-100');

    fireEvent.click(copy);
    await waitFor(() => expect(copyTextMock).toHaveBeenCalledWith('the answer'));
  });
});

describe('MessageText inline reasoning', () => {
  it('renders reasoning collapsed behind a toggle that can actually expand it', () => {
    const reasoning = Array.from({ length: 40 }, (_, i) => `thought line ${i}`).join('\n');
    render(<MessageText message={buildMessage(`<think>${reasoning}</think>the answer`)} />);

    const block = screen.getByTestId('message-reasoning');
    expect(block.textContent).toContain('thought line 0');

    // Clamped by default...
    const body = block.querySelector('[style*="max-height"]') as HTMLElement;
    expect(body).toBeTruthy();

    // ...and there must be a control to unclamp it. Clipping reasoning behind a fade with no
    // way to open it is worse than the always-expanded state this replaced.
    const toggle = screen.getByRole('button', { expanded: false });
    expect(toggle.getAttribute('aria-controls')).toBe(body.id);

    fireEvent.click(toggle);
    expect(screen.getByRole('button', { expanded: true })).toBe(toggle);
    expect(block.querySelector('[style*="max-height"]')).toBeNull();
  });

  it('keeps the message-text-content handle for the answer', () => {
    render(<MessageText message={buildMessage('<think>brief</think>the answer')} />);
    expect(screen.getByTestId('message-text-content').textContent).toContain('the answer');
  });
});
