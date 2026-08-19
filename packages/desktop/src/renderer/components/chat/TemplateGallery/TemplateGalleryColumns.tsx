/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Button, Card, Popconfirm, Tooltip } from '@arco-design/web-react';
import { CheckOne, Delete } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import type { PresentationTemplateSummary } from '@/common/types/office/presentationTemplate';
import { useTemplateLabels } from './usePresentationTemplates';

const COLUMNS = [
  { format: 'pptx', labelKey: 'conversation.presentationTemplates.columnPptx' },
  { format: 'html', labelKey: 'conversation.presentationTemplates.columnHtml' },
  { format: 'docx', labelKey: 'conversation.presentationTemplates.columnDocx' },
] as const;

// The two modes lay groups out differently:
// - `compact` (popover) keeps three narrow side-by-side columns that stack their cards
//   vertically; 172px is just wide enough for a 160px card without padding the popover.
// - `large` (landing gallery) gives every group its own full-width shelf that scrolls
//   horizontally. Shelves must NOT wrap: when the groups shared one wrapping row,
//   whichever group happened to land alone on the last row got the full width and
//   rendered inline while the others wrapped two-up, so a single gallery showed two
//   different layouts at once.
//
// Gaps carry the grouping: the space between a heading and its own cards is
// deliberately smaller than the space between one group and the next, so each
// heading reads as belonging to the row beneath it rather than floating midway
// between two.
//
// A group heading outranks the template names under it: heavier and full-strength
// ink, while the names sit back at secondary. Previously both were 12px and the
// heading was the *lighter* of the two, which inverted the hierarchy — the item
// label competed with the section it lived in. The heading only gains a size step
// in `large`; in the narrow popover, weight and colour separate them without
// three near-equal type sizes fighting in a small box. Each mode's heading stays
// one step below its own panel title (14px in the expanded gallery, 13px in the
// popover) so the ranking holds top to bottom.
const SIZE = {
  compact: {
    outer: 'flex flex-wrap gap-16px items-start',
    col: 'flex flex-col gap-6px min-w-0 flex-1 min-w-172px',
    shelf: 'flex flex-col gap-10px',
    heading: 'text-12px font-semibold text-t-primary',
  },
  large: {
    outer: 'flex flex-col gap-24px',
    col: 'flex flex-col gap-8px w-full min-w-0',
    shelf: 'flex gap-12px items-start overflow-x-auto overscroll-x-contain snap-x pb-4px',
    heading: 'text-13px font-semibold text-t-primary',
  },
} as const;

// The card's width is shared by the thumbnail AND its caption wrapper. Keeping them in
// one constant is load-bearing: if the wrapper is left unconstrained it sizes to the
// caption, so a long template name widens the whole card and breaks the row (C-07).
const CARD_W = 'w-160px';
const CARD = `${CARD_W} h-100px`;
// `truncate` needs `min-w-0` to do anything inside a flex row — without it the span
// claims its full intrinsic width and the ellipsis never appears.
const TEMPLATE_NAME = 'text-12px text-t-secondary truncate min-w-0';

// Fades sit over the scroller's own edges and match the panel fill so cards appear
// to pass under it. `pb-4px` on the shelf is the scrollbar gutter, so the fade stops
// short of it rather than veiling the scrollbar.
const FADE = 'pointer-events-none absolute top-0 bottom-4px w-28px';
const FADE_START = `${FADE} left-0 bg-gradient-to-r from-[var(--dialog-fill-0)] to-transparent`;
const FADE_END = `${FADE} right-0 bg-gradient-to-l from-[var(--dialog-fill-0)] to-transparent`;

/**
 * A format group's row of cards, plus edge fades when part of the row is out of
 * view. Split out as its own component because each shelf needs its own scroll
 * observer, and calling a hook per iteration of the COLUMNS map would not be a
 * legal hook call.
 *
 * Fades are driven by measurement rather than rendered unconditionally: a shelf
 * whose cards all fit shows none, so the fade always means "there is more this
 * way" instead of being permanent decoration. Built-in packs fit comfortably —
 * only user-imported templates push a group past the edge.
 */
