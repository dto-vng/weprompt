/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { OfficeEditState } from '../../types';
import { Button, Tooltip } from '@arco-design/web-react';
import { EditTwo, FolderOpen, Refresh } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

type OfficeEditControlsProps = {
  state: OfficeEditState;
  onEditInDefaultApp: () => void;
  onRefreshPreview: () => void;
  onRevealInFolder: () => void;
};

const OFFICE_EDIT_STATE_KEYS: Record<OfficeEditState, string> = {
  ready: 'preview.office.externalEdit.status.ready',
  opening: 'preview.office.externalEdit.status.opening',
  editingExternally: 'preview.office.externalEdit.status.editingExternally',
  refreshing: 'preview.office.externalEdit.status.refreshing',
  refreshed: 'preview.office.externalEdit.status.refreshed',
  openFailed: 'preview.office.externalEdit.status.openFailed',
  refreshFailed: 'preview.office.externalEdit.status.refreshFailed',
};

const OfficeEditControls: React.FC<OfficeEditControlsProps> = ({
  state,
  onEditInDefaultApp,
  onRefreshPreview,
  onRevealInFolder,
}) => {
  const { t } = useTranslation();
  const isRefreshing = state === 'refreshing';

  return (
    <div className='flex min-w-0 items-center gap-4px'>
      <Tooltip content={t('preview.office.externalEdit.editInDefaultAppTooltip')}>
        <Button
          type='primary'
          size='mini'
          icon={<EditTwo theme='outline' size={14} />}
          loading={state === 'opening'}
          onClick={onEditInDefaultApp}
        >
          {t('preview.office.externalEdit.editInDefaultApp')}
        </Button>
      </Tooltip>
      <Tooltip content={t('preview.office.externalEdit.refreshPreviewTooltip')}>
        <Button
          type='text'
          size='mini'
          aria-label={t('preview.office.externalEdit.refreshPreview')}
          icon={<Refresh theme='outline' size={14} />}
          disabled={isRefreshing}
          onClick={onRefreshPreview}
        />
      </Tooltip>
      <Tooltip content={t('preview.office.externalEdit.revealInFolderTooltip')}>
        <Button
          type='text'
          size='mini'
          aria-label={t('preview.office.externalEdit.revealInFolder')}
          icon={<FolderOpen theme='outline' size={14} />}
          onClick={onRevealInFolder}
        />
      </Tooltip>
      <span aria-live='polite' className='max-w-220px truncate text-12px text-t-secondary'>
        {t(OFFICE_EDIT_STATE_KEYS[state])}
      </span>
    </div>
  );
};

export default OfficeEditControls;
