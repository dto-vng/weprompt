/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { buildInjectedContext, GLOBAL_CONTEXT_LABEL } from '@/common/chat/buildInjectedContext';
import { useConfig } from '@/renderer/hooks/config/useConfig';
import { Input, Switch, Typography } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import SettingsPageWrapper from './components/SettingsPageWrapper';

const ProfileSettings: React.FC = () => {
  const { t } = useTranslation();
  const [ctx, setCtx] = useConfig('user.context');
  const enabled = ctx?.enabled ?? true;
  const instructions = ctx?.instructions ?? '';

  // Uses the same constant as the real injection, so this preview cannot drift
  // from what actually reaches the model.
  const preview = buildInjectedContext([{ label: GLOBAL_CONTEXT_LABEL, text: enabled ? instructions : '' }]);

  return (
    <SettingsPageWrapper>
      <div className='flex flex-col gap-24px'>
        <div className='flex flex-col gap-6px'>
          <Typography.Title heading={5} className='!mb-0'>
            {t('settings.profileTitle')}
          </Typography.Title>
          <Typography.Text type='secondary'>{t('settings.profileDescription')}</Typography.Text>
        </div>

        <div className='flex items-center gap-12px'>
          <Switch checked={enabled} onChange={(value) => void setCtx({ enabled: value, instructions })} />
          <span className='text-14px text-t-primary'>{t('settings.profileEnableLabel')}</span>
        </div>

        <label className='flex flex-col gap-6px'>
          <span className='text-13px text-t-secondary'>{t('settings.profileInstructionsLabel')}</span>
          <Input.TextArea
            aria-label={t('settings.profileInstructionsLabel')}
            value={instructions}
            placeholder={t('settings.profileInstructionsPlaceholder')}
            onChange={(value) => void setCtx({ enabled, instructions: value })}
            autoSize={{ minRows: 6, maxRows: 16 }}
          />
        </label>

        <Typography.Text type='secondary' className='text-12px'>
          {t('settings.profileScopeNote')}
        </Typography.Text>

        <div className='flex flex-col gap-6px'>
          <span className='text-13px text-t-secondary'>{t('settings.profilePreviewTitle')}</span>
          <pre className='m-0 whitespace-pre-wrap rd-8px bg-fill-2 p-12px text-13px text-t-secondary'>
            {preview || t('settings.profilePreviewEmpty')}
          </pre>
        </div>
      </div>
    </SettingsPageWrapper>
  );
};

export default ProfileSettings;
