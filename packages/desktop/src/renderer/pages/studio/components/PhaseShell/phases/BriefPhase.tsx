/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';

import type { BriefPhaseController } from '../types';
import styles from './BriefPhase.module.css';

export type BriefPhaseProps = {
  controller: BriefPhaseController;
};

export const BriefPhase: React.FC<BriefPhaseProps> = ({ controller }) => {
  const { t } = useTranslation();
  const { project } = controller;

  return (
    <section className={styles.phase} aria-labelledby='studio-brief-phase-heading'>
      <h2 id='studio-brief-phase-heading' data-studio-phase-heading tabIndex={-1} className={styles.heading}>
        {t('conversation.creativeStudio.project.brief')}
      </h2>
      <dl className={styles.metadata}>
        <div className={styles.metadataItem}>
          <dt>{t('conversation.creativeStudio.project.title')}</dt>
          <dd>{project.name}</dd>
        </div>
        <div className={styles.metadataItem}>
          <dt>{t('conversation.creativeStudio.project.brief')}</dt>
          <dd>{project.brief}</dd>
        </div>
        <div className={styles.metadataItem}>
          <dt>{t('conversation.creativeStudio.project.aspectRatio')}</dt>
          <dd>{project.aspectRatio}</dd>
        </div>
        <div className={styles.metadataItem}>
          <dt>{t('conversation.creativeStudio.project.targetDuration')}</dt>
          <dd>{project.targetDurationSeconds}</dd>
        </div>
      </dl>
    </section>
  );
};
