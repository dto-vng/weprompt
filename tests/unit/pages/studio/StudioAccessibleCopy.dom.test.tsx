/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, getRoles, render, screen, within } from '@testing-library/react';
import i18next, { type i18n } from 'i18next';
import React from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import i18nConfig from '@/common/config/i18n-config.json';
import type { StudioAsset, StudioRendererProject, StudioScene } from '@/common/types/project/creativeStudioTypes';
import { GenerationReviewModal } from '@renderer/pages/studio/components/Generation/GenerationReviewModal';
import { AssistantDock } from '@renderer/pages/studio/components/PhaseShell/AssistantDock';
import { StudioPhaseHeader } from '@renderer/pages/studio/components/PhaseShell/StudioPhaseHeader';
import { StudioPhaseNav } from '@renderer/pages/studio/components/PhaseShell/StudioPhaseNav';
import { StudioPhaseShell } from '@renderer/pages/studio/components/PhaseShell/StudioPhaseShell';
import type { StudioPhaseControllers } from '@renderer/pages/studio/components/PhaseShell/types';
import { AssetStrip } from '@renderer/pages/studio/components/Preview/AssetStrip';
import { SceneTimeline } from '@renderer/pages/studio/components/SceneTimeline';
import { SceneCard } from '@renderer/pages/studio/components/Storyboard/SceneCard';
import { StoryboardPanel } from '@renderer/pages/studio/components/Storyboard/StoryboardPanel';
import type { UseStoryboardEditorResult } from '@renderer/pages/studio/hooks/useStoryboardEditor';
import type { UseStudioJobsResult } from '@renderer/pages/studio/hooks/useStudioJobs';
import type { UseStudioModelsResult } from '@renderer/pages/studio/hooks/useStudioModels';
import { STUDIO_PHASES } from '@renderer/pages/studio/studioPhaseRoute';
import conversation from '@renderer/services/i18n/locales/en-US/conversation.json';

vi.mock('@dnd-kit/core', async () => {
  const actual = await vi.importActual<typeof import('@dnd-kit/core')>('@dnd-kit/core');
  return {
    ...actual,
    DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useSensor: vi.fn(() => ({})),
    useSensors: vi.fn((...sensors: unknown[]) => sensors),
  };
});

vi.mock('@dnd-kit/sortable', async () => {
  const actual = await vi.importActual<typeof import('@dnd-kit/sortable')>('@dnd-kit/sortable');
  return {
    ...actual,
    SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useSortable: () => ({
      attributes: {},
      listeners: {},
      setNodeRef: vi.fn(),
      setActivatorNodeRef: vi.fn(),
      transform: null,
      transition: undefined,
      isDragging: false,
    }),
  };
});

const localeRoot = join(process.cwd(), 'packages/desktop/src/renderer/services/i18n/locales');

const loadConversationLocale = (locale: string): typeof conversation =>
  JSON.parse(readFileSync(join(localeRoot, locale, 'conversation.json'), 'utf8')) as typeof conversation;

const createLocaleI18n = async (locale: string, resource = loadConversationLocale(locale)): Promise<i18n> => {
  const instance = i18next.createInstance();
  await instance.init({
    lng: locale,
    fallbackLng: false,
    resources: {
      [locale]: {
        translation: { conversation: resource },
      },
    },
    interpolation: { escapeValue: false },
  });
  return instance;
};

const renderEnglish = async (ui: React.ReactElement) => {
  const instance = await createLocaleI18n('en-US', conversation);
  return render(<I18nextProvider i18n={instance}>{ui}</I18nextProvider>);
};

const scene = (overrides: Partial<StudioScene> = {}): StudioScene => ({
  id: 'scene-2',
  title: 'Product close-up',
  purpose: 'Show the product',
  visualPrompt: 'A cinematic product close-up',
  narration: '',
  onScreenText: '',
  mediaKind: 'video',
  durationSeconds: 5,
  referenceAssetId: null,
  selectedAssetId: null,
  assetIds: [],
  jobIds: [],
  reviewState: 'draft',
  ...overrides,
});

const asset = (id: string): StudioAsset => ({
  id,
  projectId: 'project-1',
  sceneId: 'scene-2',
  mediaKind: 'video',
  mimeType: 'video/mp4',
  managedAsset: { collection: 'assets', fileName: `${id}.mp4` },
  byteSize: 128,
  sha256: '1'.repeat(64),
  createdAt: '2026-08-03T00:00:00.000Z',
});