const TemplateShelf: React.FC<{
  format: string;
  className: string;
  count: number;
  children: React.ReactNode;
}> = ({ format, className, count, children }) => {
  const scroller = React.useRef<HTMLDivElement>(null);
  const [edges, setEdges] = React.useState({ start: false, end: false });

  React.useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => {
      const max = el.scrollWidth - el.clientWidth;
      // 1px of slack: fractional layout widths otherwise leave a shelf permanently
      // reporting a sliver of hidden content, which would pin the end fade on.
      setEdges({ start: el.scrollLeft > 1, end: max > 1 && el.scrollLeft < max - 1 });
    };
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    // Catches the window being resized narrower, not just the card count changing.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [count]);

  return (
    <div className='relative min-w-0'>
      <div ref={scroller} data-testid={`template-shelf-${format}`} className={className}>
        {children}
      </div>
      {edges.start && <span aria-hidden='true' data-testid={`template-fade-start-${format}`} className={FADE_START} />}
      {edges.end && <span aria-hidden='true' data-testid={`template-fade-end-${format}`} className={FADE_END} />}
    </div>
  );
};

/**
 * Format-grouped templates (PPTX | HTML | DOCX) shared by the compact popover and
 * the expanded landing-page gallery. Templates are NEVER mixed across groups —
 * grouping is strictly manifest.format. See SIZE for how the two modes differ.
 */
const TemplateGalleryColumns: React.FC<{
  templates: PresentationTemplateSummary[];
  selectedId?: string | null;
  size?: 'compact' | 'large';
  onSelect: (template: PresentationTemplateSummary) => void;
  onRemove: (id: string) => void;
}> = ({ templates, selectedId, size = 'compact', onSelect, onRemove }) => {
  const { t } = useTranslation();
  const labelsOf = useTemplateLabels();
  const dims = SIZE[size];

  return (
    <div className={dims.outer}>
      {COLUMNS.map((column) => {
        const columnTemplates = templates.filter((template) => template.manifest.format === column.format);
        return (
          <div key={column.format} data-testid={`template-column-${column.format}`} className={dims.col}>
            <span className='flex items-baseline gap-6px'>
              <span className={dims.heading}>{t(column.labelKey)}</span>
              {/* Bare count, deliberately quiet: it says how many the group holds,
                  which is the only clue to hidden cards before you reach the edge. */}
              {columnTemplates.length > 0 && (
                <span data-testid={`template-count-${column.format}`} className='text-11px text-t-secondary'>
                  {columnTemplates.length}
                </span>
              )}
            </span>
            <TemplateShelf format={column.format} className={dims.shelf} count={columnTemplates.length}>
              {columnTemplates.map((template) => {
                const id = template.manifest.id;
                const isSelected = selectedId === id;
                const select = () => onSelect(template);
                const labels = labelsOf(template);
                return (
                  <div key={id} className={`flex flex-col shrink-0 snap-start ${CARD_W}`}>
                    <Tooltip content={labels.description}>
                      <Card
                        hoverable
                        bordered
                        data-testid={`template-card-${id}`}
                        // Arco Card renders a plain div, so the card carries its own
                        // button semantics — it is the only way to pick a template.
                        role='button'
                        tabIndex={0}
                        aria-pressed={isSelected}
                        aria-label={labels.name}
                        className={`${CARD} p-0 rd-8px cursor-pointer overflow-hidden relative b-solid ${isSelected ? 'b-2 border-aou-6' : 'b-1 border-4'}`}
                        onClick={select}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') return;
                          event.preventDefault();
                          select();
                        }}
                        bodyStyle={{ padding: 0 }}
                      >
                        <img src={template.previewDataUrl} alt='' className={`${CARD} object-cover`} />
                        {isSelected && (
                          <span
                            data-testid={`template-selected-${id}`}
                            className='absolute inset-0 flex items-center justify-center gap-6px bg-[rgba(0,0,0,0.55)] text-white text-13px font-medium'
                          >
                            <CheckOne theme='filled' size='16' />
                            {t('conversation.presentationTemplates.selected')}
                          </span>
                        )}
                      </Card>
                    </Tooltip>
                    <div className='flex items-center justify-between gap-4px mt-4px'>
                      <span className={TEMPLATE_NAME}>{labels.name}</span>
                      {template.manifest.source === 'user' && (
                        <Popconfirm
                          title={t('conversation.presentationTemplates.deleteConfirm')}
                          onOk={() => onRemove(id)}
                        >
                          <Button
                            size='mini'
                            shape='circle'
                            icon={<Delete size='12' />}
                            aria-label={t('conversation.presentationTemplates.deleteTooltip')}
                          />
                        </Popconfirm>
                      )}
                    </div>
                  </div>
                );
              })}
            </TemplateShelf>
            {columnTemplates.length === 0 && (
              <span className='text-12px text-t-secondary'>{t('conversation.presentationTemplates.empty')}</span>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default TemplateGalleryColumns;
