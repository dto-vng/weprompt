/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
});
