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
 * usePresentationTemplates. Templates are grouped into PPTX/HTML columns via
 * TemplateGalleryColumns and are never mixed across formats.
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
      className='bg-dialog-fill-0 b b-solid b-1 rd-12px p-12px shadow-lg'
      role='dialog'
      aria-label={t('conversation.presentationTemplates.title')}
    >
      <div className='flex items-center justify-between mb-8px'>
        <span className='text-13px font-medium'>{t('conversation.presentationTemplates.title')}</span>
        <Button size='mini' onClick={onImport} icon={<Upload size='12' />}>
          {t('conversation.presentationTemplates.importCard')}
        </Button>
        <Button
          size='mini'
          shape='circle'
          icon={<Close size='14' />}
          onClick={onClose}
          aria-label={t('common.close', { defaultValue: 'Close' })}
        />
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
            size='compact'
            onSelect={onSelect}
            onRemove={onRemove}
          />
        </div>
      )}
    </div>
  );
};

export default TemplateGalleryPanel;
