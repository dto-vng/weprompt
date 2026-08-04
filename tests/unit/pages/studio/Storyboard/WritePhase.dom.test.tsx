/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  StudioAsset,
  StudioEditableScene,
  StudioRendererProject,
  StudioRouteCatalog,
  StudioScene,
} from '@/common/types/project/creativeStudioTypes';
import { WritePhase } from '@renderer/pages/studio/components/PhaseShell/phases/WritePhase';
import type { WritePhaseController } from '@renderer/pages/studio/components/PhaseShell/types';
import type { UseStoryboardEditorResult } from '@renderer/pages/studio/hooks/useStoryboardEditor';
import type { UseStudioModelsResult } from '@renderer/pages/studio/hooks/useStudioModels';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const observedTargets: Element[] = [];

class ResizeObserverMock {
  observe(target: Element): void {
    observedTargets.push(target);
  }

  disconnect(): void {}

  unobserve(): void {}
}

const scene = (id: string, overrides: Partial<StudioScene> = {}): StudioScene => ({
  id,
  title: id === 'scene-1' ? 'Opening' : 'Reveal',
  purpose: 'Move the story forward',
  visualPrompt: id === 'scene-1' ? 'A wide opening' : 'A detailed reveal',
  narration: '',
  onScreenText: '',
  mediaKind: id === 'scene-1' ? 'image' : 'video',
  durationSeconds: id === 'scene-1' ? 5 : 6,
  referenceAssetId: null,
  selectedAssetId: null,
  assetIds: [],
  jobIds: [],
  reviewState: 'ready',
  ...overrides,
});

const editable = (value: StudioScene): StudioEditableScene => ({
  title: value.title,
  purpose: value.purpose,
  visualPrompt: value.visualPrompt,
  narration: value.narration,
  onScreenText: value.onScreenText,
  mediaKind: value.mediaKind,
  durationSeconds: value.durationSeconds,
  referenceAssetId: value.referenceAssetId,
});

const reference: StudioAsset = {
  id: 'reference-2',
  projectId: 'project-1',
  sceneId: 'scene-2',
  mediaKind: 'image',
  mimeType: 'image/png',
  managedAsset: { collection: 'imports', fileName: 'reference-2.png' },
  byteSize: 1,
  sha256: '1'.repeat(64),
  createdAt: '2026-08-04T00:00:00.000Z',
};

const scenes = [scene('scene-1'), scene('scene-2', { referenceAssetId: reference.id, assetIds: [reference.id] })];

const project: StudioRendererProject = {
  schemaVersion: 1,
  revision: 3,
  id: 'project-1',
  name: 'Launch film',
  brief: 'A short launch story',
  aspectRatio: '16:9',
  targetDurationSeconds: 15,
  resolution: '1080p',
  sceneOrder: scenes.map(({ id }) => id),
  scenes: Object.fromEntries(scenes.map((item) => [item.id, item])),
  assets: { [reference.id]: reference },
  jobs: {},
  routing: {
    storyboard: { providerId: 'story-provider', model: 'planner-model' },
    image: { choiceId: 'image-choice', providerId: 'image-provider', model: 'image-model' },
    video: { choiceId: 'video-choice', providerId: 'video-provider', model: 'video-model' },
  },
  createdAt: '2026-08-04T00:00:00.000Z',
  updatedAt: '2026-08-04T00:00:00.000Z',
};

const catalog: StudioRouteCatalog = {
  storyboard: {
    status: 'ready',
    selected: { providerId: 'story-provider', model: 'planner-model' },
    options: [
      {
        providerId: 'story-provider',
        providerName: 'Storyboard Provider',
        model: 'planner-model',
        health: 'available',
      },
    ],
  },
  image: {
    status: 'ready',
    selected: { choiceId: 'image-choice', providerId: 'image-provider', model: 'image-model' },
    selectedRoute: {
      choiceId: 'image-choice',
      providerId: 'image-provider',
      providerName: 'Image Provider',
      model: 'image-model',
      health: 'available',
      kind: 'image',
      constraints: {
        aspectRatios: ['16:9'],
        resolutions: ['1080p'],
        minDurationSeconds: 2,
        maxDurationSeconds: 8,
        supportsFirstFrame: true,
        silentOutput: true,
      },
    },
    options: [],
  },
  video: {
    status: 'ready',
    selected: { choiceId: 'video-choice', providerId: 'video-provider', model: 'video-model' },
    selectedRoute: {
      choiceId: 'video-choice',
      providerId: 'video-provider',
      providerName: 'Video Provider',
      model: 'video-model',
      health: 'available',
      kind: 'video',
      constraints: {
        aspectRatios: ['16:9'],
        resolutions: ['1080p'],
        minDurationSeconds: 4,
        maxDurationSeconds: 12,
        supportsFirstFrame: true,
        silentOutput: true,
      },
    },
    options: [],
  },
  catalogVersion: '0123456789abcdef',
};

