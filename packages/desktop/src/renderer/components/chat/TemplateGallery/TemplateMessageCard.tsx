/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import useSWR from 'swr';
import { Tag } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import { useTemplateLabels } from './usePresentationTemplates';

/** kebab-case template id → display name for templates no longer installed. */
const idToName = (id: string): string =>
  id
    .split('-')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');

/**
 * Thumbnail card rendered on a templated user message in place of the raw
 * directive text. Resolves the preview from the shared template list; when the
 * template was removed since sending, degrades to an id-derived name card.
 */
const TemplateMessageCard: React.FC<{ templateId: string }> = ({ templateId }) => {
  const { data: templates } = useSWR('presentation-templates', () => ipcBridge.presentationTemplates.list.invoke());
  const template = templates?.find((item) => item.manifest.id === templateId);
  const labelsOf = useTemplateLabels();

  return (
    <div
      data-testid='template-message-card'
      className='inline-flex items-center gap-8px p-4px pr-10px rd-8px b b-solid b-1 bg-fill-1 mb-6px max-w-280px'
    >
      {template ? (
        <>
          <img src={template.previewDataUrl} alt='' className='w-84px h-52px object-cover rd-6px shrink-0' />
          <div className='flex flex-col gap-2px min-w-0'>
            <span className='text-12px font-medium truncate'>{labelsOf(template).name}</span>
            <Tag size='small' className='w-fit'>
              {template.manifest.format.toUpperCase()}
            </Tag>
          </div>
        </>
      ) : (
        <span className='text-12px font-medium truncate'>{idToName(templateId)}</span>
      )}
    </div>
  );
};

export default TemplateMessageCard;
