/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import { Button, Message, Modal, Spin } from '@arco-design/web-react';
import { AlarmClock, Delete, Left, Refresh } from '@icon-park/react';
import { ipcBridge } from '@/common';
import type { DashboardTemplateSummary } from '@/common/types/office/dashboardTemplate';

const isElectron = typeof window !== 'undefined' && !!(window as { electronAPI?: unknown }).electronAPI;

/**
 * Dashboard tab — a gallery of stored dashboards (the built-in VNG report plus
 * any published from Preview). Clicking a card opens it live in a webview.
 * Backed by the main-process dashboards store via ipcBridge.dashboards.*.
 */
const DashboardPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading, mutate } = useSWR('dashboards', () => ipcBridge.dashboards.list.invoke());
  const dashboards: DashboardTemplateSummary[] = data ?? [];

  const [open, setOpen] = useState<DashboardTemplateSummary | null>(null);
  const [html, setHtml] = useState('');
  const [nonce, setNonce] = useState(0);

  const openDashboard = useCallback(async (d: DashboardTemplateSummary) => {
    try {
      const content = await ipcBridge.dashboards.read.invoke({ id: d.manifest.id });
      setHtml(content);
      setOpen(d);
      setNonce((n) => n + 1);
    } catch (error) {
      Message.error(String(error));
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!open) return;
    const content = await ipcBridge.dashboards.read.invoke({ id: open.manifest.id });
    setHtml(content);
    setNonce((n) => n + 1);
  }, [open]);

  const handleSchedule = useCallback(() => {
    void Promise.resolve(navigate('/scheduled')).catch(() => {});
  }, [navigate]);

  const handleDelete = useCallback(
    (d: DashboardTemplateSummary) => {
      Modal.confirm({
        title: t('dashboard.deleteConfirm'),
        onOk: async () => {
          await ipcBridge.dashboards.remove.invoke({ id: d.manifest.id });
          await mutate();
        },
      });
    },
    [mutate, t]
  );

  const dataUrl = useMemo(() => (html ? `data:text/html;charset=utf-8,${encodeURIComponent(html)}` : ''), [html]);

  // ---- Viewer ----
  if (open) {
    return (
      <div className='size-full flex flex-col bg-document'>
        <div className='shrink-0 h-56px px-16px flex items-center gap-12px border-b border-[var(--color-border-2)]'>
          <Button
            size='small'
            icon={<Left theme='outline' size='14' fill='currentColor' />}
            onClick={() => setOpen(null)}
          >
            {t('dashboard.back')}
          </Button>
          <span className='text-15px font-[700] text-t-primary truncate'>{open.manifest.name}</span>
          <div className='ml-auto flex items-center gap-8px'>
            <Button
              size='small'
              icon={<Refresh theme='outline' size='14' fill='currentColor' />}
              onClick={() => void refresh()}
            >
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
              srcDoc={html}
              title={open.manifest.name}
              className='absolute inset-0 w-full h-full border-0'
              sandbox='allow-scripts allow-same-origin allow-popups'
            />
          )}
        </div>
      </div>
    );
  }

  // ---- Gallery ----
  return (
    <div className='size-full flex flex-col bg-document overflow-auto'>
      <div className='shrink-0 px-24px pt-20px pb-12px'>
        <div className='text-20px font-[800] text-t-primary leading-tight'>{t('dashboard.title')}</div>
        <div className='text-13px text-t-tertiary'>{t('dashboard.subtitle')}</div>
      </div>
      {isLoading ? (
        <div className='flex-1 flex items-center justify-center'>
          <Spin />
        </div>
      ) : dashboards.length === 0 ? (
        <div className='flex-1 flex items-center justify-center text-t-tertiary text-14px'>{t('dashboard.empty')}</div>
      ) : (
        <div
          className='px-24px pb-24px grid gap-16px'
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
        >
          {dashboards.map((d) => {
            const builtin = d.manifest.source === 'builtin';
            return (
              <div
                key={d.manifest.id}
                className='group relative rounded-12px overflow-hidden border border-[var(--color-border-2)] bg-fill-1 cursor-pointer transition-shadow hover:shadow-lg'
                onClick={() => void openDashboard(d)}
              >
                <img
                  src={d.previewDataUrl}
                  alt={d.manifest.name}
                  className='block w-full aspect-[16/10] object-cover'
                />
                <div className='px-12px py-10px flex items-center gap-8px'>
                  <span className='text-14px font-[600] text-t-primary truncate'>{d.manifest.name}</span>
                  {builtin && (
                    <span className='shrink-0 text-9px font-[700] uppercase tracking-wide px-6px py-2px rounded-999px bg-fill-3 text-t-tertiary'>
                      {t('dashboard.builtinBadge')}
                    </span>
                  )}
                </div>
                {!builtin && (
                  <div
                    className='absolute top-8px right-8px opacity-0 group-hover:opacity-100 transition-opacity size-28px flex items-center justify-center rounded-8px bg-[var(--color-bg-2)] text-t-secondary hover:text-danger'
                    title={t('dashboard.delete')}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(d);
                    }}
                  >
                    <Delete theme='outline' size='16' fill='currentColor' />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default DashboardPage;
