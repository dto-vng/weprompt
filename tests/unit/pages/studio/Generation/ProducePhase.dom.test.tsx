/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  StudioAsset,
  StudioRendererJob,
  StudioRendererProject,
  StudioRouteCatalog,
  StudioRouteCatalogEntry,
  StudioScene,
} from '@/common/types/project/creativeStudioTypes';
import { ProducePhase } from '@renderer/pages/studio/components/PhaseShell/phases/ProducePhase';
import type { ProducePhaseController } from '@renderer/pages/studio/components/PhaseShell/types';
import type { UseStoryboardEditorResult } from '@renderer/pages/studio/hooks/useStoryboardEditor';
import type { UseStudioJobsResult } from '@renderer/pages/studio/hooks/useStudioJobs';
import type { UseStudioModelsResult } from '@renderer/pages/studio/hooks/useStudioModels';
import { deriveStudioReadiness } from '@renderer/pages/studio/studioReadiness';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values
        ? `${key}:${Object.entries(values)
            .map(([name, value]) => `${name}=${String(value)}`)
            .join(',')}`
        : key,
  }),
}));

const scene = (overrides: Partial<StudioScene> = {}): StudioScene => ({
  id: 'scene-1',
  title: 'Opening shot',
  purpose: '',
  visualPrompt: 'A wide sunrise over the city',
  narration: '',
  onScreenText: '',
  mediaKind: 'image',
  durationSeconds: 5,
  referenceAssetId: null,
  selectedAssetId: null,
  assetIds: [],
  jobIds: [],
  reviewState: 'ready',
  ...overrides,
});

const asset = (overrides: Partial<StudioAsset> = {}): StudioAsset => ({
  id: 'asset-1',
  projectId: 'project-1',
  sceneId: 'scene-1',
  mediaKind: 'image',
  mimeType: 'image/png',
  managedAsset: { collection: 'assets', fileName: 'asset-1.png' },
  byteSize: 128,
  sha256: '1'.repeat(64),
  createdAt: '2026-08-04T00:00:00.000Z',
  ...overrides,
});

const job = (overrides: Partial<StudioRendererJob> = {}): StudioRendererJob => ({
  id: 'job-1',
  projectId: 'project-1',
  sceneId: 'scene-1',
  status: 'running',
  provider: {
    choiceId: 'choice-image',
    providerId: 'provider-image',
    model: 'image-model',
  },
  outputAssetIds: [],
  error: null,
  canCancel: false,
  canRetryDownload: false,
  retryOfJobId: null,
  retryReason: null,
  duplicateChargeAcknowledged: false,
  duplicateChargeAcknowledgedAt: null,
  createdAt: '2026-08-04T00:00:00.000Z',
  updatedAt: '2026-08-04T00:00:00.000Z',
  ...overrides,
});

const route = (kind: 'image' | 'video'): StudioRouteCatalogEntry => ({
  choiceId: `choice-${kind}`,
  providerId: `provider-${kind}`,
  providerName: `${kind} provider`,
  model: `${kind}-model`,
  health: 'available',
  kind,
  constraints: {
    aspectRatios: ['16:9'],
    resolutions: ['720p'],
    minDurationSeconds: 1,
    maxDurationSeconds: 60,
    supportsFirstFrame: true,
    silentOutput: true,
  },
});

const catalog = (videoSetupRequired = false): StudioRouteCatalog => {
  const imageRoute = route('image');
  const videoRoute = route('video');
  return {
    storyboard: {
      status: 'ready',
      selected: { providerId: 'planner', model: 'planner-model' },
      options: [
        {
          providerId: 'planner',
          providerName: 'Planner',
          model: 'planner-model',
          health: 'available',
        },
      ],
    },
    image: {
      status: 'ready',
      selected: {
        choiceId: imageRoute.choiceId,
        providerId: imageRoute.providerId,
        model: imageRoute.model,
      },
      selectedRoute: imageRoute,
      options: [imageRoute],
    },
    video: videoSetupRequired
      ? { status: 'setup_required', selected: null, selectedRoute: null, options: [] }
      : {
          status: 'ready',
          selected: {
            choiceId: videoRoute.choiceId,
            providerId: videoRoute.providerId,
            model: videoRoute.model,
          },
          selectedRoute: videoRoute,
          options: [videoRoute],
        },
    catalogVersion: 'catalog-v1',
  };
};

