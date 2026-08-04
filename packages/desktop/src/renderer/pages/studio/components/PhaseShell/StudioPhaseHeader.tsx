/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { StudioRendererProject } from '@/common/types/project/creativeStudioTypes';
import { Button } from '@arco-design/web-react';
import { Left } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import styles from './StudioPhaseShell.module.css';

export type StudioPhaseHeaderProps = {
  project: StudioRendererProject;
  onBack: () => void;
  actions?: React.ReactNode;
};

export const StudioPhaseHeader: React.FC<StudioPhaseHeaderProps> = ({ project, onBack, actions }) => {
  const { t } = useTranslation();

  return (
    <header className={styles.header}>
      <div className={styles.headerCopy}>
        <nav aria-label={t('conversation.creativeStudio.phase.shared.backToLibrary')} className={styles.breadcrumb}>
          <Button type='text' size='small' icon={<Left />} onClick={onBack}>
            {t('conversation.creativeStudio.phase.shared.backToLibrary')}
          </Button>
          <span aria-hidden='true' className={styles.breadcrumbSeparator}>
            /
          </span>
          <span aria-current='page' className={styles.breadcrumbProject}>
            {project.name}
          </span>
        </nav>
        <h1 className={styles.projectTitle}>{project.name}</h1>
        <p className={styles.projectBrief}>{project.brief}</p>
      </div>
      {actions !== undefined && (
        <div data-studio-phase-actions className={styles.headerActions}>
          {actions}
        </div>
      )}
    </header>
  );
};
