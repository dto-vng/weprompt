/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import MarkdownView from '@/renderer/components/Markdown';
import { Alert, Button, Drawer, Spin } from '@arco-design/web-react';
import React, { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { findCitationHeading } from './knowledgePreviewAnchor';

export type KnowledgeSourcePreviewProps = {
  fileName: string | null;
  text: string;
  truncated: boolean;
  loading: boolean;
  failed: boolean;
  /** Citation headingPath to scroll to once the text loads (no match → top). */
  anchor?: string;
  onClose: () => void;
  onOpenOriginal: () => void;
};

/**
 * Right-side drawer showing the text a knowledge source contributes to
 * retrieval. Deliberately the *indexed* text (the extraction), not a render of
 * the original: for a converted PDF or docx, seeing exactly what the index
 * sees is what makes a bad-retrieval report diagnosable. The note says so
 * plainly so nobody mistakes a lossy extraction for a broken document.
 */
const KnowledgeSourcePreview: React.FC<KnowledgeSourcePreviewProps> = ({
  fileName,
  text,
  truncated,
  loading,
  failed,
  anchor,
  onClose,
  onOpenOriginal,
}) => {
  const { t } = useTranslation();
  const markdownBodyRef = useRef<HTMLDivElement | null>(null);
  const handleMarkdownRef = useCallback((el?: HTMLDivElement | null) => {
    markdownBodyRef.current = el ?? null;
  }, []);

  // Scroll the loaded preview to the cited section. One frame lets the
  // markdown commit inside the drawer before we measure; no match → stay at top.
  useEffect(() => {
    if (loading || failed || !anchor || fileName === null) return;
    const frame = requestAnimationFrame(() => {
      const container = markdownBodyRef.current;
      if (!container) return;
      const heading = findCitationHeading(container, anchor);
      heading?.scrollIntoView?.({ block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [anchor, failed, fileName, loading, text]);

  return (
    <Drawer
      data-testid='knowledge-preview-drawer'
      width={560}
      title={<span className='text-14px font-500 break-all'>{fileName ?? ''}</span>}
      visible={fileName !== null}
      onCancel={onClose}
      footer={
        <div className='flex justify-end'>
          <Button size='small' onClick={onOpenOriginal}>
            {t('conversation.projectHome.knowledgeOpenOriginal')}
          </Button>
        </div>
      }
    >
      <div className='flex flex-col gap-12px'>
        <span className='text-12px text-t-tertiary'>{t('conversation.projectHome.knowledgePreviewNote')}</span>
        {loading ? (
          <div className='flex items-center justify-center py-24px'>
            <Spin />
          </div>
        ) : failed ? (
          <Alert type='warning' content={t('conversation.projectHome.knowledgePreviewError')} />
        ) : (
          <>
            <MarkdownView hiddenCodeCopyButton onRef={handleMarkdownRef}>
              {text}
            </MarkdownView>
            {truncated && (
              <span className='text-12px text-t-tertiary'>
                {t('conversation.projectHome.knowledgePreviewTruncated')}
              </span>
            )}
          </>
        )}
      </div>
    </Drawer>
  );
};

export default KnowledgeSourcePreview;