const project = (overrides: Partial<StudioRendererProject> = {}): StudioRendererProject => {
  const opening = scene();
  const closing = scene({
    id: 'scene-2',
    title: 'Closing shot',
    visualPrompt: '',
    mediaKind: 'video',
  });
  return {
    schemaVersion: 1,
    revision: 1,
    id: 'project-1',
    name: 'Project',
    brief: '',
    aspectRatio: '16:9',
    targetDurationSeconds: 10,
    resolution: '720p',
    sceneOrder: [opening.id, closing.id],
    scenes: { [opening.id]: opening, [closing.id]: closing },
    assets: {},
    jobs: {},
    routing: {
      storyboard: { providerId: 'planner', model: 'planner-model' },
      image: { choiceId: 'choice-image', providerId: 'provider-image', model: 'image-model' },
      video: { choiceId: 'choice-video', providerId: 'provider-video', model: 'video-model' },
    },
    createdAt: '2026-08-04T00:00:00.000Z',
    updatedAt: '2026-08-04T00:00:00.000Z',
    ...overrides,
  };
};

const editor = (currentProject: StudioRendererProject, selectedSceneId = 'scene-1'): UseStoryboardEditorResult => {
  const selectedScene = currentProject.scenes[selectedSceneId] ?? null;
  const orderedScenes = currentProject.sceneOrder.flatMap((sceneId) => {
    const candidate = currentProject.scenes[sceneId];
    return candidate === undefined ? [] : [candidate];
  });
  const durationTotalSeconds = orderedScenes.reduce((total, candidate) => total + candidate.durationSeconds, 0);
  return {
    project: currentProject,
    orderedScenes,
    selectedSceneId,
    selectedScene,
    sceneDraft: selectedScene,
    projectDraft: null,
    projectSaveState: 'saved',
    hasUnsavedProjectDraft: false,
    hasUnsavedSceneDrafts: false,
    hasUnsavedSelectedSceneDraft: false,
    selectedSceneSaveState: 'saved',
    saveIssues: [],
    selectScene: vi.fn(),
    updateSceneDraft: vi.fn(),
    updateProjectDraft: vi.fn(),
    flushProjectDraft: vi.fn(async () => true),
    discardProjectDraft: vi.fn(),
    flushSceneDraft: vi.fn(async () => true),
    flushSceneDraftById: vi.fn(async () => true),
    flushAllSceneDrafts: vi.fn(async () => ({ failed: [], dirtied: [] })),
    discardSceneDraft: vi.fn(),
    discardSceneDraftById: vi.fn(),
    addScene: vi.fn(async () => true),
    removeScene: vi.fn(async () => true),
    reorderScenes: vi.fn(async () => true),
    moveScene: vi.fn(async () => true),
    canAddScene: true,
    durationTotalSeconds,
    durationMatchesTarget: durationTotalSeconds === currentProject.targetDurationSeconds,
    remainingDurationSeconds: currentProject.targetDurationSeconds - durationTotalSeconds,
    suggestedExpandedTargetSeconds: null,
    increaseTargetDuration: vi.fn(async () => true),
    fitToTarget: vi.fn(async () => null),
    latestFitOutcome: null,
    latestFitCatalogVersion: null,
    clearLatestFitOutcome: vi.fn(),
    mutationPending: false,
    error: null,
    clearError: vi.fn(),
    conflict: null,
    retryConflict: vi.fn(async () => true),
    discardConflict: vi.fn(),
    drafting: false,
    proposeStoryboard: vi.fn(async () => true),
  };
};

