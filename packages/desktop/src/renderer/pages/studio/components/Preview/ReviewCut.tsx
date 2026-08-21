/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Drawer, Modal, Select, Tag } from '@arco-design/web-react';
import { CloseSmall } from '@icon-park/react';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { isCanonicalStudioGeneratedTake } from '@/common/types/project/creativeStudioCanonicalTake';
import type {
  StudioAsset,
  StudioEditableCutClip,
  StudioSelectVariationRequest,
} from '@/common/types/project/creativeStudioTypes';

import type { UseCutEditorResult } from '../../hooks';
import type { StudioReadinessSummary } from '../../studioReadiness';
import studioType from '../../StudioTypography.module.css';
import type { StudioLayoutMode } from '../PhaseShell/useStudioLayoutMode';
import { CutInspector } from './CutEditor/CutInspector';
import {
  buildCutTimelineEntries,
  CutTimeline,
  renderedDurationFor,
  sourceDurationFor,
  type CutTimelineReviewState,
} from './CutEditor/CutTimeline';
import { StagePreview } from './StagePreview';
import styles from './CutEditor/cut-editor.module.css';

type ActionResult = void | Promise<unknown>;

export type ReviewCutProps = {
  cutEditor: UseCutEditorResult;
  layoutMode?: StudioLayoutMode;
  readiness: StudioReadinessSummary;
  selectedSceneId: string | null;
  posterAsset: StudioAsset | null;
  mutationPending: boolean;
  onSelectScene: (sceneId: string) => void;
  onSelectAsset: (request: StudioSelectVariationRequest) => ActionResult;
};

