/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { resolveSceneDurationBounds } from '../../../studioRouteConstraints';
import { StoryboardPanel, WriteSceneRow } from '../../Storyboard';
import { AssistantDock } from '../AssistantDock';
import type { WritePhaseController } from '../types';
import type { StudioLayoutMode } from '../useStudioLayoutMode';
import styles from './WritePhase.module.css';

const ACTIVE_JOB_STATUSES = new Set(['queued_local', 'submitting', 'queued_remote', 'running', 'needs_attention']);

export type WritePhaseProps = {
  controller: WritePhaseController;
  layoutMode?: StudioLayoutMode;
};

export const WritePhase: React.FC<WritePhaseProps> = ({ controller, layoutMode = 'inline' }) => {
  const { t } = useTranslation();
  const {
    project,
    readiness,
    editor,
    models,
    writeFocusIntent,
    mutationPending,
    openDraftReview,
    importReference,
    clearWriteFocusIntent,
  } = controller;
  const [importingSceneId, setImportingSceneId] = useState<string | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const saveConflict = editor.conflict?.operation === 'save_scene' ? editor.conflict : null;
  const nonSaveConflict =
    editor.conflict !== null &&
    editor.conflict.operation !== 'draft_storyboard' &&
    editor.conflict.operation !== 'save_scene'
      ? editor.conflict
      : null;
  const nonDraftError =
    editor.error !== null && editor.error.operation !== 'draft_storyboard' && editor.error.operation !== 'save_scene'
      ? editor.error
      : null;
  const firstSceneIssue = saveConflict ?? editor.saveIssues[0] ?? null;
  const panelConflict = firstSceneIssue?.code === 'stale_project' ? firstSceneIssue : nonSaveConflict;
  const currentFitOutcome =
    editor.latestFitOutcome !== null &&
    editor.latestFitOutcome.project.id === project.id &&
    editor.latestFitOutcome.project.revision === project.revision &&
    editor.latestFitCatalogVersion === models.catalog?.catalogVersion
      ? editor.latestFitOutcome
      : null;
  const hasLockedScenes = useMemo(
    () =>
      Object.values(project.assets).some(
        (asset) => asset.sceneId !== null && asset.managedAsset.collection === 'assets'
      ) || Object.values(project.jobs).some((job) => ACTIVE_JOB_STATUSES.has(job.status)),
    [project.assets, project.jobs]
  );
  const fitDisabled =
    editor.hasUnsavedSceneDrafts ||
    editor.conflict !== null ||
    models.loading ||
    models.catalog === null ||
    !models.catalog.catalogVersion ||
    mutationPending ||
    models.pendingRole !== null;

  useEffect(() => {
    setAssistantOpen(false);
  }, [project.id]);

  useEffect(() => {
    if (writeFocusIntent === null) return;
    if (!Object.hasOwn(project.scenes, writeFocusIntent.sceneId)) {
      clearWriteFocusIntent();
      return;
    }
    if (editor.selectedSceneId !== writeFocusIntent.sceneId) {
      editor.selectScene(writeFocusIntent.sceneId);
      return;
    }
    const focusRequestedField = (): boolean => {
      const field = document.getElementById(`studio-scene-prompt-${writeFocusIntent.sceneId}`);
      if (!(field instanceof HTMLElement)) return false;
      field.focus();
      if (document.activeElement !== field) return false;
      clearWriteFocusIntent();
      return true;
    };
    if (focusRequestedField()) return;
    const observer = new MutationObserver(() => {
      if (focusRequestedField()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [clearWriteFocusIntent, editor, project.scenes, writeFocusIntent]);

  return (
    <section data-layout={layoutMode} className={styles.phase} aria-labelledby='studio-write-phase-heading'>
      <h2 id='studio-write-phase-heading' data-studio-phase-heading tabIndex={-1} className={styles.heading}>
        {t('conversation.creativeStudio.phase.write.title')}
      </h2>
      <p className='m-0 text-14px text-t-secondary'>{t('conversation.creativeStudio.phase.write.description')}</p>
      <p className='m-0 text-12px text-t-tertiary'>{t('conversation.creativeStudio.phase.shared.noMediaGeneration')}</p>
      <div className={styles.workspace} data-layout={layoutMode}>
        <div className={styles.storyboardSlot}>
          <StoryboardPanel
            orderedScenes={editor.orderedScenes}
            selectedSceneId={editor.selectedSceneId}
            targetDurationSeconds={project.targetDurationSeconds}
            durationTotalSeconds={editor.durationTotalSeconds}
            durationMatchesTarget={editor.durationMatchesTarget}
            remainingDurationSeconds={editor.remainingDurationSeconds}
            suggestedExpandedTargetSeconds={editor.suggestedExpandedTargetSeconds}
            canAddScene={editor.canAddScene}
            mutationPending={mutationPending}
            fitDisabled={fitDisabled}
            fitOutcome={currentFitOutcome}
            hasLockedScenes={hasLockedScenes || (currentFitOutcome?.lockedSceneIds.length ?? 0) > 0}
            sceneStatuses={readiness.sceneStatuses}
            errorMessageKey={panelConflict?.messageKey ?? firstSceneIssue?.messageKey ?? nonDraftError?.messageKey}
            statusMessageKey={
              firstSceneIssue || nonDraftError || panelConflict
                ? 'conversation.creativeStudio.inspector.unsavedChanges'
                : null
            }
            conflict={panelConflict !== null || firstSceneIssue !== null}
            onSelectScene={editor.selectScene}
            onAddScene={editor.addScene}
            onIncreaseTargetDuration={editor.increaseTargetDuration}
            onFitToTarget={() => {
              const catalogVersion = models.catalog?.catalogVersion;
              if (fitDisabled || !catalogVersion) return;
              editor.clearLatestFitOutcome();
              void editor.fitToTarget(catalogVersion);
            }}
            onRemoveScene={editor.removeScene}
            onReorderScenes={editor.reorderScenes}
            onMoveScene={editor.moveScene}
            onRetryConflict={
              panelConflict !== null
                ? editor.retryConflict
                : firstSceneIssue?.sceneId !== undefined
                  ? () => editor.flushSceneDraftById(firstSceneIssue.sceneId!)
                  : editor.retryConflict
            }
            onDiscardConflict={
              panelConflict !== null
                ? editor.discardConflict
                : firstSceneIssue?.sceneId !== undefined
                  ? () => editor.discardSceneDraftById(firstSceneIssue.sceneId!)
                  : editor.discardConflict
            }
          />
        </div>

        <div className={styles.sceneRows}>
          {editor.orderedScenes.map((scene) => {
            const draft = editor.sceneDrafts[scene.id];
            if (draft === undefined) return null;
            const saveIssue = editor.saveIssues.find((issue) => issue.sceneId === scene.id) ?? null;
            const staleConflict = saveConflict?.sceneId === scene.id ? saveConflict : null;
            const issue = staleConflict ?? saveIssue;
            const referenceAsset =
              scene.referenceAssetId === null ? null : (project.assets[scene.referenceAssetId] ?? null);
            return (
              <WriteSceneRow
                key={scene.id}
                projectId={project.id}
                scene={project.scenes[scene.id] ?? scene}
                draft={draft}
                referenceAsset={referenceAsset}
                saveState={editor.sceneSaveStates[scene.id] ?? 'saved'}
                errorMessageKey={issue?.messageKey ?? null}
                conflict={issue !== null}
                selected={editor.selectedSceneId === scene.id}
                mutationPending={mutationPending}
                importingReference={importingSceneId === scene.id}
                durationBoundsByMediaKind={{
                  image: resolveSceneDurationBounds(project, models.catalog, 'image'),
                  video: resolveSceneDurationBounds(project, models.catalog, 'video'),
                }}
                onSelect={() => editor.selectScene(scene.id)}
                onUpdate={(patch) => editor.updateSceneDraftById(scene.id, patch)}
                onFlush={() => editor.flushSceneDraftById(scene.id)}
                onRetryConflict={
                  staleConflict !== null ? editor.retryConflict : () => editor.flushSceneDraftById(scene.id)
                }
                onDiscardConflict={
                  staleConflict !== null ? editor.discardConflict : () => editor.discardSceneDraftById(scene.id)
                }
                onImportReference={() => {
                  if (importingSceneId !== null) return;
                  setImportingSceneId(scene.id);
                  void importReference(scene.id).finally(() => setImportingSceneId(null));
                }}
              />
            );
          })}
        </div>

        <div className={styles.assistantSlot}>
          <AssistantDock
            kind='write'
            layoutMode={layoutMode}
            drawerVisible={assistantOpen}
            storyboard={models.catalog?.storyboard ?? null}
            catalogLoading={models.loading}
            drafting={editor.drafting}
            disabled={mutationPending || models.pendingRole !== null}
            onOpenChange={setAssistantOpen}
            onDraftStoryboard={() => {
              setAssistantOpen(false);
              openDraftReview();
            }}
          />
        </div>
      </div>
    </section>
  );
};
