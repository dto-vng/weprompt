/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

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
            /*
              C-17: Arco fills its textarea with --color-fill-2 (#f0e9db), a heavy warm block
              on the near-white settings page. Scoped to this field rather than retuning
              --color-fill-2, which every Arco fill in the app shares.
              Inline style, not a utility class, for two reasons: it beats Arco's own selector
              without an `!important` fight, and this repo's numeric border utilities set
              colour but never width, so `border-1` would silently produce no border at all.
            */
            style={{
              background: 'var(--input-surface)',
              border: '1px solid var(--input-border)',
            }}
          />
        </label>

        <Typography.Text type='secondary' className='text-12px'>
          {t('settings.profileScopeNote')}
        </Typography.Text>
      </div>
    </SettingsPageWrapper>
  );
};

export default ProfileSettings;
