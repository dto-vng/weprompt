/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { StudioRendererProject, StudioScene } from '@/common/types/project/creativeStudioTypes';

import type { StudioPhase } from '../../studioPhaseRoute';
import type { StudioReadinessSummary } from '../../studioReadiness';

export type StudioPhaseCompletion = Record<StudioPhase, boolean>;

const orderedScenesAreComplete = (project: StudioRendererProject): boolean => {
  if (project.sceneOrder.length === 0 || new Set(project.sceneOrder).size !== project.sceneOrder.length) return false;
  const scenes = project.sceneOrder.flatMap((sceneId): StudioScene[] => {
    const candidate = project.scenes[sceneId];
    return candidate?.id === sceneId ? [candidate] : [];
  });
  return scenes.length === project.sceneOrder.length && scenes.every((scene) => scene.visualPrompt.trim().length > 0);
};

/** Derives rail completion from durable project content rather than route order. */
export const deriveStudioPhaseCompletion = (
  project: StudioRendererProject,
  readiness: StudioReadinessSummary
): StudioPhaseCompletion => ({
  brief: project.brief.trim().length > 0,
  write: orderedScenesAreComplete(project),
  produce: readiness.selectedAssetCount > 0,
  review: false,
});
