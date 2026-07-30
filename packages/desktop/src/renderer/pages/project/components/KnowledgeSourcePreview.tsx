/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import MarkdownView from '@/renderer/components/Markdown';
import { Alert, Button, Drawer, Spin } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

export type KnowledgeSourcePreviewProps = {
  fileName: string | null;
  text: string;
  truncated: boolean;
  loading: boolean;
  failed: boolean;
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
  onClose,
  onOpenOriginal,
}) => {
  const { t } = useTranslation();

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
            <MarkdownView hiddenCodeCopyButton>{text}</MarkdownView>
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
