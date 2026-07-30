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

// `col` is the column's minimum width and differs per mode because the two modes
// lay cards out differently: `large` wraps cards two-up (2x160 + 12 gap = 332), while
// `compact` stacks them one-per-row, where a 340px column would only pad the popover.
const SIZE = {
  compact: { card: 'w-160px h-100px', img: 'w-160px h-100px', col: 'min-w-172px' },
  large: { card: 'w-160px h-100px', img: 'w-160px h-100px', col: 'min-w-340px' },
} as const;

/**
 * Format-grouped template columns (PPTX | HTML | DOCX) shared by the compact
 * popover and the expanded landing-page gallery. Columns wrap rather than being
 * forced onto one row, so a narrow container drops the last group to a second
 * row. Templates are NEVER mixed across columns — grouping is strictly
 * manifest.format.
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
    <div className='flex flex-wrap gap-16px items-start'>
      {COLUMNS.map((column) => {
        const columnTemplates = templates.filter((template) => template.manifest.format === column.format);
        return (
          <div
            key={column.format}
            data-testid={`template-column-${column.format}`}
            className={`flex flex-col gap-10px min-w-0 flex-1 ${dims.col}`}
          >
            <span className='text-12px font-medium text-t-secondary'>{t(column.labelKey)}</span>
            <div className={size === 'large' ? 'flex flex-wrap gap-12px items-start' : 'flex flex-col gap-10px'}>
              {columnTemplates.map((template) => {
                const id = template.manifest.id;
                const isSelected = selectedId === id;
                return (
                  <div key={id} className='flex flex-col'>
                    <Tooltip content={template.manifest.description}>
                      <Card
                        hoverable
                        bordered
                        data-testid={`template-card-${id}`}
                        className={`${dims.card} p-0 rd-8px cursor-pointer overflow-hidden relative ${isSelected ? 'b-2 b-solid border-aou-6' : ''}`}
                        onClick={() => onSelect(template)}
                        bodyStyle={{ padding: 0 }}
                      >
                        <img
                          src={template.previewDataUrl}
                          alt={template.manifest.name}
                          className={`${dims.img} object-cover`}
                        />
                        {isSelected && (
                          <span
                            data-testid={`template-selected-${id}`}
                            className='absolute inset-0 flex items-center justify-center gap-6px bg-[rgba(0,0,0,0.35)] text-white text-13px font-medium'
                          >
                            <CheckOne theme='filled' size='16' />
                            {t('conversation.presentationTemplates.selected')}
                          </span>
                        )}
                      </Card>
                    </Tooltip>
                    <div className='flex items-center justify-between mt-4px'>
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