const editor = (
  selectedSceneId = 'scene-1',
  overrides: Partial<UseStoryboardEditorResult> = {}
): UseStoryboardEditorResult =>
  ({
    project,
    orderedScenes: scenes,
    selectedSceneId,
    selectedScene: project.scenes[selectedSceneId] ?? null,
    sceneDraft: project.scenes[selectedSceneId] ? editable(project.scenes[selectedSceneId]!) : null,
    sceneDrafts: Object.fromEntries(scenes.map((item) => [item.id, editable(item)])),
    sceneSaveStates: { 'scene-1': 'saved', 'scene-2': 'dirty' },
    projectDraft: null,
    projectSaveState: 'saved',
    hasUnsavedProjectDraft: false,
    hasUnsavedSceneDrafts: true,
    hasUnsavedSelectedSceneDraft: false,
    selectedSceneSaveState: 'saved',
    saveIssues: [],
    selectScene: vi.fn(),
    updateSceneDraft: vi.fn(),
    updateSceneDraftById: vi.fn(),
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
    durationTotalSeconds: 11,
    durationMatchesTarget: false,
    remainingDurationSeconds: 4,
    suggestedExpandedTargetSeconds: 20,
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
    ...overrides,
  }) as UseStoryboardEditorResult;

const models = (overrides: Partial<UseStudioModelsResult> = {}): UseStudioModelsResult => ({
  catalog,
  loading: false,
  errorMessageKey: null,
  pendingRole: null,
  refresh: vi.fn(async () => {}),
  updateSelection: vi.fn(async () => true),
  ...overrides,
});

const controller = (overrides: Partial<WritePhaseController> = {}): WritePhaseController => ({
  project,
  readiness: {
    sceneStatuses: { 'scene-1': 'ready', 'scene-2': 'ready' },
    totalSceneCount: 2,
    readySceneIds: ['scene-1', 'scene-2'],
    selectedAssetCount: 0,
    durationDeltaSeconds: -4,
  },
  editor: editor(),
  models: models(),
  selectedReferenceAsset: null,
  writeFocusIntent: null,
  advisory: null,
  mutationPending: false,
  requestTransition: vi.fn(),
  openDraftReview: vi.fn(),
  importReference: vi.fn(async () => {}),
  clearWriteFocusIntent: vi.fn(),
  ...overrides,
});

