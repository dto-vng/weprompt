/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import TemplateChipCard from '@/renderer/components/chat/TemplateGallery/TemplateChipCard';
import type { PresentationTemplateSummary } from '@/common/types/office/presentationTemplate';

const summary = (id: string, format: 'pptx' | 'html'): PresentationTemplateSummary => ({
  manifest: {
    id,
    name: id,
    description: 'd',
    format,
    kind: format === 'pptx' ? 'deck' : 'report',
    source: 'builtin',
    themeFile: 'THEME.md',
    referenceFile: format === 'pptx' ? 'reference.pptx' : null,
    preview: 'preview.svg',
    version: 1,
    createdAt: 'now',
  },
  themePath: `/abs/${id}/THEME.md`,
  referencePath: format === 'pptx' ? `/abs/${id}/reference.pptx` : null,
  previewDataUrl: 'data:image/svg+xml;base64,x',
});

describe('TemplateChipCard', () => {
  afterEach(() => {
    document.documentElement.classList.remove('dark');
  });

  it('shows preview thumbnail, name, format tag; × fires onRemove', () => {
    const onRemove = vi.fn();
    render(<TemplateChipCard template={summary('business-review', 'pptx')} onRemove={onRemove} />);
    const chip = screen.getByTestId('template-chip-card');
    expect(chip.querySelector('img')?.getAttribute('src')).toBe('data:image/svg+xml;base64,x');
    expect(screen.getByText('business-review')).toBeTruthy();
    expect(screen.getByText('PPTX')).toBeTruthy();
    fireEvent.click(screen.getByTestId('template-chip-remove'));
    expect(onRemove).toHaveBeenCalled();
  });

  it('keeps a long selected-template name readable and truncated in dark mode', () => {
    document.documentElement.classList.add('dark');
    const longName = 'connected-operations-quarterly-transformation-review-template';

    render(<TemplateChipCard template={summary(longName, 'pptx')} onRemove={vi.fn()} />);

    const title = screen.getByText(longName);
    expect(title.className).toContain('text-t-primary');
    expect(title.className).toContain('truncate');
    expect(title.parentElement?.className).toContain('flex-1');
  });

  it('uses semantic badge and remove colors with a visible keyboard-focus treatment', async () => {
    document.documentElement.classList.add('dark');
    const user = userEvent.setup();

    render(<TemplateChipCard template={summary('connected-ops', 'pptx')} onRemove={vi.fn()} />);

    const formatBadge = screen.getByText('PPTX').closest('.arco-tag');
    expect(formatBadge?.className).toContain('!text-t-secondary');
    expect(formatBadge?.className).toContain('!bg-fill-2');

    const remove = screen.getByTestId('template-chip-remove');
    expect(remove.className).toContain('!text-t-secondary');
    expect(remove.className).toContain('focus-visible:');
    await user.tab();
    expect(document.activeElement).toBe(remove);
  });
});
