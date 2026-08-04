/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { STUDIO_PHASES, type StudioPhase } from '../../studioPhaseRoute';
import styles from './StudioPhaseShell.module.css';

const PHASE_LABEL_KEYS: Record<StudioPhase, string> = {
  brief: 'conversation.creativeStudio.phase.nav.brief',
  write: 'conversation.creativeStudio.phase.nav.write',
  produce: 'conversation.creativeStudio.phase.nav.produce',
  review: 'conversation.creativeStudio.phase.nav.review',
};

export type StudioPhaseNavProps = {
  activePhase: StudioPhase;
  disabled: boolean;
  onSelect: (phase: StudioPhase) => void;
};

export const StudioPhaseNav: React.FC<StudioPhaseNavProps> = ({ activePhase, disabled, onSelect }) => {
  const { t } = useTranslation();

  return (
    <nav aria-label={t('conversation.creativeStudio.phase.nav.label')} className={styles.phaseNavigation}>
      <ol className={styles.phaseList}>
        {STUDIO_PHASES.map((phase) => (
          <li key={phase} className={styles.phaseItem}>
            <Button
              type={phase === activePhase ? 'primary' : 'text'}
              aria-current={phase === activePhase ? 'step' : undefined}
              className={styles.phaseButton}
              disabled={disabled}
              onClick={() => onSelect(phase)}
            >
              {t(PHASE_LABEL_KEYS[phase])}
            </Button>
          </li>
        ))}
      </ol>
    </nav>
  );
};
