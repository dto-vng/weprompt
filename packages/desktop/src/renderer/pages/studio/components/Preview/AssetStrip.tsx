/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button } from '@arco-design/web-react';
import { VideoOne } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import type {
  StudioAsset,
  StudioScene,
  StudioSelectVariationRequest,
} from '@/common/types/project/creativeStudioTypes';

import studioType from '../../StudioTypography.module.css';
import { createManagedStudioAssetUrl } from './StagePreview';

type ActionResult = void | Promise<unknown>;

export type AssetStripProps = {
  projectId: string;
  scene: StudioScene | null;
  assets: Readonly<Record<string, StudioAsset>>;
  projectRevision: number;
  mutationPending: boolean;
  direction?: 'row' | 'column';
  onSelectAsset: (request: StudioSelectVariationRequest) => ActionResult;
};

/** Canonical generated variations for the selected scene. */
export const AssetStrip: React.FC<AssetStripProps> = ({
  projectId,
  scene,
  assets,
  projectRevision,
  mutationPending,
  direction = 'row',
  onSelectAsset,
}) => {
  const { t } = useTranslation();
  if (scene === null) return null;

  const generatedAssets = scene.assetIds.flatMap((assetId) => {
    const candidate = assets[assetId];
    if (
      candidate === undefined ||
      candidate.id !== assetId ||
      candidate.projectId !== projectId ||
      candidate.sceneId !== scene.id ||
      candidate.mediaKind !== scene.mediaKind ||
      candidate.managedAsset.collection !== 'assets'
    ) {
      return [];
    }
    const source = createManagedStudioAssetUrl(projectId, candidate.id);
    return source === null ? [] : [{ asset: candidate, source }];
  });

  if (generatedAssets.length === 0) return null;

  return (
    <section
      aria-label={t('conversation.creativeStudio.preview.versions')}
      data-layout={direction}
      className='flex min-w-0 flex-col gap-8px'
    >
      <h3 className={`${studioType.cardTitle} m-0`}>{t('conversation.creativeStudio.preview.versions')}</h3>
      <ol
        className={
          direction === 'column'
            ? 'm-0 flex min-w-0 list-none flex-col gap-8px p-0'
            : 'm-0 flex list-none gap-8px overflow-x-auto p-0'
        }
      >
        {generatedAssets.map(({ asset, source }, index) => {
          const versionLabel = t('conversation.creativeStudio.preview.versionLabel', { number: index + 1 });
          const selectLabel = t('conversation.creativeStudio.preview.selectVersionAccessible', { number: index + 1 });
          const selected = scene.selectedAssetId === asset.id;
          return (
            <li key={asset.id} className={direction === 'column' ? 'min-w-0' : 'flex-none'}>
              <Button
                type='text'
                aria-label={selectLabel}
                aria-current={selected ? 'true' : undefined}
                title={selectLabel}
                long={direction === 'column'}
                className={
                  direction === 'column'
                    ? 'h-auto min-w-0 flex-row justify-start gap-8px p-6px text-left'
                    : 'h-auto min-w-92px flex-col gap-6px p-6px'
                }
                disabled={mutationPending}
                onClick={() =>
                  void onSelectAsset({
                    projectId,
                    sceneId: scene.id,
                    assetId: asset.id,
                    expectedRevision: projectRevision,
                  })
                }
              >
                <span className='flex h-54px w-80px items-center justify-center overflow-hidden rounded-6px bg-fill-2 text-24px text-t-tertiary'>
                  {asset.mediaKind === 'image' ? (
                    <img alt='' className='h-full w-full object-cover' src={source} />
                  ) : (
                    <VideoOne aria-hidden='true' />
                  )}
                </span>
                <span className='flex min-w-0 flex-col items-start gap-4px'>
                  <span className={studioType.meta}>{versionLabel}</span>
                  {selected && (
                    <span
                      className={`${studioType.eyebrow} rounded-full bg-primary-light-1 px-6px py-2px text-primary-6`}
                    >
                      {t('conversation.creativeStudio.phase.review.selectedTake')}
                    </span>
                  )}
                </span>
              </Button>
            </li>
          );
        })}
      </ol>
    </section>
  );
};
