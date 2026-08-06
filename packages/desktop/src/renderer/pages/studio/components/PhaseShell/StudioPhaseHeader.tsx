/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { StudioRendererProject } from '@/common/types/project/creativeStudioTypes';
import { Button, Tag } from '@arco-design/web-react';
import { Left } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import type { SelectedSceneSaveState } from '../../hooks/useStoryboardEditor';
import styles from './StudioPhaseShell.module.css';

export type StudioPhaseHeaderProps = {
  project: StudioRendererProject;
  saveState: SelectedSceneSaveState;
  onBack: () => void;
  actions?: React.ReactNode;
};

const SAVE_STATE_KEYS: Record<SelectedSceneSaveState, string> = {
  saved: 'conversation.creativeStudio.phase.nav.saved',
  dirty: 'conversation.creativeStudio.phase.nav.saving',
  saving: 'conversation.creativeStudio.phase.nav.saving',
  failed: 'conversation.creativeStudio.inspector.saveFailed',
};

export const StudioPhaseHeader: React.FC<StudioPhaseHeaderProps> = ({ project, saveState, onBack, actions }) => {
  const { t } = useTranslation();

  return (
    <header className={styles.header}>
      <div className={styles.headerCopy}>
        <nav aria-label={t('conversation.creativeStudio.phase.shared.backToLibrary')} className={styles.breadcrumb}>
          <Button type='text' size='small' icon={<Left />} className={styles.breadcrumbButton} onClick={onBack}>
            {t('conversation.creativeStudio.phase.shared.backToLibrary')}
          </Button>
          <span aria-hidden='true' className={styles.breadcrumbSeparator}>
            /
          </span>
        </nav>
        <h1 className={styles.projectTitle}>{project.name}</h1>
        <Tag
          size='small'
          aria-label={`${t('conversation.creativeStudio.project.aspectRatio')}: ${project.aspectRatio}`}
          className={styles.aspectChip}
        >
          {project.aspectRatio}
        </Tag>
      </div>
      <div className={styles.headerMeta}>
        <span role='status' aria-live='polite' aria-atomic='true' data-state={saveState} className={styles.saveState}>
          {t(SAVE_STATE_KEYS[saveState])}
        </span>
        {actions !== undefined && (
          <div data-studio-phase-actions className={styles.headerActions}>
            {actions}
          </div>
        )}
      </div>
    </header>
  );
};
