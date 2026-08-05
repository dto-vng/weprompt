/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  StudioAsset,
  StudioRendererProject,
  StudioRouteCatalog,
  StudioScene,
} from '@/common/types/project/creativeStudioTypes';
import { Button } from '@arco-design/web-react';
import { Picture, VideoOne } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { buildSingleSceneReviewRequest, type GenerationSingleReviewRequest } from '../Generation/GenerationControls';
import { canOpenSingleSceneReview, deriveStudioReadiness } from '../../studioReadiness';
import studioType from '../../StudioTypography.module.css';
import {
  createManagedStudioAssetUrl,
  isCanonicalStudioPosterAsset,
  isCanonicalStudioSelectedAsset,
  isSafeStudioId,
} from './managedStudioAssets';

const SLATE_PREVIEW_STYLE = {
  background: 'var(--studio-slate-surface)',
  border: '1px dashed var(--studio-slate-border)',
} satisfies React.CSSProperties;

export type StagePreviewProps = {
  projectId: string;
  project?: StudioRendererProject;
  catalog?: StudioRouteCatalog | null;
  selectedScene: StudioScene | null;
  /** Canonical metadata for the selected generated output. Omitted only for the legacy ID-only caller. */
  selectedAsset?: StudioAsset | null;
  /** Canonical thumbnail resolved by the controller from the selected video's job lineage. */
  posterAsset?: StudioAsset | null;
  catalogLoading?: boolean;
  generationDisabled?: boolean;
  /** Review opts into a non-generating slate; Produce remains the default presentation. */
  presentation?: 'produce' | 'review';
  slate?: {
    title: string;
    durationSeconds: number;
  } | null;
  onOpenSingleReview?: (request: GenerationSingleReviewRequest) => void;
};

