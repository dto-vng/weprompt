/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import type { StudioFitStoryboardOutcome, StudioScene } from '@/common/types/project/creativeStudioTypes';

import styles from './write.module.css';

type ActionResult = void | Promise<unknown>;

export type PacingBarProps = {
  orderedScenes: readonly StudioScene[];
  selectedSceneId: string | null;
  targetDurationSeconds: number;
  durationTotalSeconds: number;
  durationMatchesTarget: boolean;
  fitDisabled: boolean;
  fitOutcome: StudioFitStoryboardOutcome | null;
  hasLockedScenes: boolean;
  advisoryMessageKey?: string | null;
  onSelectScene: (sceneId: string) => void;
  onFitToGoal: () => ActionResult;
};

/** Proportional shot pacing with the phase-owned timing advisory slot. */
export const PacingBar: React.FC<PacingBarProps> = ({
  orderedScenes,
  selectedSceneId,
  targetDurationSeconds,
  durationTotalSeconds,
  durationMatchesTarget,
  fitDisabled,
  fitOutcome,
  hasLockedScenes,
  advisoryMessageKey = null,
  onSelectScene,
  onFitToGoal,
}) => {
  const { t } = useTranslation();
  const pacingHorizonSeconds = Math.max(durationTotalSeconds, targetDurationSeconds);
  const shotSpan = pacingHorizonSeconds > 0 ? (durationTotalSeconds / pacingHorizonSeconds) * 100 : 0;
  const goalPosition = durationTotalSeconds > 0 ? (targetDurationSeconds / durationTotalSeconds) * 100 : 0;
  const fitErrorMessage = (() => {
    if (fitOutcome?.status !== 'unreachable') return null;
    if (fitOutcome.reason === 'route_unavailable') {
      const unavailableTitles = fitOutcome.unavailableSceneIds.flatMap((sceneId) => {
        const title = orderedScenes.find((scene) => scene.id === sceneId)?.title.trim();
        return title ? [title] : [];
      });
      const scenes =
        unavailableTitles.length === fitOutcome.unavailableSceneIds.length
          ? unavailableTitles.join(', ')
          : t('conversation.creativeStudio.storyboard.fitUnreachable.affectedSceneCount', {
              count: fitOutcome.unavailableSceneIds.length,
            });
      return t('conversation.creativeStudio.storyboard.fitUnreachable.route_unavailable', { scenes });
    }
    if (fitOutcome.reason === 'no_adjustable_scenes') {
      return t('conversation.creativeStudio.storyboard.fitUnreachable.no_adjustable_scenes', {
        fixedTotalSeconds: fitOutcome.fixedTotalSeconds,
      });
    }
    return t('conversation.creativeStudio.storyboard.fitUnreachable.target_out_of_bounds', {
      minimumTotalSeconds: fitOutcome.minimumTotalSeconds,
      maximumTotalSeconds: fitOutcome.maximumTotalSeconds,
    });
  })();
  const advisoryMessage = advisoryMessageKey === null ? null : t(advisoryMessageKey);

  return (
    <section className={styles.pacingBar} aria-labelledby='studio-write-pacing-heading'>
      <header className={styles.pacingHeader}>
        <div>
          <h3 id='studio-write-pacing-heading' className={styles.pacingTitle}>
            {t('conversation.creativeStudio.phase.write.pacingTitle')}
          </h3>
          <p role='status' className={styles.pacingSummary}>
            {t('conversation.creativeStudio.phase.write.pacingSummary', {
              total: durationTotalSeconds,
              target: targetDurationSeconds,
            })}
          </p>
        </div>
      </header>

      {orderedScenes.length > 0 && (
        <div className={styles.pacingTrackWrap}>
          <div className={styles.pacingScale}>
            <div data-pacing-shot-span className={styles.pacingShotSpan} style={{ width: `${shotSpan}%` }}>
              <ol className={styles.pacingTrack}>
                {orderedScenes.map((scene, index) => {
                  const placeholderKey =
                    index === 0
                      ? 'conversation.creativeStudio.phase.write.placeholder.opening'
                      : index === orderedScenes.length - 1
                        ? 'conversation.creativeStudio.phase.write.placeholder.closing'
                        : 'conversation.creativeStudio.phase.write.placeholder.middle';
                  const title = scene.title.trim().length > 0 ? scene.title : t(placeholderKey);
                  const accessibleName = t('conversation.creativeStudio.timeline.selectSceneAccessible', {
                    number: index + 1,
                    title,
                    count: scene.durationSeconds,
                    seconds: scene.durationSeconds,
                  });
                  return (
                    <li
                      key={scene.id}
                      data-pacing-scene={scene.id}
                      className={styles.pacingBlock}
                      style={{ flexGrow: scene.durationSeconds, flexBasis: 0 }}
                    >
                      <Button
                        type='text'
                        long
                        aria-label={accessibleName}
                        aria-current={selectedSceneId === scene.id ? 'true' : undefined}
                        title={accessibleName}
                        onClick={() => onSelectScene(scene.id)}
                      >
                        <span>{String(index + 1).padStart(2, '0')}</span>
                        <span>
                          {t('conversation.creativeStudio.scene.durationSeconds', {
                            count: scene.durationSeconds,
                            seconds: scene.durationSeconds,
                          })}
                        </span>
                      </Button>
                    </li>
                  );
                })}
              </ol>
              <span
                data-pacing-goal
                aria-label={t('conversation.creativeStudio.phase.write.goalMarker', {
                  seconds: targetDurationSeconds,
                })}
                className={styles.goalMarker}
                style={{ left: `${goalPosition}%` }}
              />
            </div>
          </div>
        </div>
      )}

      <footer className={styles.pacingFooter}>
        <div className={styles.pacingFeedback}>
          {hasLockedScenes && !durationMatchesTarget && (
            <p>{t('conversation.creativeStudio.storyboard.fitUnlockedOnly')}</p>
          )}
          {fitErrorMessage !== null && (
            <div role='alert' className={styles.errorMessage}>
              {fitErrorMessage}
            </div>
          )}
          {fitErrorMessage === null && advisoryMessage !== null && (
            <div role='status' aria-live='polite' className={styles.errorMessage}>
              {advisoryMessage}
            </div>
          )}
        </div>
        {!durationMatchesTarget && (
          <Button type='primary' disabled={fitDisabled} onClick={() => void onFitToGoal()}>
            {t('conversation.creativeStudio.phase.write.fitToGoal')}
          </Button>
        )}
      </footer>
    </section>
  );
};