const createController = (
  currentProject = project(),
  selectedSceneId = 'scene-1',
  currentCatalog: StudioRouteCatalog | null = catalog()
): ProducePhaseController => {
  const currentEditor = editor(currentProject, selectedSceneId);
  const models: UseStudioModelsResult = {
    catalog: currentCatalog,
    loading: false,
    errorMessageKey: null,
    pendingRole: null,
    refresh: vi.fn(async () => undefined),
    updateSelection: vi.fn(async () => true),
  };
  const jobs: UseStudioJobsResult = {
    project: currentProject,
    jobs: Object.values(currentProject.jobs),
    mutationPending: false,
    issue: null,
    staleIntent: null,
    clearIssue: vi.fn(),
    clearStaleIntent: vi.fn(),
    submitScenes: vi.fn(async () => true),
    cancelJob: vi.fn(async () => true),
    retryJob: vi.fn(async () => true),
    retryDownload: vi.fn(async () => true),
  };
  return {
    project: currentProject,
    readiness: deriveStudioReadiness(currentProject),
    editor: currentEditor,
    models,
    jobs,
    selectedAsset:
      currentEditor.selectedScene?.selectedAssetId === null ||
      currentEditor.selectedScene?.selectedAssetId === undefined
        ? null
        : (currentProject.assets[currentEditor.selectedScene.selectedAssetId] ?? null),
    posterAsset: null,
    advisory: null,
    mutationPending: false,
    requestTransition: vi.fn(),
    openSingleGenerationReview: vi.fn(),
    openBatchGenerationReview: vi.fn(),
    openModelSettings: vi.fn((_path?: '/settings/model') => undefined),
    selectVariation: vi.fn(async () => undefined),
    openDuplicateChargeConfirmation: vi.fn(),
  };
};

