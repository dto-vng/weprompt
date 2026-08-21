/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { DndContext, PointerSensor, closestCenter, type DragEndEvent, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@arco-design/web-react';
import { Attention, Drag, Loading, Right } from '@icon-park/react';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type {
  StudioAsset,
  StudioCut,
  StudioCutClip,
  StudioEditableCutClip,
  StudioScene,
} from '@/common/types/project/creativeStudioTypes';

import studioType from '../../../StudioTypography.module.css';
import type { StudioLayoutMode } from '../../PhaseShell/useStudioLayoutMode';
import styles from './cut-editor.module.css';

const FRAME_SECONDS = 1 / 30;

export const sourceDurationFor = (clip: StudioCutClip, scene: StudioScene, asset: StudioAsset | undefined): number =>
  asset?.durationSeconds ?? scene.durationSeconds;

export const renderedDurationFor = (
  clip: StudioCutClip,
  scene: StudioScene,
  asset: StudioAsset | undefined
): number => {
  const sourceDuration = sourceDurationFor(clip, scene, asset);
  return (
    Math.round(
      Math.max(FRAME_SECONDS, (clip.sourceOutSeconds ?? sourceDuration) - (clip.sourceInSeconds ?? 0)) * 1000
    ) / 1000
  );
};

export type CutTimelineEntry =
  | { kind: 'clip'; clip: StudioCutClip; scene: StudioScene; asset: StudioAsset | undefined }
  | { kind: 'slate'; scene: StudioScene };

export type CutTimelineReviewState = 'selected-take' | 'missing-slate' | 'running' | 'failed';

export const buildCutTimelineEntries = (
  cut: StudioCut,
  sceneOrder: readonly string[],
  scenes: Readonly<Record<string, StudioScene>>,
  assets: Readonly<Record<string, StudioAsset>>,
  slateScenes: readonly StudioScene[]
): CutTimelineEntry[] => {
  const clips = cut.clipOrder.flatMap((clipId) => {
    const clip = cut.clips[clipId];
    const scene = clip === undefined ? undefined : scenes[clip.sceneId];
    return clip === undefined || scene === undefined
      ? []
      : [{ kind: 'clip' as const, clip, scene, asset: assets[clip.assetId] }];
  });
  const slates = slateScenes.map((scene) => ({ kind: 'slate' as const, scene }));
  if (cut.orderMode === 'manual') return [...clips, ...slates];

  const bySceneId = new Map<string, CutTimelineEntry>([...clips, ...slates].map((entry) => [entry.scene.id, entry]));
  const ordered = sceneOrder.flatMap((sceneId) => {
    const entry = bySceneId.get(sceneId);
    if (entry === undefined) return [];
    bySceneId.delete(sceneId);
    return [entry];
  });
  return [...ordered, ...bySceneId.values()];
};

const roundSeconds = (seconds: number): number => Math.round(seconds * 1000) / 1000;

type SortableClipProps = {
  clip: StudioCutClip;
  scene: StudioScene;
  asset: StudioAsset | undefined;
  index: number;
  total: number;
  selected: boolean;
  disabled: boolean;
  reviewState: CutTimelineReviewState;
  reviewStateLabel: string;
  layoutMode: StudioLayoutMode;
  onSelect: () => void;
  onMove: (targetIndex: number) => void;
  onEdit: (edit: StudioEditableCutClip) => void;
};

const SortableClip: React.FC<SortableClipProps> = ({
  clip,
  scene,
  asset,
  index,
  total,
  selected,
  disabled,
  reviewState,
  reviewStateLabel,
  layoutMode,
  onSelect,
  onMove,
  onEdit,
}) => {
  const { t } = useTranslation();
  const reviewStateId = React.useId();
  const sourceDuration = sourceDurationFor(clip, scene, asset);
  const persistedIn = clip.sourceInSeconds ?? 0;
  const persistedOut = clip.sourceOutSeconds ?? sourceDuration;
  const [draftTrim, setDraftTrim] = useState<[number, number]>([persistedIn, persistedOut]);
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({
    id: clip.id,
    disabled,
  });

  useEffect(() => setDraftTrim([persistedIn, persistedOut]), [persistedIn, persistedOut]);

  const renderedDuration = roundSeconds(Math.max(FRAME_SECONDS, draftTrim[1] - draftTrim[0]));
  const trimmed = clip.sourceInSeconds !== null || clip.sourceOutSeconds !== null;
  const graded = clip.filters.length > 0;

  const commitTrim = (nextIn: number, nextOut: number): void => {
    const boundedIn = roundSeconds(Math.max(0, Math.min(nextIn, sourceDuration - FRAME_SECONDS)));
    const boundedOut = roundSeconds(Math.max(boundedIn + FRAME_SECONDS, Math.min(nextOut, sourceDuration)));
    setDraftTrim([boundedIn, boundedOut]);
    onEdit({
      sourceInSeconds: boundedIn === 0 ? null : boundedIn,
      sourceOutSeconds: boundedOut === sourceDuration ? null : boundedOut,
      crop: clip.crop,
      filters: clip.filters,
    });
  };

  const handleTrimKey = (edge: 'in' | 'out', event: React.KeyboardEvent<HTMLButtonElement>): void => {
    const step = event.shiftKey ? 1 : FRAME_SECONDS;
    let next = edge === 'in' ? draftTrim[0] : draftTrim[1];
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        next -= step;
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        next += step;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = sourceDuration;
        break;
      default:
        return;
    }
    event.preventDefault();
    if (edge === 'in') commitTrim(Math.min(next, draftTrim[1] - FRAME_SECONDS), draftTrim[1]);
    else commitTrim(draftTrim[0], Math.max(next, draftTrim[0] + FRAME_SECONDS));
  };

  const beginTrimDrag = (edge: 'in' | 'out', event: React.MouseEvent<HTMLButtonElement>): void => {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    const plate = event.currentTarget.closest<HTMLElement>('[data-cut-clip-id]');
    if (plate === null) return;
    const startX = event.clientX;
    const startTrim = draftTrim;
    const width = Math.max(1, plate.getBoundingClientRect().width);
    let latest = startTrim;
    const move = (moveEvent: MouseEvent): void => {
      const delta = ((moveEvent.clientX - startX) / width) * renderedDuration;
      latest =
        edge === 'in'
          ? [Math.max(0, Math.min(startTrim[0] + delta, startTrim[1] - FRAME_SECONDS)), startTrim[1]]
          : [startTrim[0], Math.min(sourceDuration, Math.max(startTrim[1] + delta, startTrim[0] + FRAME_SECONDS))];
      setDraftTrim([roundSeconds(latest[0]), roundSeconds(latest[1])]);
    };
    const end = (): void => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', end);
      commitTrim(latest[0], latest[1]);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end, { once: true });
  };

  const clipStyle: React.CSSProperties = {
    flexBasis: layoutMode === 'compact' ? 96 : 0,
    flexGrow: layoutMode === 'compact' ? 0 : renderedDuration,
    minWidth: layoutMode === 'compact' ? 96 : undefined,
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const accessibleName = t('conversation.creativeStudio.phase.review.cut.clipAccessible', {
    number: index + 1,
    title: scene.title,
    seconds: renderedDuration,
  });

  return (
    <li
      ref={setNodeRef}
      data-cut-clip-id={clip.id}
      data-dragging={isDragging || undefined}
      className={styles.clipItem}
      style={clipStyle}
    >
      <Button
        type='text'
        long
        aria-label={accessibleName}
        aria-describedby={reviewStateId}
        aria-current={selected ? 'true' : undefined}
        className={styles.clipPlate}
        onClick={onSelect}
        onKeyDown={(event) => {
          if (!(event.metaKey || event.ctrlKey)) return;
          if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
            event.preventDefault();
            onMove(Math.max(0, index - 1));
          } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
            event.preventDefault();
            onMove(Math.min(total - 1, index + 1));
          }
        }}
      >
        <span id={reviewStateId} data-review-state={reviewState} className='sr-only'>
          {reviewStateLabel}
        </span>
        <span className={styles.clipCopy}>
          <span data-cut-title title={scene.title} className={`${studioType.eyebrow} ${styles.clipTitle}`}>
            {scene.title}
          </span>
          <span data-cut-duration className={`${studioType.meta} ${styles.clipDuration}`}>
            {roundSeconds(renderedDuration)}
            {t('common.unit.second_short')}
          </span>
        </span>
        <span className={styles.editMarks}>
          {trimmed && (
            <span data-cut-fact-chip className='rounded-full bg-fill-2 px-6px py-2px text-t-secondary'>
              {t('conversation.creativeStudio.phase.review.cut.trimmed')}
            </span>
          )}
          {graded && (
            <span data-cut-fact-chip className='rounded-full bg-fill-2 px-6px py-2px text-t-secondary'>
              {t('conversation.creativeStudio.phase.review.cut.graded')}
            </span>
          )}
        </span>
      </Button>
      <Button
        ref={setActivatorNodeRef}
        type='text'
        size='mini'
        aria-label={t('conversation.creativeStudio.phase.review.cut.dragClip', { title: scene.title })}
        className={styles.dragHandle}
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <Drag aria-hidden='true' />
      </Button>
      {(['in', 'out'] as const).map((edge) => {
        const value = edge === 'in' ? draftTrim[0] : draftTrim[1];
        return (
          <Button
            key={edge}
            type='text'
            size='mini'
            role='slider'
            aria-label={t(
              edge === 'in'
                ? 'conversation.creativeStudio.phase.review.cut.trimInHandle'
                : 'conversation.creativeStudio.phase.review.cut.trimOutHandle'
            )}
            aria-valuemin={0}
            aria-valuemax={sourceDuration}
            aria-valuenow={value}
            aria-valuetext={t('conversation.creativeStudio.phase.review.cut.secondsValue', { seconds: value })}
            className={`${styles.trimHandle} ${edge === 'in' ? styles.trimHandleIn : styles.trimHandleOut}`}
            disabled={disabled}
            onKeyDown={(event) => handleTrimKey(edge, event)}
            onMouseDown={(event) => beginTrimDrag(edge, event)}
          />
        );
      })}
    </li>
  );
};

