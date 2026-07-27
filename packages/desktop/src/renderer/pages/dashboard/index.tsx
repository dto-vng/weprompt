/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@arco-design/web-react';
import { AlarmClock, Refresh } from '@icon-park/react';
// Seeded HR report is the single source of truth in the process dashboard-templates pack.
// `?raw` inlines it as a build-time string, so this stays renderer-safe (no process runtime).
import reportHtml from '@process/resources/dashboard-templates/vng-headcount/template.html?raw';

const isElectron = typeof window !== 'undefined' && !!(window as { electronAPI?: unknown }).electronAPI;

/**
 * Dashboard page — renders the VNG People Analytics report live inside WePrompt.
 * Electron hosts it in a <webview> (so the report's CDN chart libraries load, unbound by the
 * app CSP, mirroring the Preview HTMLRenderer); the web build falls back to a sandboxed iframe.
 */
const DashboardPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Bump to remount the host and re-run the report (a "refresh").
  const [nonce, setNonce] = useState(0);

  const dataUrl = useMemo(() => `data:text/html;charset=utf-8,${encodeURIComponent(reportHtml)}`, []);

  const handleRefresh = () => setNonce((n) => n + 1);
  const handleSchedule = () => {
    void Promise.resolve(navigate('/scheduled')).catch((error) => {
      console.error('Navigation failed:', error);
    });
  };

  return (
    <div className='size-full flex flex-col bg-document'>
      <div className='shrink-0 h-56px px-16px flex items-center gap-12px border-b border-[var(--color-border-2)]'>
        <div className='flex flex-col justify-center min-w-0'>
          <span className='text-16px font-[700] text-t-primary leading-tight truncate'>{t('dashboard.title')}</span>
          <span className='text-12px text-t-tertiary leading-tight truncate'>{t('dashboard.subtitle')}</span>
        </div>
        <div className='ml-auto flex items-center gap-8px'>
          <Button size='small' icon={<Refresh theme='outline' size='14' fill='currentColor' />} onClick={handleRefresh}>
            {t('dashboard.refresh')}
          </Button>
          <Button
            size='small'
            type='primary'
            icon={<AlarmClock theme='outline' size='14' fill='currentColor' />}
            onClick={handleSchedule}
          >
            {t('dashboard.scheduleRun')}
          </Button>
        </div>
      </div>
      <div className='flex-1 min-h-0 relative'>
        {isElectron ? (
          <webview
            key={nonce}
            src={dataUrl}
            className='absolute inset-0 w-full h-full border-0'
            webpreferences='allowRunningInsecureContent, javascript=yes'
          />
        ) : (
          <iframe
            key={nonce}
            srcDoc={reportHtml}
            title={t('dashboard.title')}
            className='absolute inset-0 w-full h-full border-0'
            sandbox='allow-scripts allow-same-origin allow-popups'
          />
        )}
      </div>
    </div>
  );
};

export default DashboardPage;
