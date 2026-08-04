/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  StudioAsset,
  StudioRendererProject,
  StudioSelectVariationRequest,
} from '@/common/types/project/creativeStudioTypes';
import React, { useMemo } from 'react';

import type { StudioReadinessSummary } from '../../studioReadiness';
import { SceneTimeline, type SceneTimelineReviewState } from '../SceneTimeline';
import { AssetStrip } from './AssetStrip';
import { StagePreview } from './StagePreview';

type ActionResult = void | Promise<unknown>;

export type ReviewCutProps = {
  project: StudioRendererProject;
  readiness: StudioReadinessSummary;
  selectedSceneId: string | null;
  selectedAsset: StudioAsset | null;
  posterAsset: StudioAsset | null;
  mutationPending: boolean;
  onSelectScene: (sceneId: string) => void;
  onSelectAsset: (request: StudioSelectVariationRequest) => ActionResult;
};

/** Selected takes and UI-only slates in canonical storyboard order. */
export const ReviewCut: React.FC<ReviewCutProps> = ({
  project,
  readiness,
  selectedSceneId,
  selectedAsset,
  posterAsset,
  mutationPending,
  onSelectScene,
  onSelectAsset,
}) => {
  const orderedScenes = useMemo(
    () =>
      project.sceneOrder.flatMap((sceneId) => {
        const scene = project.scenes[sceneId];
        return scene?.id === sceneId ? [scene] : [];
      }),
    [project]
  );
  const selectedScene = selectedSceneId === null ? null : (project.scenes[selectedSceneId] ?? null);
  const reviewStates = useMemo(
    () =>
      Object.fromEntries(
        orderedScenes.map((scene): [string, SceneTimelineReviewState] => {
          switch (readiness.sceneStatuses[scene.id]) {
            case 'generated':
              return [scene.id, 'selected-take'];
            case 'generating':
              return [scene.id, 'running'];
            case 'needs_attention':
              return [scene.id, 'failed'];
            default:
              return [scene.id, 'missing-slate'];
          }
        })
      ),
    [orderedScenes, readiness.sceneStatuses]
  );

  return (
    <>
      <div data-review-region='stage' className='min-w-0'>
        <StagePreview
          projectId={project.id}
          project={project}
          selectedScene={selectedScene}
          selectedAsset={selectedAsset}
          posterAsset={posterAsset}
          presentation='review'
          slate={
            selectedScene === null
              ? null
              : { title: selectedScene.title, durationSeconds: selectedScene.durationSeconds }
          }
        />
      </div>
      <div data-review-region='takes' className='min-w-0 rounded-12px border border-border-2 bg-base p-12px'>
        <AssetStrip
          projectId={project.id}
          scene={selectedScene}
          assets={project.assets}
          projectRevision={project.revision}
          mutationPending={mutationPending}
          direction='column'
          onSelectAsset={onSelectAsset}
        />
      </div>
      <div data-review-region='filmstrip' className='min-w-0'>
        <SceneTimeline
          orderedScenes={orderedScenes}
          selectedSceneId={selectedSceneId}
          reviewStates={reviewStates}
          onSelectScene={onSelectScene}
        />
      </div>
    </>
  );
};
