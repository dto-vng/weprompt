/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { OfficeArtifactEdit, OfficeArtifactInspection } from '@/common/types/office/artifactEditor';
import { Button, Dropdown, Menu, Tooltip, Typography } from '@arco-design/web-react';
import { Download, EditTwo, FolderOpen, MoreOne, Refresh, Robot, Undo } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { OfficeSelectionEditor } from './OfficeSelectionEditor';
import type { OfficeArtifactEditorStatus, OfficeSelectionDirection } from './useOfficeArtifactEditor';
import styles from './OfficeArtifactToolbar.module.css';

export type OfficeArtifactToolbarProps = {
  inspection: OfficeArtifactInspection | null;
  status: OfficeArtifactEditorStatus;
  undoDepth: number;
  apply: (edit: OfficeArtifactEdit) => Promise<boolean> | boolean | void;
  undo: () => Promise<boolean> | boolean | void;
  askForge: () => void;
  openInDesktopApp: () => Promise<boolean> | boolean | void;
  download: () => void;
  revealInFolder: () => void;
  refresh: () => void;
  moveSelection: (direction: OfficeSelectionDirection) => void;
};

const ICON_SIZE = 16;

const STATUS_KEYS: Partial<Record<OfficeArtifactEditorStatus, string>> = {
  saving: 'preview.office.editor.saving',
  saved: 'preview.office.editor.saved',
  saveFailed: 'preview.office.editor.saveFailed',
  fileChanged: 'preview.office.editor.fileChanged',
  unsupported: 'preview.office.editor.unsupported',
  openedDesktop: 'preview.office.editor.openedDesktop',
};

export const OfficeArtifactToolbar: React.FC<OfficeArtifactToolbarProps> = ({
  inspection,
  status,
  undoDepth,
  apply,
  undo,
  askForge,
  openInDesktopApp,
  download,
  revealInFolder,
  refresh,
  moveSelection,
}) => {
  const { t } = useTranslation();
  const busy = status === 'saving' || status === 'openingDesktop';
  const unsupported =
    inspection !== null &&
    (inspection.kind === 'word'
      ? !inspection.canReplace && !inspection.canFormat
      : inspection.cells.length !== 1 || !inspection.canEdit);
  const statusKey = STATUS_KEYS[status];
  const statusText = statusKey ? t(statusKey) : unsupported ? t('preview.office.editor.unsupported') : '';
  const statusIsError =
    status === 'saveFailed' || status === 'fileChanged' || status === 'unsupported' || (unsupported && !statusKey);

  const moreMenu = (
    <Menu>
      <Menu.Item
        key='undo'
        className={styles.compactMenuItem}
        data-testid='office-toolbar-compact-undo'
        disabled={undoDepth <= 0 || busy}
        onClick={() => void undo()}
      >
        <Undo size={ICON_SIZE} />
        {t('preview.office.editor.undo')}
      </Menu.Item>
      <Menu.Item
        key='open'
        className={styles.compactMenuItem}
        data-testid='office-toolbar-compact-open'
        onClick={() => void openInDesktopApp()}
      >
        <EditTwo size={ICON_SIZE} />
        {t('preview.office.editor.openDesktop')}
      </Menu.Item>
      <Menu.Item key='download' onClick={download}>
        <Download size={ICON_SIZE} />
        {t('common.download')}
      </Menu.Item>
      <Menu.Item key='reveal' onClick={revealInFolder}>
        <FolderOpen size={ICON_SIZE} />
        {t('preview.office.editor.reveal')}
      </Menu.Item>
      <Menu.Item key='refresh' onClick={refresh}>
        <Refresh size={ICON_SIZE} />
        {t('preview.office.editor.refresh')}
      </Menu.Item>
    </Menu>
  );

  return (
    <div className={styles.toolbar} data-testid='office-artifact-toolbar'>
      <div className={styles.leftActions}>
        <OfficeSelectionEditor inspection={inspection} status={status} apply={apply} moveSelection={moveSelection} />
        <Typography.Text
          className={statusIsError ? styles.errorStatus : styles.status}
          aria-live='polite'
          role={statusIsError ? 'alert' : undefined}
          ellipsis
        >
          {statusText}
        </Typography.Text>
      </div>
      <div className={styles.rightActions}>
        <Tooltip content={t('preview.office.editor.undo')}>
          <Button
            type='text'
            size='small'
            aria-label={t('preview.office.editor.undo')}
            icon={<Undo size={ICON_SIZE} />}
            disabled={undoDepth <= 0 || busy}
            className={`${styles.actionButton} ${styles.secondaryAction}`}
            onClick={() => void undo()}
          >
            <span className={styles.actionLabel}>{t('preview.office.editor.undo')}</span>
          </Button>
        </Tooltip>
        <Tooltip content={t('preview.office.editor.askForge')}>
          <Button
            type='text'
            size='small'
            aria-label={t('preview.office.editor.askForge')}
            icon={<Robot size={ICON_SIZE} />}
            disabled={!inspection || status === 'saving'}
            className={styles.actionButton}
            onClick={askForge}
          >
            <span className={styles.actionLabel}>{t('preview.office.editor.askForge')}</span>
          </Button>
        </Tooltip>
        <Tooltip content={t('preview.office.editor.openDesktop')}>
          <Button
            type='secondary'
            size='small'
            aria-label={t('preview.office.editor.openDesktop')}
            icon={<EditTwo size={ICON_SIZE} />}
            loading={status === 'openingDesktop'}
            className={`${styles.actionButton} ${styles.secondaryAction}`}
            onClick={() => void openInDesktopApp()}
          >
            <span className={styles.actionLabel}>{t('preview.office.editor.openDesktop')}</span>
          </Button>
        </Tooltip>
        <Dropdown trigger='click' position='br' droplist={moreMenu}>
          <Tooltip content={t('preview.office.editor.more')}>
            <Button
              type='text'
              size='small'
              aria-label={t('preview.office.editor.more')}
              icon={<MoreOne size={ICON_SIZE} />}
              className={styles.iconButton}
            />
          </Tooltip>
        </Dropdown>
      </div>
    </div>
  );
};
