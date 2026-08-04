/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { canOpenSingleSceneReview } from '../../../studioReadiness';
import { GenerationControls } from '../../Generation';
import { StudioModelBar } from '../../Models';
import { AssetStrip, StagePreview } from '../../Preview';
import { AssistantDock } from '../AssistantDock';
import type { ProducePhaseController } from '../types';
import styles from './ProducePhase.module.css';

export type ProducePhaseProps = {
  controller: ProducePhaseController;
};

export const ProducePhase: React.FC<ProducePhaseProps> = ({ controller }) => {
  const { t } = useTranslation();
  const {
    project,
    readiness,
    editor,
    models,
    jobs,
    selectedAsset,
    posterAsset,
    mutationPending,
    openSingleGenerationReview,
    openBatchGenerationReview,
    openModelSettings,
    selectVariation,
    openDuplicateChargeConfirmation,
  } = controller;
  const selectedScene = editor.selectedSceneId === null ? null : (project.scenes[editor.selectedSceneId] ?? null);
  const selectedSceneJobs = useMemo(
    () =>
      selectedScene === null
        ? []
        : jobs.jobs.filter((job) => job.sceneId === selectedScene.id && selectedScene.jobIds.includes(job.id)),
    [jobs.jobs, selectedScene]
  );
  const generationBlocked =
    editor.hasUnsavedProjectDraft ||
    editor.hasUnsavedSceneDrafts ||
    editor.conflict !== null ||
    editor.drafting ||
    mutationPending;
  const modelSetupCalloutVisible =
    models.catalog !== null &&
    (['storyboard', 'image', 'video'] as const).some((role) => models.catalog?.[role].status === 'setup_required');
  const generationActionIssue =
    jobs.issue?.jobId !== undefined && selectedSceneJobs.some((job) => job.id === jobs.issue?.jobId)
      ? { jobId: jobs.issue.jobId, code: jobs.issue.code, messageKey: jobs.issue.messageKey }
      : null;

  return (
    <div className={styles.phase}>
      <h2 id='studio-produce-phase-heading' data-studio-phase-heading tabIndex={-1} className={styles.heading}>
        {t('conversation.creativeStudio.models.title')}
      </h2>
      <StudioModelBar
        catalog={models.catalog}
        loading={models.loading}
        errorMessageKey={models.errorMessageKey}
        pendingRole={models.pendingRole}
        disabled={mutationPending || editor.drafting || jobs.mutationPending}
        onRefresh={models.refresh}
        onSelectionChange={models.updateSelection}
        onOpenSettings={openModelSettings}
      />
      <div className={styles.workspace}>
        <div className={styles.previewColumn}>
          <StagePreview
            projectId={project.id}
            project={project}
            catalog={models.catalog}
            catalogLoading={models.loading}
            selectedScene={selectedScene}
            selectedAsset={selectedAsset}
            posterAsset={posterAsset}
            generationDisabled={generationBlocked}
            onOpenSingleReview={openSingleGenerationReview}
          />
          <AssetStrip
            projectId={project.id}
            scene={selectedScene}
            assets={project.assets}
            projectRevision={project.revision}
            mutationPending={mutationPending || editor.hasUnsavedSceneDrafts}
            onSelectAsset={selectVariation}
          />
        </div>
        <AssistantDock>
          <GenerationControls
            project={project}
            catalog={models.catalog}
            catalogLoading={models.loading}
            catalogErrorMessageKey={models.errorMessageKey}
            onRefreshCatalog={models.refresh}
            scene={
              selectedScene === null
                ? null
                : {
                    id: selectedScene.id,
                    mediaKind: selectedScene.mediaKind,
                    hasSelectedAsset: selectedScene.selectedAssetId !== null,
                  }
            }
            aspectRatio={project.aspectRatio}
            resolution={project.resolution}
            sceneDurationSeconds={selectedScene?.durationSeconds}
            hasReference={selectedScene?.referenceAssetId != null}
            batchSceneCount={readiness.readySceneIds.length}
            batchDisabled={readiness.durationDeltaSeconds !== 0}
            batchDisabledReasonKey={
              readiness.durationDeltaSeconds !== 0
                ? 'conversation.creativeStudio.review.disabledDurationMismatch'
                : null
            }
            disabled={generationBlocked}
            singleDisabled={
              selectedScene !== null &&
              !canOpenSingleSceneReview(readiness.sceneStatuses[selectedScene.id], selectedScene.visualPrompt)
            }
            showSettingsAction={!modelSetupCalloutVisible}
            jobs={selectedSceneJobs}
            pendingJobIds={jobs.mutationPending ? selectedSceneJobs.map((job) => job.id) : []}
            actionIssue={generationActionIssue}
            onOpenSettings={openModelSettings}
            onOpenSingleReview={openSingleGenerationReview}
            onOpenBatchReview={openBatchGenerationReview}
            onCancelJob={jobs.cancelJob}
            onRetryJob={jobs.retryJob}
            onRetryDownload={jobs.retryDownload}
            onReviewUnknownSubmission={openDuplicateChargeConfirmation}
          />
        </AssistantDock>
      </div>
    </div>
  );
};
