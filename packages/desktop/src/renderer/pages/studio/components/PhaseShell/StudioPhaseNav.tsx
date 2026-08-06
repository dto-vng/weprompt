/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { StudioRendererProject } from '@/common/types/project/creativeStudioTypes';
import { Button } from '@arco-design/web-react';
import { Check } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { STUDIO_PHASES, type StudioPhase } from '../../studioPhaseRoute';
import type { StudioReadinessSummary } from '../../studioReadiness';
import { deriveStudioPhaseCompletion } from './studioPhaseCompletion';
import styles from './StudioPhaseShell.module.css';

const PHASE_LABEL_KEYS: Record<StudioPhase, string> = {
  brief: 'conversation.creativeStudio.phase.nav.brief',
  write: 'conversation.creativeStudio.phase.nav.write',
  produce: 'conversation.creativeStudio.phase.nav.produce',
  review: 'conversation.creativeStudio.phase.nav.review',
};

export type StudioPhaseNavProps = {
  activePhase: StudioPhase;
  project: StudioRendererProject;
  readiness: StudioReadinessSummary;
  disabled: boolean;
  onSelect: (phase: StudioPhase) => void;
};

export const StudioPhaseNav: React.FC<StudioPhaseNavProps> = ({
  activePhase,
  project,
  readiness,
  disabled,
  onSelect,
}) => {
  const { t } = useTranslation();
  const completion = deriveStudioPhaseCompletion(project, readiness);

  return (
    <nav aria-label={t('conversation.creativeStudio.phase.nav.label')} className={styles.phaseNavigation}>
      <ol className={styles.phaseList}>
        {STUDIO_PHASES.map((phase, index) => {
          const active = phase === activePhase;
          const complete = completion[phase];
          return (
            <li key={phase} className={styles.phaseItem}>
              <Button
                type='text'
                aria-current={active ? 'step' : undefined}
                data-active={active}
                className={`${styles.phaseButton} ${active ? styles.phaseButtonActive : ''}`}
                disabled={disabled}
                onClick={() => onSelect(phase)}
              >
                <span
                  aria-hidden='true'
                  data-complete={complete}
                  data-studio-phase-marker={phase}
                  className={`${styles.phaseMarker} ${complete ? styles.phaseMarkerComplete : ''}`}
                >
                  {complete ? <Check size='12' /> : index + 1}
                </span>
                <span className={styles.phaseLabel}>{t(PHASE_LABEL_KEYS[phase])}</span>
              </Button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
