/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMessageThinking } from '@/common/chat/chatLib';
import MessageThinking from '@/renderer/pages/conversation/Messages/components/MessageThinking';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

function createThinkingMessage(createdAt: number): IMessageThinking {
  return {
    id: 'thinking-1',
    type: 'thinking',
    msg_id: 'msg-1',
    conversation_id: 'conversation-1',
    position: 'left',
    created_at: createdAt,
    content: {
      content: 'analyzing',
      status: 'thinking',
    },
  };
}

describe('MessageThinking', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('preserves elapsed time when the component remounts for an active thinking message', () => {
    vi.setSystemTime(new Date('2026-05-26T09:00:10.000Z'));
    const createdAt = Date.now() - 5_000;

    const { unmount } = render(<MessageThinking message={createThinkingMessage(createdAt)} />);

    expect(screen.getByText('Thinking... · 5s')).toBeInTheDocument();

    unmount();

    vi.setSystemTime(new Date('2026-05-26T09:00:12.000Z'));
    render(<MessageThinking message={createThinkingMessage(createdAt)} />);

    expect(screen.getByText('Thinking... · 7s')).toBeInTheDocument();
  });

  it('exposes the summary row as a keyboard-operable button', () => {
    vi.setSystemTime(new Date('2026-05-26T09:00:10.000Z'));
    render(<MessageThinking message={createThinkingMessage(Date.now())} />);

    const header = screen.getByRole('button', { expanded: true });
    expect(header).toHaveAttribute('tabindex', '0');
    // aria-controls must point at the body, which keeps `ref` for the streaming auto-scroll.
    const bodyId = header.getAttribute('aria-controls');
    expect(bodyId).toBeTruthy();
    expect(document.getElementById(bodyId!)).toBeTruthy();

    fireEvent.keyDown(header, { key: 'Enter' });
    expect(screen.getByRole('button', { expanded: false })).toBe(header);

    fireEvent.keyDown(header, { key: ' ' });
    expect(screen.getByRole('button', { expanded: true })).toBe(header);
  });
});
