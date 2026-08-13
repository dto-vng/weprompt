/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { buildPdfSrc } from '../../previewUrls';
import { usePreviewToolbarExtras } from '../../context/PreviewToolbarExtrasContext';
import { Button, Message } from '@arco-design/web-react';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface PDFPreviewProps {
  /**
   * PDF file path (absolute path on disk)
   * PDF 文件路径（磁盘上的绝对路径）
   */
  file_path?: string;
  /**
   * PDF content as base64 or blob URL
   * PDF 内容（base64 或 blob URL）
   */
  content?: string;
  hideToolbar?: boolean;
}

// Electron webview 元素的类型定义 / Type definition for Electron webview element
interface ElectronWebView extends HTMLElement {
  src: string;
}

const PDFPreview: React.FC<PDFPreviewProps> = ({ file_path, content, hideToolbar = false }) => {
  const { t } = useTranslation();
  const [loadFailed, setLoadFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const webviewRef = useRef<ElectronWebView>(null);
  const [messageApi, messageContextHolder] = Message.useMessage();
  const toolbarExtrasContext = usePreviewToolbarExtras();
  const usePortalToolbar = Boolean(toolbarExtrasContext) && !hideToolbar;

  // 使用 Electron webview 加载本地 PDF 文件
  // Use Electron webview to load local PDF files
  const pdfSrc = buildPdfSrc(file_path, content);
  // 错误文案在渲染时翻译，这样监听副作用不必依赖 t
  // Errors are translated at render time so the listener effect never depends on `t`
  const errorMessage = !pdfSrc ? t('preview.pdf.pathMissing') : loadFailed ? t('preview.pdf.loadFailed') : null;
  const hasError = Boolean(errorMessage);

  const handleOpenInSystem = useCallback(async () => {
    if (!file_path) {
      messageApi.error(t('preview.errors.openWithoutPath'));
      return;
    }

    try {
      await ipcBridge.shell.openFile.invoke(file_path);
      messageApi.success(t('preview.openInSystemSuccess'));
    } catch (err) {
      messageApi.error(t('preview.openInSystemFailed'));
    }
  }, [file_path, messageApi, t]);

  // webview 始终保持挂载，loading 只作为覆盖层渲染，因此监听器绑定在活动节点上
  // The <webview> stays mounted and loading renders as an overlay, so these listeners
  // are always bound to the live element. Unmounting it while loading would strand them
  // on a detached node: neither did-finish-load nor did-fail-load would arrive and the
  // panel would sit on "Loading…" forever.
  //
  // 仅以 pdfSrc 为依赖：切换语言时已加载完成的 webview 不会再次触发 did-finish-load
  // Keyed on pdfSrc alone — on a language switch the document has not changed, and an
  // already-loaded webview never fires did-finish-load again, so re-entering the loading
  // state there would hang. useLayoutEffect puts the overlay up before the new src paints.
  useLayoutEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    setLoading(true);
    setLoadFailed(false);

    const handleLoad = () => {
      setLoading(false);
    };
    const handleError = () => {
      setLoadFailed(true);
      setLoading(false);
    };

    webview.addEventListener('did-finish-load', handleLoad);
    webview.addEventListener('did-fail-load', handleError);

    return () => {
      webview.removeEventListener('did-finish-load', handleLoad);
      webview.removeEventListener('did-fail-load', handleError);
    };
  }, [pdfSrc]);

  // 设置工具栏扩展（必须在所有条件返回之前调用）
  // Set toolbar extras (must be called before any conditional returns)
  useEffect(() => {
    if (!usePortalToolbar || !toolbarExtrasContext || loading || hasError) return;
    toolbarExtrasContext.setExtras({
      left: (
        <div className='flex items-center gap-8px'>
          <span className='text-13px text-t-secondary'>📄 {t('preview.pdf.title')}</span>
          <span className='text-11px text-t-tertiary'>{t('preview.readOnlyLabel')}</span>
        </div>
      ),
      right: null,
    });
    return () => toolbarExtrasContext.setExtras(null);
  }, [usePortalToolbar, toolbarExtrasContext, t, loading, hasError]);

  if (errorMessage) {
    return (
      <div className='flex items-center justify-center h-full'>
        {messageContextHolder}
        <div className='text-center'>
          <div className='text-16px text-t-error mb-8px'>❌ {errorMessage}</div>
          <div className='text-12px text-t-secondary'>{t('preview.pdf.unableDisplay')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className='h-full w-full bg-1 flex flex-col'>
      {messageContextHolder}
      {!usePortalToolbar && !hideToolbar && (
        <div className='flex items-center justify-between h-40px px-12px bg-2 flex-shrink-0'>
          <div className='flex items-center gap-8px'>
            <span className='text-13px text-t-secondary'>📄 {t('preview.pdf.title')}</span>
            <span className='text-11px text-t-tertiary'>{t('preview.readOnlyLabel')}</span>
          </div>
          {file_path && (
            <Button size='mini' type='text' onClick={handleOpenInSystem} title={t('preview.openInSystemApp')}>
              <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                <path d='M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' />
                <polyline points='15 3 21 3 21 9' />
                <line x1='10' y1='14' x2='21' y2='3' />
              </svg>
              <span>{t('preview.openInSystemApp')}</span>
            </Button>
          )}
        </div>
      )}
      {/* PDF 内容区域 / PDF content area */}
      <div className='relative flex-1 overflow-hidden bg-1'>
        {/* key 确保文件路径改变时 webview 重新挂载 / key ensures webview remounts when file path changes */}
        <webview
          key={pdfSrc}
          ref={webviewRef}
          src={pdfSrc}
          className='w-full h-full'
          style={{ display: 'inline-flex' }}
        />
        {loading && (
          <div className='absolute inset-0 flex items-center justify-center bg-1'>
            <div className='text-14px text-t-secondary'>{t('preview.loading')}</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PDFPreview;