const project = (): StudioRendererProject => ({
  schemaVersion: 1,
  revision: 1,
  id: 'project-1',
  name: 'Launch film',
  brief: 'A short launch video',
  aspectRatio: '16:9',
  targetDurationSeconds: 5,
  resolution: '720p',
  sceneOrder: [],
  scenes: {},
  assets: {},
  jobs: {},
  routing: { storyboard: null, image: null, video: null },
  createdAt: '2026-08-03T00:00:00.000Z',
  updatedAt: '2026-08-03T00:00:00.000Z',
});

const phaseController = (): StudioPhaseControllers => {
  const currentProject = project();
  const editor: UseStoryboardEditorResult = {
    project: currentProject,
    orderedScenes: [],
    selectedSceneId: null,
    selectedScene: null,
    sceneDraft: null,
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
    flushAllSceneDrafts: vi.fn(async () => true),
    discardSceneDraft: vi.fn(),
    discardSceneDraftById: vi.fn(),
    addScene: vi.fn(async () => true),
    removeScene: vi.fn(async () => true),
    reorderScenes: vi.fn(async () => true),
    moveScene: vi.fn(async () => true),
    canAddScene: true,
    durationTotalSeconds: 0,
    durationMatchesTarget: false,
    remainingDurationSeconds: currentProject.targetDurationSeconds,
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
  const models: UseStudioModelsResult = {
    catalog: null,
    loading: false,
    errorMessageKey: null,
    pendingRole: null,
    refresh: vi.fn(async () => undefined),
    updateSelection: vi.fn(async () => true),
  };
  const jobs: UseStudioJobsResult = {
    project: currentProject,
    jobs: [],
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
    readiness: {
      sceneStatuses: {},
      totalSceneCount: 0,
      readySceneIds: [],
      selectedAssetCount: 0,
      durationDeltaSeconds: currentProject.targetDurationSeconds,
    },
    editor,
    models,
    jobs,
    selectedAsset: null,
    posterAsset: null,
    selectedReferenceAsset: null,
    writeFocusIntent: null,
    mutationPending: false,
    requestTransition: vi.fn(),
    openDraftReview: vi.fn(),
    openSingleGenerationReview: vi.fn(),
    openBatchGenerationReview: vi.fn(),
    openReadyScenesReview: vi.fn(async () => undefined),
    openExport: vi.fn(),
    openModelSettings: vi.fn(),
    importReference: vi.fn(async () => undefined),
    selectVariation: vi.fn(async () => undefined),
    clearWriteFocusIntent: vi.fn(),
    openDuplicateChargeConfirmation: vi.fn(),
  };
};

describe('Creative Studio full-sentence English copy', () => {
  it('labels the Brief primary action with the phase start-writing copy', async () => {
    await renderEnglish(
      <StudioPhaseShell
        activePhase='brief'
        controller={phaseController()}
        navigationDisabled={false}
        onBack={vi.fn()}
      />
    );

    const headerActions = document.querySelector<HTMLElement>('[data-studio-phase-actions]');
    expect(headerActions).not.toBeNull();
    expect(within(headerActions!).getByRole('button', { name: 'Start writing' })).toBeInTheDocument();
  });

  it('renders every phase in every configured locale without raw visible or accessible copy', async () => {
    const rawKey = /conversation\.creativeStudio\./i;
    const issues: string[] = [];
    const localeInstances = await Promise.all(
      i18nConfig.supportedLanguages.map(async (locale) => [locale, await createLocaleI18n(locale)] as const)
    );

    for (const [locale, instance] of localeInstances) {
      for (const activePhase of STUDIO_PHASES) {
        const { container, unmount } = render(
          <I18nextProvider i18n={instance}>
            <StudioPhaseShell
              activePhase={activePhase}
              controller={phaseController()}
              navigationDisabled={false}
              onBack={vi.fn()}
            />
          </I18nextProvider>
        );

        if (rawKey.test(container.textContent ?? '')) {
          issues.push(`${locale}.${activePhase} exposes a raw key as visible text`);
        }

        for (const role of Object.keys(getRoles(container))) {
          const rawNames = within(container).queryAllByRole(role, { name: rawKey });
          if (rawNames.length > 0) {
            issues.push(`${locale}.${activePhase} exposes ${rawNames.length} raw accessible name(s) for ${role}`);
          }
        }

        unmount();
      }
    }

    expect(issues).toEqual([]);
  });

  it('renders the phase workflow and assistant dock with localized accessible names', async () => {
    await renderEnglish(
      <>
        <StudioPhaseNav activePhase='brief' disabled={false} onSelect={vi.fn()} />
        <AssistantDock>
          <span>Assistant controls</span>
        </AssistantDock>
        <AssistantDock kind='produce'>
          <span>Generation controls</span>
        </AssistantDock>
      </>
    );

    const navigation = screen.getByRole('navigation', { name: 'Creative workflow' });
    expect(
      within(navigation)
        .getAllByRole('button')
        .map((button) => button.textContent)
    ).toEqual(['Brief', 'Write', 'Produce', 'Review']);
    expect(screen.getByRole('complementary', { name: 'Writing assistant' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Generation activity' })).toBeInTheDocument();
  });

  it('renders complete scene action names and a grammatically singular duration', async () => {
    await renderEnglish(
      <SceneCard
        scene={scene({ durationSeconds: 1 })}
        index={1}
        selected={false}
        status='ready'
        removeDisabled={false}
        mutationPending={false}
        moveUpDisabled={false}
        moveDownDisabled={false}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
        onMove={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Drag scene 2: Product close-up' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move scene 2: Product close-up up' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move scene 2: Product close-up down' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove scene 2: Product close-up' })).toBeInTheDocument();
    expect(screen.getByText('1 second')).toBeInTheDocument();
  });

  it('keeps the full removal action name in the confirmation dialog', async () => {
    await renderEnglish(
      <StoryboardPanel
        orderedScenes={[scene()]}
        selectedSceneId='scene-2'
        targetDurationSeconds={5}
        durationTotalSeconds={5}
        durationMatchesTarget
        remainingDurationSeconds={0}
        suggestedExpandedTargetSeconds={10}
        canAddScene
        mutationPending={false}
        fitDisabled={false}
        fitOutcome={null}
        hasLockedScenes={false}
        sceneStatuses={{ 'scene-2': 'ready' }}
        conflict={false}
        onSelectScene={vi.fn()}
        onAddScene={vi.fn()}
        onIncreaseTargetDuration={vi.fn()}
        onFitToTarget={vi.fn()}
        onRemoveScene={vi.fn()}
        onReorderScenes={vi.fn()}
        onMoveScene={vi.fn()}
        onRetryConflict={vi.fn()}
        onDiscardConflict={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove scene 1: Product close-up' }));

    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove scene 1: Product close-up' })
    ).toBeInTheDocument();
  });

  it('renders complete timeline and variation selection names without translated fragments', async () => {
    const timelineScene = scene({ id: 'scene-1', durationSeconds: 1 });
    const assetScene = scene();
    const firstAsset = asset('asset-1');
    const secondAsset = asset('asset-2');

    await renderEnglish(
      <>
        <SceneTimeline orderedScenes={[timelineScene]} selectedSceneId='scene-1' onSelectScene={vi.fn()} />
        <AssetStrip
          projectId='project-1'
          scene={{ ...assetScene, assetIds: [firstAsset.id, secondAsset.id] }}
          assets={{ [firstAsset.id]: firstAsset, [secondAsset.id]: secondAsset }}
          projectRevision={3}
          mutationPending={false}
          onSelectAsset={vi.fn()}
        />
      </>
    );

    expect(screen.getByRole('button', { name: 'Select scene 1: Product close-up, 1 second' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/^Total duration: 1 second$/);
    expect(screen.getByRole('button', { name: 'Select version 2' })).toBeInTheDocument();
  });

  it('renders complete selected, target, and per-scene duration phrases', async () => {
    await renderEnglish(
      <GenerationReviewModal
        visible
        mode='single'
        scenes={[
          {
            id: 'scene-2',
            title: 'Product close-up',
            mediaKind: 'video',
            durationSeconds: 1,
            route: {
              status: 'valid',
              snapshot: {
                sceneId: 'scene-2',
                kind: 'video',
                providerId: 'provider-1',
                choiceId: 'choice-1',
                model: 'video-model',
              },
              providerName: 'Provider',
            },
          },
        ]}
        aspectRatio='16:9'
        resolution='720p'
        targetDurationSeconds={2}
        selectedDurationSeconds={1}
        projectDurationSeconds={1}
        submitting={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Selected duration: 1 second')).toBeInTheDocument();
    expect(within(dialog).getByText('Target duration: 2 seconds')).toBeInTheDocument();
    expect(within(screen.getByRole('article', { name: 'Product close-up' })).getByText('1 second')).toBeInTheDocument();
  });

  it('renders singular and plural ready-scene actions through the logical i18next key', async () => {
    const ReadyAction = ({ count }: { count: number }) => {
      const { t } = useTranslation();
      return (
        <StudioPhaseHeader
          project={project()}
          onBack={vi.fn()}
          actions={
            <button type='button'>{t('conversation.creativeStudio.review.generateReadyScenes', { count })}</button>
          }
        />
      );
    };

    await renderEnglish(
      <>
        <ReadyAction count={1} />
        <ReadyAction count={2} />
      </>
    );

    expect(screen.getByRole('button', { name: 'Generate 1 ready scene' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate 2 ready scenes' })).toBeInTheDocument();
  });
});
