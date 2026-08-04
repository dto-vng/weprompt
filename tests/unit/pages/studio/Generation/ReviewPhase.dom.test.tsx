/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { StudioAsset, StudioRendererProject, StudioScene } from '@/common/types/project/creativeStudioTypes';
import { ReviewPhase } from '@renderer/pages/studio/components/PhaseShell/phases/ReviewPhase';
import type { ReviewPhaseController } from '@renderer/pages/studio/components/PhaseShell/types';
import type { UseStoryboardEditorResult } from '@renderer/pages/studio/hooks/useStoryboardEditor';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values === undefined ? key : `${key}:${Object.values(values).join(',')}`,
  }),
}));

const scene = (id: string, overrides: Partial<StudioScene> = {}): StudioScene => ({
  id,
  title: `Shot ${id}`,
  purpose: 'Tell the story',
  visualPrompt: 'A cinematic frame',
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

const asset = (id: string, sceneId = 'scene-selected'): StudioAsset => ({
  id,
  projectId: 'project-1',
  sceneId,
  mediaKind: 'image',
  mimeType: 'image/png',
  managedAsset: { collection: 'assets', fileName: `${id}.png` },
  byteSize: 128,
  sha256: id.padEnd(64, 'a').slice(0, 64),
  createdAt: '2026-08-04T00:00:00.000Z',
});

const project = (): StudioRendererProject => {
  const selected = scene('scene-selected', {
    title: 'Selected opening',
    selectedAssetId: 'asset-1',
    assetIds: ['asset-1', 'asset-2'],
    reviewState: 'complete',
  });
  const slate = scene('scene-slate', { title: 'Missing close', durationSeconds: 7 });
  const running = scene('scene-running', { title: 'Running reveal', reviewState: 'generating' });
  const failed = scene('scene-failed', { title: 'Failed end card', reviewState: 'blocked' });
  return {
    schemaVersion: 1,
    revision: 12,
    id: 'project-1',
    name: 'Launch film',
    brief: 'A short launch video',
    aspectRatio: '16:9',
    targetDurationSeconds: 22,
    resolution: '720p',
    sceneOrder: [selected.id, slate.id, running.id, failed.id],
    scenes: {
      [selected.id]: selected,
      [slate.id]: slate,
      [running.id]: running,
      [failed.id]: failed,
    },
    assets: {
      'asset-1': asset('asset-1'),
      'asset-2': asset('asset-2'),
    },
    jobs: {},
    routing: { storyboard: null, image: null, video: null },
    createdAt: '2026-08-04T00:00:00.000Z',
    updatedAt: '2026-08-04T00:00:00.000Z',
  };
};

const editor = (currentProject: StudioRendererProject, selectedSceneId: string): UseStoryboardEditorResult => ({
  project: currentProject,
  orderedScenes: currentProject.sceneOrder.map((sceneId) => currentProject.scenes[sceneId]!),
  selectedSceneId,
  selectedScene: currentProject.scenes[selectedSceneId]!,
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
  durationTotalSeconds: currentProject.targetDurationSeconds,
  durationMatchesTarget: true,
  remainingDurationSeconds: 0,
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
});

const controller = (selectedSceneId = 'scene-selected'): ReviewPhaseController => {
  const currentProject = project();
  return {
    project: currentProject,
    readiness: {
      sceneStatuses: {
        'scene-selected': 'generated',
        'scene-slate': 'ready',
        'scene-running': 'generating',
        'scene-failed': 'needs_attention',
      },
      totalSceneCount: 4,
      readySceneIds: ['scene-slate'],
      selectedAssetCount: 1,
      durationDeltaSeconds: 0,
    },
    editor: editor(currentProject, selectedSceneId),
    selectedAsset: selectedSceneId === 'scene-selected' ? currentProject.assets['asset-1']! : null,
    posterAsset: null,
    mutationPending: false,
    requestTransition: vi.fn(),
    openExport: vi.fn(),
    selectVariation: vi.fn(async () => undefined),
  };
};

describe('Review phase cut', () => {
  it('shows the selected take and changes variations with the canonical project revision', () => {
    const reviewController = controller();
    render(<ReviewPhase controller={reviewController} />);

    expect(screen.getByRole('img', { name: 'conversation.creativeStudio.preview.imageAlt' })).toHaveAttribute(
      'src',
      'weprompt-studio://asset/project-1/asset-1'
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'conversation.creativeStudio.preview.selectVersionAccessible:2' })
    );

    expect(reviewController.selectVariation).toHaveBeenCalledExactlyOnceWith({
      projectId: 'project-1',
      sceneId: 'scene-selected',
      assetId: 'asset-2',
      expectedRevision: 12,
    });
  });

  it('shows a labeled scene slate with timing and handoff exclusion when no take is selected', () => {
    render(<ReviewPhase controller={controller('scene-slate')} />);

    const preview = screen.getByRole('region', { name: 'conversation.creativeStudio.preview.title' });
    expect(within(preview).getByText('Missing close')).toBeVisible();
    expect(within(preview).getByText('conversation.creativeStudio.scene.durationSeconds:7,7')).toBeVisible();
    expect(within(preview).getByText('conversation.creativeStudio.phase.review.excludedFromHandoff')).toBeVisible();
  });

  it('labels selected, slate, running, and failed rail states without relying on color', () => {
    const { container } = render(<ReviewPhase controller={controller()} />);

    expect(
      Array.from(container.querySelectorAll('[data-review-state]'), (node) => node.getAttribute('data-review-state'))
    ).toEqual(['selected-take', 'missing-slate', 'running', 'failed']);
    expect(screen.getAllByText('conversation.creativeStudio.phase.review.selectedTake')).toHaveLength(2);
    expect(
      screen.getByRole('button', {
        name: 'conversation.creativeStudio.timeline.selectSceneAccessible:1,Selected opening,5,5',
      })
    ).toHaveAccessibleDescription('conversation.creativeStudio.phase.review.selectedTake');
    expect(screen.getByText('conversation.creativeStudio.phase.review.slateLabel')).toBeVisible();
    expect(screen.getByText('conversation.creativeStudio.scene.status.generating')).toBeVisible();
    expect(screen.getByText('conversation.creativeStudio.jobs.status.failed')).toBeVisible();
  });

  it('never exposes generation or stitched-playback actions in Review', () => {
    const { container } = render(<ReviewPhase controller={controller('scene-slate')} />);

    expect(
      screen.queryByRole('button', { name: 'conversation.creativeStudio.preview.generateThisScene' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('conversation.creativeStudio.review.generateScene')).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/stitched|final movie|play all/i);
  });

  it('exposes the handoff summary as a complementary region beside the review workspace', () => {
    render(<ReviewPhase controller={controller()} />);

    const handoff = screen.getByRole('complementary', {
      name: 'conversation.creativeStudio.phase.review.handoff',
    });
    expect(handoff).toContainElement(screen.getByText('conversation.creativeStudio.phase.review.handoffDescription'));
  });
});
