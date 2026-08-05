/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  StudioAspectRatio,
  StudioMediaKind,
  StudioResolution,
  StudioRouteCatalogEntry,
} from '@/common/types/project/creativeStudioTypes';

export type StudioRouteSupportContext = {
  kind?: StudioMediaKind;
  sceneId?: string;
  routeSceneId?: string;
  aspectRatio?: StudioAspectRatio;
  resolution?: StudioResolution;
  durationSeconds?: number;
  hasReference?: boolean;
};

/**
 * Checks renderer-visible compatibility for a scene and catalog route.
 *
 * `silentOutput` is intentionally not checked here. The main-process Creative
 * Studio service is the security boundary that rejects non-silent routes for
 * untrusted adapters; duplicating that gate in the renderer would incorrectly
 * hide legitimate audio-capable routes.
 */
export const routeSupportsScene = (
  route: StudioRouteCatalogEntry,
  { kind, sceneId, routeSceneId, aspectRatio, resolution, durationSeconds, hasReference }: StudioRouteSupportContext
): boolean =>
  route.health !== 'unavailable' &&
  (kind === undefined || route.kind === kind) &&
  (sceneId === undefined || routeSceneId === sceneId) &&
  (aspectRatio === undefined || route.constraints.aspectRatios.includes(aspectRatio)) &&
  (resolution === undefined || route.constraints.resolutions.includes(resolution)) &&
  (durationSeconds === undefined ||
    (durationSeconds >= route.constraints.minDurationSeconds &&
      durationSeconds <= route.constraints.maxDurationSeconds)) &&
  (hasReference !== true || route.constraints.supportsFirstFrame);
