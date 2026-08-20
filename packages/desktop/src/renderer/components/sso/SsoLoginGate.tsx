/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, ConfigProvider, Typography } from '@arco-design/web-react';
import React, { createContext, useContext, useState, type CSSProperties, type PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';

export type SsoAccount = { username: string; name?: string; homeAccountId?: string };

type SsoAuthValue = {
  account: SsoAccount | null;
  ssoEnabled: boolean;
  setAccount: (account: SsoAccount | null) => void;
};

const SsoAuthContext = createContext<SsoAuthValue>({ account: null, ssoEnabled: false, setAccount: () => {} });

export const useSsoAuth = (): SsoAuthValue => useContext(SsoAuthContext);

function readSsoWindow(): { account: SsoAccount | null; enabled: boolean } {
  const w = window as typeof window & { __ssoAccount?: SsoAccount | null; __ssoEnabled?: boolean };
  return { account: w.__ssoAccount ?? null, enabled: Boolean(w.__ssoEnabled) };
}

const DRAG: CSSProperties = { WebkitAppRegion: 'drag' } as CSSProperties;
const NO_DRAG: CSSProperties = { WebkitAppRegion: 'no-drag' } as CSSProperties;

const MicrosoftLogo: React.FC = () => (
  <svg width='16' height='16' viewBox='0 0 21 21' aria-hidden='true'>
    <rect x='1' y='1' width='9' height='9' fill='#f25022' />
    <rect x='11' y='1' width='9' height='9' fill='#7fba00' />
    <rect x='1' y='11' width='9' height='9' fill='#00a4ef' />
    <rect x='11' y='11' width='9' height='9' fill='#ffb900' />
  </svg>
);

const SsoLoginScreen: React.FC<{ onSignedIn: (account: SsoAccount) => void }> = ({ onSignedIn }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const account = await window.electronAPI?.signInSso?.();
      if (account) onSignedIn(account);
      else setError(t('login.sso.failedMessage'));
    } catch {
      setError(t('login.sso.failedMessage'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='fixed inset-0 z-1000 flex items-center justify-center bg-base px-24px' style={DRAG}>
      <div className='flex flex-col items-center text-center w-full max-w-360px' style={NO_DRAG}>
        <div className='text-24px font-600 text-t-primary tracking-tight'>WePrompt</div>
        <Typography.Title heading={4} className='!mt-24px !mb-8px'>
          {t('login.sso.title')}
        </Typography.Title>
        <Typography.Text type='secondary' className='text-14px leading-relaxed'>
          {t('login.sso.subtitle')}
        </Typography.Text>
        <Button
          type='primary'
          size='large'
          long
          loading={loading}
          className='!mt-32px'
          icon={<MicrosoftLogo />}
          onClick={() => void handleLogin()}
        >
          {t('login.sso.signInButton')}
        </Button>
        {error && (
          <Typography.Text type='error' className='!mt-16px text-13px'>
            {error}
          </Typography.Text>
        )}
      </div>
    </div>
  );
};

/**
 * Gates the app behind a Microsoft login screen when SSO is configured and no account
 * is signed in. The app window opens to this screen (no forced browser popup); the user
 * clicks to sign in, and signing out returns here (WP 24045).
 */
export const SsoLoginGate: React.FC<PropsWithChildren> = ({ children }) => {
  const initial = readSsoWindow();
  const [account, setAccount] = useState<SsoAccount | null>(initial.account);
  const value: SsoAuthValue = { account, ssoEnabled: initial.enabled, setAccount };
  const showLogin = initial.enabled && !account;

  return (
    <SsoAuthContext.Provider value={value}>
      {showLogin ? (
        <ConfigProvider theme={{ primaryColor: '#F05A22' }}>
          <SsoLoginScreen onSignedIn={setAccount} />
        </ConfigProvider>
      ) : (
        children
      )}
    </SsoAuthContext.Provider>
  );
};
