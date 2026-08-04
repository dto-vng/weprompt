/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { StudioRendererProject, StudioScene } from '@/common/types/project/creativeStudioTypes';
import { Button } from '@arco-design/web-react';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { canOpenSingleSceneReview } from '../../../studioReadiness';
import { GenerationControls, GenerationJobList, ProduceShotCard } from '../../Generation';
import { StudioModelBar } from '../../Models';
import { AssetStrip, StagePreview } from '../../Preview';
import type { ProducePhaseController } from '../types';
import styles from './ProducePhase.module.css';

export type ProducePhaseProps = {
  controller: ProducePhaseController;
};

const selectedTakeNumber = (project: StudioRendererProject, scene: StudioScene): number | null => {
  if (scene.selectedAssetId === null) return null;
  const selected = project.assets[scene.selectedAssetId];
  if (
    selected?.id !== scene.selectedAssetId ||
    selected.projectId !== project.id ||
    selected.sceneId !== scene.id ||
    selected.mediaKind !== scene.mediaKind ||
    selected.managedAsset.collection !== 'assets'
  ) {
    return null;
  }
  const selectedIndex = scene.assetIds.indexOf(selected.id);
  return selectedIndex < 0 ? null : selectedIndex + 1;
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
    requestTransition,
    openSingleGenerationReview,
    openBatchGenerationReview,
    openModelSettings,
    selectVariation,
    openDuplicateChargeConfirmation,
  } = controller;
  const orderedScenes = useMemo(
    () =>
      project.sceneOrder.flatMap((sceneId) => {
        const candidate = project.scenes[sceneId];
        return candidate?.id === sceneId ? [candidate] : [];
      }),
    [project]
  );
  const selectedScene = editor.selectedSceneId === null ? null : (project.scenes[editor.selectedSceneId] ?? null);
  const sceneTitles = useMemo(
    () => Object.fromEntries(orderedScenes.map((candidate) => [candidate.id, candidate.title])),
    [orderedScenes]
  );
  const generationBlocked =
    editor.hasUnsavedProjectDraft ||
    editor.hasUnsavedSceneDrafts ||
    editor.conflict !== null ||
    editor.drafting ||
    mutationPending;
  const selectedSceneEligible =
    selectedScene !== null &&
    canOpenSingleSceneReview(readiness.sceneStatuses[selectedScene.id], selectedScene.visualPrompt);
  const modelSetupCalloutVisible =
    models.catalog !== null &&
    (['storyboard', 'image', 'video'] as const).some((role) => models.catalog?.[role].status === 'setup_required');
  const generationActionIssue =
    jobs.issue?.jobId !== undefined && jobs.jobs.some((candidate) => candidate.id === jobs.issue?.jobId)
      ? { jobId: jobs.issue.jobId, code: jobs.issue.code, messageKey: jobs.issue.messageKey }
      : null;

  return (
    <section className={styles.phase} aria-labelledby='studio-produce-phase-heading'>
      <div className={styles.phaseIntroduction}>
        <div>
          <h2 id='studio-produce-phase-heading' data-studio-phase-heading tabIndex={-1} className={styles.heading}>
            {t('conversation.creativeStudio.phase.produce.title')}
          </h2>
          <p className='mb-0 mt-6px text-14px text-t-secondary'>
            {t('conversation.creativeStudio.phase.produce.description')}
          </p>
          <p className='mb-0 mt-4px text-12px text-t-tertiary'>
            {t('conversation.creativeStudio.phase.produce.providerChargeDisclosure')}
          </p>
        </div>
        <Button onClick={() => requestTransition({ phase: 'review' })}>
          {t('conversation.creativeStudio.phase.produce.reviewCut')}
        </Button>
      </div>

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

      <section aria-label={t('conversation.creativeStudio.storyboard.title')} className={styles.shotRail}>
        <ul className={styles.shotList}>
          {orderedScenes.map((candidate, index) => {
            const selected = candidate.id === selectedScene?.id;
            return (
              <ProduceShotCard
                key={candidate.id}
                scene={candidate}
                index={index}
                status={readiness.sceneStatuses[candidate.id] ?? 'needs_prompt'}
                selected={selected}
                selectedTakeNumber={selectedTakeNumber(project, candidate)}
                mutationPending={mutationPending}
                onSelect={() => editor.selectScene(candidate.id)}
                onAddVisual={() => {
                  editor.selectScene(candidate.id);
                  requestTransition({
                    phase: 'write',
                    state: { writeFocus: { sceneId: candidate.id, field: 'visualPrompt' } },
                  });
                }}
              />
            );
          })}
        </ul>
      </section>

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
            readiness.durationDeltaSeconds !== 0 ? 'conversation.creativeStudio.review.disabledDurationMismatch' : null
          }
          disabled={generationBlocked}
          singleDisabled={!selectedSceneEligible}
          showSettingsAction={!modelSetupCalloutVisible}
          onOpenSettings={openModelSettings}
          onOpenSingleReview={openSingleGenerationReview}
          onOpenBatchReview={openBatchGenerationReview}
        />
      </div>

      <GenerationJobList
        jobs={jobs.jobs}
        sceneTitles={sceneTitles}
        disabled={generationBlocked}
        pendingJobIds={jobs.mutationPending ? jobs.jobs.map((candidate) => candidate.id) : []}
        actionIssue={generationActionIssue}
        onCancelJob={jobs.cancelJob}
        onRetryJob={jobs.retryJob}
        onRetryDownload={jobs.retryDownload}
        onReviewUnknownSubmission={openDuplicateChargeConfirmation}
      />
    </section>
  );
};
