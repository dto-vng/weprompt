/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { DndContext, PointerSensor, closestCenter, type DragEndEvent, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Button, Modal } from '@arco-design/web-react';
import { Add } from '@icon-park/react';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { StudioFitStoryboardOutcome, StudioScene } from '@/common/types/project/creativeStudioTypes';
import type { StudioSceneStatus } from '../../studioReadiness';

import { SceneCard, type SceneMoveDirection } from './SceneCard';
import styles from './Storyboard.module.css';

type ActionResult = void | Promise<unknown>;

const MAX_SCENES = 24;

type RemoveCandidate = {
  sceneId: string;
  sceneLabel: string;
};

export type StoryboardPanelProps = {
  orderedScenes: StudioScene[];
  selectedSceneId: string | null;
  targetDurationSeconds: number;
  durationTotalSeconds: number;
  durationMatchesTarget: boolean;
  remainingDurationSeconds: number;
  suggestedExpandedTargetSeconds: number | null;
  canAddScene: boolean;
  mutationPending: boolean;
  fitDisabled: boolean;
  fitOutcome: StudioFitStoryboardOutcome | null;
  hasLockedScenes: boolean;
  sceneStatuses: Record<string, StudioSceneStatus>;
  errorMessageKey?: string | null;
  statusMessageKey?: string | null;
  conflict: boolean;
  onSelectScene: (sceneId: string) => void;
  onAddScene: () => ActionResult;
  onIncreaseTargetDuration: () => ActionResult;
  onFitToTarget: () => ActionResult;
  onRemoveScene: (sceneId: string) => ActionResult;
  onReorderScenes: (sceneOrder: string[]) => ActionResult;
  onMoveScene: (sceneId: string, direction: SceneMoveDirection) => ActionResult;
  onRetryConflict: () => ActionResult;
  onDiscardConflict: () => ActionResult;
};

