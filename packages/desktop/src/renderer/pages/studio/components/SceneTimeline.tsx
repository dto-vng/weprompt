/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button } from '@arco-design/web-react';
import { Attention, Loading } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import type { StudioScene } from '@/common/types/project/creativeStudioTypes';

import studioType from '../StudioTypography.module.css';

export type SceneTimelineReviewState = 'selected-take' | 'missing-slate' | 'running' | 'failed';

export type SceneTimelineProps = {
  orderedScenes: readonly StudioScene[];
  selectedSceneId: string | null;
  onSelectScene: (sceneId: string) => void;
  reviewStates?: Readonly<Partial<Record<string, SceneTimelineReviewState>>>;
};

/** Keyboard-selectable scene order and duration strip. */
export const SceneTimeline: React.FC<SceneTimelineProps> = ({
  orderedScenes,
  selectedSceneId,
  onSelectScene,
  reviewStates,
}) => {
  const { t } = useTranslation();
  const timelineId = React.useId();
  const totalDurationSeconds = orderedScenes.reduce((total, scene) => total + scene.durationSeconds, 0);

  const selectAdjacent = (event: React.KeyboardEvent<HTMLButtonElement>, index: number): void => {
    let targetIndex: number | null = null;
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        targetIndex = Math.max(0, index - 1);
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        targetIndex = Math.min(orderedScenes.length - 1, index + 1);
        break;
      case 'Home':
        targetIndex = 0;
        break;
      case 'End':
        targetIndex = orderedScenes.length - 1;
        break;
      default:
        return;
    }

    const target = orderedScenes[targetIndex];
    if (target === undefined) return;
    event.preventDefault();
    event.currentTarget.closest('ol')?.querySelectorAll<HTMLButtonElement>('button')[targetIndex]?.focus();
    onSelectScene(target.id);
  };

  return (
    <section
      aria-label={t('conversation.creativeStudio.timeline.title')}
      className='flex min-w-0 flex-col gap-10px rounded-12px border border-border-2 bg-base p-14px'
    >
      <header className='flex flex-wrap items-center justify-between gap-8px'>
        <h2 className={`${studioType.cardTitle} m-0`}>{t('conversation.creativeStudio.timeline.title')}</h2>
        {orderedScenes.length > 0 && (
          <div role='status' className={`${studioType.meta} flex items-center gap-6px`}>
            <span>
              {t('conversation.creativeStudio.timeline.totalDurationFull', {
                count: totalDurationSeconds,
                seconds: totalDurationSeconds,
              })}
            </span>
          </div>
        )}
      </header>

      {orderedScenes.length === 0 ? (
        <p className={`${studioType.body} m-0 py-12px text-center`}>
          {t('conversation.creativeStudio.timeline.noScenes')}
        </p>
      ) : (
        <ol className='m-0 flex min-w-0 list-none gap-4px overflow-x-auto p-0'>
          {orderedScenes.map((scene, index) => {
            const reviewState = reviewStates?.[scene.id];
            const sceneNumber = String(index + 1).padStart(2, '0');
            const accessibleName = t('conversation.creativeStudio.timeline.selectSceneAccessible', {
              number: index + 1,
              title: scene.title,
              count: scene.durationSeconds,
              seconds: scene.durationSeconds,
            });
            const reviewPresentation = (() => {
              switch (reviewState) {
                case 'selected-take':
                  return {
                    icon: null,
                    label: t('conversation.creativeStudio.phase.review.selectedTake'),
                  };
                case 'missing-slate':
                  return {
                    icon: null,
                    label: t('conversation.creativeStudio.phase.review.slateLabel'),
                  };
                case 'running':
                  return {
                    icon: <Loading aria-hidden='true' />,
                    label: t('conversation.creativeStudio.scene.status.generating'),
                  };
                case 'failed':
                  return {
                    icon: <Attention aria-hidden='true' />,
                    label: t('conversation.creativeStudio.jobs.status.failed'),
                  };
                default:
                  return null;
              }
            })();
            const reviewStateId =
              reviewPresentation === null ? undefined : `${timelineId}-scene-${index + 1}-review-state`;
            const plateBorderStyle: Pick<React.CSSProperties, 'borderStyle' | 'borderColor'> =
              reviewState === 'missing-slate'
                ? { borderStyle: 'dashed', borderColor: 'var(--studio-slate-border)' }
                : reviewState === 'failed'
                  ? { borderStyle: 'solid', borderColor: 'var(--danger)' }
                  : { borderStyle: 'solid', borderColor: 'var(--studio-take-border)' };
            const plateLabel =
              reviewState === 'missing-slate'
                ? `${sceneNumber} · ${t('conversation.creativeStudio.phase.review.slateLabel')}`
                : reviewState === 'running' || reviewState === 'failed'
                  ? null
                  : `${sceneNumber} · ${scene.durationSeconds}${t('common.unit.second_short')}`;
            const reviewDescriptionIsVisible = reviewState === 'running' || reviewState === 'failed';
            return (
              <li key={scene.id} className='flex min-w-72px' style={{ flexGrow: scene.durationSeconds, flexBasis: 0 }}>
                <Button
                  type='text'
                  long
                  aria-label={accessibleName}
                  aria-describedby={reviewStateId}
                  aria-current={selectedSceneId === scene.id ? 'true' : undefined}
                  title={accessibleName}
                  className='min-w-0 flex-1 flex-col items-start justify-end overflow-hidden p-8px text-left'
                  style={{
                    height: 52,
                    background: 'var(--studio-slate-surface)',
                    borderWidth: 1,
                    ...plateBorderStyle,
                  }}
                  onClick={() => onSelectScene(scene.id)}
                  onKeyDown={(event) => selectAdjacent(event, index)}
                >
                  {reviewPresentation !== null && !reviewDescriptionIsVisible && (
                    <span id={reviewStateId} className='sr-only'>
                      {reviewPresentation.label}
                    </span>
                  )}
                  {plateLabel !== null ? (
                    <span
                      aria-hidden='true'
                      data-review-state={reviewState}
                      className={`${studioType.eyebrow} max-w-full truncate rounded-3px px-4px py-2px`}
                      style={
                        reviewState === 'missing-slate'
                          ? { color: 'var(--studio-slate-text)' }
                          : { color: 'var(--text-white)', background: 'rgba(31, 29, 27, 0.5)' }
                      }
                    >
                      {plateLabel}
                    </span>
                  ) : (
                    reviewPresentation !== null && (
                      <span
                        data-review-state={reviewState}
                        className={`${studioType.eyebrow} flex max-w-full items-center gap-4px truncate`}
                        style={{ color: reviewState === 'failed' ? 'var(--danger)' : 'var(--studio-plate-text)' }}
                      >
                        <span>{sceneNumber} ·</span>
                        {reviewPresentation.icon}
                        <span id={reviewStateId} className='truncate'>
                          {reviewPresentation.label}
                        </span>
                      </span>
                    )
                  )}
                </Button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
};
