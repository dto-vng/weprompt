/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { SceneTimeline } from '../../SceneTimeline';
import { AssetStrip, StagePreview } from '../../Preview';
import type { ReviewPhaseController } from '../types';
import styles from './ReviewPhase.module.css';

export type ReviewPhaseProps = {
  controller: ReviewPhaseController;
};

export const ReviewPhase: React.FC<ReviewPhaseProps> = ({ controller }) => {
  const { t } = useTranslation();
  const { project, readiness, editor, selectedAsset, posterAsset, mutationPending, selectVariation } = controller;
  const selectedScene = editor.selectedSceneId === null ? null : (project.scenes[editor.selectedSceneId] ?? null);
  const canonicalOrderedScenes = useMemo(
    () =>
      project.sceneOrder.flatMap((sceneId) => {
        const scene = project.scenes[sceneId];
        return scene === undefined ? [] : [scene];
      }),
    [project]
  );

  return (
    <section className={styles.phase} aria-labelledby='studio-review-phase-heading'>
      <h2 id='studio-review-phase-heading' data-studio-phase-heading tabIndex={-1} className={styles.heading}>
        {t('conversation.creativeStudio.phase.review.title')}
      </h2>
      <p className='m-0 text-14px text-t-secondary'>{t('conversation.creativeStudio.phase.review.description')}</p>
      <section aria-labelledby='studio-review-slate-heading'>
        <h3 id='studio-review-slate-heading' className='m-0 text-14px font-600 text-t-primary'>
          {t('conversation.creativeStudio.phase.review.slateLabel')}
        </h3>
        <p className='m-0 text-12px text-t-secondary'>
          {t('conversation.creativeStudio.phase.review.slateDescription')}
        </p>
        <p className='m-0 text-12px text-t-secondary'>
          {t('conversation.creativeStudio.phase.review.excludedFromHandoff')}
        </p>
      </section>
      <div className={styles.previewArea}>
        <StagePreview
          projectId={project.id}
          project={project}
          selectedScene={selectedScene}
          selectedAsset={selectedAsset}
          posterAsset={posterAsset}
          generationDisabled
        />
        <AssetStrip
          projectId={project.id}
          scene={selectedScene}
          assets={project.assets}
          projectRevision={project.revision}
          mutationPending={mutationPending || editor.hasUnsavedSceneDrafts}
          onSelectAsset={selectVariation}
        />
      </div>
      <SceneTimeline
        orderedScenes={canonicalOrderedScenes}
        selectedSceneId={editor.selectedSceneId}
        onSelectScene={editor.selectScene}
      />
      <section aria-labelledby='studio-review-handoff-heading'>
        <h3 id='studio-review-handoff-heading' className='m-0 text-14px font-600 text-t-primary'>
          {t('conversation.creativeStudio.phase.review.handoff')}
        </h3>
        <p className='m-0 text-12px text-t-secondary'>
          {t('conversation.creativeStudio.phase.review.handoffDescription')}
        </p>
        {readiness.selectedAssetCount === 0 && (
          <p className='m-0 text-12px text-t-secondary'>{t('conversation.creativeStudio.phase.review.noAssets')}</p>
        )}
      </section>
    </section>
  );
};
