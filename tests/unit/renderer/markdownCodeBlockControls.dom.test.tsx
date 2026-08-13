/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import CodeBlock from '@/renderer/components/Markdown/CodeBlock';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const copyTextMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@/renderer/utils/ui/clipboard', () => ({ copyText: copyTextMock }));
vi.mock('@arco-design/web-react', () => ({
  Message: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('@/renderer/components/Markdown/MermaidBlock', () => ({ default: () => null }));
vi.mock('react-syntax-highlighter', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => <pre>{children}</pre>,
}));
vi.mock('react-syntax-highlighter/dist/esm/styles/hljs', () => ({ vs: {}, vs2015: {} }));
vi.mock('@icon-park/react', () => ({
  Copy: () => <span data-testid='copy-icon' />,
  Down: () => <span data-testid='down-icon' />,
  Up: () => <span data-testid='up-icon' />,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number; defaultValue?: string }) =>
      options?.count === undefined ? (options?.defaultValue ?? key) : `${key}:${options.count}`,
  }),
}));

const LONG_CODE = Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n');

describe('CodeBlock controls', () => {
  beforeEach(() => {
    copyTextMock.mockClear();
  });

  it('exposes copy and collapse as focusable buttons with accessible names', async () => {
    render(<CodeBlock className='language-ts'>{LONG_CODE}</CodeBlock>);

    const copy = screen.getByRole('button', { name: 'common.copy' });
    copy.focus();
    expect(document.activeElement).toBe(copy);
    fireEvent.click(copy);
    await waitFor(() => expect(copyTextMock).toHaveBeenCalled());

    // Both the header control and the footer control toggle the same panel.
    const expandControls = screen.getAllByRole('button', { expanded: false });
    expect(expandControls.length).toBe(2);
    for (const control of expandControls) {
      const panelId = control.getAttribute('aria-controls');
      expect(panelId).toBeTruthy();
      expect(document.getElementById(panelId!)).toBeTruthy();
    }

    fireEvent.click(expandControls[1]);
    expect(screen.getAllByRole('button', { expanded: true }).length).toBe(2);
  });

  it('shows the language chip only for a labelled fence', () => {
    const { rerender, container } = render(<CodeBlock className='language-ts'>{LONG_CODE}</CodeBlock>);
    expect(container.textContent).toContain('ts');

    rerender(<CodeBlock className=''>{LONG_CODE}</CodeBlock>);
    // An unlabelled fence used to advertise the meaningless literal "text".
    expect(container.textContent).not.toContain('text');
  });

  it('carries no dead shadow-DOM-invisible hover classes', () => {
    const { container } = render(<CodeBlock className='language-ts'>{LONG_CODE}</CodeBlock>);
    expect(container.innerHTML).not.toContain('group-hover');
    expect(container.innerHTML).not.toContain('md:opacity-0');
  });
});