const StagePreview: React.FC<StagePreviewProps> = ({
  projectId,
  project,
  catalog,
  selectedScene,
  selectedAsset,
  posterAsset = null,
  catalogLoading = false,
  generationDisabled = false,
  presentation = 'produce',
  slate = null,
  onOpenSingleReview,
}) => {
  const { t } = useTranslation();
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const mediaKind = selectedScene?.mediaKind ?? 'image';
  const accessibleName = t(
    mediaKind === 'video'
      ? 'conversation.creativeStudio.preview.videoLabel'
      : 'conversation.creativeStudio.preview.imageAlt'
  );
  const selectedAssetId = selectedScene?.selectedAssetId ?? null;
  const canonicalScene =
    project?.id === projectId && selectedScene !== null && project.scenes[selectedScene.id]?.id === selectedScene.id
      ? project.scenes[selectedScene.id]!
      : null;
  const sceneStatus =
    project === undefined || canonicalScene === null
      ? null
      : deriveStudioReadiness(project).sceneStatuses[canonicalScene.id];
  const singleReviewEligible =
    canonicalScene !== null && canOpenSingleSceneReview(sceneStatus, canonicalScene.visualPrompt);
  const singleReviewRequest =
    catalogLoading ||
    generationDisabled ||
    onOpenSingleReview === undefined ||
    canonicalScene === null ||
    !singleReviewEligible
      ? null
      : buildSingleSceneReviewRequest({
          project: project!,
          catalog: catalog ?? null,
          scene: canonicalScene,
          durationSeconds: canonicalScene.durationSeconds,
          hasReference: canonicalScene.referenceAssetId !== null,
        });

  useEffect(() => {
    setFailedSource(null);
  }, [selectedAssetId]);

  if (selectedAssetId === null) {
    const PlaceholderIcon = mediaKind === 'video' ? VideoOne : Picture;
    if (presentation === 'review' && slate !== null) {
      return (
        <section
          aria-label={t('conversation.creativeStudio.preview.title')}
          className='flex min-h-320px flex-col items-center justify-center gap-10px rounded-12px p-24px text-center'
          style={SLATE_PREVIEW_STYLE}
        >
          <div
            role='img'
            aria-label={accessibleName}
            className='flex h-64px w-64px items-center justify-center rounded-full bg-fill-2 text-30px text-t-tertiary'
          >
            <PlaceholderIcon />
          </div>
          <p className={`${studioType.eyebrow} m-0 text-t-tertiary`}>
            {t('conversation.creativeStudio.phase.review.slateLabel')}
          </p>
          <h2 className={`${studioType.cardTitle} m-0`}>{slate.title}</h2>
          <p className={`${studioType.meta} m-0`}>
            {t('conversation.creativeStudio.scene.durationSeconds', {
              count: slate.durationSeconds,
              seconds: slate.durationSeconds,
            })}
          </p>
          <p className={`${studioType.body} m-0 max-w-480px`}>
            {t('conversation.creativeStudio.phase.review.slateDescription')}
          </p>
          <p className={`${studioType.body} m-0 max-w-480px`}>
            {t('conversation.creativeStudio.phase.review.excludedFromHandoff')}
          </p>
        </section>
      );
    }
    return (
      <section
        aria-label={t('conversation.creativeStudio.preview.title')}
        className='flex min-h-320px flex-col items-center justify-center gap-10px rounded-12px p-24px text-center'
        style={SLATE_PREVIEW_STYLE}
      >
        <div
          role='img'
          aria-label={accessibleName}
          className='flex h-64px w-64px items-center justify-center rounded-full bg-fill-2 text-30px text-t-tertiary'
        >
          <PlaceholderIcon />
        </div>
        <h2 className={`${studioType.cardTitle} m-0`}>{t('conversation.creativeStudio.preview.noAssetTitle')}</h2>
        <p className={`${studioType.body} m-0 max-w-420px`}>
          {catalogLoading
            ? t('conversation.creativeStudio.models.loading')
            : selectedScene !== null && selectedScene.visualPrompt.trim().length === 0
              ? t('conversation.creativeStudio.preview.missingVisualPrompt')
              : project !== undefined && !generationDisabled && singleReviewEligible && singleReviewRequest === null
                ? t('conversation.creativeStudio.preview.missingModel')
                : t('conversation.creativeStudio.preview.noAssetBody')}
        </p>
        {singleReviewRequest !== null && (
          <Button type='primary' onClick={() => onOpenSingleReview(singleReviewRequest)}>
            {t('conversation.creativeStudio.preview.generateThisScene')}
          </Button>
        )}
      </section>
    );
  }

  const source = createManagedStudioAssetUrl(projectId, selectedAssetId);
  const hasCanonicalSceneIdentity = selectedScene !== null && isSafeStudioId(selectedScene.id);
  const hasCanonicalAssetIdentity =
    selectedScene?.assetIds.includes(selectedAssetId) === true &&
    (selectedAsset === undefined ||
      (selectedAsset !== null &&
        isCanonicalStudioSelectedAsset(selectedAsset, projectId, selectedScene, selectedAssetId)));
  if (source === null || !hasCanonicalSceneIdentity || !hasCanonicalAssetIdentity || failedSource === source) {
    return (
      <div
        role='alert'
        className='flex min-h-320px items-center justify-center rounded-12px border border-danger-3 bg-danger-light-1 p-24px text-center text-danger'
      >
        {t('conversation.creativeStudio.preview.loadFailed')}
      </div>
    );
  }

  const posterSource =
    mediaKind === 'video' &&
    selectedScene !== null &&
    posterAsset !== null &&
    isCanonicalStudioPosterAsset(posterAsset, projectId, selectedScene)
      ? createManagedStudioAssetUrl(projectId, posterAsset.id)
      : null;

  return (
    <figure
      aria-label={t('conversation.creativeStudio.preview.title')}
      className='m-0 flex min-h-320px flex-col items-center justify-center gap-10px overflow-hidden rounded-12px border border-border-2 bg-fill-1'
    >
      {mediaKind === 'video' ? (
        <>
          <video
            aria-label={accessibleName}
            className='max-h-70vh max-w-full object-contain'
            src={source}
            poster={posterSource ?? undefined}
            controls
            muted
            playsInline
            preload='metadata'
            onError={() => setFailedSource(source)}
          />
          {posterSource === null && (
            <div role='status' className={`${studioType.body} flex items-center gap-6px px-12px pb-12px`}>
              <VideoOne aria-hidden='true' />
              <span>{t('conversation.creativeStudio.preview.videoReady')}</span>
            </div>
          )}
        </>
      ) : (
        <img
          alt={accessibleName}
          className='max-h-70vh max-w-full object-contain'
          src={source}
          onError={() => setFailedSource(source)}
        />
      )}
    </figure>
  );
};

export { StagePreview };
export { createManagedStudioAssetUrl, isCanonicalStudioPosterAsset, isCanonicalStudioSelectedAsset };