/** Ordered storyboard presentation with accessible drag and non-drag reordering. */
export const StoryboardPanel: React.FC<StoryboardPanelProps> = ({
  orderedScenes,
  selectedSceneId,
  targetDurationSeconds,
  durationTotalSeconds,
  durationMatchesTarget,
  remainingDurationSeconds,
  suggestedExpandedTargetSeconds,
  canAddScene,
  mutationPending,
  fitDisabled,
  fitOutcome,
  hasLockedScenes,
  sceneStatuses,
  errorMessageKey = null,
  statusMessageKey = null,
  conflict,
  onSelectScene,
  onAddScene,
  onIncreaseTargetDuration,
  onFitToTarget,
  onRemoveScene,
  onReorderScenes,
  onMoveScene,
  onRetryConflict,
  onDiscardConflict,
}) => {
  const { t } = useTranslation();
  const [removeCandidate, setRemoveCandidate] = useState<RemoveCandidate | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );
  const sceneOrder = orderedScenes.map((scene) => scene.id);
  const sceneLimitReached = orderedScenes.length >= MAX_SCENES;
  const removeActionLabel = removeCandidate
    ? `${t('conversation.creativeStudio.storyboard.removeScene')}: ${removeCandidate.sceneLabel}`
    : t('conversation.creativeStudio.storyboard.removeScene');
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

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      if (mutationPending || !over || active.id === over.id) return;

      const oldIndex = sceneOrder.indexOf(String(active.id));
      const newIndex = sceneOrder.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;

      void onReorderScenes(arrayMove(sceneOrder, oldIndex, newIndex));
    },
    [mutationPending, onReorderScenes, sceneOrder]
  );

  const confirmRemove = () => {
    if (!removeCandidate || mutationPending) return;
    const sceneId = removeCandidate.sceneId;
    setRemoveCandidate(null);
    void onRemoveScene(sceneId);
  };

  return (
    <section aria-label={t('conversation.creativeStudio.storyboard.title')} className={styles.panel}>
      <header className={styles.panelHeader}>
        <h2>{t('conversation.creativeStudio.storyboard.title')}</h2>
        <p className={styles.timing}>
          {t('conversation.creativeStudio.storyboard.durationTotal', {
            total: durationTotalSeconds,
            target: targetDurationSeconds,
          })}
          <span
            className={`${styles.timingState} ${durationMatchesTarget ? styles.timingMatch : styles.timingMismatch}`}
          >
            {t(
              durationMatchesTarget
                ? 'conversation.creativeStudio.storyboard.durationMatches'
                : 'conversation.creativeStudio.storyboard.durationMismatch'
            )}
          </span>
          {!durationMatchesTarget && (
            <Button size='mini' disabled={fitDisabled} onClick={() => void onFitToTarget()}>
              {t('conversation.creativeStudio.storyboard.fitToTarget', { seconds: targetDurationSeconds })}
            </Button>
          )}
          {remainingDurationSeconds > 0 && (
            <span className={styles.timingState}>
              {t('conversation.creativeStudio.storyboard.durationRemaining', { seconds: remainingDurationSeconds })}
            </span>
          )}
          {remainingDurationSeconds < 0 && (
            <span className={`${styles.timingState} ${styles.timingMismatch}`}>
              {t('conversation.creativeStudio.storyboard.durationOver', {
                seconds: Math.abs(remainingDurationSeconds),
              })}
            </span>
          )}
        </p>
      </header>

      {orderedScenes.length === 0 ? (
        <p className={styles.empty}>{t('conversation.creativeStudio.storyboard.noScenes')}</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sceneOrder} strategy={verticalListSortingStrategy}>
            <ol className={styles.sceneList}>
              {orderedScenes.map((scene, index) => (
                <SceneCard
                  key={scene.id}
                  scene={scene}
                  index={index}
                  selected={selectedSceneId === scene.id}
                  status={sceneStatuses[scene.id] ?? 'needs_prompt'}
                  removeDisabled={scene.assetIds.length > 0 || scene.jobIds.length > 0}
                  mutationPending={mutationPending}
                  moveUpDisabled={index === 0}
                  moveDownDisabled={index === orderedScenes.length - 1}
                  onSelect={() => onSelectScene(scene.id)}
                  onRemove={() =>
                    setRemoveCandidate({
                      sceneId: scene.id,
                      sceneLabel: t('conversation.creativeStudio.scene.accessibleName', {
                        number: index + 1,
                        title: scene.title,
                      }),
                    })
                  }
                  onMove={(direction) => void onMoveScene(scene.id, direction)}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      <footer className={styles.panelFooter}>
        {hasLockedScenes && !durationMatchesTarget && (
          <p className={styles.limit}>{t('conversation.creativeStudio.storyboard.fitUnlockedOnly')}</p>
        )}
        {fitErrorMessage && (
          <div role='alert' className={`${styles.feedback} ${styles.error}`}>
            {fitErrorMessage}
          </div>
        )}
        {errorMessageKey && (
          <div role='alert' className={`${styles.feedback} ${styles.error}`}>
            {t(errorMessageKey)}
          </div>
        )}
        {statusMessageKey && (
          <div role='status' className={`${styles.feedback} ${styles.status}`}>
            {t(statusMessageKey)}
          </div>
        )}
        {conflict && (
          <div className={styles.conflictActions}>
            <Button type='primary' loading={mutationPending} onClick={() => void onRetryConflict()}>
              {t('conversation.creativeStudio.storyboard.retry')}
            </Button>
            <Button disabled={mutationPending} onClick={() => void onDiscardConflict()}>
              {t('conversation.creativeStudio.storyboard.discard')}
            </Button>
          </div>
        )}
        {!canAddScene && (sceneLimitReached || remainingDurationSeconds > 0) && (
          <p className={styles.limit}>{t('conversation.creativeStudio.storyboard.sceneLimit')}</p>
        )}
        {!canAddScene && !sceneLimitReached && suggestedExpandedTargetSeconds !== null && (
          <Button disabled={mutationPending} onClick={() => void onIncreaseTargetDuration()}>
            {t('conversation.creativeStudio.storyboard.increaseTarget', { seconds: suggestedExpandedTargetSeconds })}
          </Button>
        )}
        {!canAddScene &&
          !sceneLimitReached &&
          suggestedExpandedTargetSeconds === null &&
          remainingDurationSeconds <= 0 && (
            <p className={styles.limit}>{t('conversation.creativeStudio.storyboard.shortenBeforeAdding')}</p>
          )}
        <Button
          type='primary'
          long
          icon={<Add size={15} />}
          disabled={!canAddScene || mutationPending}
          onClick={() => void onAddScene()}
        >
          {t('conversation.creativeStudio.storyboard.addScene')}
        </Button>
      </footer>

      <Modal
        title={t('conversation.creativeStudio.storyboard.removeConfirmTitle')}
        visible={removeCandidate !== null}
        onCancel={() => !mutationPending && setRemoveCandidate(null)}
        footer={
          <>
            <Button disabled={mutationPending} onClick={() => setRemoveCandidate(null)}>
              {t('conversation.creativeStudio.create.cancel')}
            </Button>
            <Button
              type='primary'
              status='danger'
              aria-label={removeActionLabel}
              title={removeActionLabel}
              loading={mutationPending}
              onClick={confirmRemove}
            >
              {t('conversation.creativeStudio.storyboard.removeScene')}
            </Button>
          </>
        }
      >
        <p>{t('conversation.creativeStudio.storyboard.removeConfirmBody')}</p>
        {removeCandidate && <p>{removeCandidate.sceneLabel}</p>}
      </Modal>
    </section>
  );
};
