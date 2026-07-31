/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TemplateGalleryPanel from '@renderer/components/chat/TemplateGallery/TemplateGalleryPanel';
import type { PresentationTemplateSummary } from '@/common/types/office/presentationTemplate';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key.split('.').pop() ?? key,
  }),
}));

const template: PresentationTemplateSummary = {
  manifest: {
    id: 'simple-light',
    name: 'Simple Light',
    description: 'Minimal light deck',
    format: 'html',
    kind: 'deck',
    source: 'builtin',
    themeFile: 'THEME.md',
    referenceFile: null,
    preview: 'preview.svg',
    version: 1,
    createdAt: 'now',
  },
  themePath: '/abs/simple-light/THEME.md',
  referencePath: null,
  previewDataUrl: 'data:image/svg+xml;base64,PHN2Zy8+',
};

describe('TemplateGalleryPanel', () => {
  it('renders the template inside its format column and fires onSelect when the card is clicked', () => {
    const onSelect = vi.fn();
    render(
      <TemplateGalleryPanel
        templates={[template]}
        onSelect={onSelect}
        onImport={vi.fn()}
        onRemove={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('Simple Light')).toBeDefined();
    expect(screen.getByTestId('template-column-html')).toContainElement(
      screen.getByTestId('template-card-simple-light')
    );
    // The card is the button and carries the accessible name; its preview image is
    // decorative (alt=''), so querying by alt text would duplicate that name to
    // screen readers.
    fireEvent.click(screen.getByRole('button', { name: 'Simple Light' }));
    expect(onSelect).toHaveBeenCalledWith(template);
  });

  it('fires onImport from the header button and shows empty columns without templates', () => {
    const onImport = vi.fn();
    render(
      <TemplateGalleryPanel
        templates={[]}
        onSelect={vi.fn()}
        onImport={onImport}
        onRemove={vi.fn()}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'importCard' }));
    expect(onImport).toHaveBeenCalled();
  });
});