/** The complete Review cut editor: stage, timeline, selected-clip inspector, and manual-cut recovery. */
export const ReviewCut: React.FC<ReviewCutProps> = ({
  cutEditor,
  layoutMode = 'inline',
  readiness,
  selectedSceneId,
  posterAsset,
  mutationPending,
  onSelectScene,
  onSelectAsset,
}) => {
  const { t } = useTranslation();
  const { project, activeCut } = cutEditor;
  const [playhead, setPlayhead] = useState({ sceneId: selectedSceneId, localSeconds: 0 });
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const inspectorOpenerRef = useRef<HTMLElement | null>(null);
  const previousInspectorOpenRef = useRef(inspectorOpen);
  const inspectorPresentation = layoutMode === 'inline' ? 'inline' : 'drawer';
  const selectedScene = selectedSceneId === null ? null : (project.scenes[selectedSceneId] ?? null);
  const selectedAsset =
    selectedScene?.selectedAssetId === null || selectedScene?.selectedAssetId === undefined
      ? null
      : (project.assets[selectedScene.selectedAssetId] ?? null);
  const selectedClip =
    activeCut === null || selectedScene === null
      ? null
      : (Object.values(activeCut.clips).find((clip) => clip.sceneId === selectedScene.id) ?? null);
  const disabled = mutationPending || cutEditor.mutationPending;

  useEffect(() => {
    if (inspectorPresentation === 'inline') setInspectorOpen(false);
  }, [inspectorPresentation]);

  useLayoutEffect(() => {
    if (previousInspectorOpenRef.current && !inspectorOpen) inspectorOpenerRef.current?.focus();
    previousInspectorOpenRef.current = inspectorOpen;
  }, [inspectorOpen]);

  const slateScenes = useMemo(
    () =>
      project.sceneOrder.flatMap((sceneId) => {
        const scene = project.scenes[sceneId];
        if (scene === undefined || scene.selectedAssetId !== null) return [];
        return [scene];
      }),
    [project]
  );
  const reviewStates = useMemo<Readonly<Partial<Record<string, CutTimelineReviewState>>>>(() => {
    const states: Partial<Record<string, CutTimelineReviewState>> = {};
    for (const sceneId of project.sceneOrder) {
      const scene = project.scenes[sceneId];
      if (scene === undefined) continue;
      const selectedAsset = scene.selectedAssetId === null ? undefined : project.assets[scene.selectedAssetId];
      if (selectedAsset !== undefined && isCanonicalStudioGeneratedTake(selectedAsset, project.id, scene)) {
        states[scene.id] = 'selected-take';
        continue;
      }
      switch (readiness.sceneStatuses[scene.id]) {
        case 'generated':
          states[scene.id] = 'selected-take';
          break;
        case 'generating':
          states[scene.id] = 'running';
          break;
        case 'needs_attention':
          states[scene.id] = 'failed';
          break;
        default:
          states[scene.id] = 'missing-slate';
      }
    }
    return states;
  }, [project, readiness.sceneStatuses]);
  const outsideScenes = useMemo(() => {
    if (activeCut?.orderMode !== 'manual') return [];
    const clippedSceneIds = new Set(Object.values(activeCut.clips).map((clip) => clip.sceneId));
    return project.sceneOrder.flatMap((sceneId) => {
      const scene = project.scenes[sceneId];
      const asset = scene?.selectedAssetId === null ? undefined : project.assets[scene?.selectedAssetId ?? ''];
      return scene !== undefined &&
        asset !== undefined &&
        isCanonicalStudioGeneratedTake(asset, project.id, scene) &&
        !clippedSceneIds.has(scene.id)
        ? [scene]
        : [];
    });
  }, [activeCut, project]);

  if (activeCut === null) return null;

  const clipEntries = activeCut.clipOrder.flatMap((clipId) => {
    const clip = activeCut.clips[clipId];
    const scene = clip === undefined ? undefined : project.scenes[clip.sceneId];
    return clip === undefined || scene === undefined ? [] : [{ clip, scene, asset: project.assets[clip.assetId] }];
  });
  const timelineEntries = buildCutTimelineEntries(
    activeCut,
    project.sceneOrder,
    project.scenes,
    project.assets,
    slateScenes
  );
  const renderDuration = clipEntries.reduce(
    (total, entry) => total + renderedDurationFor(entry.clip, entry.scene, entry.asset),
    0
  );
  const untrimmedDuration =
    selectedClip === null || selectedScene === null
      ? (selectedScene?.durationSeconds ?? 0)
      : sourceDurationFor(selectedClip, selectedScene, selectedAsset ?? undefined);
  const selectedSourceIn = selectedClip?.sourceInSeconds ?? 0;
  const selectedSourceOut = selectedClip?.sourceOutSeconds ?? untrimmedDuration;
  const localPlayhead = playhead.sceneId === selectedSceneId ? playhead.localSeconds : 0;
  const globalPlayhead = (() => {
    let elapsed = 0;
    for (const entry of timelineEntries) {
      if (entry.scene.id === selectedSceneId) return elapsed + localPlayhead;
      elapsed +=
        entry.kind === 'clip' ? renderedDurationFor(entry.clip, entry.scene, entry.asset) : entry.scene.durationSeconds;
    }
    return 0;
  })();

  const editSelectedClip = (edit: StudioEditableCutClip): void => {
    if (selectedClip !== null) void cutEditor.updateClip(selectedClip.id, edit);
  };

  const nudgeCrop = (deltaX: number, deltaY: number): void => {
    if (selectedClip === null || selectedClip.crop === null) return;
    const crop = selectedClip.crop;
    editSelectedClip({
      sourceInSeconds: selectedClip.sourceInSeconds,
      sourceOutSeconds: selectedClip.sourceOutSeconds,
      crop: {
        ...crop,
        x: Math.round(Math.max(0, Math.min(1 - crop.width, crop.x + deltaX)) * 1000) / 1000,
        y: Math.round(Math.max(0, Math.min(1 - crop.height, crop.y + deltaY)) * 1000) / 1000,
      },
      filters: selectedClip.filters,
    });
  };

  const seekTimeline = (seconds: number): void => {
    let remaining = seconds;
    for (const entry of timelineEntries) {
      const duration =
        entry.kind === 'clip' ? renderedDurationFor(entry.clip, entry.scene, entry.asset) : entry.scene.durationSeconds;
      if (remaining <= duration) {
        onSelectScene(entry.scene.id);
        setPlayhead({ sceneId: entry.scene.id, localSeconds: Math.max(0, remaining) });
        return;
      }
      remaining -= duration;
    }
  };

  const setPointAtPlayhead = (edge: 'in' | 'out'): void => {
    if (selectedClip === null || selectedScene === null) return;
    const sourceDuration = sourceDurationFor(selectedClip, selectedScene, selectedAsset ?? undefined);
    const absolute = Math.max(0, Math.min(sourceDuration, selectedSourceIn + localPlayhead));
    const currentIn = selectedClip.sourceInSeconds ?? 0;
    const currentOut = selectedClip.sourceOutSeconds ?? sourceDuration;
    const frame = 1 / 30;
    if (edge === 'in' && absolute < currentOut - frame) {
      editSelectedClip({
        sourceInSeconds: absolute === 0 ? null : absolute,
        sourceOutSeconds: selectedClip.sourceOutSeconds,
        crop: selectedClip.crop,
        filters: selectedClip.filters,
      });
    }
    if (edge === 'out' && absolute > currentIn + frame) {
      editSelectedClip({
        sourceInSeconds: selectedClip.sourceInSeconds,
        sourceOutSeconds: absolute === sourceDuration ? null : absolute,
        crop: selectedClip.crop,
        filters: selectedClip.filters,
      });
    }
  };

  return (
    <section
      data-review-cut-layout
      data-layout={layoutMode}
      className='flex min-w-0 flex-col gap-12px'
      onKeyDown={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest('input, [role="slider"], [role="combobox"]') !== null) return;
        if (event.key === 'i' || event.key === 'I') {
          event.preventDefault();
          setPointAtPlayhead('in');
          return;
        }
        if (event.key === 'o' || event.key === 'O') {
          event.preventDefault();
          setPointAtPlayhead('out');
          return;
        }
        if (event.key !== ' ' || target.closest('button') !== null) return;
        const video = event.currentTarget.querySelector('video');
        if (video === null) return;
        event.preventDefault();
        if (video.paused) void video.play();
        else video.pause();
      }}
    >
      <header className={styles.stageHeader}>
        <div className={styles.durationLine}>
          <span>{t('conversation.creativeStudio.phase.review.cut.duration.played', { seconds: localPlayhead })}</span>
          <span>
            {t('conversation.creativeStudio.phase.review.cut.duration.untrimmed', { seconds: untrimmedDuration })}
          </span>
        </div>
        {activeCut.orderMode === 'manual' && (
          <div className={styles.divergenceLine}>
            <Tag color='arcoblue'>{t('conversation.creativeStudio.phase.review.cut.divergence')}</Tag>
            <Button
              size='small'
              disabled={disabled}
              onClick={() =>
                Modal.confirm({
                  title: t('conversation.creativeStudio.phase.review.cut.resyncTitle'),
                  content: t('conversation.creativeStudio.phase.review.cut.resyncDescription'),
                  okText: t('conversation.creativeStudio.phase.review.cut.resyncAction'),
                  cancelText: t('common.cancel'),
                  onOk: () => cutEditor.restoreStoryboardOrder(),
                })
              }
            >
              {t('conversation.creativeStudio.phase.review.cut.resyncAction')}
            </Button>
          </div>
        )}
      </header>

      <div
        data-review-workspace
        data-inspector-presentation={inspectorPresentation}
        className={
          inspectorPresentation === 'inline'
            ? 'grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(250px,310px)] items-start gap-16px'
            : 'flex min-w-0 items-start'
        }
      >
        <div
          data-review-primary
          data-full-width={inspectorPresentation === 'drawer' ? 'true' : undefined}
          className='flex min-w-0 flex-1 flex-col gap-12px'
        >
          <div data-review-region='stage' className='min-w-0'>
            <StagePreview
              projectId={project.id}
              project={project}
              selectedScene={selectedScene}
              selectedAsset={selectedAsset}
              posterAsset={posterAsset}
              presentation='review'
              slate={
                selectedScene === null
                  ? null
                  : { title: selectedScene.title, durationSeconds: selectedScene.durationSeconds }
              }
              crop={selectedClip?.crop ?? null}
              cropOverlayVisible={selectedClip !== null}
              cropDisabled={disabled}
              seekSeconds={selectedClip === null ? undefined : selectedSourceIn + localPlayhead}
              playbackEndSeconds={selectedClip === null ? undefined : selectedSourceOut}
              onPlaybackTimeChange={(seconds) =>
                setPlayhead({ sceneId: selectedSceneId, localSeconds: Math.max(0, seconds - selectedSourceIn) })
              }
              onNudgeCrop={nudgeCrop}
            />
          </div>
          <CutTimeline
            layoutMode={layoutMode}
            cut={activeCut}
            sceneOrder={project.sceneOrder}
            scenes={project.scenes}
            assets={project.assets}
            slateScenes={slateScenes}
            reviewStates={reviewStates}
            selectedSceneId={selectedSceneId}
            playheadSeconds={globalPlayhead}
            disabled={disabled}
            moveAnnouncement={cutEditor.moveAnnouncement}
            onSelectScene={(sceneId) => {
              onSelectScene(sceneId);
              setPlayhead({ sceneId, localSeconds: 0 });
              if (inspectorPresentation === 'drawer') {
                inspectorOpenerRef.current =
                  document.activeElement instanceof HTMLElement ? document.activeElement : null;
                setInspectorOpen(true);
              }
            }}
            onMoveClip={(clipId, targetIndex) => void cutEditor.moveClip(clipId, targetIndex)}
            onEditClip={(clipId, edit) => void cutEditor.updateClip(clipId, edit)}
            onSeek={seekTimeline}
          />
          <div className={`${styles.durationLine} ${studioType.meta}`}>
            {t('conversation.creativeStudio.phase.review.cut.duration.render', { seconds: renderDuration })}
          </div>
        </div>
        {inspectorPresentation === 'inline' && (
          <CutInspector
            project={project}
            scene={selectedScene}
            asset={selectedAsset}
            clip={selectedClip}
            playheadInClipSeconds={selectedSourceIn + localPlayhead}
            disabled={disabled}
            onSelectAsset={onSelectAsset}
            onEditClip={editSelectedClip}
            onResetClip={() => {
              if (selectedClip !== null) void cutEditor.resetClip(selectedClip.id);
            }}
          />
        )}
      </div>

      {inspectorPresentation === 'drawer' && (
        <Drawer
          visible={inspectorOpen}
          title={t('conversation.creativeStudio.phase.review.cut.inspector')}
          width={layoutMode === 'drawer' ? '322px' : 'min(322px, 100vw)'}
          footer={null}
          closable={false}
          unmountOnExit
          onCancel={() => setInspectorOpen(false)}
        >
          <section role='dialog' aria-label={t('conversation.creativeStudio.phase.review.cut.inspector')}>
            <Button
              type='text'
              aria-label={t('common.close')}
              className='mb-8px ml-auto flex'
              icon={<CloseSmall aria-hidden='true' />}
              onClick={() => setInspectorOpen(false)}
            />
            <CutInspector
              project={project}
              scene={selectedScene}
              asset={selectedAsset}
              clip={selectedClip}
              playheadInClipSeconds={selectedSourceIn + localPlayhead}
              disabled={disabled}
              onSelectAsset={onSelectAsset}
              onEditClip={editSelectedClip}
              onResetClip={() => {
                if (selectedClip !== null) void cutEditor.resetClip(selectedClip.id);
              }}
            />
          </section>
        </Drawer>
      )}

      {activeCut.orderMode === 'manual' && outsideScenes.length > 0 && (
        <section aria-labelledby='studio-cut-outside-heading' className={styles.outsideGroup}>
          <header className={styles.outsideHeader}>
            <div>
              <h3 id='studio-cut-outside-heading' className={`${studioType.cardTitle} m-0`}>
                {t('conversation.creativeStudio.phase.review.cut.outsideTitle')}
              </h3>
              <p className={`${studioType.meta} m-0`}>
                {t('conversation.creativeStudio.phase.review.cut.outsideDescription')}
              </p>
            </div>
            <Button
              size='small'
              disabled={disabled}
              onClick={() =>
                void cutEditor.placeScenes(
                  outsideScenes.map((scene) => scene.id),
                  null
                )
              }
            >
              {t('conversation.creativeStudio.phase.review.cut.addAllToEnd')}
            </Button>
          </header>
          <ol className={styles.outsideList}>
            {outsideScenes.map((scene) => (
              <li key={scene.id} className={styles.outsideHeader}>
                <span className='min-w-0 truncate' title={scene.title}>
                  {scene.title}
                </span>
                <div className={styles.outsideActions}>
                  <Select
                    aria-label={t('conversation.creativeStudio.phase.review.cut.placeIt', { title: scene.title })}
                    placeholder={t('conversation.creativeStudio.phase.review.cut.placeIt', { title: scene.title })}
                    disabled={disabled}
                    onChange={(beforeClipId) => void cutEditor.placeScenes([scene.id], beforeClipId)}
                  >
                    {clipEntries.map((entry, index) => (
                      <Select.Option key={entry.clip.id} value={entry.clip.id}>
                        {t('conversation.creativeStudio.phase.review.cut.placeBefore', {
                          number: index + 1,
                          title: entry.scene.title,
                        })}
                      </Select.Option>
                    ))}
                  </Select>
                  <Button
                    size='small'
                    aria-label={t('conversation.creativeStudio.phase.review.cut.addToEnd', { title: scene.title })}
                    disabled={disabled}
                    onClick={() => void cutEditor.placeScenes([scene.id], null)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return;
                      event.preventDefault();
                      void cutEditor.placeScenes([scene.id], null);
                    }}
                  >
                    {t('conversation.creativeStudio.phase.review.cut.addToEnd', { title: scene.title })}
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
      {cutEditor.errorMessageKey !== null && (
        <p role='alert' className='m-0 text-danger'>
          {t(cutEditor.errorMessageKey)}
        </p>
      )}
    </section>
  );
};
