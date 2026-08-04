/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button } from '@arco-design/web-react';
import { Attention, CheckOne, Loading, Picture } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import type { StudioScene } from '@/common/types/project/creativeStudioTypes';

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
        <h2 className='m-0 text-14px font-600 text-t-primary'>{t('conversation.creativeStudio.timeline.title')}</h2>
        {orderedScenes.length > 0 && (
          <div role='status' className='flex items-center gap-6px text-12px text-t-secondary'>
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
        <p className='m-0 py-12px text-center text-13px text-t-tertiary'>
          {t('conversation.creativeStudio.timeline.noScenes')}
        </p>
      ) : (
        <ol className='m-0 flex min-w-0 list-none gap-4px overflow-x-auto p-0'>
          {orderedScenes.map((scene, index) => {
            const reviewState = reviewStates?.[scene.id];
            const durationLabel = t('conversation.creativeStudio.scene.durationSeconds', {
              count: scene.durationSeconds,
              seconds: scene.durationSeconds,
            });
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
                    icon: <CheckOne aria-hidden='true' />,
                    label: t('conversation.creativeStudio.scene.status.generated'),
                  };
                case 'missing-slate':
                  return {
                    icon: <Picture aria-hidden='true' />,
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
            return (
              <li key={scene.id} className='flex min-w-72px' style={{ flexGrow: scene.durationSeconds, flexBasis: 0 }}>
                <Button
                  type='text'
                  long
                  aria-label={accessibleName}
                  aria-current={selectedSceneId === scene.id ? 'true' : undefined}
                  title={accessibleName}
                  className='h-auto min-w-0 flex-1 flex-col items-start gap-3px overflow-hidden p-8px text-left'
                  onClick={() => onSelectScene(scene.id)}
                  onKeyDown={(event) => selectAdjacent(event, index)}
                >
                  <span className='max-w-full truncate text-12px font-500 text-t-primary'>{scene.title}</span>
                  <span className='text-11px text-t-tertiary'>{durationLabel}</span>
                  {reviewState !== undefined && reviewPresentation !== null && (
                    <span
                      data-review-state={reviewState}
                      className='flex max-w-full items-center gap-4px rounded-full bg-fill-2 px-6px py-2px text-10px text-t-secondary'
                    >
                      {reviewPresentation.icon}
                      <span className='truncate'>{reviewPresentation.label}</span>
                    </span>
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
