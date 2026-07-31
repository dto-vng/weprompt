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

const summary = (id: string, format: 'pptx' | 'html' | 'docx'): PresentationTemplateSummary => {
  const referenceFile = format === 'pptx' ? 'reference.pptx' : format === 'docx' ? 'reference.docx' : null;
  return {
    manifest: {
      id,
      name: id,
      description: 'd',
      format,
      kind: format === 'pptx' ? 'deck' : format === 'docx' ? 'document' : 'report',
      source: 'builtin',
      themeFile: 'THEME.md',
      referenceFile,
      preview: 'preview.svg',
      version: 1,
      createdAt: 'now',
    },
    themePath: `/abs/${id}/THEME.md`,
    referencePath: referenceFile ? `/abs/${id}/${referenceFile}` : null,
    previewDataUrl: 'data:image/svg+xml;base64,x',
  };
};

describe('TemplateGalleryColumns', () => {
  const templates = [
    summary('business-review', 'pptx'),
    summary('simple-dark', 'html'),
    summary('simple-light', 'html'),
    summary('business-report', 'docx'),
  ];

  it('groups strictly by format: each card appears only in its format column', () => {
    render(<TemplateGalleryColumns templates={templates} onSelect={() => {}} onRemove={() => {}} />);
    const pptxCol = screen.getByTestId('template-column-pptx');
    const htmlCol = screen.getByTestId('template-column-html');
    const docxCol = screen.getByTestId('template-column-docx');
    expect(pptxCol).toContainElement(screen.getByTestId('template-card-business-review'));
    expect(htmlCol).toContainElement(screen.getByTestId('template-card-simple-dark'));
    expect(htmlCol).toContainElement(screen.getByTestId('template-card-simple-light'));
    expect(docxCol).toContainElement(screen.getByTestId('template-card-business-report'));
    expect(pptxCol.querySelectorAll('[data-testid^=template-card-]')).toHaveLength(1);
    expect(htmlCol.querySelectorAll('[data-testid^=template-card-]')).toHaveLength(2);
    expect(docxCol.querySelectorAll('[data-testid^=template-card-]')).toHaveLength(1);
  });

  it('renders the docx column with an empty state when no docx packs exist', () => {
    render(
      <TemplateGalleryColumns templates={[summary('simple-dark', 'html')]} onSelect={() => {}} onRemove={() => {}} />
    );
    const docxCol = screen.getByTestId('template-column-docx');
    expect(docxCol.querySelectorAll('[data-testid^=template-card-]')).toHaveLength(0);
  });

  it('lays out large mode as full-width horizontally scrolling shelves', () => {
    render(<TemplateGalleryColumns templates={templates} size='large' onSelect={() => {}} onRemove={() => {}} />);

    // Every format group is its own full-width shelf, so no group is ever left
    // sharing a row (which is what made pptx/html wrap two-up while docx sat inline).
    for (const format of ['pptx', 'html', 'docx']) {
      const shelf = screen.getByTestId(`template-shelf-${format}`);
      expect(shelf.className).toContain('overflow-x-auto');
      expect(shelf.className).not.toContain('flex-wrap');
      expect(screen.getByTestId(`template-column-${format}`).className).not.toContain('min-w-340px');
    }
  });

  it('keeps compact mode as narrow stacked columns', () => {
    render(<TemplateGalleryColumns templates={templates} size='compact' onSelect={() => {}} onRemove={() => {}} />);
    expect(screen.getByTestId('template-column-docx').className).toContain('min-w-172px');
    expect(screen.getByTestId('template-shelf-docx').className).toContain('flex-col');
  });

  it('ranks the group heading above the template names under it', () => {
    // These were both 12px with the heading the *lighter* of the two, so a card
    // name outweighed the section it sat in. Asserted because it is a deliberate
    // hierarchy, not incidental styling.
    render(<TemplateGalleryColumns templates={templates} size='large' onSelect={() => {}} onRemove={() => {}} />);
    const heading = screen.getByText('conversation.presentationTemplates.columnPptx');
    const name = screen.getByText('business-review');

    expect(heading.className).toContain('font-semibold');
    expect(heading.className).toContain('text-t-primary');
    expect(name.className).toContain('text-t-secondary');
    expect(name.className).not.toContain('font-semibold');
    // Heading must not be smaller than the name it governs.
    const px = (cls: string) => Number(/text-(\d+)px/.exec(cls)?.[1] ?? NaN);
    expect(px(heading.className)).toBeGreaterThan(px(name.className));
  });

  it('groups each heading with its own cards, not midway between rows', () => {
    // Proximity does the grouping: heading→cards gap must be tighter than the
    // gap between one group and the next.
    const { container } = render(
      <TemplateGalleryColumns templates={templates} size='large' onSelect={() => {}} onRemove={() => {}} />
    );
    const outer = container.firstElementChild as HTMLElement;
    const column = screen.getByTestId('template-column-pptx');
    const gap = (cls: string) => Number(/gap-(\d+)px/.exec(cls)?.[1] ?? NaN);
    expect(gap(outer.className)).toBeGreaterThan(gap(column.className));
  });

  it('counts the templates in each group', () => {
    render(<TemplateGalleryColumns templates={templates} size='large' onSelect={() => {}} onRemove={() => {}} />);
    expect(screen.getByTestId('template-count-pptx').textContent).toBe('1');
    expect(screen.getByTestId('template-count-html').textContent).toBe('2');
    // An empty group shows its empty state instead of a "0".
    expect(screen.queryByTestId('template-count-xlsx')).toBeNull();
  });

  it('shows no edge fade while a shelf fits, and an end fade once it overflows', () => {
    // jsdom reports every layout box as 0, so scroll metrics have to be stubbed to
    // exercise the measurement at all. Without this the fade branch is unreachable
    // and the test would pass for the wrong reason.
    const stub = (scrollWidth: number, clientWidth: number, scrollLeft = 0) => {
      for (const key of ['scrollWidth', 'clientWidth', 'scrollLeft'] as const) {
        Object.defineProperty(HTMLElement.prototype, key, {
          configurable: true,
          get() {
            return { scrollWidth, clientWidth, scrollLeft }[key];
          },
        });
      }
    };
    const restore = () => {
      for (const key of ['scrollWidth', 'clientWidth', 'scrollLeft']) {
        delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
      }
    };

    try {
      stub(400, 400);
      const fits = render(
        <TemplateGalleryColumns templates={templates} size='large' onSelect={() => {}} onRemove={() => {}} />
      );
      expect(screen.queryByTestId('template-fade-end-pptx')).toBeNull();
      expect(screen.queryByTestId('template-fade-start-pptx')).toBeNull();
      fits.unmount();

      stub(1373, 744);
      const atStart = render(
        <TemplateGalleryColumns templates={templates} size='large' onSelect={() => {}} onRemove={() => {}} />
      );
      expect(screen.getByTestId('template-fade-end-pptx')).toBeTruthy();
      // Still at scrollLeft 0, so nothing is hidden off the left yet.
      expect(screen.queryByTestId('template-fade-start-pptx')).toBeNull();
      atStart.unmount();

      // Scrolled into the middle: content is hidden on both sides.
      stub(1373, 744, 300);
      const midway = render(
        <TemplateGalleryColumns templates={templates} size='large' onSelect={() => {}} onRemove={() => {}} />
      );
      expect(screen.getByTestId('template-fade-start-pptx')).toBeTruthy();
      expect(screen.getByTestId('template-fade-end-pptx')).toBeTruthy();
      midway.unmount();

      // Scrolled fully to the end: nothing further right, so only the start fades.
      stub(1373, 744, 629);
      render(<TemplateGalleryColumns templates={templates} size='large' onSelect={() => {}} onRemove={() => {}} />);
      expect(screen.getByTestId('template-fade-start-pptx')).toBeTruthy();
      expect(screen.queryByTestId('template-fade-end-pptx')).toBeNull();
    } finally {
      restore();
    }
  });

  it('exposes each card as a keyboard-operable button', () => {
    const onSelect = vi.fn();
    render(<TemplateGalleryColumns templates={templates} onSelect={onSelect} onRemove={() => {}} />);
    const card = screen.getByTestId('template-card-simple-dark');
    expect(card.getAttribute('role')).toBe('button');
    expect(card.getAttribute('tabindex')).toBe('0');

    fireEvent.keyDown(card, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(card, { key: ' ' });
    expect(onSelect).toHaveBeenCalledTimes(2);
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
