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
import { useTemplateLabels } from './usePresentationTemplates';

/** Kimi-style selected-template thumbnail card shown inside the composer. */
const TemplateChipCard: React.FC<{
  template: PresentationTemplateSummary;
  onRemove: () => void;
}> = ({ template, onRemove }) => {
  const { t } = useTranslation();
  const labels = useTemplateLabels()(template);
  return (
    <Tooltip content={t('conversation.presentationTemplates.chipTooltip')}>
      <div
        data-testid='template-chip-card'
        className='inline-flex items-center gap-8px p-4px pr-8px rd-8px b b-solid b-1 bg-fill-1 max-w-280px'
      >
        <img src={template.previewDataUrl} alt='' className='w-84px h-52px object-cover rd-6px shrink-0' />
        <div className='flex min-w-0 flex-1 flex-col gap-2px'>
          <span className='truncate text-12px font-medium text-t-primary'>{labels.name}</span>
          <Tag size='small' className='w-fit !border-[var(--color-border-2)] !bg-fill-2 !text-t-secondary'>
            {template.manifest.format.toUpperCase()}
          </Tag>
        </div>
        <Button
          type='text'
          size='mini'
          shape='circle'
          icon={<Close size='12' />}
          onClick={onRemove}
          data-testid='template-chip-remove'
          aria-label={t('common.close', { defaultValue: 'Close' })}
          className='shrink-0 !text-t-secondary hover:!bg-fill-2 hover:!text-t-primary focus-visible:[outline:2px_solid_rgb(var(--primary-6))] focus-visible:outline-offset-2'
        />
      </div>
    </Tooltip>
  );
};

export default TemplateChipCard;
