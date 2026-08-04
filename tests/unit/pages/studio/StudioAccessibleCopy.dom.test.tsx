/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen, within } from '@testing-library/react';
import i18next, { type i18n } from 'i18next';
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import type {
  StudioAsset,
  StudioRendererProject,
  StudioRouteCatalog,
  StudioScene,
} from '@/common/types/project/creativeStudioTypes';
import { GenerationReviewModal } from '@renderer/pages/studio/components/Generation/GenerationReviewModal';
import { AssetStrip } from '@renderer/pages/studio/components/Preview/AssetStrip';
import { SceneTimeline } from '@renderer/pages/studio/components/SceneTimeline';
import { StudioHeader } from '@renderer/pages/studio/components/StudioHeader';
import { SceneCard } from '@renderer/pages/studio/components/Storyboard/SceneCard';
import { StoryboardPanel } from '@renderer/pages/studio/components/Storyboard/StoryboardPanel';
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

const createEnglishI18n = async (): Promise<i18n> => {
  const instance = i18next.createInstance();
  await instance.init({
    lng: 'en-US',
    fallbackLng: false,
    resources: {
      'en-US': {
        translation: { conversation },
      },
    },
    interpolation: { escapeValue: false },
  });
  return instance;
};

const renderEnglish = async (ui: React.ReactElement) => {
  const instance = await createEnglishI18n();
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

const storyboardCatalog = (): StudioRouteCatalog['storyboard'] => ({
  status: 'ready',
  selected: { providerId: 'provider-1', model: 'story-model' },
  options: [{ providerId: 'provider-1', providerName: 'Provider', model: 'story-model', health: 'available' }],
});

describe('Creative Studio full-sentence English copy', () => {
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
    const commonProps = {
      project: project(),
      storyboard: storyboardCatalog(),
      catalogLoading: false,
      catalogErrorMessageKey: null,
      drafting: false,
      onBack: vi.fn(),
      onOpenDraft: vi.fn(),
      onOpenGenerationReview: vi.fn(),
    } as const;

    await renderEnglish(
      <>
        <StudioHeader
          {...commonProps}
          readiness={{
            sceneStatuses: {},
            totalSceneCount: 1,
            readySceneIds: ['scene-1'],
            selectedAssetCount: 0,
            durationDeltaSeconds: 0,
          }}
        />
        <StudioHeader
          {...commonProps}
          readiness={{
            sceneStatuses: {},
            totalSceneCount: 2,
            readySceneIds: ['scene-1', 'scene-2'],
            selectedAssetCount: 0,
            durationDeltaSeconds: 0,
          }}
        />
      </>
    );

    expect(screen.getByRole('button', { name: 'Generate 1 ready scene' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate 2 ready scenes' })).toBeInTheDocument();
  });
});
