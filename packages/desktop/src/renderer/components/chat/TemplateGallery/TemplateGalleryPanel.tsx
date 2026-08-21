/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Button, Spin } from '@arco-design/web-react';
import { Close, Upload } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import type { PresentationTemplateSummary } from '@/common/types/office/presentationTemplate';
import TemplateGalleryColumns from './TemplateGalleryColumns';

/**
 * Compact popover panel shown above the SendBox (positioned by the SendBox
 * overlay slot). Pure presentational — state lives in
 * usePresentationTemplates. Templates are grouped by artifact type via
 * TemplateGalleryColumns — one horizontal shelf each — and are never mixed across
 * formats.
 */
const TemplateGalleryPanel: React.FC<{
  templates: PresentationTemplateSummary[];
  selectedId?: string | null;
  loading?: boolean;
  onSelect: (template: PresentationTemplateSummary) => void;
  onImport: () => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}> = ({ templates, selectedId, loading, onSelect, onImport, onRemove, onClose }) => {
  const { t } = useTranslation();

  return (
    <div
      className='bg-dialog-fill-0 b-1 b-solid border-4 rd-12px p-12px shadow-lg'
      role='dialog'
      aria-label={t('conversation.presentationTemplates.title')}
    >
      <div className='flex items-center justify-between gap-8px mb-8px'>
        <span className='text-13px font-semibold text-t-primary'>{t('conversation.presentationTemplates.title')}</span>
        {/* Both actions share one group: with three direct children, justify-between
            stranded the import button in the middle of the header. */}
        <div className='flex items-center gap-4px shrink-0'>
          <Button size='small' type='text' onClick={onImport} className='!text-t-secondary hover:!text-t-primary'>
            <span className='flex items-center gap-6px'>
              <Upload size='14' />
              {t('conversation.presentationTemplates.importCard')}
            </span>
          </Button>
          <Button
            size='small'
            type='text'
            shape='circle'
            icon={<Close size='14' />}
            onClick={onClose}
            aria-label={t('common.close')}
          />
        </div>
      </div>
      {loading ? (
        <div className='flex justify-center p-16px'>
          <Spin />
        </div>
      ) : (
        <div className='max-h-320px overflow-y-auto'>
          <TemplateGalleryColumns
            templates={templates}
            selectedId={selectedId}
            // C-06: `large` gives one horizontal shelf per artifact type, matching the
            // new-chat gallery. `compact` stacked each type vertically in its own column,
            // so adding templates grew the panel downward into a ragged grid. This panel
            // is wide enough for shelves, and `large` scrolls horizontally when it is not.
            size='large'
            onSelect={onSelect}
            onRemove={onRemove}
          />
        </div>
      )}
    </div>
  );
};

export default TemplateGalleryPanel;