describe('WritePhase', () => {
  beforeEach(() => {
    observedTargets.length = 0;
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders every scene as a by-ID editor with route-aware duration bounds', () => {
    const props = controller();
    render(<WritePhase controller={props} />);

    expect(screen.getAllByLabelText('conversation.creativeStudio.inspector.titleLabel')).toHaveLength(2);
    expect(screen.getAllByLabelText('conversation.creativeStudio.inspector.narrationLabel')).toHaveLength(2);
    expect(screen.getAllByLabelText('conversation.creativeStudio.inspector.visualPromptLabel')).toHaveLength(2);
    expect(screen.getAllByLabelText('conversation.creativeStudio.inspector.onScreenTextLabel')).toHaveLength(2);
    expect(screen.getAllByLabelText('conversation.creativeStudio.inspector.purposeLabel')).toHaveLength(2);

    const durations = screen.getAllByRole('spinbutton', {
      name: 'conversation.creativeStudio.inspector.durationLabel',
    });
    expect(durations[0]).toHaveAttribute('aria-valuemin', '2');
    expect(durations[0]).toHaveAttribute('aria-valuemax', '8');
    expect(durations[1]).toHaveAttribute('aria-valuemin', '4');
    expect(durations[1]).toHaveAttribute('aria-valuemax', '12');

    fireEvent.change(screen.getAllByLabelText('conversation.creativeStudio.inspector.visualPromptLabel')[1]!, {
      target: { value: 'A revised reveal prompt' },
    });
    expect(props.editor.updateSceneDraftById).toHaveBeenCalledWith('scene-2', {
      visualPrompt: 'A revised reveal prompt',
    });
  });

  it.each([
    {
      sceneId: 'scene-1',
      selectorIndex: 0,
      initialDraft: editable(scene('scene-1', { durationSeconds: 2 })),
      nextKind: 'video' as const,
      optionLabel: 'conversation.creativeStudio.scene.video',
      expectedDurationSeconds: 4,
    },
    {
      sceneId: 'scene-2',
      selectorIndex: 1,
      initialDraft: editable(scene('scene-2', { mediaKind: 'video', durationSeconds: 12 })),
      nextKind: 'image' as const,
      optionLabel: 'conversation.creativeStudio.scene.image',
      expectedDurationSeconds: 8,
    },
  ])(
    'atomically clamps $sceneId duration when changing to the $nextKind route',
    async ({ sceneId, selectorIndex, initialDraft, nextKind, optionLabel, expectedDurationSeconds }) => {
      const phaseEditor = editor('scene-1', {
        sceneDrafts: {
          'scene-1': selectorIndex === 0 ? initialDraft : editable(scenes[0]!),
          'scene-2': selectorIndex === 1 ? initialDraft : editable(scenes[1]!),
        },
      });
      render(<WritePhase controller={controller({ editor: phaseEditor })} />);

      const selectors = screen.getAllByRole('combobox', {
        name: 'conversation.creativeStudio.inspector.mediaKindLabel',
      });
      fireEvent.click(selectors[selectorIndex]!);
      fireEvent.click(await screen.findByRole('option', { name: optionLabel }));

      expect(phaseEditor.updateSceneDraftById).toHaveBeenCalledExactlyOnceWith(sceneId, {
        mediaKind: nextKind,
        durationSeconds: expectedDurationSeconds,
      });
    }
  );

  it('shows one truthful first-frame reference per row and imports for that scene ID', async () => {
    const props = controller();
    render(<WritePhase controller={props} />);

    expect(screen.getByRole('img', { name: 'conversation.creativeStudio.preview.importReference' })).toHaveAttribute(
      'src',
      'weprompt-studio://asset/project-1/reference-2'
    );
    const referenceActions = screen.getAllByRole('button', {
      name: 'conversation.creativeStudio.preview.importReference',
    });
    expect(referenceActions).toHaveLength(2);
    fireEvent.click(referenceActions[1]!);
    await waitFor(() => expect(props.importReference).toHaveBeenCalledWith('scene-2'));
  });

  it('keeps Fit to goal at summary level and contains no media-generation or spend action', () => {
    const phaseEditor = editor('scene-1', { hasUnsavedSceneDrafts: false });
    const props = controller({ editor: phaseEditor });
    render(<WritePhase controller={props} />);

    const fitButton = screen.getByRole('button', {
      name: 'conversation.creativeStudio.storyboard.fitToTarget',
    });
    expect(fitButton).toBeEnabled();
    fireEvent.click(fitButton);
    expect(phaseEditor.fitToTarget).toHaveBeenCalledWith('0123456789abcdef');
    expect(screen.queryByRole('button', { name: /render|generate image|generate video/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/credit|session spend|estimated cost/i)).not.toBeInTheDocument();
  });

  it('selects and focuses the requested visual prompt, then clears the route intent', async () => {
    const firstEditor = editor('scene-1');
    const props = controller({
      editor: firstEditor,
      writeFocusIntent: { sceneId: 'scene-2', field: 'visualPrompt' },
    });
    const view = render(<WritePhase controller={props} />);

    expect(firstEditor.selectScene).toHaveBeenCalledWith('scene-2');
    const selectedEditor = editor('scene-2');
    const selectedProps = controller({
      editor: selectedEditor,
      writeFocusIntent: { sceneId: 'scene-2', field: 'visualPrompt' },
      clearWriteFocusIntent: props.clearWriteFocusIntent,
    });
    view.rerender(<WritePhase controller={selectedProps} />);

    await waitFor(() => expect(screen.getByDisplayValue('A detailed reveal')).toHaveFocus());
    expect(props.clearWriteFocusIntent).toHaveBeenCalledOnce();
  });

  it('clears a missing-scene focus intent without moving focus', () => {
    const phaseEditor = editor();
    const props = controller({
      editor: phaseEditor,
      writeFocusIntent: { sceneId: 'removed-scene', field: 'visualPrompt' },
    });
    render(<WritePhase controller={props} />);

    expect(props.clearWriteFocusIntent).toHaveBeenCalledOnce();
    expect(phaseEditor.selectScene).not.toHaveBeenCalled();
  });

  it('uses the shell layout contract without observing its own phase root', () => {
    const { container } = render(<WritePhase controller={controller()} />);

    const phaseRoot = container.querySelector('section[data-layout]');
    expect(phaseRoot).not.toBeNull();
    expect(observedTargets).not.toContain(phaseRoot);
  });
});
