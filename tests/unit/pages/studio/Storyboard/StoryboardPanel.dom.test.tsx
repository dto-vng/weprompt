/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StudioFitStoryboardOutcome, StudioScene } from '@/common/types/project/creativeStudioTypes';
import type { StudioSceneStatus } from '@renderer/pages/studio/studioReadiness';
import {
  StoryboardPanel,
  type StoryboardPanelProps,
} from '@renderer/pages/studio/components/Storyboard/StoryboardPanel';

const dnd = vi.hoisted(() => ({
  onDragEnd: null as null | ((event: { active: { id: string }; over: { id: string } | null }) => void),
}));

vi.mock('@dnd-kit/core', async () => {
  const actual = await vi.importActual<typeof import('@dnd-kit/core')>('@dnd-kit/core');
  return {
    ...actual,
    DndContext: ({
      children,
      onDragEnd,
    }: {
      children: React.ReactNode;
      onDragEnd?: (event: { active: { id: string }; over: { id: string } | null }) => void;
    }) => {
      dnd.onDragEnd = onDragEnd ?? null;
      return <>{children}</>;
    },
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

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      if (key === 'conversation.creativeStudio.scene.accessibleName') {
        return `${key}:${params?.number}:${params?.title}`;
      }
      if (key === 'conversation.creativeStudio.storyboard.durationTotal') {
        return `${key}:${params?.total}:${params?.target}`;
      }
      if (key === 'conversation.creativeStudio.storyboard.removeBlocked') {
        return 'Scenes with imported or generated media, or generation history, cannot be removed.';
      }
      return params === undefined ? key : `${key}:${Object.values(params).join(':')}`;
    },
  }),
}));

const scene = (
  id: string,
  title: string,
  durationSeconds: number,
  overrides: Partial<StudioScene> = {}
): StudioScene => ({
  id,
  title,
  purpose: `${title} purpose`,
  visualPrompt: `${title} prompt`,
  narration: '',
  onScreenText: '',
  mediaKind: id === 'scene-2' ? 'video' : 'image',
  durationSeconds,
  referenceAssetId: null,
  selectedAssetId: null,
  assetIds: [],
  jobIds: [],
  reviewState: 'draft',
  ...overrides,
});

const orderedScenes = [scene('scene-1', 'Opening', 4), scene('scene-2', 'Reveal', 6), scene('scene-3', 'Closing', 5)];

const createProps = (overrides: Partial<StoryboardPanelProps> = {}): StoryboardPanelProps => ({
  orderedScenes,
  selectedSceneId: 'scene-1',
  targetDurationSeconds: 20,
  durationTotalSeconds: 15,
  durationMatchesTarget: false,
  remainingDurationSeconds: 5,
  suggestedExpandedTargetSeconds: 25,
  canAddScene: true,
  mutationPending: false,
  fitDisabled: false,
  fitOutcome: null,
  hasLockedScenes: false,
  sceneStatuses: Object.fromEntries(orderedScenes.map((item) => [item.id, 'ready' satisfies StudioSceneStatus])),
  errorMessageKey: null,
  statusMessageKey: null,
  conflict: false,
  onSelectScene: vi.fn(),
  onAddScene: vi.fn(),
  onIncreaseTargetDuration: vi.fn(),
  onFitToTarget: vi.fn(),
  onRemoveScene: vi.fn(),
  onReorderScenes: vi.fn(),
  onMoveScene: vi.fn(),
  onRetryConflict: vi.fn(),
  onDiscardConflict: vi.fn(),
  ...overrides,
});

