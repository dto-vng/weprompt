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
      className='mt-18px w-full box-border animate-fade-in bg-dialog-fill-0 b-1 b-solid border-4 rd-12px p-12px'
      aria-label={t('conversation.presentationTemplates.title')}
    >
      <div className='flex items-center justify-between gap-8px mb-8px'>
        <span className='text-14px font-semibold text-t-primary'>{t('conversation.presentationTemplates.title')}</span>
        <div className='flex items-center gap-4px shrink-0'>
          {/* Text-weight so importing (the rarest action here) doesn't outweigh the
              title, and so it matches the borderless close button beside it. Arco
              colours text buttons with the brand orange, which read louder than the
              heading — force the neutral pair instead. */}
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
            data-testid='template-gallery-expanded-close'
            aria-label={t('common.close')}
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
