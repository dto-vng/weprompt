/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { StudioAsset, StudioScene } from '@/common/types/project/creativeStudioTypes';

const SAFE_STUDIO_ID = /^[A-Za-z0-9_-]{1,256}$/;

/** Builds the only renderer-supported Creative Studio media URL shape. */
export const createManagedStudioAssetUrl = (projectId: string, assetId: string): string | null => {
  if (!SAFE_STUDIO_ID.test(projectId) || !SAFE_STUDIO_ID.test(assetId)) return null;
  return `weprompt-studio://asset/${encodeURIComponent(projectId)}/${encodeURIComponent(assetId)}`;
};

export const isSafeStudioId = (value: string): boolean => SAFE_STUDIO_ID.test(value);

export const isCanonicalStudioSelectedAsset = (
  asset: StudioAsset,
  projectId: string,
  scene: StudioScene,
  selectedAssetId: string
): boolean =>
  asset.id === selectedAssetId &&
  asset.projectId === projectId &&
  asset.sceneId === scene.id &&
  asset.mediaKind === scene.mediaKind &&
  asset.managedAsset.collection === 'assets' &&
  scene.assetIds.includes(asset.id) &&
  createManagedStudioAssetUrl(projectId, asset.id) !== null;

export const isCanonicalStudioPosterAsset = (asset: StudioAsset, projectId: string, scene: StudioScene): boolean =>
  asset.projectId === projectId &&
  asset.sceneId === scene.id &&
  asset.mediaKind === 'image' &&
  asset.managedAsset.collection === 'thumbnails' &&
  scene.assetIds.includes(asset.id) &&
  createManagedStudioAssetUrl(projectId, asset.id) !== null;
