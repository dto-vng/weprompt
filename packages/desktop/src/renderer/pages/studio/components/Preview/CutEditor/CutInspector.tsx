/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, InputNumber, Select, Slider } from '@arco-design/web-react';
import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import type {
  StudioAsset,
  StudioCutClip,
  StudioCutFilter,
  StudioEditableCutClip,
  StudioRendererProject,
  StudioScene,
  StudioSelectVariationRequest,
} from '@/common/types/project/creativeStudioTypes';

import studioType from '../../../StudioTypography.module.css';
import { AssetStrip } from '../AssetStrip';
import { sourceDurationFor } from './CutTimeline';
import styles from './cut-editor.module.css';

const FILTER_IDS = ['exposure', 'contrast', 'saturation', 'temperature'] as const;
const FRAME_SECONDS = 1 / 30;

const roundSeconds = (value: number): number => Math.round(value * 1000) / 1000;
const roundNormalised = (value: number): number => Math.round(value * 1000) / 1000;

const filterAmount = (clip: StudioCutClip, id: StudioCutFilter['id']): number =>
  clip.filters.find((filter) => filter.id === id)?.amount ?? 0;

const withFilter = (clip: StudioCutClip, id: StudioCutFilter['id'], amount: number): StudioEditableCutClip => ({
  sourceInSeconds: clip.sourceInSeconds,
  sourceOutSeconds: clip.sourceOutSeconds,
  crop: clip.crop,
  filters: [
    ...clip.filters.filter((filter) => filter.id !== id && filter.amount !== 0),
    ...(amount === 0 ? [] : [{ id, amount }]),
  ],
});

const ratioValue = (ratio: StudioRendererProject['aspectRatio']): number => {
  const [width, height] = ratio.split(':').map(Number);
  return width! / height!;
};

const cropBaseFor = (project: StudioRendererProject, asset: StudioAsset | null): { width: number; height: number } => {
  const projectRatio = ratioValue(project.aspectRatio);
  const sourceRatio =
    asset?.width !== undefined && asset.height !== undefined ? asset.width / asset.height : projectRatio;
  return sourceRatio > projectRatio
    ? { width: projectRatio / sourceRatio, height: 1 }
    : { width: 1, height: sourceRatio / projectRatio };
};

const cropForScale = (
  percent: number,
  project: StudioRendererProject,
  asset: StudioAsset | null
): StudioCutClip['crop'] => {
  if (percent >= 100) return null;
  const base = cropBaseFor(project, asset);
  const scale = percent / 100;
  const width = roundNormalised(base.width * scale);
  const height = roundNormalised(base.height * scale);
  return {
    x: roundNormalised((1 - width) / 2),
    y: roundNormalised((1 - height) / 2),
    width,
    height,
  };
};

export type CutInspectorProps = {
  project: StudioRendererProject;
  scene: StudioScene | null;
  asset: StudioAsset | null;
  clip: StudioCutClip | null;
  playheadInClipSeconds: number;
  disabled: boolean;
  onSelectAsset: (request: StudioSelectVariationRequest) => void | Promise<unknown>;
  onEditClip: (edit: StudioEditableCutClip) => void;
  onResetClip: () => void;
};

