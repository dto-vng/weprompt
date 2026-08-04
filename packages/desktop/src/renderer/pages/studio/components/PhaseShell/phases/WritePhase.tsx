/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { resolveSceneDurationBounds } from '../../../studioRouteConstraints';
import { AssistantDock } from '../AssistantDock';
import type { WritePhaseController } from '../types';
import { SceneInspector, StoryboardPanel } from '../../Storyboard';
import styles from './WritePhase.module.css';

const ACTIVE_JOB_STATUSES = new Set(['queued_local', 'submitting', 'queued_remote', 'running', 'needs_attention']);

export type WritePhaseProps = {
  controller: WritePhaseController;
};

export const WritePhase: React.FC<WritePhaseProps> = ({ controller }) => {
  const { t } = useTranslation();
  const {
    project,
    readiness,
    editor,
    models,
    selectedReferenceAsset,
    writeFocusIntent,
    mutationPending,
    importReference,
    clearWriteFocusIntent,
  } = controller;
  const [importingSceneId, setImportingSceneId] = useState<string | null>(null);
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
  const selectedSaveIssue = editor.saveIssues.find((issue) => issue.sceneId === editor.selectedScene?.id) ?? null;
  const sceneIssue =
    nonSaveConflict === null ? (saveConflict ?? selectedSaveIssue ?? editor.saveIssues[0] ?? null) : null;
  const inspectorSceneIssue =
    sceneIssue !== null && editor.selectedScene?.id === sceneIssue.sceneId ? sceneIssue : null;
  const panelSceneIssue = sceneIssue !== null && inspectorSceneIssue === null ? sceneIssue : null;
  const panelConflict = panelSceneIssue?.code === 'stale_project' ? panelSceneIssue : nonSaveConflict;
  const inspectorConflict = inspectorSceneIssue?.code === 'stale_project';
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
  const sceneDurationBounds = useMemo(() => {
    const mediaKind = editor.sceneDraft?.mediaKind ?? editor.selectedScene?.mediaKind;
    return mediaKind === undefined
      ? { minDurationSeconds: 1, maxDurationSeconds: 60, source: 'fallback' as const }
      : resolveSceneDurationBounds(project, models.catalog, mediaKind);
  }, [editor.sceneDraft?.mediaKind, editor.selectedScene?.mediaKind, models.catalog, project]);

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
    const field = document.getElementById(`studio-scene-prompt-${writeFocusIntent.sceneId}`);
    if (field instanceof HTMLElement) field.focus();
    clearWriteFocusIntent();
  }, [clearWriteFocusIntent, editor, project.scenes, writeFocusIntent]);

  return (
    <div className={styles.phase}>
      <h2 id='studio-write-phase-heading' data-studio-phase-heading tabIndex={-1} className={styles.heading}>
        {t('conversation.creativeStudio.storyboard.title')}
      </h2>
      <div className={styles.workspace}>
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
          errorMessageKey={panelConflict?.messageKey ?? panelSceneIssue?.messageKey ?? nonDraftError?.messageKey}
          statusMessageKey={
            panelSceneIssue || nonDraftError || panelConflict
              ? 'conversation.creativeStudio.inspector.unsavedChanges'
              : null
          }
          conflict={panelConflict !== null || panelSceneIssue !== null}
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
            panelSceneIssue !== null &&
            panelSceneIssue.code !== 'stale_project' &&
            panelSceneIssue.sceneId !== undefined
              ? () => editor.flushSceneDraftById(panelSceneIssue.sceneId!)
              : editor.retryConflict
          }
          onDiscardConflict={
            panelSceneIssue !== null &&
            panelSceneIssue.code !== 'stale_project' &&
            panelSceneIssue.sceneId !== undefined
              ? () => editor.discardSceneDraftById(panelSceneIssue.sceneId!)
              : editor.discardConflict
          }
        />
        <AssistantDock>
          <SceneInspector
            projectId={project.id}
            selectedScene={editor.selectedScene}
            referenceAsset={selectedReferenceAsset}
            sceneDraft={editor.sceneDraft}
            mutationPending={mutationPending}
            errorMessageKey={inspectorSceneIssue?.messageKey ?? null}
            saveState={editor.selectedSceneSaveState}
            conflict={inspectorSceneIssue !== null}
            durationBounds={sceneDurationBounds}
            onUpdateSceneDraft={editor.updateSceneDraft}
            onFlushSceneDraft={editor.flushSceneDraft}
            onRetryConflict={inspectorConflict ? editor.retryConflict : editor.flushSceneDraft}
            onDiscardConflict={inspectorConflict ? editor.discardConflict : editor.discardSceneDraft}
            importingReference={importingSceneId === editor.selectedScene?.id}
            onImportReference={() => {
              const sceneId = editor.selectedScene?.id;
              if (sceneId === undefined || importingSceneId !== null) return;
              setImportingSceneId(sceneId);
              void importReference(sceneId).finally(() => setImportingSceneId(null));
            }}
          />
        </AssistantDock>
      </div>
    </div>
  );
};
