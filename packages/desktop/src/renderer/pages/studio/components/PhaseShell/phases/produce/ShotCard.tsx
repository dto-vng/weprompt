/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { StudioRendererJob, StudioScene } from '@/common/types/project/creativeStudioTypes';
import { Button, Progress } from '@arco-design/web-react';
import { VideoOne } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import type { StudioSceneStatus } from '../../../../studioReadiness';
import styles from './produce.module.css';

export type ShotCardProps = {
  scene: StudioScene;
  index: number;
  status: StudioSceneStatus;
  selected: boolean;
  selectedTakeSource: string | null;
  posterSource: string | null;
  takeCurrent: number;
  takeTotal: number;
  displayedJob: StudioRendererJob | null;
  mutationPending: boolean;
  cancelPending: boolean;
  reviewAvailable: boolean;
  onSelect: () => void;
  onOpenPreview: () => void;
  onWriteVisual: () => void;
  onOpenReview: () => void;
  onCancelJob: (jobId: string) => void | Promise<unknown>;
};

/** A 16:9 Produce canvas with canonical take, progress, and review actions. */
export const ShotCard: React.FC<ShotCardProps> = ({
  scene,
  index,
  status,
  selected,
  selectedTakeSource,
  posterSource,
  takeCurrent,
  takeTotal,
  displayedJob,
  mutationPending,
  cancelPending,
  reviewAvailable,
  onSelect,
  onOpenPreview,
  onWriteVisual,
  onOpenReview,
  onCancelJob,
}) => {
  const { t } = useTranslation();
  const sceneLabel = t('conversation.creativeStudio.scene.accessibleName', {
    number: index + 1,
    title: scene.title,
  });
  const hasSelectedTake = selectedTakeSource !== null;
  const previewLabel = t('conversation.creativeStudio.phase.produce.openPreview', { title: scene.title });

  return (
    <li aria-label={sceneLabel} data-selected={selected || undefined} className={styles.shotCard}>
      <div className={styles.canvas}>
        {hasSelectedTake ? (
          <Button type='text' className={styles.previewButton} aria-label={previewLabel} onClick={onOpenPreview}>
            {scene.mediaKind === 'image' ? (
              <img
                alt={t('conversation.creativeStudio.preview.imageAlt')}
                className={styles.previewImage}
                src={selectedTakeSource}
              />
            ) : posterSource !== null ? (
              <img
                alt={t('conversation.creativeStudio.preview.videoLabel')}
                className={styles.previewImage}
                src={posterSource}
              />
            ) : (
              <span
                role='img'
                aria-label={t('conversation.creativeStudio.preview.videoLabel')}
                className={styles.videoPlaceholder}
              >
                <VideoOne aria-hidden='true' />
                <span>{t('conversation.creativeStudio.preview.posterUnavailable')}</span>
              </span>
            )}
          </Button>
        ) : (
          <div className={styles.emptyCanvas}>
            <span>{t('conversation.creativeStudio.phase.produce.noVisualYet')}</span>
            <Button size='small' disabled={mutationPending} onClick={onWriteVisual}>
              {t('conversation.creativeStudio.phase.produce.writeVisual')}
            </Button>
          </div>
        )}
      </div>

      <div className={styles.shotBody}>
        <div className={styles.shotTitleRow}>
          <Button
            type='text'
            className={styles.shotTitleButton}
            aria-label={sceneLabel}
            aria-current={selected ? 'true' : undefined}
            disabled={mutationPending}
            onClick={onSelect}
          >
            <span className={styles.shotNumber}>
              {t('conversation.creativeStudio.scene.number', { number: index + 1 })}
            </span>
            <span className={styles.shotTitle}>{scene.title}</span>
          </Button>
          <span className={styles.takeRatio}>
            {t('conversation.creativeStudio.phase.produce.takeRatio', {
              current: takeCurrent,
              total: takeTotal,
            })}
          </span>
        </div>

        <div className={styles.shotMeta}>
          <span className={styles.statusLabel}>
            <span aria-hidden='true' data-status={status} className={styles.statusDot} />
            {t(`conversation.creativeStudio.scene.status.${status}`)}
          </span>
          <span>
            {t('conversation.creativeStudio.scene.durationSeconds', {
              count: scene.durationSeconds,
              seconds: scene.durationSeconds,
            })}
          </span>
        </div>

        {typeof displayedJob?.progress === 'number' && (
          <div className={styles.progressRow}>
            <Progress percent={displayedJob.progress} size='small' showText={false} />
            <span>{t('conversation.creativeStudio.jobs.progress', { percent: displayedJob.progress })}</span>
          </div>
        )}

        <div className={styles.shotActions}>
          {displayedJob?.canCancel === true && (
            <Button size='mini' disabled={cancelPending} onClick={() => void onCancelJob(displayedJob.id)}>
              {t('conversation.creativeStudio.jobs.cancel')}
            </Button>
          )}
          {reviewAvailable && (
            <Button type='primary' size='small' disabled={mutationPending} onClick={onOpenReview}>
              {t(
                takeTotal > 0
                  ? 'conversation.creativeStudio.phase.produce.renderAnother'
                  : 'conversation.creativeStudio.phase.produce.render'
              )}
            </Button>
          )}
        </div>
      </div>
    </li>
  );
};
