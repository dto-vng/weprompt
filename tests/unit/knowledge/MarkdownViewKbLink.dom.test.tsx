/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildKbCitationHref } from '@/common/knowledge/citationFormat';
import MarkdownView from '@/renderer/components/Markdown';

const mockOpenExternalUrl = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/renderer/utils/platform', () => ({
  openExternalUrl: (...args: unknown[]) => mockOpenExternalUrl(...args),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));

const shadowBody = (container: HTMLElement): HTMLElement | null => {
  const host = container.querySelector('.markdown-shadow');
  const root = (host?.shadowRoot ?? null) as ShadowRoot | null;
  return (root?.querySelector('.markdown-shadow-body') as HTMLElement | null) ?? null;
};

const queryShadowAnchor = (container: HTMLElement): HTMLAnchorElement | null =>
  (shadowBody(container)?.querySelector('a') as HTMLAnchorElement | null) ?? null;

describe('MarkdownView weprompt-kb link interception', () => {
  it('invokes onKbCitationClick and never openExternalUrl', async () => {
    mockOpenExternalUrl.mockClear();
    const onKbCitationClick = vi.fn();
    const href = buildKbCitationHref('hop-dong.pdf', 'Pages 1–3');
    const { container } = render(
      <MarkdownView onKbCitationClick={onKbCitationClick}>{`See [\`hop-dong.pdf\`](${href}).`}</MarkdownView>
    );
    await waitFor(() => expect(queryShadowAnchor(container)).toBeTruthy());
    const anchor = queryShadowAnchor(container) as HTMLAnchorElement;
    expect(anchor.getAttribute('href')).toBe(href);
    fireEvent.click(anchor);
    expect(onKbCitationClick).toHaveBeenCalledWith('hop-dong.pdf', 'Pages 1–3');
    expect(mockOpenExternalUrl).not.toHaveBeenCalled();
  });

  it('swallows kb links even without a handler (scheme never leaks)', async () => {
    mockOpenExternalUrl.mockClear();
    const { container } = render(
      <MarkdownView>{`[hop-dong.pdf](${buildKbCitationHref('hop-dong.pdf')})`}</MarkdownView>
    );
    await waitFor(() => expect(queryShadowAnchor(container)).toBeTruthy());
    fireEvent.click(queryShadowAnchor(container) as HTMLAnchorElement);
    expect(mockOpenExternalUrl).not.toHaveBeenCalled();
  });

  it('still opens normal links externally', async () => {
    mockOpenExternalUrl.mockClear();
    const { container } = render(<MarkdownView>{'[x](https://example.com/)'}</MarkdownView>);
    await waitFor(() => expect(queryShadowAnchor(container)).toBeTruthy());
    fireEvent.click(queryShadowAnchor(container) as HTMLAnchorElement);
    expect(mockOpenExternalUrl).toHaveBeenCalledWith('https://example.com/');
  });
});
