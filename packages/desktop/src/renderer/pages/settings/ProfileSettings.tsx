/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useConfig } from '@/renderer/hooks/config/useConfig';
import { Button, Input, Popconfirm, Switch, Typography } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import SettingsPageWrapper from './components/SettingsPageWrapper';

const ProfileSettings: React.FC = () => {
  const { t } = useTranslation();
  const [ctx, setCtx] = useConfig('user.context');
  const enabled = ctx?.enabled ?? true;
  const instructions = ctx?.instructions ?? '';

  // Microsoft SSO account (WP 24045), exposed by the preload; null when SSO is off.
  const ssoAccount =
    (globalThis as typeof globalThis & { __ssoAccount?: { username: string; name?: string } | null }).__ssoAccount ??
    null;
  const ssoName = ssoAccount?.name?.trim() || ssoAccount?.username;
  const showSsoEmail = Boolean(ssoAccount?.name?.trim() && ssoAccount.name.trim() !== ssoAccount.username);

  // Sign out of Microsoft SSO: the main process clears the token cache and relaunches
  // the app, so the login gate runs again for a fresh sign-in (WP 24045).
  const handleSignOut = () => {
    void window.electronAPI?.signOutSso?.();
  };

  return (
    <SettingsPageWrapper>
      <div className='flex flex-col gap-24px'>
        {ssoAccount && (
          <div className='flex items-center justify-between gap-12px'>
            <div className='flex flex-col gap-2px'>
              <Typography.Text className='!font-medium'>{t('settings.signedInAs', { name: ssoName })}</Typography.Text>
              {showSsoEmail && (
                <Typography.Text type='secondary' className='text-12px'>
                  {ssoAccount.username}
                </Typography.Text>
              )}
            </div>
            <Popconfirm
              focusLock
              title={t('settings.signOutConfirm')}
              okText={t('settings.signOut')}
              cancelText={t('common.cancel')}
              onOk={handleSignOut}
            >
              <Button size='small'>{t('settings.signOut')}</Button>
            </Popconfirm>
          </div>
        )}

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
      </div>
    </SettingsPageWrapper>
  );
};

export default ProfileSettings;
