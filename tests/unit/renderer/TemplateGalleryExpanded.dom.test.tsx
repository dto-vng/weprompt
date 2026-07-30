/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import TemplateGalleryExpanded from '@/renderer/components/chat/TemplateGallery/TemplateGalleryExpanded';
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

describe('TemplateGalleryExpanded', () => {
  it('renders both format columns and closes via the header button', () => {
    const onClose = vi.fn();
    render(
      <TemplateGalleryExpanded
        templates={[summary('business-review', 'pptx'), summary('simple-dark', 'html')]}
        onSelect={() => {}}
        onImport={() => {}}
        onRemove={() => {}}
        onClose={onClose}
      />
    );
    expect(screen.getByTestId('template-gallery-expanded')).toBeTruthy();
    expect(screen.getByTestId('template-column-pptx')).toBeTruthy();
    expect(screen.getByTestId('template-column-html')).toBeTruthy();
    fireEvent.click(screen.getByTestId('template-gallery-expanded-close'));
    expect(onClose).toHaveBeenCalled();
  });
});
