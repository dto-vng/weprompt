/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Button, Tooltip } from '@arco-design/web-react';
import { SlideTwo } from '@icon-park/react';
import { useTranslation } from 'react-i18next';

const TemplateGalleryButton: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  const { t } = useTranslation();
  return (
    <Tooltip content={t('conversation.presentationTemplates.buttonTooltip')}>
      <Button
        size='small'
        shape='circle'
        icon={<SlideTwo size='16' />}
        onClick={onClick}
        aria-label={t('conversation.presentationTemplates.buttonTooltip')}
      />
    </Tooltip>
  );
};

export default TemplateGalleryButton;
