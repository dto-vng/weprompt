/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MarkdownView from '@/renderer/components/Markdown';

vi.mock('@/renderer/components/Markdown/ShadowView', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/renderer/components/Markdown/CodeBlock', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => <code>{children}</code>,
}));

vi.mock('@/renderer/components/media/LocalImageView', () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

vi.mock('@/renderer/utils/chat/latexDelimiters', () => ({
  convertLatexDelimiters: (text: string) => text,
}));

vi.mock('@/renderer/utils/platform', () => ({
  openExternalUrl: vi.fn(),
}));

vi.mock('@/renderer/utils/ui/clipboard', () => ({
  copyText: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({
    children,
    icon,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode }) => (
    <button type='button' {...props}>
      {icon}
      {children}
    </button>
  ),
  Message: { error: vi.fn() },
  Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@icon-park/react', () => ({
  Copy: () => <span data-testid='copy-icon' />,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

describe('MarkdownView auto-linkifies artifact paths', () => {
  it('turns a bare path in prose into a clickable open control', () => {
    const onLocalFileLink = vi.fn();
    render(
      <MarkdownView onLocalFileLink={onLocalFileLink}>
        {'File location: /Users/demo/project/Healthcare_Insurance_New_Hires.pptx'}
      </MarkdownView>
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '/Users/demo/project/Healthcare_Insurance_New_Hires.pptx' }));
    expect(onLocalFileLink).toHaveBeenCalledWith(
      '/Users/demo/project/Healthcare_Insurance_New_Hires.pptx',
      expect.objectContaining({ filePath: '/Users/demo/project/Healthcare_Insurance_New_Hires.pptx' })
    );
  });

  it('turns a back-ticked path into a clickable open control', () => {
    const onLocalFileLink = vi.fn();
    render(
      <MarkdownView onLocalFileLink={onLocalFileLink}>
        {'File location: `/Users/demo/project/report.pptx`'}
      </MarkdownView>
    );

    fireEvent.click(screen.getByRole('button', { name: '/Users/demo/project/report.pptx' }));
    expect(onLocalFileLink).toHaveBeenCalledWith(
      '/Users/demo/project/report.pptx',
      expect.objectContaining({ filePath: '/Users/demo/project/report.pptx' })
    );
  });

  it('does not linkify paths inside fenced code blocks', () => {
    const onLocalFileLink = vi.fn();
    render(
      <MarkdownView onLocalFileLink={onLocalFileLink}>
        {'```sh\ncat /Users/demo/project/report.pptx\n```'}
      </MarkdownView>
    );

    expect(screen.queryByRole('button', { name: '/Users/demo/project/report.pptx' })).not.toBeInTheDocument();
  });

  it('leaves ordinary http links as browser anchors', () => {
    render(<MarkdownView>{'[docs](https://aionui.com/docs)'}</MarkdownView>);
    expect(screen.getByRole('link', { name: 'docs' })).toHaveAttribute('href', 'https://aionui.com/docs');
  });
});
