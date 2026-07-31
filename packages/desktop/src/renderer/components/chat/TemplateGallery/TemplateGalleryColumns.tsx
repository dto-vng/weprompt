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
const SIZE = {
  compact: {
    outer: 'flex flex-wrap gap-16px items-start',
    col: 'flex flex-col gap-10px min-w-0 flex-1 min-w-172px',
    shelf: 'flex flex-col gap-10px',
  },
  large: {
    outer: 'flex flex-col gap-16px',
    col: 'flex flex-col gap-10px w-full min-w-0',
    shelf: 'flex gap-12px items-start overflow-x-auto overscroll-x-contain snap-x pb-4px',
  },
} as const;

const CARD = 'w-160px h-100px';

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
  const dims = SIZE[size];

  return (
    <div className={dims.outer}>
      {COLUMNS.map((column) => {
        const columnTemplates = templates.filter((template) => template.manifest.format === column.format);
        return (
          <div key={column.format} data-testid={`template-column-${column.format}`} className={dims.col}>
            <span className='text-12px font-medium text-t-secondary'>{t(column.labelKey)}</span>
            <div data-testid={`template-shelf-${column.format}`} className={dims.shelf}>
              {columnTemplates.map((template) => {
                const id = template.manifest.id;
                const isSelected = selectedId === id;
                const select = () => onSelect(template);
                return (
                  <div key={id} className='flex flex-col shrink-0 snap-start'>
                    <Tooltip content={template.manifest.description}>
                      <Card
                        hoverable
                        bordered
                        data-testid={`template-card-${id}`}
                        // Arco Card renders a plain div, so the card carries its own
                        // button semantics — it is the only way to pick a template.
                        role='button'
                        tabIndex={0}
                        aria-pressed={isSelected}
                        aria-label={template.manifest.name}
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
                      <span className='text-12px truncate'>{template.manifest.name}</span>
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
            </div>
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
