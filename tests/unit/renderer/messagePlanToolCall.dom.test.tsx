/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessagePlan, IMessageToolCall } from '@/common/chat/chatLib';
import MessagePlan from '@/renderer/pages/conversation/Messages/components/MessagePlan';
import MessageToolCall from '@/renderer/pages/conversation/Messages/components/MessageToolCall';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

const planMessage = {
  id: 'plan-1',
  msg_id: 'plan-1',
  conversation_id: 'c1',
  type: 'plan',
  position: 'left',
  content: {
    entries: [
      // Two entries with identical text: the old `key={item.content}` shape would collide here.
      { content: 'Review the report', status: 'completed' },
      { content: 'Review the report', status: 'pending' },
    ],
  },
} as unknown as IMessagePlan;

const toolCallMessage = {
  id: 'tool-1',
  msg_id: 'tool-1',
  conversation_id: 'c1',
  type: 'tool_call',
  position: 'left',
  content: {
    call_id: 'call-1',
    name: 'read_file',
    description: 'report.md',
    status: 'success',
    input: '{"path":"report.md"}',
    output: 'file contents',
  },
} as unknown as IMessageToolCall;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MessagePlan', () => {
  it('renders duplicate entries without a React key warning', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<MessagePlan message={planMessage} />);

    expect(consoleError.mock.calls.some((call) => String(call[0]).includes('unique "key"'))).toBe(false);
    expect(screen.getAllByText(/Review the report/)).toHaveLength(2);
  });

  it('localizes the title and exposes an accessible toggle', () => {
    render(<MessagePlan message={planMessage} />);

    expect(screen.getByText('messages.plan.title')).toBeTruthy();
    const toggle = screen.getByRole('button', { expanded: true });
    const panelId = toggle.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId!)).toBeTruthy();

    fireEvent.click(toggle);
    expect(screen.getByRole('button', { expanded: false })).toBe(toggle);
  });

  it('carries no hardcoded colour literals', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync('packages/desktop/src/renderer/pages/conversation/Messages/components/MessagePlan.tsx', 'utf8')
    );
    expect(source).not.toMatch(/color-#|rgba\(/);
  });
});

describe('MessageToolCall', () => {
  it('localizes the Input/Output labels and makes the toggle keyboard-reachable', () => {
    render(<MessageToolCall message={toolCallMessage} />);

    const toggle = screen.getByRole('button', { expanded: false });
    const panelId = toggle.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();

    fireEvent.click(toggle);

    expect(screen.getByRole('button', { expanded: true })).toBe(toggle);
    expect(document.getElementById(panelId!)).toBeTruthy();
    expect(screen.getByText('tools.labels.arguments')).toBeTruthy();
    expect(screen.getByText('tools.labels.result')).toBeTruthy();
    expect(screen.queryByText('Input')).toBeNull();
    expect(screen.queryByText('Output')).toBeNull();
  });

  it('carries no hardcoded colour literals', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(
        'packages/desktop/src/renderer/pages/conversation/Messages/components/MessageToolCall.tsx',
        'utf8'
      )
    );
    expect(source).not.toMatch(/color-#/);
  });
});
