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
 * Kimi-style expanded gallery rendered below the landing composer (in place of
 * the prompt suggestions while open). Large cards, strict PPTX | HTML columns.
 */
const TemplateGalleryExpanded: React.FC<{
  templates: PresentationTemplateSummary[];
  loading?: boolean;
  selectedId?: string | null;
  onSelect: (template: PresentationTemplateSummary) => void;
  onImport: () => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}> = ({ templates, loading, selectedId, onSelect, onImport, onRemove, onClose }) => {
  const { t } = useTranslation();
  return (
    <section
      data-testid='template-gallery-expanded'
      className='mt-18px w-full box-border animate-fade-in bg-dialog-fill-0 b b-solid b-1 rd-12px p-12px'
      aria-label={t('conversation.presentationTemplates.title')}
    >
      <div className='flex items-center justify-between mb-8px'>
        <span className='text-14px font-medium'>{t('conversation.presentationTemplates.title')}</span>
        <div className='flex items-center gap-8px'>
          <Button size='mini' onClick={onImport} icon={<Upload size='12' />}>
            {t('conversation.presentationTemplates.importCard')}
          </Button>
          <Button
            size='mini'
            shape='circle'
            icon={<Close size='14' />}
            onClick={onClose}
            data-testid='template-gallery-expanded-close'
            aria-label={t('common.close', { defaultValue: 'Close' })}
          />
        </div>
      </div>
      {loading ? (
        <div className='flex justify-center p-16px'>
          <Spin />
        </div>
      ) : (
        <TemplateGalleryColumns
          templates={templates}
          selectedId={selectedId}
          size='large'
          onSelect={onSelect}
          onRemove={onRemove}
        />
      )}
    </section>
  );
};

export default TemplateGalleryExpanded;
