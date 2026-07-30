/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Button, Tag, Tooltip } from '@arco-design/web-react';
import { Close } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import type { PresentationTemplateSummary } from '@/common/types/office/presentationTemplate';

/** Kimi-style selected-template thumbnail card shown inside the composer. */
const TemplateChipCard: React.FC<{
  template: PresentationTemplateSummary;
  onRemove: () => void;
}> = ({ template, onRemove }) => {
  const { t } = useTranslation();
  return (
    <Tooltip content={t('conversation.presentationTemplates.chipTooltip')}>
      <div
        data-testid='template-chip-card'
        className='inline-flex items-center gap-8px p-4px pr-8px rd-8px b b-solid b-1 bg-fill-1 max-w-280px'
      >
        <img
          src={template.previewDataUrl}
          alt={template.manifest.name}
          className='w-84px h-52px object-cover rd-6px shrink-0'
        />
        <div className='flex flex-col gap-2px min-w-0'>
          <span className='text-12px font-medium truncate'>{template.manifest.name}</span>
          <Tag size='small' className='w-fit'>
            {template.manifest.format.toUpperCase()}
          </Tag>
        </div>
        <Button
          size='mini'
          shape='circle'
          icon={<Close size='12' />}
          onClick={onRemove}
          data-testid='template-chip-remove'
          aria-label={t('common.close', { defaultValue: 'Close' })}
        />
      </div>
    </Tooltip>
  );
};

export default TemplateChipCard;