describe('StoryboardPanel', () => {
  beforeEach(() => {
    dnd.onDragEnd = null;
  });

  it('renders canonical scene order with localized selectable names and visible selection', () => {
    const props = createProps();
    render(<StoryboardPanel {...props} />);

    const sceneButtons = screen.getAllByRole('button', {
      name: /^conversation\.creativeStudio\.scene\.accessibleName/,
    });
    expect(sceneButtons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'conversation.creativeStudio.scene.accessibleName:1:Opening',
      'conversation.creativeStudio.scene.accessibleName:2:Reveal',
      'conversation.creativeStudio.scene.accessibleName:3:Closing',
    ]);
    expect(sceneButtons[0]).toHaveAttribute('aria-current', 'true');
    expect(screen.queryByText('conversation.creativeStudio.scene.selected')).not.toBeInTheDocument();

    fireEvent.click(sceneButtons[1]);
    expect(props.onSelectScene).toHaveBeenCalledExactlyOnceWith('scene-2');
  });

  it('shows the controlled duration total and whether it misses or matches the target', () => {
    const props = createProps();
    const view = render(<StoryboardPanel {...props} />);

    expect(screen.getByText('conversation.creativeStudio.storyboard.durationTotal:15:20')).toBeInTheDocument();
    expect(screen.getByText('conversation.creativeStudio.storyboard.durationMismatch')).toBeInTheDocument();

    view.rerender(
      <StoryboardPanel {...props} targetDurationSeconds={15} durationTotalSeconds={15} durationMatchesTarget />
    );
    expect(screen.getByText('conversation.creativeStudio.storyboard.durationMatches')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'conversation.creativeStudio.storyboard.fitToTarget:15' })).toBeNull();
  });

  it('offers one fit action only while the full cut mismatches', () => {
    const props = createProps();
    render(<StoryboardPanel {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'conversation.creativeStudio.storyboard.fitToTarget:20' }));

    expect(props.onFitToTarget).toHaveBeenCalledOnce();
  });

  it('disables fit for external authorization gates and explains locked shots', () => {
    const props = createProps({ fitDisabled: true, hasLockedScenes: true });
    render(<StoryboardPanel {...props} />);

    expect(
      screen.getByRole('button', { name: 'conversation.creativeStudio.storyboard.fitToTarget:20' })
    ).toBeDisabled();
    expect(screen.getByText('conversation.creativeStudio.storyboard.fitUnlockedOnly')).toBeInTheDocument();
  });

  it.each([
    [
      'route_unavailable',
      {
        status: 'unreachable',
        reason: 'route_unavailable',
        project: {} as never,
        lockedSceneIds: [],
        unavailableSceneIds: ['scene-1'],
      },
    ],
    [
      'no_adjustable_scenes',
      {
        status: 'unreachable',
        reason: 'no_adjustable_scenes',
        project: {} as never,
        lockedSceneIds: ['scene-1'],
        fixedTotalSeconds: 15,
      },
    ],
    [
      'target_out_of_bounds',
      {
        status: 'unreachable',
        reason: 'target_out_of_bounds',
        project: {} as never,
        lockedSceneIds: [],
        minimumTotalSeconds: 18,
        maximumTotalSeconds: 24,
      },
    ],
  ] as const)('shows actionable %s fit feedback while leaving the mismatch visible', (_reason, fitOutcome) => {
    const props = createProps({ fitOutcome: fitOutcome as StudioFitStoryboardOutcome });
    render(<StoryboardPanel {...props} />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      `conversation.creativeStudio.storyboard.fitUnreachable.${fitOutcome.reason}`
    );
    expect(screen.getByText('conversation.creativeStudio.storyboard.durationMismatch')).toBeInTheDocument();
  });

  it('keeps Add Scene enabled while project duration remains', () => {
    const props = createProps({
      remainingDurationSeconds: 5,
      suggestedExpandedTargetSeconds: 25,
      onIncreaseTargetDuration: vi.fn(),
    });
    render(<StoryboardPanel {...props} />);

    expect(screen.getByRole('button', { name: 'conversation.creativeStudio.storyboard.addScene' })).toBeEnabled();
    expect(screen.getByText('conversation.creativeStudio.storyboard.durationRemaining:5')).toBeInTheDocument();
  });

  it('requires an explicit target increase when the storyboard reaches its duration', () => {
    const props = createProps({
      durationTotalSeconds: 20,
      durationMatchesTarget: true,
      remainingDurationSeconds: 0,
      suggestedExpandedTargetSeconds: 25,
      canAddScene: false,
      onIncreaseTargetDuration: vi.fn(),
    });
    render(<StoryboardPanel {...props} />);

    expect(screen.getByRole('button', { name: 'conversation.creativeStudio.storyboard.addScene' })).toBeDisabled();
    expect(screen.getByText('conversation.creativeStudio.storyboard.increaseTarget:25')).toBeInTheDocument();
  });

  it('asks to shorten scenes when a 60-second storyboard cannot expand further', () => {
    const props = createProps({
      targetDurationSeconds: 60,
      durationTotalSeconds: 60,
      durationMatchesTarget: true,
      remainingDurationSeconds: 0,
      suggestedExpandedTargetSeconds: null,
      canAddScene: false,
      onIncreaseTargetDuration: vi.fn(),
    });
    render(<StoryboardPanel {...props} />);

    expect(screen.getByText('conversation.creativeStudio.storyboard.shortenBeforeAdding')).toBeInTheDocument();
  });

  it('prioritizes the scene limit over target expansion when 24 scenes already fill the target', () => {
    const fullStoryboard = Array.from({ length: 24 }, (_, index) =>
      scene(`scene-${index + 1}`, `Scene ${index + 1}`, 1)
    );
    const props = createProps({
      orderedScenes: fullStoryboard,
      selectedSceneId: 'scene-1',
      targetDurationSeconds: 24,
      durationTotalSeconds: 24,
      durationMatchesTarget: true,
      remainingDurationSeconds: 0,
      suggestedExpandedTargetSeconds: 29,
      canAddScene: false,
    });
    render(<StoryboardPanel {...props} />);

    expect(screen.queryByText('conversation.creativeStudio.storyboard.increaseTarget:29')).not.toBeInTheDocument();
    expect(screen.getByText('conversation.creativeStudio.storyboard.sceneLimit')).toBeInTheDocument();
  });

  it('disables add and blocks all ordering controls while a mutation is pending', () => {
    const props = createProps({ canAddScene: false, mutationPending: true });
    render(<StoryboardPanel {...props} />);

    expect(screen.getByRole('button', { name: 'conversation.creativeStudio.storyboard.addScene' })).toBeDisabled();
    for (const button of screen.getAllByRole('button', {
      name: /conversation\.creativeStudio\.storyboard\.moveUp: conversation\.creativeStudio\.scene\.accessibleName/,
    })) {
      expect(button).toBeDisabled();
    }
    for (const button of screen.getAllByRole('button', {
      name: /conversation\.creativeStudio\.storyboard\.moveDown: conversation\.creativeStudio\.scene\.accessibleName/,
    })) {
      expect(button).toBeDisabled();
    }
    for (const button of screen.getAllByRole('button', {
      name: /conversation\.creativeStudio\.storyboard\.dragScene: conversation\.creativeStudio\.scene\.accessibleName/,
    })) {
      expect(button).toBeDisabled();
    }
  });

  it('offers bounded move buttons and reports the requested accessible move', () => {
    const props = createProps();
    render(<StoryboardPanel {...props} />);

    const moveUpButtons = screen.getAllByRole('button', {
      name: /conversation\.creativeStudio\.storyboard\.moveUp: conversation\.creativeStudio\.scene\.accessibleName/,
    });
    const moveDownButtons = screen.getAllByRole('button', {
      name: /conversation\.creativeStudio\.storyboard\.moveDown: conversation\.creativeStudio\.scene\.accessibleName/,
    });
    expect(moveUpButtons[0]).toBeDisabled();
    expect(moveDownButtons[2]).toBeDisabled();

    fireEvent.click(moveUpButtons[1]);
    fireEvent.click(moveDownButtons[1]);
    expect(props.onMoveScene).toHaveBeenNthCalledWith(1, 'scene-2', 'up');
    expect(props.onMoveScene).toHaveBeenNthCalledWith(2, 'scene-2', 'down');
  });

  it('uses the exact dnd-kit array permutation for a drag reorder', () => {
    const props = createProps();
    render(<StoryboardPanel {...props} />);

    act(() => {
      dnd.onDragEnd?.({ active: { id: 'scene-1' }, over: { id: 'scene-3' } });
    });

    expect(props.onReorderScenes).toHaveBeenCalledExactlyOnceWith(['scene-2', 'scene-3', 'scene-1']);
  });

  it('confirms remove intent and preserves the canonical scene when the mutation reports an error', () => {
    const props = createProps();
    const view = render(<StoryboardPanel {...props} />);

    fireEvent.click(
      screen.getAllByRole('button', {
        name: /conversation\.creativeStudio\.storyboard\.removeScene: conversation\.creativeStudio\.scene\.accessibleName/,
      })[1]
    );
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('conversation.creativeStudio.storyboard.removeConfirmBody')).toBeInTheDocument();
    expect(within(dialog).getByText('conversation.creativeStudio.scene.accessibleName:2:Reveal')).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'conversation.creativeStudio.storyboard.removeScene: conversation.creativeStudio.scene.accessibleName:2:Reveal',
      })
    );
    expect(props.onRemoveScene).toHaveBeenCalledExactlyOnceWith('scene-2');

    view.rerender(
      <StoryboardPanel
        {...props}
        errorMessageKey='conversation.creativeStudio.errors.busy'
        statusMessageKey='conversation.creativeStudio.inspector.unsavedChanges'
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('conversation.creativeStudio.errors.busy');
    expect(screen.getByRole('status')).toHaveTextContent('conversation.creativeStudio.inspector.unsavedChanges');
    expect(
      screen.getByRole('button', {
        name: 'conversation.creativeStudio.scene.accessibleName:2:Reveal',
      })
    ).toBeInTheDocument();
  });

  it('only offers removal for draft scenes with no imported or generated media or generation history', () => {
    const removable = scene('scene-draft', 'Draft', 4);
    const withImportedReference = scene('scene-reference', 'Reference', 4, {
      referenceAssetId: 'asset-reference',
      assetIds: ['asset-reference'],
    });
    const withGeneratedAsset = scene('scene-asset', 'Asset', 4, { assetIds: ['asset-1'] });
    const withCompletedJob = scene('scene-history', 'History', 4, { jobIds: ['job-completed'] });
    const props = createProps({
      orderedScenes: [removable, withImportedReference, withGeneratedAsset, withCompletedJob],
      selectedSceneId: removable.id,
      sceneStatuses: {
        [removable.id]: 'ready',
        [withImportedReference.id]: 'ready',
        [withGeneratedAsset.id]: 'generated',
        [withCompletedJob.id]: 'needs_attention',
      },
    });
    render(<StoryboardPanel {...props} />);

    const removeButtons = screen.getAllByRole('button', {
      name: /conversation\.creativeStudio\.storyboard\.removeScene: conversation\.creativeStudio\.scene\.accessibleName/,
    });
    expect(removeButtons[0]).toBeEnabled();
    expect(removeButtons[1]).toBeDisabled();
    expect(removeButtons[2]).toBeDisabled();
    expect(removeButtons[3]).toBeDisabled();
    expect(
      screen.getAllByText('Scenes with imported or generated media, or generation history, cannot be removed.')
    ).toHaveLength(3);
  });

  it('keeps non-draft conflict recovery reachable when the storyboard has no scenes', () => {
    const props = createProps({
      orderedScenes: [],
      selectedSceneId: null,
      conflict: true,
      errorMessageKey: 'conversation.creativeStudio.errors.staleProject',
    });
    render(<StoryboardPanel {...props} />);

    expect(screen.getByText('conversation.creativeStudio.storyboard.noScenes')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('conversation.creativeStudio.errors.staleProject');
    fireEvent.click(screen.getByRole('button', { name: 'conversation.creativeStudio.storyboard.retry' }));
    fireEvent.click(screen.getByRole('button', { name: 'conversation.creativeStudio.storyboard.discard' }));

    expect(props.onRetryConflict).toHaveBeenCalledTimes(1);
    expect(props.onDiscardConflict).toHaveBeenCalledTimes(1);
  });
});
