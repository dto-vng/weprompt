/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';

import { ReviewCut } from '../../Preview';
import type { ReviewPhaseController } from '../types';
import type { StudioLayoutMode } from '../useStudioLayoutMode';
import styles from './ReviewPhase.module.css';

export type ReviewPhaseProps = {
  controller: ReviewPhaseController;
  layoutMode?: StudioLayoutMode;
};

export const ReviewPhase: React.FC<ReviewPhaseProps> = ({ controller, layoutMode = 'inline' }) => {
  const { t } = useTranslation();
  const { project, readiness, editor, selectedAsset, posterAsset, mutationPending, selectVariation } = controller;
  const missingSlateCount = Math.max(0, readiness.totalSceneCount - readiness.selectedAssetCount);

  return (
    <section data-layout={layoutMode} className={styles.phase} aria-labelledby='studio-review-phase-heading'>
      <h2 id='studio-review-phase-heading' data-studio-phase-heading tabIndex={-1} className={styles.heading}>
        {t('conversation.creativeStudio.phase.review.title')}
      </h2>
      <p className='m-0 text-14px text-t-secondary'>{t('conversation.creativeStudio.phase.review.description')}</p>
      <div className={styles.workspace}>
        <div className={styles.previewArea}>
          <ReviewCut
            project={project}
            readiness={readiness}
            selectedSceneId={editor.selectedSceneId}
            selectedAsset={selectedAsset}
            posterAsset={posterAsset}
            mutationPending={mutationPending || editor.hasUnsavedSceneDrafts}
            onSelectAsset={selectVariation}
            onSelectScene={editor.selectScene}
          />
        </div>
        <aside aria-labelledby='studio-review-handoff-heading' className={styles.handoff}>
          <h3 id='studio-review-handoff-heading' className='m-0 text-14px font-600 text-t-primary'>
            {t('conversation.creativeStudio.phase.review.handoff')}
          </h3>
          <div className={styles.handoffSummary}>
            <span>
              {t('conversation.creativeStudio.phase.review.renderedShots', {
                count: readiness.selectedAssetCount,
              })}
            </span>
            <span>
              {t('conversation.creativeStudio.phase.review.missingSlates', {
                count: missingSlateCount,
              })}
            </span>
          </div>
          <p className='m-0 text-12px text-t-secondary'>
            {t('conversation.creativeStudio.phase.review.handoffDescription')}
          </p>
          {readiness.selectedAssetCount === 0 && (
            <p className='m-0 text-12px text-t-secondary'>{t('conversation.creativeStudio.phase.review.noAssets')}</p>
          )}
        </aside>
      </div>
    </section>
  );
};