export const CutInspector: React.FC<CutInspectorProps> = ({
  project,
  scene,
  asset,
  clip,
  playheadInClipSeconds,
  disabled,
  onSelectAsset,
  onEditClip,
  onResetClip,
}) => {
  const { t } = useTranslation();
  const inspectorRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    inspectorRef.current?.querySelectorAll<HTMLElement>('[data-slider-label]').forEach((container) => {
      const label = container.dataset.sliderLabel;
      if (label !== undefined)
        container.querySelector<HTMLElement>('[role="slider"]')?.setAttribute('aria-label', label);
    });
  }, [clip, t]);

  if (scene === null) {
    return (
      <aside
        ref={inspectorRef}
        aria-label={t('conversation.creativeStudio.phase.review.cut.inspector')}
        className={styles.inspector}
      >
        <h3 className={`${studioType.cardTitle} m-0`}>{t('conversation.creativeStudio.phase.review.cut.inspector')}</h3>
        <p className={`${studioType.body} m-0`}>{t('conversation.creativeStudio.phase.review.cut.selectClip')}</p>
      </aside>
    );
  }

  const sourceDuration = clip === null ? scene.durationSeconds : sourceDurationFor(clip, scene, asset ?? undefined);
  const inSeconds = clip?.sourceInSeconds ?? 0;
  const outSeconds = clip?.sourceOutSeconds ?? sourceDuration;
  const cropBase = cropBaseFor(project, asset);
  const scale =
    clip?.crop === null || clip?.crop === undefined
      ? 100
      : Math.round(Math.min(clip.crop.width / cropBase.width, clip.crop.height / cropBase.height) * 100);

  const commitTrim = (nextIn: number, nextOut: number): void => {
    if (clip === null) return;
    const boundedIn = roundSeconds(Math.max(0, Math.min(nextIn, sourceDuration - FRAME_SECONDS)));
    const boundedOut = roundSeconds(Math.max(boundedIn + FRAME_SECONDS, Math.min(nextOut, sourceDuration)));
    onEditClip({
      sourceInSeconds: boundedIn === 0 ? null : boundedIn,
      sourceOutSeconds: boundedOut === sourceDuration ? null : boundedOut,
      crop: clip.crop,
      filters: clip.filters,
    });
  };

  return (
    <aside
      ref={inspectorRef}
      aria-label={t('conversation.creativeStudio.phase.review.cut.inspector')}
      className={styles.inspector}
    >
      <header className={styles.inspectorHeader}>
        <div className='min-w-0'>
          <h3 className={`${studioType.cardTitle} m-0`}>
            {t('conversation.creativeStudio.phase.review.cut.inspector')}
          </h3>
          <p className={`${studioType.meta} m-0 truncate`} title={scene.title}>
            {scene.title}
          </p>
        </div>
      </header>

      <section className={styles.inspectorSection}>
        <h4 className={`${studioType.eyebrow} m-0`}>{t('conversation.creativeStudio.phase.review.cut.takes')}</h4>
        <AssetStrip
          projectId={project.id}
          scene={scene}
          assets={project.assets}
          projectRevision={project.revision}
          mutationPending={disabled}
          direction='column'
          onSelectAsset={onSelectAsset}
        />
      </section>

      {clip !== null && (
        <>
          <section className={styles.inspectorSection}>
            <h4 className={`${studioType.eyebrow} m-0`}>{t('conversation.creativeStudio.phase.review.cut.trim')}</h4>
            <div className={styles.trimFields}>
              <label className={styles.fieldLabel}>
                <span>{t('conversation.creativeStudio.phase.review.cut.inPoint')}</span>
                <InputNumber
                  aria-label={t('conversation.creativeStudio.phase.review.cut.trimInField')}
                  min={0}
                  max={outSeconds - FRAME_SECONDS}
                  step={FRAME_SECONDS}
                  precision={3}
                  value={inSeconds}
                  disabled={disabled}
                  onChange={(value) => commitTrim(typeof value === 'number' ? value : inSeconds, outSeconds)}
                />
              </label>
              <label className={styles.fieldLabel}>
                <span>{t('conversation.creativeStudio.phase.review.cut.outPoint')}</span>
                <InputNumber
                  aria-label={t('conversation.creativeStudio.phase.review.cut.trimOutField')}
                  min={inSeconds + FRAME_SECONDS}
                  max={sourceDuration}
                  step={FRAME_SECONDS}
                  precision={3}
                  value={outSeconds}
                  disabled={disabled}
                  onChange={(value) => commitTrim(inSeconds, typeof value === 'number' ? value : outSeconds)}
                />
              </label>
            </div>
            <div className={styles.setPointActions}>
              <Button
                size='small'
                disabled={disabled || playheadInClipSeconds >= outSeconds - FRAME_SECONDS}
                onClick={() => commitTrim(playheadInClipSeconds, outSeconds)}
              >
                {t('conversation.creativeStudio.phase.review.cut.setIn')}
              </Button>
              <Button
                size='small'
                disabled={disabled || playheadInClipSeconds <= inSeconds + FRAME_SECONDS}
                onClick={() => commitTrim(inSeconds, playheadInClipSeconds)}
              >
                {t('conversation.creativeStudio.phase.review.cut.setOut')}
              </Button>
            </div>
          </section>

          <section className={styles.inspectorSection}>
            <h4 className={`${studioType.eyebrow} m-0`}>{t('conversation.creativeStudio.phase.review.cut.frame')}</h4>
            <label className={styles.fieldLabel}>
              <span>{t('conversation.creativeStudio.phase.review.cut.scale')}</span>
              <Select
                aria-label={t('conversation.creativeStudio.phase.review.cut.scale')}
                value={scale}
                disabled={disabled}
                onChange={(value) =>
                  onEditClip({
                    sourceInSeconds: clip.sourceInSeconds,
                    sourceOutSeconds: clip.sourceOutSeconds,
                    crop: cropForScale(value, project, asset),
                    filters: clip.filters,
                  })
                }
              >
                {[100, 90, 80, 70].map((value) => (
                  <Select.Option key={value} value={value}>
                    {t('conversation.creativeStudio.phase.review.cut.scaleValue', { percent: value })}
                  </Select.Option>
                ))}
              </Select>
            </label>
            <p className={`${studioType.meta} m-0`}>{t('conversation.creativeStudio.phase.review.cut.cropHint')}</p>
          </section>

          <section className={styles.inspectorSection}>
            <h4 className={`${studioType.eyebrow} m-0`}>{t('conversation.creativeStudio.phase.review.cut.colour')}</h4>
            <div className={styles.colourControls}>
              {FILTER_IDS.map((id) => {
                const amount = filterAmount(clip, id);
                return (
                  <label key={id} className={styles.colourControl}>
                    <span data-colour-label className={styles.colourLabel}>
                      <span>{t(`conversation.creativeStudio.phase.review.cut.colourLabels.${id}`)}</span>
                      <span>{amount.toFixed(2)}</span>
                    </span>
                    <span
                      className={styles.sliderTrack}
                      data-slider-label={t(`conversation.creativeStudio.phase.review.cut.colourLabels.${id}`)}
                      onKeyDownCapture={(event) => {
                        const step = event.shiftKey ? 0.1 : 0.01;
                        const next = (() => {
                          switch (event.key) {
                            case 'ArrowRight':
                            case 'ArrowUp':
                              return Math.min(1, amount + step);
                            case 'ArrowLeft':
                            case 'ArrowDown':
                              return Math.max(-1, amount - step);
                            case 'Home':
                              return -1;
                            case 'End':
                              return 1;
                            default:
                              return null;
                          }
                        })();
                        if (next === null) return;
                        event.preventDefault();
                        event.stopPropagation();
                        onEditClip(withFilter(clip, id, Math.round(next * 100) / 100));
                      }}
                    >
                      <span aria-hidden='true' data-control-zero-tick className={styles.zeroTick} />
                      <Slider
                        aria-label={t(`conversation.creativeStudio.phase.review.cut.colourLabels.${id}`)}
                        min={-1}
                        max={1}
                        step={0.01}
                        value={amount}
                        disabled={disabled}
                        onAfterChange={(value) => {
                          if (typeof value === 'number') onEditClip(withFilter(clip, id, value));
                        }}
                      />
                    </span>
                  </label>
                );
              })}
            </div>
          </section>

          <footer className={styles.inspectorFooter}>
            <Button status='danger' disabled={disabled} onClick={onResetClip}>
              {t('conversation.creativeStudio.phase.review.cut.resetClip')}
            </Button>
            <p className={`${studioType.meta} m-0`}>{t('conversation.creativeStudio.phase.review.cut.noUndo')}</p>
          </footer>
        </>
      )}
    </aside>
  );
};
