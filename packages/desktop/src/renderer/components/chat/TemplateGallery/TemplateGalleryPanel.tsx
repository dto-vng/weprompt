/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Button, Card, Popconfirm, Spin, Tag, Tooltip } from '@arco-design/web-react';
import { Close, Delete, Upload } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import type { PresentationTemplateSummary } from '@/common/types/office/presentationTemplate';

/**
 * Horizontal template card strip shown above the SendBox (positioned by the
 * SendBox overlay slot). Pure presentational — state lives in
 * usePresentationTemplates.
 */
const TemplateGalleryPanel: React.FC<{
  templates: PresentationTemplateSummary[];
  loading?: boolean;
  onSelect: (template: PresentationTemplateSummary) => void;
  onImport: () => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}> = ({ templates, loading, onSelect, onImport, onRemove, onClose }) => {
  const { t } = useTranslation();

  return (
    <div
      className='bg-dialog-fill-0 b b-solid b-1 rd-12px p-12px shadow-lg'
      role='dialog'
      aria-label={t('conversation.presentationTemplates.title')}
    >
      <div className='flex items-center justify-between mb-8px'>
        <span className='text-13px font-medium'>{t('conversation.presentationTemplates.title')}</span>
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
        <div className='flex gap-12px overflow-x-auto pb-4px'>
          {templates.map((template) => (
            <div key={template.manifest.id} className='flex flex-col w-160px shrink-0'>
              <Tooltip content={template.manifest.description}>
                <Card
                  hoverable
                  bordered
                  className='w-160px h-100px p-0 rd-8px cursor-pointer overflow-hidden'
                  onClick={() => onSelect(template)}
                  bodyStyle={{ padding: 0 }}
                >
                  <img
                    src={template.previewDataUrl}
                    alt={template.manifest.name}
                    className='w-160px h-100px object-cover'
                  />
                </Card>
              </Tooltip>
              <div className='flex items-center justify-between mt-4px'>
                <span className='text-12px truncate'>{template.manifest.name}</span>
                <div className='flex items-center gap-4px shrink-0'>
                  <Tag size='small'>{template.manifest.format.toUpperCase()}</Tag>
                  {template.manifest.source === 'user' && (
                    <Popconfirm
                      title={t('conversation.presentationTemplates.deleteConfirm')}
                      onOk={() => onRemove(template.manifest.id)}
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
            </div>
          ))}
          <Card
            hoverable
            bordered
            className='flex flex-col items-center justify-center w-160px h-100px shrink-0 rd-8px cursor-pointer'
            onClick={onImport}
            role='button'
            aria-label={t('conversation.presentationTemplates.importCard')}
          >
            <Upload size='20' />
            <span className='text-12px mt-4px'>{t('conversation.presentationTemplates.importCard')}</span>
          </Card>
          {templates.length === 0 && (
            <span className='text-12px self-center'>{t('conversation.presentationTemplates.empty')}</span>
          )}
        </div>
      )}
    </div>
  );
};

export default TemplateGalleryPanel;
