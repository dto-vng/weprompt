/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import TemplateGalleryColumns from '@/renderer/components/chat/TemplateGallery/TemplateGalleryColumns';
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

describe('TemplateGalleryColumns', () => {
  const templates = [
    summary('business-review', 'pptx'),
    summary('simple-dark', 'html'),
    summary('simple-light', 'html'),
  ];

  it('groups strictly by format: pptx cards only in the pptx column', () => {
    render(<TemplateGalleryColumns templates={templates} onSelect={() => {}} onRemove={() => {}} />);
    const pptxCol = screen.getByTestId('template-column-pptx');
    const htmlCol = screen.getByTestId('template-column-html');
    expect(pptxCol).toContainElement(screen.getByTestId('template-card-business-review'));
    expect(htmlCol).toContainElement(screen.getByTestId('template-card-simple-dark'));
    expect(htmlCol).toContainElement(screen.getByTestId('template-card-simple-light'));
    expect(pptxCol.querySelectorAll('[data-testid^=template-card-]')).toHaveLength(1);
    expect(htmlCol.querySelectorAll('[data-testid^=template-card-]')).toHaveLength(2);
  });

  it('marks the selected card and fires onSelect on click', () => {
    const onSelect = vi.fn();
    render(
      <TemplateGalleryColumns
        templates={templates}
        selectedId='business-review'
        onSelect={onSelect}
        onRemove={() => {}}
      />
    );
    expect(screen.getByTestId('template-selected-business-review')).toBeTruthy();
    fireEvent.click(screen.getByTestId('template-card-simple-dark'));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ manifest: expect.objectContaining({ id: 'simple-dark' }) })
    );
  });
});
