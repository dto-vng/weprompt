/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  StudioMediaKind,
  StudioRendererProject,
  StudioRouteCatalog,
} from '@/common/types/project/creativeStudioTypes';

const STORAGE_BOUNDS = { minDurationSeconds: 1, maxDurationSeconds: 60 } as const;

export type StudioSceneDurationBounds = {
  minDurationSeconds: number;
  maxDurationSeconds: number;
  source: 'selected_route' | 'fallback';
};

/** Resolves the editable duration range for the selected route and media kind. */
export const resolveSceneDurationBounds = (
  project: StudioRendererProject,
  catalog: StudioRouteCatalog | null,
  mediaKind: StudioMediaKind
): StudioSceneDurationBounds => {
  const selected = project.routing[mediaKind];
  const route = catalog?.[mediaKind].selectedRoute ?? null;
  const matches =
    selected !== null &&
    route !== null &&
    route.kind === mediaKind &&
    route.choiceId === selected.choiceId &&
    route.providerId === selected.providerId &&
    route.model === selected.model;
  if (!matches) return { ...STORAGE_BOUNDS, source: 'fallback' };
  return {
    minDurationSeconds: Math.max(STORAGE_BOUNDS.minDurationSeconds, route.constraints.minDurationSeconds),
    maxDurationSeconds: Math.min(STORAGE_BOUNDS.maxDurationSeconds, route.constraints.maxDurationSeconds),
    source: 'selected_route',
  };
};
