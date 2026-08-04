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
  const { project, editor, selectedAsset, posterAsset, mutationPending, selectVariation } = controller;
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
    <div className={styles.phase}>
      <h2 id='studio-review-phase-heading' data-studio-phase-heading tabIndex={-1} className={styles.heading}>
        {t('conversation.creativeStudio.review.title')}
      </h2>
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
    </div>
  );
};
