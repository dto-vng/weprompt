/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@arco-design/web-react';

import { isCanonicalStudioGeneratedTake } from '@/common/types/project/creativeStudioCanonicalTake';
import { ReviewCut, createManagedStudioAssetUrl } from '../../Preview';
import { useCutEditor, useStudioRender } from '../../../hooks';
import type { ReviewPhaseController } from '../types';
import type { StudioLayoutMode } from '../useStudioLayoutMode';
import styles from './ReviewPhase.module.css';

export type ReviewPhaseProps = {
  controller: ReviewPhaseController;
  layoutMode?: StudioLayoutMode;
};

export const ReviewPhase: React.FC<ReviewPhaseProps> = ({ controller, layoutMode = 'inline' }) => {
  const { t } = useTranslation();
  const { readiness, editor, posterAsset, mutationPending, selectVariation } = controller;
  const cutEditor = useCutEditor(controller.project, controller.refreshProject);
  const { project } = cutEditor;
  const missingSlateCount = Math.max(0, readiness.totalSceneCount - readiness.selectedAssetCount);
  const render = useStudioRender(project.id);
  const canonicalMissingSceneIds = project.sceneOrder.filter((sceneId) => {
    const scene = project.scenes[sceneId];
    const asset = scene?.selectedAssetId === null ? undefined : project.assets[scene?.selectedAssetId ?? ''];
    return scene === undefined || asset === undefined || !isCanonicalStudioGeneratedTake(asset, project.id, scene);
  });
  const renderMissingSceneIds = render.missingSceneIds ?? canonicalMissingSceneIds;
  const renderSource = render.assetId === null ? null : createManagedStudioAssetUrl(project.id, render.assetId);
  const renderRunning = render.status === 'running';
  const renderPercent = Math.round(render.progress * 100);

  return (
    <section data-layout={layoutMode} className={styles.phase} aria-labelledby='studio-review-phase-heading'>
      <h2 id='studio-review-phase-heading' data-studio-phase-heading tabIndex={-1} className={styles.heading}>
        {t('conversation.creativeStudio.phase.review.title')}
      </h2>
      <p className={`${styles.description} m-0`}>{t('conversation.creativeStudio.phase.review.description')}</p>
      <div className={styles.workspace}>
        <ReviewCut
          cutEditor={cutEditor}
          readiness={readiness}
          selectedSceneId={editor.selectedSceneId}
          posterAsset={posterAsset}
          mutationPending={mutationPending || editor.hasUnsavedSceneDrafts}
          onSelectAsset={selectVariation}
          onSelectScene={editor.selectScene}
        />
        <footer aria-label={t('conversation.creativeStudio.phase.review.render.footer')} className={styles.renderFoot}>
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
          <p className={`${styles.handoffDescription} m-0`}>
            {t('conversation.creativeStudio.phase.review.handoffDescription')}
          </p>
          {readiness.selectedAssetCount === 0 && (
            <p className={`${styles.handoffDescription} m-0`}>
              {t('conversation.creativeStudio.phase.review.noAssets')}
            </p>
          )}
          {renderMissingSceneIds.length > 0 && (
            <p className={`${styles.handoffDescription} m-0`}>
              {t('conversation.creativeStudio.phase.review.render.missingScenes', {
                count: renderMissingSceneIds.length,
              })}
            </p>
          )}
          <div className='flex flex-wrap gap-8px'>
            <Button
              type='primary'
              disabled={renderRunning}
              loading={renderRunning}
              onClick={() => void render.render()}
            >
              {renderRunning
                ? t('conversation.creativeStudio.phase.review.render.progress', { percent: renderPercent })
                : t('conversation.creativeStudio.phase.review.render.action')}
            </Button>
            {renderRunning && (
              <Button onClick={() => void render.cancel()}>
                {t('conversation.creativeStudio.phase.review.render.cancel')}
              </Button>
            )}
          </div>
          {render.errorMessageKey !== null && (
            <p role='alert' className={`${styles.handoffDescription} m-0 text-danger`}>
              {t(render.errorMessageKey)}
            </p>
          )}
          {renderSource !== null && (
            <video
              aria-label={t('conversation.creativeStudio.phase.review.render.resultLabel')}
              className='w-full rounded-8px border border-border-2 bg-fill-1'
              src={renderSource}
              controls
              playsInline
              preload='metadata'
            />
          )}
        </footer>
      </div>
    </section>
  );
};