describe('ProducePhase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the three project model selectors and sends setup to Model Settings', () => {
    const controller = createController(project(), 'scene-1', catalog(true));
    const { container } = render(<ProducePhase controller={controller} />);

    expect(screen.getByRole('combobox', { name: 'conversation.creativeStudio.models.storyboard' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'conversation.creativeStudio.models.image' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'conversation.creativeStudio.models.video' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(container.querySelector('input[type="password"]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'conversation.creativeStudio.models.openSettings' }));
    expect(controller.openModelSettings).toHaveBeenCalledExactlyOnceWith('/settings/model');
  });

  it('renders every ordered shot with output, timing, status, and selected-take state', () => {
    const selectedAsset = asset();
    const currentProject = project({
      scenes: {
        'scene-1': scene({ selectedAssetId: selectedAsset.id, assetIds: [selectedAsset.id] }),
        'scene-2': scene({ id: 'scene-2', title: 'Closing shot', mediaKind: 'video', visualPrompt: '' }),
      },
      assets: { [selectedAsset.id]: selectedAsset },
    });
    render(<ProducePhase controller={createController(currentProject)} />);

    const opening = screen.getByRole('listitem', {
      name: 'conversation.creativeStudio.scene.accessibleName:number=1,title=Opening shot',
    });
    const closing = screen.getByRole('listitem', {
      name: 'conversation.creativeStudio.scene.accessibleName:number=2,title=Closing shot',
    });
    expect(within(opening).getByText('conversation.creativeStudio.scene.image')).toBeVisible();
    expect(within(opening).getByText('conversation.creativeStudio.preview.versionLabel:number=1')).toBeVisible();
    expect(within(closing).getByText('conversation.creativeStudio.scene.video')).toBeVisible();
    expect(within(closing).getByText('conversation.creativeStudio.scene.status.needs_prompt')).toBeVisible();
  });

  it('selects a shot without opening or submitting generation', () => {
    const currentProject = project({
      scenes: {
        'scene-1': scene(),
        'scene-2': scene({ id: 'scene-2', title: 'Closing shot', mediaKind: 'video', visualPrompt: 'A final wave' }),
      },
    });
    const controller = createController(currentProject);
    render(<ProducePhase controller={controller} />);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'conversation.creativeStudio.scene.accessibleName:number=2,title=Closing shot',
      })
    );

    expect(controller.editor.selectScene).toHaveBeenCalledExactlyOnceWith('scene-2');
    expect(controller.openSingleGenerationReview).not.toHaveBeenCalled();
    expect(controller.jobs.submitScenes).not.toHaveBeenCalled();
  });

  it('routes a blank-prompt shot to its Write visual field instead of offering generation', () => {
    const controller = createController();
    render(<ProducePhase controller={controller} />);
    const closing = screen.getByRole('listitem', {
      name: 'conversation.creativeStudio.scene.accessibleName:number=2,title=Closing shot',
    });

    expect(
      within(closing).queryByRole('button', { name: 'conversation.creativeStudio.review.generateScene' })
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(closing).getByRole('button', { name: 'conversation.creativeStudio.phase.produce.addVisual' })
    );

    expect(controller.editor.selectScene).toHaveBeenCalledExactlyOnceWith('scene-2');
    expect(controller.requestTransition).toHaveBeenCalledExactlyOnceWith({
      phase: 'write',
      state: { writeFocus: { sceneId: 'scene-2', field: 'visualPrompt' } },
    });
  });

  it('opens explicit single-shot review from a ready selected shot without submitting', () => {
    const controller = createController();
    render(<ProducePhase controller={controller} />);

    expect(screen.getAllByRole('button', { name: 'conversation.creativeStudio.review.generateScene' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'conversation.creativeStudio.review.generateScene' }));

    expect(controller.openSingleGenerationReview).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ sceneId: 'scene-1', routeStatus: 'valid' })
    );
    expect(controller.jobs.submitScenes).not.toHaveBeenCalled();
  });

  it('renders the batch advisory only when the controller routes it to the batch anchor', () => {
    const mismatchedProject = project({ targetDurationSeconds: 12 });
    const mismatch = createController(mismatchedProject);
    const exact = createController(project());
    exact.openBatchGenerationReview = mismatch.openBatchGenerationReview;
    const { rerender } = render(<ProducePhase controller={mismatch} />);

    const mismatchedBatch = screen.getByRole('button', {
      name: 'conversation.creativeStudio.review.generateReadyScenes:count=1',
    });
    expect(mismatchedBatch).toBeEnabled();
    expect(screen.queryByText('conversation.creativeStudio.review.durationMismatch')).not.toBeInTheDocument();
    fireEvent.click(mismatchedBatch);
    expect(mismatch.openBatchGenerationReview).toHaveBeenCalledTimes(1);

    exact.advisory = {
      messageKey: 'conversation.creativeStudio.review.durationMismatch',
      anchor: 'batch',
    };
    rerender(<ProducePhase controller={exact} />);
    const batch = screen.getByRole('button', {
      name: 'conversation.creativeStudio.review.generateReadyScenes:count=1',
    });
    expect(batch).toBeEnabled();
    expect(screen.getByText('conversation.creativeStudio.review.durationMismatch')).toBeVisible();
    fireEvent.click(batch);
    expect(mismatch.openBatchGenerationReview).toHaveBeenCalledTimes(2);
    expect(exact.jobs.submitScenes).not.toHaveBeenCalled();
  });

  it('lists project activity across scenes instead of filtering to the selected shot', () => {
    const openingJob = job({ id: 'job-opening', sceneId: 'scene-1' });
    const closingJob = job({ id: 'job-closing', sceneId: 'scene-2', status: 'succeeded' });
    const currentProject = project({
      scenes: {
        'scene-1': scene({ jobIds: [openingJob.id] }),
        'scene-2': scene({
          id: 'scene-2',
          title: 'Closing shot',
          mediaKind: 'video',
          visualPrompt: 'A final wave',
          jobIds: [closingJob.id],
        }),
      },
      jobs: { [openingJob.id]: openingJob, [closingJob.id]: closingJob },
    });
    render(<ProducePhase controller={createController(currentProject)} />);

    const activity = screen.getByRole('region', {
      name: 'conversation.creativeStudio.phase.produce.activityTitle',
    });
    expect(within(activity).getByText('Opening shot')).toBeVisible();
    expect(within(activity).getByText('Closing shot')).toBeVisible();
  });

  it('does not duplicate the shell-owned Review cut action inside Produce', () => {
    const controller = createController();
    render(<ProducePhase controller={controller} />);

    expect(
      screen.queryByRole('button', { name: 'conversation.creativeStudio.phase.produce.reviewCut' })
    ).not.toBeInTheDocument();
    expect(controller.requestTransition).not.toHaveBeenCalled();
  });
});