export type CutTimelineProps = {
  cut: StudioCut;
  layoutMode?: StudioLayoutMode;
  sceneOrder: readonly string[];
  scenes: Readonly<Record<string, StudioScene>>;
  assets: Readonly<Record<string, StudioAsset>>;
  slateScenes: readonly StudioScene[];
  reviewStates: Readonly<Partial<Record<string, CutTimelineReviewState>>>;
  selectedSceneId: string | null;
  playheadSeconds: number;
  disabled: boolean;
  moveAnnouncement: { fromPosition: number; toPosition: number; total: number } | null;
  onSelectScene: (sceneId: string) => void;
  onMoveClip: (clipId: string, targetIndex: number) => void;
  onEditClip: (clipId: string, edit: StudioEditableCutClip) => void;
  onSeek: (seconds: number) => void;
};

export const CutTimeline: React.FC<CutTimelineProps> = ({
  cut,
  layoutMode = 'inline',
  sceneOrder,
  scenes,
  assets,
  slateScenes,
  reviewStates,
  selectedSceneId,
  playheadSeconds,
  disabled,
  moveAnnouncement,
  onSelectScene,
  onMoveClip,
  onEditClip,
  onSeek,
}) => {
  const { t } = useTranslation();
  const slateReviewStateId = React.useId();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const clipEntries = useMemo(
    () =>
      cut.clipOrder.flatMap((clipId) => {
        const clip = cut.clips[clipId];
        const scene = clip === undefined ? undefined : scenes[clip.sceneId];
        return clip === undefined || scene === undefined ? [] : [{ clip, scene, asset: assets[clip.assetId] }];
      }),
    [assets, cut, scenes]
  );
  const timelineEntries = useMemo(
    () => buildCutTimelineEntries(cut, sceneOrder, scenes, assets, slateScenes),
    [assets, cut, sceneOrder, scenes, slateScenes]
  );
  const timelineDuration = timelineEntries.reduce(
    (total, entry) =>
      total +
      (entry.kind === 'clip' ? renderedDurationFor(entry.clip, entry.scene, entry.asset) : entry.scene.durationSeconds),
    0
  );
  const timelineEntryDurations = timelineEntries.map((entry) =>
    entry.kind === 'clip' ? renderedDurationFor(entry.clip, entry.scene, entry.asset) : entry.scene.durationSeconds
  );
  const playheadPercent = (() => {
    if (layoutMode !== 'compact') return timelineDuration === 0 ? 0 : (playheadSeconds / timelineDuration) * 100;
    if (timelineEntries.length === 0) return 0;
    let remaining = Math.max(0, playheadSeconds);
    for (let index = 0; index < timelineEntryDurations.length; index += 1) {
      const duration = timelineEntryDurations[index]!;
      if (remaining <= duration) return ((index + Math.min(1, remaining / duration)) / timelineEntries.length) * 100;
      remaining -= duration;
    }
    return 100;
  })();

  const handleDragEnd = ({ active, over }: DragEndEvent): void => {
    if (over === null || active.id === over.id) return;
    const targetIndex = cut.clipOrder.indexOf(String(over.id));
    if (targetIndex >= 0) onMoveClip(String(active.id), targetIndex);
  };

  return (
    <section aria-label={t('conversation.creativeStudio.timeline.title')} className={styles.timeline}>
      <div className={styles.ruler} aria-hidden='true'>
        <span>0{t('common.unit.second_short')}</span>
        <span>
          {roundSeconds(timelineDuration / 2)}
          {t('common.unit.second_short')}
        </span>
        <span>
          {roundSeconds(timelineDuration)}
          {t('common.unit.second_short')}
        </span>
      </div>
      <div
        data-cut-timeline-track
        data-layout={layoutMode}
        className={styles.timelineTrack}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('button') !== null) return;
          const track = event.currentTarget;
          const bounds = track.getBoundingClientRect();
          const width = layoutMode === 'compact' ? Math.max(bounds.width, track.scrollWidth) : bounds.width;
          const position = event.clientX - bounds.left + (layoutMode === 'compact' ? track.scrollLeft : 0);
          const ratio = width === 0 ? 0 : Math.max(0, Math.min(1, position / width));
          if (layoutMode !== 'compact' || timelineEntries.length === 0) {
            onSeek(roundSeconds(ratio * timelineDuration));
            return;
          }
          const scaledPosition = ratio * timelineEntries.length;
          const entryIndex = Math.min(timelineEntries.length - 1, Math.floor(scaledPosition));
          const entryProgress = Math.min(1, scaledPosition - entryIndex);
          const elapsedBefore = timelineEntryDurations
            .slice(0, entryIndex)
            .reduce((total, duration) => total + duration, 0);
          onSeek(roundSeconds(elapsedBefore + timelineEntryDurations[entryIndex]! * entryProgress));
        }}
      >
        <div
          aria-label={t('conversation.creativeStudio.phase.review.cut.playhead')}
          className={styles.playhead}
          style={{ left: `${playheadPercent}%` }}
        />
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={cut.clipOrder} strategy={horizontalListSortingStrategy}>
            <ol className={styles.clipList}>
              {timelineEntries.map((entry) => {
                const reviewState = reviewStates[entry.scene.id] ?? 'missing-slate';
                const reviewPresentation = (() => {
                  switch (reviewState) {
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
                    case 'selected-take':
                      return { icon: null, label: t('conversation.creativeStudio.phase.review.selectedTake') };
                    default:
                      return { icon: null, label: t('conversation.creativeStudio.phase.review.slateLabel') };
                  }
                })();
                return entry.kind === 'clip' ? (
                  <SortableClip
                    key={entry.clip.id}
                    clip={entry.clip}
                    scene={entry.scene}
                    asset={entry.asset}
                    index={cut.clipOrder.indexOf(entry.clip.id)}
                    total={clipEntries.length}
                    selected={selectedSceneId === entry.scene.id}
                    disabled={disabled}
                    reviewState={reviewState}
                    reviewStateLabel={reviewPresentation.label}
                    layoutMode={layoutMode}
                    onSelect={() => onSelectScene(entry.scene.id)}
                    onMove={(targetIndex) => onMoveClip(entry.clip.id, targetIndex)}
                    onEdit={(edit) => onEditClip(entry.clip.id, edit)}
                  />
                ) : (
                  <li
                    key={entry.scene.id}
                    data-slate-scene-id={entry.scene.id}
                    className={styles.slateItem}
                    style={{
                      flexBasis: layoutMode === 'compact' ? 96 : 0,
                      flexGrow: layoutMode === 'compact' ? 0 : entry.scene.durationSeconds,
                      minWidth: layoutMode === 'compact' ? 96 : undefined,
                    }}
                  >
                    <Button
                      type='text'
                      long
                      aria-label={t('conversation.creativeStudio.timeline.selectSceneAccessible', {
                        number: sceneOrder.indexOf(entry.scene.id) + 1,
                        title: entry.scene.title,
                        seconds: entry.scene.durationSeconds,
                      })}
                      aria-describedby={`${slateReviewStateId}-${entry.scene.id}`}
                      aria-current={selectedSceneId === entry.scene.id ? 'true' : undefined}
                      className={styles.slatePlate}
                      onClick={() => onSelectScene(entry.scene.id)}
                    >
                      <span className={styles.clipCopy}>
                        <span data-cut-title title={entry.scene.title} className={styles.clipTitle}>
                          {entry.scene.title}
                        </span>
                        <span data-cut-duration className={`${studioType.meta} ${styles.clipDuration}`}>
                          {roundSeconds(entry.scene.durationSeconds)}
                          {t('common.unit.second_short')}
                        </span>
                      </span>
                      <span
                        id={`${slateReviewStateId}-${entry.scene.id}`}
                        data-review-state={reviewState}
                        className={reviewState === 'failed' ? styles.failedState : undefined}
                      >
                        {reviewPresentation.icon}
                        <span>{reviewPresentation.label}</span>
                      </span>
                    </Button>
                  </li>
                );
              })}
            </ol>
          </SortableContext>
        </DndContext>
        {layoutMode === 'compact' && (
          <span aria-hidden='true' data-testid='cut-scroll-affordance' className={styles.scrollAffordance}>
            <Right />
          </span>
        )}
      </div>
      <span className='sr-only' role='status' aria-live='polite'>
        {moveAnnouncement === null
          ? ''
          : t('conversation.creativeStudio.phase.review.cut.moveAnnouncement', {
              clip: moveAnnouncement.fromPosition,
              position: moveAnnouncement.toPosition,
              total: moveAnnouncement.total,
            })}
      </span>
    </section>
  );
};
