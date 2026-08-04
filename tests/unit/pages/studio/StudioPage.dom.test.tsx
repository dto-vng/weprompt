/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  StudioAsset,
  StudioCommandResult,
  StudioFitStoryboardOutcome,
  StudioRendererJob,
  StudioRendererProject,
  StudioRouteCatalog,
  StudioRouteCatalogEntry,
  StudioScene,
} from '@/common/types/project/creativeStudioTypes';
import StudioPage from '@renderer/pages/studio/StudioPage';
import { useStudioProject } from '@renderer/pages/studio/hooks';

const bridge = vi.hoisted(() => ({
  getProject: { invoke: vi.fn() },
  listRoutes: { invoke: vi.fn() },
  updateModelSelection: { invoke: vi.fn() },
  updateScene: { invoke: vi.fn() },
  reorderScenes: { invoke: vi.fn() },
  proposeStoryboard: { invoke: vi.fn() },
  chooseAndImportReference: { invoke: vi.fn() },
  fitStoryboard: { invoke: vi.fn() },
  submitScenes: { invoke: vi.fn() },
  cancelJob: { invoke: vi.fn() },
  retryJob: { invoke: vi.fn() },
  retryDownload: { invoke: vi.fn() },
  selectAsset: { invoke: vi.fn() },
  listConnectionCandidates: { invoke: vi.fn() },
  listConnections: { invoke: vi.fn() },
  validateConnection: { invoke: vi.fn() },
  saveConnection: { invoke: vi.fn() },
  removeConnection: { invoke: vi.fn() },
  projectUpdated: { on: vi.fn() },
}));

vi.mock('@/common', () => ({ ipcBridge: { creativeStudio: bridge } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const ok = <T,>(data: T): StudioCommandResult<T> => ({ ok: true, data });
const failure = <T,>(): StudioCommandResult<T> => ({
  ok: false,
  error: { code: 'storage_error', messageKey: 'conversation.creativeStudio.errors.storage' },
});
const stale = <T,>(): StudioCommandResult<T> => ({
  ok: false,
  error: { code: 'stale_project', messageKey: 'conversation.creativeStudio.errors.staleProject' },
});

const project = (id = 'project-1', overrides: Partial<StudioRendererProject> = {}): StudioRendererProject => ({
  schemaVersion: 1,
  revision: 2,
  id,
  name: id === 'project-1' ? 'Launch film' : 'Second film',
  brief: 'A short launch video',
  aspectRatio: '16:9',
  targetDurationSeconds: 15,
  resolution: '720p',
  sceneOrder: [],
  scenes: {},
  assets: {},
  jobs: {},
  routing: {
    storyboard: null,
    image: {
      choiceId: 'choice_image',
      providerId: 'provider-image',
      model: 'image-model',
    },
    video: null,
  },
  createdAt: '2026-07-30T00:00:00.000Z',
  updatedAt: '2026-07-30T00:00:00.000Z',
  ...overrides,
});

const scene = (overrides: Partial<StudioScene> = {}): StudioScene => ({
  id: 'scene-1',
  title: 'Opening',
  purpose: 'Introduce the story',
  visualPrompt: 'A bright studio',
  narration: '',
  onScreenText: '',
  mediaKind: 'image',
  durationSeconds: 5,
  referenceAssetId: null,
  selectedAssetId: null,
  assetIds: [],
  jobIds: [],
  reviewState: 'draft',
  ...overrides,
});

const job = (id: string, overrides: Partial<StudioRendererJob> = {}): StudioRendererJob => ({
  id,
  projectId: 'project-1',
  sceneId: 'scene-1',
  status: 'succeeded',
  provider: {
    choiceId: 'choice_image',
    providerId: 'provider-image',
    model: 'image-model',
  },
  outputAssetIds: [],
  error: null,
  canRetryDownload: false,
  retryOfJobId: null,
  retryReason: null,
  duplicateChargeAcknowledged: false,
  duplicateChargeAcknowledgedAt: null,
  createdAt: '2026-07-30T00:00:00.000Z',
  updatedAt: '2026-07-30T00:00:00.000Z',
  ...overrides,
});

const asset = (id: string): StudioAsset => ({
  id,
  projectId: 'project-1',
  sceneId: 'scene-1',
  mediaKind: 'image',
  mimeType: 'image/png',
  managedAsset: { collection: 'assets', fileName: `${id}.png` },
  byteSize: 128,
  sha256: id.padEnd(64, 'a').slice(0, 64),
  createdAt: '2026-07-30T00:00:00.000Z',
});

const routes = (): StudioRouteCatalog => ({
  storyboard: {
    status: 'ready',
    selected: { providerId: 'provider-1', model: 'operations-model' },
    options: [
      {
        providerId: 'provider-1',
        providerName: 'Provider',
        model: 'operations-model',
        health: 'available',
      },
    ],
  },
  image: { status: 'setup_required', selected: null, selectedRoute: null, options: [] },
  video: { status: 'setup_required', selected: null, selectedRoute: null, options: [] },
  catalogVersion: 'catalog-1',
});

const imageRoute = (overrides: Partial<StudioRouteCatalogEntry> = {}): StudioRouteCatalogEntry => ({
  choiceId: 'choice_image',
  providerId: 'provider-image',
  providerName: 'Image provider',
  model: 'image-model',
  health: 'available',
  kind: 'image',
  constraints: {
    aspectRatios: ['16:9'],
    resolutions: ['720p'],
    minDurationSeconds: 1,
    maxDurationSeconds: 60,
    supportsFirstFrame: true,
    silentOutput: true,
  },
  ...overrides,
});

const routesWithImage = (route = imageRoute()): StudioRouteCatalog => ({
  ...routes(),
  image: {
    status: 'ready',
    selected: {
      choiceId: route.choiceId,
      providerId: route.providerId,
      model: route.model,
    },
    selectedRoute: route,
    options: [route],
  },
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const renderRoute = (path = '/studio/project-1') => {
  const router = createMemoryRouter([{ path: '/studio/:id', element: <StudioPage /> }], { initialEntries: [path] });
  return { router, view: render(<RouterProvider router={router} />) };
};

const findBatchActions = async (): Promise<{ headerAction: HTMLElement; lowerAction: HTMLElement }> => {
  const routingPanel = await screen.findByRole('region', { name: 'conversation.creativeStudio.routing.title' });
  const lowerAction = within(routingPanel).getByRole('button', {
    name: 'conversation.creativeStudio.review.generateReadyScenes',
  });
  const headerAction = screen
    .getAllByRole('button', { name: 'conversation.creativeStudio.review.generateReadyScenes' })
    .find((candidate) => !routingPanel.contains(candidate));
  if (headerAction === undefined) throw new Error('Studio header batch action is missing');
  return { headerAction, lowerAction };
};

const ProjectHookHarness: React.FC = () => {
  const { project: currentProject, refetch } = useStudioProject('project-1');

  return (
    <>
      <span>{currentProject?.name}</span>
      <button type='button' onClick={() => void refetch()}>
        Refetch project
      </button>
    </>
  );
};

describe('StudioPage and useStudioProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('11111111-1111-4111-8111-111111111111');
    bridge.getProject.invoke.mockResolvedValue(ok(project()));
    bridge.listRoutes.invoke.mockResolvedValue(ok(routes()));
    bridge.updateModelSelection.invoke.mockResolvedValue(ok(project()));
    bridge.updateScene.invoke.mockImplementation(async () => ok(project()));
    bridge.reorderScenes.invoke.mockImplementation(async () => ok(project()));
    bridge.proposeStoryboard.invoke.mockImplementation(async () => ok(project()));
    bridge.chooseAndImportReference.invoke.mockResolvedValue(ok({ status: 'cancelled' }));
    bridge.fitStoryboard.invoke.mockResolvedValue(
      ok<StudioFitStoryboardOutcome>({
        status: 'already_matches',
        project: project(),
        changedSceneIds: [],
        lockedSceneIds: [],
      })
    );
    bridge.submitScenes.invoke.mockResolvedValue(ok([]));
    bridge.cancelJob.invoke.mockResolvedValue(failure());
    bridge.retryJob.invoke.mockResolvedValue(failure());
    bridge.retryDownload.invoke.mockResolvedValue(failure());
    bridge.selectAsset.invoke.mockResolvedValue(failure());
    bridge.listConnectionCandidates.invoke.mockResolvedValue(ok([]));
    bridge.listConnections.invoke.mockResolvedValue(ok([]));
    bridge.validateConnection.invoke.mockResolvedValue(failure());
    bridge.saveConnection.invoke.mockResolvedValue(failure());
    bridge.removeConnection.invoke.mockResolvedValue(failure());
    bridge.projectUpdated.on.mockReturnValue(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a loading shell while the canonical project is being fetched', () => {
    bridge.getProject.invoke.mockReturnValue(new Promise(() => {}));
    renderRoute();

    expect(screen.getByText('conversation.creativeStudio.project.loading')).toBeInTheDocument();
  });

  it('renders the durable project shell after a canonical result', async () => {
    renderRoute();

    expect(await screen.findByRole('heading', { level: 1, name: 'Launch film' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'conversation.creativeStudio.draft.action' })).toBeInTheDocument();
  });

  it('composes the storyboard-first workspace from the canonical project', async () => {
    const opening = scene();
    bridge.getProject.invoke.mockResolvedValue(
      ok(
        project('project-1', {
          sceneOrder: [opening.id],
          scenes: { [opening.id]: opening },
        })
      )
    );

    renderRoute();

    expect(await screen.findByText('conversation.creativeStudio.storyboard.title')).toBeInTheDocument();
    expect(screen.getByText('conversation.creativeStudio.preview.noAssetTitle')).toBeInTheDocument();
    expect(screen.getByText('conversation.creativeStudio.inspector.title')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'conversation.creativeStudio.draft.redraftAction' })).toBeInTheDocument();
    await waitFor(() => expect(bridge.listRoutes.invoke).toHaveBeenCalledWith({ projectId: 'project-1' }));
    expect(
      screen.queryByRole('button', { name: 'conversation.creativeStudio.routing.connectProvider' })
    ).not.toBeInTheDocument();
    expect(bridge.listConnectionCandidates.invoke).not.toHaveBeenCalled();
    expect(bridge.listConnections.invoke).not.toHaveBeenCalled();
    expect(bridge.saveConnection.invoke).not.toHaveBeenCalled();
    expect(bridge.removeConnection.invoke).not.toHaveBeenCalled();
  });

  it('keeps manual storyboard editing available when Storyboard setup is required', async () => {
    bridge.listRoutes.invoke.mockResolvedValue(
      ok({
        ...routes(),
        storyboard: { status: 'setup_required', selected: null, options: [] },
      })
    );

    renderRoute();

    expect(await screen.findByRole('button', { name: 'conversation.creativeStudio.draft.action' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'conversation.creativeStudio.storyboard.addScene' })).toBeEnabled();
  });

  it.each([
    {
      setupState: 'full',
      catalog: {
        storyboard: { status: 'setup_required' as const, selected: null, options: [] },
        image: { status: 'setup_required' as const, selected: null, options: [] },
        video: { status: 'setup_required' as const, selected: null, options: [] },
        catalogVersion: 'catalog-full-setup',
      },
    },
    {
      setupState: 'partial',
      catalog: routesWithImage(),
    },
  ])('shows exactly one whole-screen Settings action for $setupState setup requirements', async ({ catalog }) => {
    bridge.listRoutes.invoke.mockResolvedValue(ok(catalog));
    renderRoute();

    await screen.findByText('conversation.creativeStudio.models.setupTitle');
    const routingPanel = await screen.findByRole('region', { name: 'conversation.creativeStudio.routing.title' });
    expect(screen.getAllByRole('button', { name: 'conversation.creativeStudio.models.openSettings' })).toHaveLength(1);
    expect(routingPanel).toHaveTextContent('conversation.creativeStudio.routing.missingRoute');
  });

  it('imports a first frame through the native managed-asset command and refetches canonical state', async () => {
    const opening = scene();
    const initial = project('project-1', {
      sceneOrder: [opening.id],
      scenes: { [opening.id]: opening },
    });
    const refreshed = project('project-1', {
      revision: 3,
      sceneOrder: [opening.id],
      scenes: {
        [opening.id]: {
          ...opening,
          referenceAssetId: 'asset-reference',
          assetIds: ['asset-reference'],
        },
      },
      assets: {
        'asset-reference': {
          id: 'asset-reference',
          projectId: 'project-1',
          sceneId: 'scene-1',
          mediaKind: 'image',
          mimeType: 'image/png',
          managedAsset: { collection: 'imports', fileName: 'asset-reference.png' },
          byteSize: 128,
          sha256: 'a'.repeat(64),
          createdAt: '2026-07-30T00:00:00.000Z',
        },
      },
    });
    bridge.getProject.invoke
      .mockResolvedValueOnce(ok(initial))
      .mockResolvedValueOnce(ok(initial))
      .mockResolvedValueOnce(ok(initial))
      .mockResolvedValue(ok(refreshed));
    bridge.chooseAndImportReference.invoke.mockResolvedValueOnce(
      ok({ status: 'imported', asset: refreshed.assets['asset-reference'] })
    );
    renderRoute();

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'conversation.creativeStudio.preview.importReference',
      })
    );

    await waitFor(() =>
      expect(bridge.chooseAndImportReference.invoke).toHaveBeenCalledExactlyOnceWith({
        projectId: 'project-1',
        sceneId: 'scene-1',
        expectedRevision: 2,
      })
    );
    expect(JSON.stringify(bridge.chooseAndImportReference.invoke.mock.calls[0]?.[0])).not.toMatch(
      /path|data:|base64|https?:/i
    );
    await waitFor(() => expect(bridge.getProject.invoke).toHaveBeenCalledTimes(4));
    expect(
      screen.getByRole('img', {
        name: 'conversation.creativeStudio.preview.importReference',
      })
    ).toHaveAttribute('src', 'weprompt-studio://asset/project-1/asset-reference');
  });

  it('selects a generated variation with IDs only and adopts the refetched canonical project', async () => {
    const first = asset('asset-1');
    const second = asset('asset-2');
    const opening = scene({
      selectedAssetId: first.id,
      assetIds: [first.id, second.id],
      reviewState: 'complete',
    });
    const initial = project('project-1', {
      sceneOrder: [opening.id],
      scenes: { [opening.id]: opening },
      assets: { [first.id]: first, [second.id]: second },
    });
    const refreshed = project('project-1', {
      revision: 3,
      sceneOrder: [opening.id],
      scenes: {
        [opening.id]: {
          ...opening,
          selectedAssetId: second.id,
        },
      },
      assets: { [first.id]: first, [second.id]: second },
    });
    bridge.getProject.invoke
      .mockResolvedValueOnce(ok(initial))
      .mockResolvedValueOnce(ok(initial))
      .mockResolvedValue(ok(refreshed));
    bridge.selectAsset.invoke.mockResolvedValueOnce(ok(refreshed));
    renderRoute();

    const variations = await screen.findAllByRole('button', {
      name: /conversation\.creativeStudio\.preview\.selectVersion/,
    });
    fireEvent.click(variations[1]!);

    await waitFor(() =>
      expect(bridge.selectAsset.invoke).toHaveBeenCalledExactlyOnceWith({
        projectId: 'project-1',
        sceneId: 'scene-1',
        assetId: 'asset-2',
        expectedRevision: 2,
      })
    );
    expect(JSON.stringify(bridge.selectAsset.invoke.mock.calls[0]?.[0])).not.toMatch(/path|data:|base64|https?:/i);
    await waitFor(() => expect(bridge.getProject.invoke).toHaveBeenCalledTimes(3));
  });

  it('does not infer a video poster when more than one succeeded job claims the selected primary asset', async () => {
    const videoAsset: StudioAsset = {
      ...asset('video-1'),
      mediaKind: 'video',
      mimeType: 'video/mp4',
    };
    const firstPoster: StudioAsset = {
      ...asset('poster-1'),
      managedAsset: { collection: 'thumbnails', fileName: 'poster-1.png' },
    };
    const secondPoster: StudioAsset = {
      ...asset('poster-2'),
      managedAsset: { collection: 'thumbnails', fileName: 'poster-2.png' },
    };
    const firstJob = job('job-1', {
      provider: {
        choiceId: 'choice_video',
        providerId: 'provider-video',
        model: 'video-model',
      },
      outputAssetIds: [videoAsset.id, firstPoster.id],
    });
    const secondJob = job('job-2', {
      provider: firstJob.provider,
      outputAssetIds: [videoAsset.id, secondPoster.id],
    });
    const opening = scene({
      mediaKind: 'video',
      selectedAssetId: videoAsset.id,
      assetIds: [videoAsset.id, firstPoster.id, secondPoster.id],
      jobIds: [firstJob.id, secondJob.id],
      reviewState: 'complete',
    });
    bridge.getProject.invoke.mockResolvedValue(
      ok(
        project('project-1', {
          sceneOrder: [opening.id],
          scenes: { [opening.id]: opening },
          assets: {
            [videoAsset.id]: videoAsset,
            [firstPoster.id]: firstPoster,
            [secondPoster.id]: secondPoster,
          },
          jobs: {
            [firstJob.id]: firstJob,
            [secondJob.id]: secondJob,
          },
        })
      )
    );
    renderRoute();

    const video = await screen.findByLabelText('conversation.creativeStudio.preview.videoLabel');
    expect(video).not.toHaveAttribute('poster');
    expect(screen.getByText('conversation.creativeStudio.preview.posterUnavailable')).toBeInTheDocument();
  });

  it('submits one scene only after explicit review without applying the batch duration gate', async () => {
    const opening = scene({ durationSeconds: 5 });
    bridge.getProject.invoke.mockResolvedValue(
      ok(
        project('project-1', {
          targetDurationSeconds: 15,
          sceneOrder: [opening.id],
          scenes: { [opening.id]: opening },
        })
      )
    );
    bridge.listRoutes.invoke.mockResolvedValue(ok(routesWithImage()));
    renderRoute();

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'conversation.creativeStudio.review.generateScene',
      })
    );

    expect(bridge.submitScenes.invoke).not.toHaveBeenCalled();
    expect(await screen.findByRole('dialog')).toHaveTextContent('conversation.creativeStudio.review.title');

    fireEvent.click(
      screen.getByRole('button', {
        name: 'conversation.creativeStudio.review.confirm',
      })
    );

    await waitFor(() =>
      expect(bridge.submitScenes.invoke).toHaveBeenCalledExactlyOnceWith({
        projectId: 'project-1',
        mode: 'single',
        sceneIds: ['scene-1'],
        expectedRevision: 2,
        routes: [
          {
            sceneId: 'scene-1',
            choiceId: 'choice_image',
            kind: 'image',
          },
        ],
        catalogVersion: 'catalog-1',
      })
    );
  });

  it.each([
    {
      state: 'generated',
      selectedAssetId: 'asset-output',
    },
    {
      state: 'needs selection',
      selectedAssetId: null,
    },
  ])('blocks a blank-prompt $state scene from single-scene review', async ({ selectedAssetId }) => {
    const output = asset('asset-output');
    const opening = scene({
      visualPrompt: '   ',
      selectedAssetId,
      assetIds: [output.id],
      durationSeconds: 5,
    });
    bridge.getProject.invoke.mockResolvedValue(
      ok(
        project('project-1', {
          targetDurationSeconds: 5,
          sceneOrder: [opening.id],
          scenes: { [opening.id]: opening },
          assets: { [output.id]: output },
        })
      )
    );
    bridge.listRoutes.invoke.mockResolvedValue(ok(routesWithImage()));
    renderRoute();

    const action = await screen.findByRole('button', {
      name:
        selectedAssetId === null
          ? 'conversation.creativeStudio.review.generateScene'
          : 'conversation.creativeStudio.review.regenerateScene',
    });
    expect(action).toBeDisabled();
    fireEvent.click(action);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(bridge.submitScenes.invoke).not.toHaveBeenCalled();
  });

  it('allows explicit regeneration with a nonblank prompt independently of the batch duration total', async () => {
    const output = asset('asset-output');
    const opening = scene({ selectedAssetId: output.id, assetIds: [output.id], durationSeconds: 5 });
    bridge.getProject.invoke.mockResolvedValue(
      ok(
        project('project-1', {
          targetDurationSeconds: 15,
          sceneOrder: [opening.id],
          scenes: { [opening.id]: opening },
          assets: { [output.id]: output },
        })
      )
    );
    bridge.listRoutes.invoke.mockResolvedValue(ok(routesWithImage()));
    renderRoute();

    const regenerate = await screen.findByRole('button', {
      name: 'conversation.creativeStudio.review.regenerateScene',
    });
    expect(regenerate).toBeEnabled();
    fireEvent.click(regenerate);
    expect(await screen.findByRole('dialog')).toHaveTextContent('conversation.creativeStudio.review.title');
    expect(bridge.submitScenes.invoke).not.toHaveBeenCalled();
  });

  it('opens the existing paid review from the preview CTA without submitting before confirmation', async () => {
    const opening = scene({ durationSeconds: 5 });
    bridge.getProject.invoke.mockResolvedValue(
      ok(
        project('project-1', {
          targetDurationSeconds: 15,
          sceneOrder: [opening.id],
          scenes: { [opening.id]: opening },
        })
      )
    );
    bridge.listRoutes.invoke.mockResolvedValue(ok(routesWithImage()));
    renderRoute();

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'conversation.creativeStudio.preview.generateThisScene',
      })
    );

    expect(await screen.findByRole('dialog')).toHaveTextContent('conversation.creativeStudio.review.title');
    expect(bridge.submitScenes.invoke).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'conversation.creativeStudio.review.confirm' }));
    await waitFor(() => expect(bridge.submitScenes.invoke).toHaveBeenCalledTimes(1));
  });

  it('keeps both batch entry points and their handler closed until storyboard timing exactly matches the target', async () => {
    const opening = scene({ durationSeconds: 5 });
    bridge.getProject.invoke.mockResolvedValue(
      ok(
        project('project-1', {
          targetDurationSeconds: 15,
          sceneOrder: [opening.id],
          scenes: { [opening.id]: opening },
        })
      )
    );
    bridge.listRoutes.invoke.mockResolvedValue(ok(routesWithImage()));
    renderRoute();

    const { headerAction, lowerAction } = await findBatchActions();
    const routingPanel = screen.getByRole('region', { name: 'conversation.creativeStudio.routing.title' });
    expect(headerAction).toBeDisabled();
    expect(lowerAction).toBeDisabled();
    expect(headerAction.closest('header')).toHaveTextContent(
      'conversation.creativeStudio.review.disabledDurationMismatch'
    );
    expect(within(routingPanel).getByText('conversation.creativeStudio.review.disabledDurationMismatch')).toBeVisible();
    fireEvent.click(headerAction);
    fireEvent.click(lowerAction);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(bridge.submitScenes.invoke).not.toHaveBeenCalled();
  });

  it('fits 18 seconds to 15 with one atomic command, no scene updates, and opens both batch gates', async () => {
    const opening = scene({ id: 'scene-1', durationSeconds: 6 });
    const reveal = scene({ id: 'scene-2', title: 'Reveal', durationSeconds: 6 });
    const closing = scene({ id: 'scene-3', title: 'Closing', durationSeconds: 6 });
    const initial = project('project-1', {
      targetDurationSeconds: 15,
      sceneOrder: [opening.id, reveal.id, closing.id],
      scenes: { [opening.id]: opening, [reveal.id]: reveal, [closing.id]: closing },
    });
    const fitted = project('project-1', {
      revision: 3,
      targetDurationSeconds: 15,
      sceneOrder: [opening.id, reveal.id, closing.id],
      scenes: {
        [opening.id]: { ...opening, durationSeconds: 5 },
        [reveal.id]: { ...reveal, durationSeconds: 5 },
        [closing.id]: { ...closing, durationSeconds: 5 },
      },
    });
    bridge.getProject.invoke.mockResolvedValue(ok(initial));
    bridge.listRoutes.invoke.mockResolvedValue(ok({ ...routesWithImage(), catalogVersion: '0123456789abcdef' }));
    bridge.fitStoryboard.invoke.mockResolvedValueOnce(
      ok<StudioFitStoryboardOutcome>({
        status: 'applied',
        project: fitted,
        changedSceneIds: ['scene-1', 'scene-2', 'scene-3'],
        lockedSceneIds: [],
      })
    );
    renderRoute();

    fireEvent.click(await screen.findByRole('button', { name: 'conversation.creativeStudio.storyboard.fitToTarget' }));

    await waitFor(() =>
      expect(bridge.fitStoryboard.invoke).toHaveBeenCalledExactlyOnceWith({
        projectId: 'project-1',
        expectedRevision: 2,
        catalogVersion: '0123456789abcdef',
      })
    );
    expect(bridge.updateScene.invoke).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'conversation.creativeStudio.storyboard.fitToTarget' })).toBeNull()
    );
    const { headerAction, lowerAction } = await findBatchActions();
    expect(headerAction).toBeEnabled();
    expect(lowerAction).toBeEnabled();
  });

  it('keeps the batch gate closed and explains an unreachable fit', async () => {
    const opening = scene({ durationSeconds: 18 });
    const initial = project('project-1', {
      targetDurationSeconds: 15,
      sceneOrder: [opening.id],
      scenes: { [opening.id]: opening },
    });
    bridge.getProject.invoke.mockResolvedValue(ok(initial));
    bridge.listRoutes.invoke.mockResolvedValue(ok({ ...routesWithImage(), catalogVersion: '0123456789abcdef' }));
    bridge.fitStoryboard.invoke.mockResolvedValueOnce(
      ok<StudioFitStoryboardOutcome>({
        status: 'unreachable',
        reason: 'target_out_of_bounds',
        project: initial,
        lockedSceneIds: [],
        minimumTotalSeconds: 1,
        maximumTotalSeconds: 12,
      })
    );
    renderRoute();

    fireEvent.click(await screen.findByRole('button', { name: 'conversation.creativeStudio.storyboard.fitToTarget' }));

    expect(
      await screen.findByText('conversation.creativeStudio.storyboard.fitUnreachable.target_out_of_bounds')
    ).toBeInTheDocument();
    const { headerAction, lowerAction } = await findBatchActions();
    expect(headerAction).toBeDisabled();
    expect(lowerAction).toBeDisabled();
  });

  it('hides unreachable fit feedback after the route catalog version changes', async () => {
    const opening = scene({ durationSeconds: 18 });
    const initial = project('project-1', {
      targetDurationSeconds: 15,
      sceneOrder: [opening.id],
      scenes: { [opening.id]: opening },
    });
    bridge.getProject.invoke.mockResolvedValue(ok(initial));
    bridge.listRoutes.invoke
      .mockResolvedValueOnce(ok({ ...routesWithImage(), catalogVersion: 'catalog-1' }))
      .mockResolvedValue(ok({ ...routesWithImage(), catalogVersion: 'catalog-2' }));
    bridge.fitStoryboard.invoke.mockResolvedValueOnce(
      ok<StudioFitStoryboardOutcome>({
        status: 'unreachable',
        reason: 'target_out_of_bounds',
        project: initial,
        lockedSceneIds: [],
        minimumTotalSeconds: 1,
        maximumTotalSeconds: 12,
      })
    );
    renderRoute();

    fireEvent.click(await screen.findByRole('button', { name: 'conversation.creativeStudio.storyboard.fitToTarget' }));
    expect(
      await screen.findByText('conversation.creativeStudio.storyboard.fitUnreachable.target_out_of_bounds')
    ).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'conversation.creativeStudio.models.refresh' })[0]!);

    await waitFor(() => expect(bridge.listRoutes.invoke).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        screen.queryByText('conversation.creativeStudio.storyboard.fitUnreachable.target_out_of_bounds')
      ).not.toBeInTheDocument()
    );
  });

  it('keeps fit disabled for the entire reference import mutation', async () => {
    const opening = scene({ durationSeconds: 10 });
    const initial = project('project-1', {
      targetDurationSeconds: 15,
      sceneOrder: [opening.id],
      scenes: { [opening.id]: opening },
    });
    let resolveImport!: (result: StudioCommandResult<{ status: 'cancelled' }>) => void;
    bridge.getProject.invoke.mockResolvedValue(ok(initial));
    bridge.listRoutes.invoke.mockResolvedValue(ok({ ...routesWithImage(), catalogVersion: '0123456789abcdef' }));
    bridge.chooseAndImportReference.invoke.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveImport = resolve;
      })
    );
    renderRoute();
    const fit = await screen.findByRole('button', { name: 'conversation.creativeStudio.storyboard.fitToTarget' });

    fireEvent.click(
      screen.getByRole('button', {
        name: 'conversation.creativeStudio.preview.importReference',
      })
    );
    await waitFor(() => expect(bridge.chooseAndImportReference.invoke).toHaveBeenCalledOnce());
    expect(fit).toBeDisabled();

    resolveImport(ok({ status: 'cancelled' }));
    await waitFor(() => expect(fit).toBeEnabled());
  });

  it('keeps fit disabled for the entire model-selection mutation', async () => {
    const opening = scene({ durationSeconds: 10 });
    const initial = project('project-1', {
      targetDurationSeconds: 15,
      sceneOrder: [opening.id],
      scenes: { [opening.id]: opening },
    });
    const alternate = imageRoute({
      choiceId: 'choice_image_alternate',
      providerId: 'provider-image-alternate',
      providerName: 'Alternate image provider',
      model: 'alternate-image-model',
    });
    const catalog = routesWithImage();
    catalog.catalogVersion = '0123456789abcdef';
    catalog.image.options.push(alternate);
    const selection = deferred<StudioCommandResult<StudioRendererProject>>();
    bridge.getProject.invoke.mockResolvedValue(ok(initial));
    bridge.listRoutes.invoke.mockResolvedValue(ok(catalog));
    bridge.updateModelSelection.invoke.mockReturnValueOnce(selection.promise);
    renderRoute();
    const fit = await screen.findByRole('button', { name: 'conversation.creativeStudio.storyboard.fitToTarget' });

    fireEvent.click(screen.getByLabelText('conversation.creativeStudio.models.image'));
    fireEvent.click(await screen.findByText(/alternate-image-model/));
    await waitFor(() => expect(bridge.updateModelSelection.invoke).toHaveBeenCalledOnce());
    expect(fit).toBeDisabled();

    selection.resolve(ok(project('project-1', { revision: 3 })));
    await waitFor(() => expect(fit).toBeEnabled());
  });

  it('opens a canonical batch review from the header and submits every exact scene route only after confirmation', async () => {
    const opening = scene({ id: 'scene-1', durationSeconds: 5 });
    const closing = scene({ id: 'scene-2', title: 'Closing', durationSeconds: 10 });
    bridge.getProject.invoke.mockResolvedValue(
      ok(
        project('project-1', {
          targetDurationSeconds: 15,
          sceneOrder: [opening.id, closing.id],
          scenes: { [opening.id]: opening, [closing.id]: closing },
        })
      )
    );
    bridge.listRoutes.invoke.mockResolvedValue(ok(routesWithImage()));
    renderRoute();

    const { headerAction } = await findBatchActions();
    fireEvent.click(headerAction);

    expect(bridge.submitScenes.invoke).not.toHaveBeenCalled();
    expect(await screen.findByRole('dialog')).toHaveTextContent('conversation.creativeStudio.review.sceneCount');

    fireEvent.click(
      screen.getByRole('button', {
        name: 'conversation.creativeStudio.review.confirm',
      })
    );

    await waitFor(() =>
      expect(bridge.submitScenes.invoke).toHaveBeenCalledExactlyOnceWith({
        projectId: 'project-1',
        mode: 'batch',
        sceneIds: ['scene-1', 'scene-2'],
        expectedRevision: 2,
        routes: [
          {
            sceneId: 'scene-1',
            choiceId: 'choice_image',
            kind: 'image',
          },
          {
            sceneId: 'scene-2',
            choiceId: 'choice_image',
            kind: 'image',
          },
        ],
        catalogVersion: 'catalog-1',
      })
    );
  });

  it('opens the header review with a catalog that becomes ready during refresh', async () => {
    const opening = scene({ durationSeconds: 5 });
    bridge.getProject.invoke.mockResolvedValue(
      ok(
        project('project-1', {
          targetDurationSeconds: 5,
          sceneOrder: [opening.id],
          scenes: { [opening.id]: opening },
        })
      )
    );
    bridge.listRoutes.invoke.mockResolvedValueOnce(failure()).mockResolvedValue(ok(routesWithImage()));
    renderRoute();

    await screen.findAllByText('conversation.creativeStudio.errors.storage');
    await act(async () => {});
    const { headerAction } = await findBatchActions();
    fireEvent.click(headerAction);

    expect(await screen.findByRole('dialog')).toHaveTextContent('conversation.creativeStudio.review.title');
    expect(screen.queryByText('conversation.creativeStudio.models.loading')).not.toBeInTheDocument();
  });

  it('removes the stale preview review action while the route catalog refreshes', async () => {
    const opening = scene({ durationSeconds: 5 });
    const refresh = deferred<StudioCommandResult<StudioRouteCatalog>>();
    bridge.getProject.invoke.mockResolvedValue(
      ok(
        project('project-1', {
          targetDurationSeconds: 5,
          sceneOrder: [opening.id],
          scenes: { [opening.id]: opening },
        })
      )
    );
    bridge.listRoutes.invoke.mockResolvedValueOnce(ok(routesWithImage())).mockReturnValueOnce(refresh.promise);
    renderRoute();

    const preview = await screen.findByRole('region', { name: 'conversation.creativeStudio.preview.title' });
    expect(
      within(preview).getByRole('button', { name: 'conversation.creativeStudio.preview.generateThisScene' })
    ).toBeEnabled();
    const modelBar = screen.getByRole('region', { name: 'conversation.creativeStudio.models.title' });
    fireEvent.click(
      within(modelBar).getByRole('button', {
        name: 'conversation.creativeStudio.models.refresh',
      })
    );

    expect(within(preview).getByText('conversation.creativeStudio.models.loading')).toBeVisible();
    expect(
      within(preview).queryByRole('button', { name: 'conversation.creativeStudio.preview.generateThisScene' })
    ).not.toBeInTheDocument();

    await act(async () => refresh.resolve(ok(routesWithImage())));
    expect(
      await within(preview).findByRole('button', { name: 'conversation.creativeStudio.preview.generateThisScene' })
    ).toBeEnabled();
  });

  it('does not build a paid review when route constraints reject a single scene', async () => {
    const opening = scene({ durationSeconds: 61 });
    bridge.getProject.invoke.mockResolvedValue(
      ok(
        project('project-1', {
          targetDurationSeconds: 61,
          sceneOrder: [opening.id],
          scenes: { [opening.id]: opening },
        })
      )
    );
    bridge.listRoutes.invoke.mockResolvedValue(ok(routesWithImage()));
    renderRoute();

    const generate = await screen.findByRole('button', {
      name: 'conversation.creativeStudio.review.generateScene',
    });
    expect(generate).toBeDisabled();
    fireEvent.click(generate);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(bridge.submitScenes.invoke).not.toHaveBeenCalled();
  });

  it('requires the duplicate-charge acknowledgement path before generating an unresolved scene again', async () => {
    const unknownJob = job('job-unknown', {
      status: 'needs_attention',
      error: {
        code: 'submission_unknown',
        messageKey: 'conversation.creativeStudio.jobs.errors.submissionUnknown',
      },
    });
    const opening = scene({
      durationSeconds: 5,
      jobIds: [unknownJob.id],
    });
    bridge.getProject.invoke.mockResolvedValue(
      ok(
        project('project-1', {
          targetDurationSeconds: 5,
          sceneOrder: [opening.id],
          scenes: { [opening.id]: opening },
          jobs: { [unknownJob.id]: unknownJob },
        })
      )
    );
    bridge.listRoutes.invoke.mockResolvedValue(ok(routesWithImage()));
    renderRoute();

    expect(
      await screen.findByRole('button', {
        name: 'conversation.creativeStudio.review.generateScene',
      })
    ).toBeDisabled();
    const batchButtons = screen.getAllByRole('button', {
      name: 'conversation.creativeStudio.review.generateReadyScenes',
    });
    expect(batchButtons).toHaveLength(2);
    batchButtons.forEach((button) => expect(button).toBeDisabled());
    expect(
      screen.getByRole('button', {
        name: 'conversation.creativeStudio.jobs.retry',
      })
    ).toBeEnabled();
    expect(bridge.submitScenes.invoke).not.toHaveBeenCalled();
  });

  it('keeps every needs-attention scene out of single and batch paid generation', async () => {
    const attentionJob = job('job-attention', {
      status: 'needs_attention',
      error: {
        code: 'provider_unavailable',
        messageKey: 'conversation.creativeStudio.jobs.errors.providerUnavailable',
      },
    });
    const opening = scene({
      durationSeconds: 5,
      jobIds: [attentionJob.id],
      reviewState: 'ready',
    });
    bridge.getProject.invoke.mockResolvedValue(
      ok(
        project('project-1', {
          targetDurationSeconds: 5,
          sceneOrder: [opening.id],
          scenes: { [opening.id]: opening },
          jobs: { [attentionJob.id]: attentionJob },
        })
      )
    );
    bridge.listRoutes.invoke.mockResolvedValue(ok(routesWithImage()));
    renderRoute();

    expect(
      await screen.findByRole('button', {
        name: 'conversation.creativeStudio.review.generateScene',
      })
    ).toBeDisabled();
    screen
      .getAllByRole('button', {
        name: 'conversation.creativeStudio.review.generateReadyScenes',
      })
      .forEach((button) => expect(button).toBeDisabled());
    expect(bridge.submitScenes.invoke).not.toHaveBeenCalled();
  });

  it('refreshes the single project catalog owner once when canonical routing changes', async () => {
    let onUpdate: ((event: { projectId: string }) => void) | undefined;
    bridge.projectUpdated.on.mockImplementation((listener: (event: { projectId: string }) => void) => {
      onUpdate = listener;
      return () => {};
    });
    const opening = scene({ durationSeconds: 5 });
    const initial = project('project-1', {
      sceneOrder: [opening.id],
      scenes: { [opening.id]: opening },
      routing: { storyboard: null, image: null, video: null },
    });
    const sameRouting = project('project-1', {
      revision: 3,
      sceneOrder: [opening.id],
      scenes: { [opening.id]: opening },
      routing: { storyboard: null, image: null, video: null },
    });
    const routed = project('project-1', {
      revision: 4,
      sceneOrder: [opening.id],
      scenes: { [opening.id]: opening },
      routing: {
        storyboard: null,
        image: {
          choiceId: 'choice_image',
          providerId: 'provider-image',
          model: 'image-model',
        },
        video: null,
      },
    });
    bridge.getProject.invoke
      .mockResolvedValueOnce(ok(initial))
      .mockResolvedValueOnce(ok(initial))
      .mockResolvedValueOnce(ok(sameRouting))
      .mockResolvedValue(ok(routed));
    bridge.listRoutes.invoke.mockResolvedValue(ok(routesWithImage()));
    renderRoute();

    await screen.findByRole('heading', { level: 1, name: 'Launch film' });
    await waitFor(() => expect(bridge.listRoutes.invoke).toHaveBeenCalledTimes(1));
    const initialRouteRequestCount = bridge.listRoutes.invoke.mock.calls.length;

    await act(async () => onUpdate?.({ projectId: 'project-1' }));
    await waitFor(() => expect(bridge.getProject.invoke).toHaveBeenCalledTimes(3));
    expect(bridge.listRoutes.invoke).toHaveBeenCalledTimes(initialRouteRequestCount);

    await act(async () => onUpdate?.({ projectId: 'project-1' }));
    await waitFor(() => expect(bridge.getProject.invoke).toHaveBeenCalledTimes(4));
    await waitFor(() => expect(bridge.listRoutes.invoke).toHaveBeenCalledTimes(initialRouteRequestCount + 1));
    await act(async () => {});
    expect(bridge.listRoutes.invoke).toHaveBeenCalledTimes(initialRouteRequestCount + 1);
  });

  it('refreshes a paid review after an external revision and requires a second confirmation', async () => {
    let onUpdate: ((event: { projectId: string }) => void) | undefined;
    bridge.projectUpdated.on.mockImplementation((listener: (event: { projectId: string }) => void) => {
      onUpdate = listener;
      return () => {};
    });
    const opening = scene({ durationSeconds: 5 });
    const revisedOpening = scene({ title: 'Revised opening', durationSeconds: 6 });
    const initial = project('project-1', {
      targetDurationSeconds: 5,
      sceneOrder: [opening.id],
      scenes: { [opening.id]: opening },
    });
    const revised = project('project-1', {
      revision: 3,
      targetDurationSeconds: 6,
      sceneOrder: [revisedOpening.id],
      scenes: { [revisedOpening.id]: revisedOpening },
      routing: {
        storyboard: null,
        image: {
          choiceId: 'choice_image_new',
          providerId: 'provider-image-new',
          model: 'image-model-new',
        },
        video: null,
      },
    });
    const revisedRoute = imageRoute({
      choiceId: 'choice_image_new',
      providerId: 'provider-image-new',
      providerName: 'New image provider',
      model: 'image-model-new',
    });
    bridge.getProject.invoke
      .mockResolvedValueOnce(ok(initial))
      .mockResolvedValueOnce(ok(initial))
      .mockResolvedValue(ok(revised));
    bridge.listRoutes.invoke.mockResolvedValueOnce(ok(routesWithImage())).mockResolvedValue(
      ok({
        ...routesWithImage(revisedRoute),
        catalogVersion: 'catalog-2',
      })
    );
    renderRoute();

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'conversation.creativeStudio.review.generateScene',
      })
    );
    expect(await screen.findByRole('dialog')).toHaveTextContent('Opening');

    await act(async () => onUpdate?.({ projectId: 'project-1' }));
    expect((await screen.findAllByText('Revised opening')).length).toBeGreaterThan(0);
    const routeRequestsBeforeConfirmation = bridge.listRoutes.invoke.mock.calls.length;

    fireEvent.click(
      screen.getByRole('button', {
        name: 'conversation.creativeStudio.review.confirm',
      })
    );

    await waitFor(() => expect(bridge.listRoutes.invoke).toHaveBeenCalledTimes(routeRequestsBeforeConfirmation + 1));
    expect(bridge.submitScenes.invoke).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveTextContent('Revised opening');
    expect(screen.getByRole('dialog')).toHaveTextContent('New image provider');
    expect(screen.getByRole('dialog')).not.toHaveTextContent('weprompt-media-gateway-v1');
    expect(screen.getByRole('dialog')).toHaveTextContent('conversation.creativeStudio.errors.staleProject');

    fireEvent.click(
      screen.getByRole('button', {
        name: 'conversation.creativeStudio.review.confirm',
      })
    );

    await waitFor(() =>
      expect(bridge.submitScenes.invoke).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          projectId: 'project-1',
          expectedRevision: 3,
          catalogVersion: 'catalog-2',
          routes: [
            {
              sceneId: 'scene-1',
              choiceId: 'choice_image_new',
              kind: 'image',
            },
          ],
        })
      )
    );
  });

  it('cannot reauthorize a scene that began generating while its paid review was open', async () => {
    let onUpdate: ((event: { projectId: string }) => void) | undefined;
    bridge.projectUpdated.on.mockImplementation((listener: (event: { projectId: string }) => void) => {
      onUpdate = listener;
      return () => {};
    });
    const opening = scene({ durationSeconds: 5 });
    const runningJob = job('job-running', { status: 'running' });
    const generatingOpening = scene({
      durationSeconds: 5,
      reviewState: 'generating',
      jobIds: [runningJob.id],
    });
    const initial = project('project-1', {
      targetDurationSeconds: 5,
      sceneOrder: [opening.id],
      scenes: { [opening.id]: opening },
    });
    const generating = project('project-1', {
      revision: 3,
      targetDurationSeconds: 5,
      sceneOrder: [generatingOpening.id],
      scenes: { [generatingOpening.id]: generatingOpening },
      jobs: { [runningJob.id]: runningJob },
    });
    bridge.getProject.invoke
      .mockResolvedValueOnce(ok(initial))
      .mockResolvedValueOnce(ok(initial))
      .mockResolvedValue(ok(generating));
    bridge.listRoutes.invoke.mockResolvedValue(ok(routesWithImage()));
    renderRoute();

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'conversation.creativeStudio.review.generateScene',
      })
    );
    await screen.findByRole('dialog');

    await act(async () => onUpdate?.({ projectId: 'project-1' }));
    await screen.findByText('conversation.creativeStudio.jobs.status.running');
    const routeRequestsBeforeConfirmation = bridge.listRoutes.invoke.mock.calls.length;
    fireEvent.click(
      screen.getByRole('button', {
        name: 'conversation.creativeStudio.review.confirm',
      })
    );

    await waitFor(() => expect(bridge.listRoutes.invoke).toHaveBeenCalledTimes(routeRequestsBeforeConfirmation + 1));
    expect(bridge.submitScenes.invoke).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', {
        name: 'conversation.creativeStudio.review.confirm',
      })
    ).toBeDisabled();
  });

  it('blocks repeated confirmation after the backend rejects a reviewed route', async () => {
    const opening = scene({ durationSeconds: 5 });
    bridge.getProject.invoke.mockResolvedValue(
      ok(
        project('project-1', {
          targetDurationSeconds: 5,
          sceneOrder: [opening.id],
          scenes: { [opening.id]: opening },
        })
      )
    );
    bridge.listRoutes.invoke.mockResolvedValue(ok(routesWithImage()));
    bridge.submitScenes.invoke.mockResolvedValue({
      ok: false,
      error: {
        code: 'invalid_route',
        messageKey: 'conversation.creativeStudio.errors.invalidRoute',
      },
    });
    renderRoute();

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'conversation.creativeStudio.review.generateScene',
      })
    );
    const confirm = screen.getByRole('button', {
      name: 'conversation.creativeStudio.review.confirm',
    });
    fireEvent.click(confirm);

    await waitFor(() => expect(bridge.submitScenes.invoke).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('dialog')).toHaveTextContent('conversation.creativeStudio.errors.invalidRoute');
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(bridge.submitScenes.invoke).toHaveBeenCalledTimes(1);
  });

  it('keeps paid generation in review after a stale result and never resubmits without another confirmation', async () => {
    const opening = scene();
    const initial = project('project-1', {
      sceneOrder: [opening.id],
      scenes: { [opening.id]: opening },
    });
    const refreshed = project('project-1', {
      revision: 3,
      sceneOrder: [opening.id],
      scenes: { [opening.id]: opening },
      routing: {
        storyboard: null,
        image: {
          choiceId: 'choice_image_new',
          providerId: 'provider-image-new',
          model: 'image-model-new',
        },
        video: null,
      },
    });
    const refreshedRoute = imageRoute({
      choiceId: 'choice_image_new',
      providerId: 'provider-image-new',
      providerName: 'New image provider',
      model: 'image-model-new',
    });
    bridge.getProject.invoke
      .mockResolvedValueOnce(ok(initial))
      .mockResolvedValueOnce(ok(initial))
      .mockResolvedValue(ok(refreshed));
    bridge.listRoutes.invoke
      .mockResolvedValueOnce(ok(routesWithImage()))
      .mockResolvedValue(ok({ ...routesWithImage(refreshedRoute), catalogVersion: 'catalog-2' }));
    bridge.submitScenes.invoke.mockResolvedValueOnce(stale()).mockResolvedValueOnce(ok([]));
    renderRoute();

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'conversation.creativeStudio.review.generateScene',
      })
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'conversation.creativeStudio.review.confirm',
      })
    );

    await waitFor(() => expect(bridge.submitScenes.invoke).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole('dialog')).toHaveTextContent('conversation.creativeStudio.errors.staleProject')
    );
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('New image provider'));
    expect(screen.getByRole('dialog')).not.toHaveTextContent('weprompt-media-gateway-v1');
    expect(bridge.submitScenes.invoke).toHaveBeenCalledTimes(1);

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'conversation.creativeStudio.review.confirm',
      })
    );

    await waitFor(() => expect(bridge.submitScenes.invoke).toHaveBeenCalledTimes(2));
    expect(bridge.submitScenes.invoke.mock.calls[1]?.[0]).toMatchObject({
      projectId: 'project-1',
      expectedRevision: 3,
      catalogVersion: 'catalog-2',
      routes: [
        {
          sceneId: 'scene-1',
          choiceId: 'choice_image_new',
          kind: 'image',
        },
      ],
    });
  });

  it('routes an empty-project add conflict to always-visible recovery controls', async () => {
    bridge.getProject.invoke
      .mockResolvedValueOnce(ok(project()))
      .mockResolvedValueOnce(ok(project('project-1', { revision: 3 })));
    bridge.updateScene.invoke.mockResolvedValueOnce(stale());
    renderRoute();

    await screen.findByRole('heading', { level: 1, name: 'Launch film' });
    fireEvent.click(screen.getByRole('button', { name: 'conversation.creativeStudio.storyboard.addScene' }));

    await waitFor(() => expect(bridge.updateScene.invoke).toHaveBeenCalledTimes(1), { timeout: 5_000 });
    expect(
      await screen.findByRole(
        'button',
        {
          name: 'conversation.creativeStudio.storyboard.retry',
        },
        { timeout: 5_000 }
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'conversation.creativeStudio.storyboard.discard',
      })
    ).toBeInTheDocument();
  });

  it('keeps stale scene-save recovery reachable when the canonical refetch removes every scene', async () => {
    const opening = scene();
    bridge.getProject.invoke
      .mockResolvedValueOnce(
        ok(
          project('project-1', {
            sceneOrder: [opening.id],
            scenes: { [opening.id]: opening },
          })
        )
      )
      .mockResolvedValueOnce(
        ok(
          project('project-1', {
            sceneOrder: [opening.id],
            scenes: { [opening.id]: opening },
          })
        )
      )
      .mockResolvedValueOnce(ok(project('project-1', { revision: 3 })));
    bridge.updateScene.invoke.mockResolvedValueOnce(stale());
    renderRoute();

    const titleInput = await screen.findByLabelText('conversation.creativeStudio.inspector.titleLabel');
    fireEvent.change(titleInput, { target: { value: 'Updated opening' } });
    fireEvent.blur(titleInput);

    await waitFor(() => expect(bridge.updateScene.invoke).toHaveBeenCalledTimes(1), { timeout: 5_000 });
    expect(
      await screen.findByRole(
        'button',
        {
          name: 'conversation.creativeStudio.storyboard.retry',
        },
        { timeout: 5_000 }
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'conversation.creativeStudio.storyboard.discard',
      })
    ).toBeInTheDocument();
  });

  it('blocks project navigation until a stale scene draft is explicitly retried or discarded', async () => {
    const opening = scene();
    let projectOneFetches = 0;
    bridge.getProject.invoke.mockImplementation(async ({ projectId }: { projectId: string }) => {
      if (projectId === 'project-2') return ok(project('project-2'));
      projectOneFetches += 1;
      return ok(
        project('project-1', {
          revision: projectOneFetches === 1 ? 2 : 3,
          sceneOrder: [opening.id],
          scenes: { [opening.id]: opening },
        })
      );
    });
    bridge.updateScene.invoke.mockResolvedValueOnce(stale());
    const { router } = renderRoute();

    const titleInput = await screen.findByLabelText('conversation.creativeStudio.inspector.titleLabel');
    fireEvent.change(titleInput, { target: { value: 'Keep this local title' } });
    fireEvent.blur(titleInput);
    await screen.findByRole('button', { name: 'conversation.creativeStudio.storyboard.retry' }, { timeout: 5_000 });

    await act(async () => router.navigate('/studio/project-2'));

    expect(router.state.location.pathname).toBe('/studio/project-1');
    expect(screen.getByRole('heading', { level: 1, name: 'Launch film' })).toBeInTheDocument();
    expect(bridge.getProject.invoke).not.toHaveBeenCalledWith({ projectId: 'project-2' });

    fireEvent.click(screen.getAllByRole('button', { name: 'conversation.creativeStudio.storyboard.discard' })[0]);
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'conversation.creativeStudio.storyboard.retry' })
      ).not.toBeInTheDocument()
    );
    await act(async () => router.navigate('/studio/project-2'));

    expect(await screen.findByRole('heading', { level: 1, name: 'Second film' })).toBeInTheDocument();
  });

  it('offers explicit retry and discard before leaving after a typed scene-save failure', async () => {
    const opening = scene();
    bridge.getProject.invoke.mockImplementation(async ({ projectId }: { projectId: string }) =>
      ok(
        project(projectId, {
          sceneOrder: [opening.id],
          scenes: { [opening.id]: opening },
        })
      )
    );
    bridge.updateScene.invoke.mockResolvedValueOnce(failure());
    const { router } = renderRoute();

    const titleInput = await screen.findByLabelText('conversation.creativeStudio.inspector.titleLabel');
    fireEvent.change(titleInput, { target: { value: 'Unsaved typed failure' } });
    fireEvent.blur(titleInput);

    expect(
      await screen.findByRole('button', { name: 'conversation.creativeStudio.storyboard.retry' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'conversation.creativeStudio.storyboard.discard' })).toBeInTheDocument();

    await act(async () => router.navigate('/studio/project-2'));
    expect(router.state.location.pathname).toBe('/studio/project-1');

    fireEvent.click(screen.getByRole('button', { name: 'conversation.creativeStudio.storyboard.discard' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'conversation.creativeStudio.storyboard.retry' })
      ).not.toBeInTheDocument()
    );
    await act(async () => router.navigate('/studio/project-2'));

    expect(await screen.findByRole('heading', { level: 1, name: 'Second film' })).toBeInTheDocument();
  });

  it('prioritizes a stale non-save conflict before a queued scene-save issue', async () => {
    const opening = scene();
    const reveal = scene({ id: 'scene-2', title: 'Reveal' });
    const initial = project('project-1', {
      sceneOrder: [opening.id, reveal.id],
      scenes: { [opening.id]: opening, [reveal.id]: reveal },
    });
    const refreshed = project('project-1', {
      revision: 8,
      sceneOrder: [opening.id, reveal.id],
      scenes: { [opening.id]: opening, [reveal.id]: reveal },
    });
    const firstSave = deferred<StudioCommandResult<StudioRendererProject>>();
    bridge.getProject.invoke
      .mockResolvedValueOnce(ok(initial))
      .mockResolvedValueOnce(ok(initial))
      .mockResolvedValueOnce(ok(refreshed));
    bridge.updateScene.invoke.mockReturnValueOnce(firstSave.promise);
    bridge.reorderScenes.invoke.mockResolvedValueOnce(stale()).mockResolvedValueOnce(
      ok(
        project('project-1', {
          revision: 9,
          sceneOrder: [reveal.id, opening.id],
          scenes: { [opening.id]: opening, [reveal.id]: reveal },
        })
      )
    );
    renderRoute();

    const titleInput = await screen.findByLabelText('conversation.creativeStudio.inspector.titleLabel');
    fireEvent.change(titleInput, { target: { value: 'Unresolved opening edit' } });
    fireEvent.blur(titleInput);
    await waitFor(() => expect(bridge.updateScene.invoke).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getAllByRole('button', { name: 'conversation.creativeStudio.scene.accessibleName' })[1]);
    await act(async () => firstSave.resolve(failure()));
    expect(await screen.findByText('conversation.creativeStudio.errors.storage')).toBeInTheDocument();

    fireEvent.click(
      screen.getAllByRole('button', {
        name: 'conversation.creativeStudio.storyboard.moveUp: conversation.creativeStudio.scene.accessibleName',
      })[1]
    );
    await waitFor(() => expect(bridge.reorderScenes.invoke).toHaveBeenCalledTimes(1));

    expect(await screen.findByText('conversation.creativeStudio.errors.staleProject')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'conversation.creativeStudio.storyboard.retry' }));
    await waitFor(() => expect(bridge.reorderScenes.invoke).toHaveBeenCalledTimes(2));

    expect(bridge.updateScene.invoke).toHaveBeenCalledTimes(1);
  });

  it('shows not found when the bridge succeeds with no canonical project', async () => {
    bridge.getProject.invoke.mockResolvedValue(ok(null));
    renderRoute();

    expect(await screen.findByText('conversation.creativeStudio.project.notFound')).toBeInTheDocument();
  });

  it('shows the typed command error separately from not found', async () => {
    bridge.getProject.invoke.mockResolvedValue(failure());
    renderRoute();

    expect(await screen.findByText('conversation.creativeStudio.errors.storage')).toBeInTheDocument();
    expect(screen.queryByText('conversation.creativeStudio.project.notFound')).not.toBeInTheDocument();
  });

  it('resets and fetches again when the route project id changes', async () => {
    const { router } = renderRoute('/studio/project-1');
    await screen.findByRole('heading', { level: 1, name: 'Launch film' });
    bridge.getProject.invoke.mockResolvedValue(ok(project('project-2')));

    await act(async () => router.navigate('/studio/project-2'));

    await waitFor(() => expect(bridge.getProject.invoke).toHaveBeenLastCalledWith({ projectId: 'project-2' }));
  });

  it('flushes a dirty scene draft before switching to another project route', async () => {
    const opening = scene();
    bridge.getProject.invoke.mockImplementation(async ({ projectId }: { projectId: string }) =>
      ok(
        project(projectId, {
          sceneOrder: [opening.id],
          scenes: { [opening.id]: opening },
        })
      )
    );
    bridge.updateScene.invoke.mockResolvedValue(
      ok(
        project('project-1', {
          revision: 3,
          sceneOrder: [opening.id],
          scenes: { [opening.id]: { ...opening, title: 'Unsaved project A title' } },
        })
      )
    );
    const { router } = renderRoute('/studio/project-1');
    await screen.findByRole('heading', { level: 1, name: 'Launch film' });

    fireEvent.change(screen.getByLabelText('conversation.creativeStudio.inspector.titleLabel'), {
      target: { value: 'Unsaved project A title' },
    });
    await act(async () => router.navigate('/studio/project-2'));

    await waitFor(() =>
      expect(bridge.updateScene.invoke).toHaveBeenCalledWith({
        projectId: 'project-1',
        sceneId: 'scene-1',
        expectedRevision: 2,
        scene: expect.objectContaining({ title: 'Unsaved project A title' }),
      })
    );
  });

  it('refetches only for matching project update events and cleans up', async () => {
    let onUpdate: ((event: { projectId: string }) => void) | undefined;
    const unsubscribe = vi.fn();
    bridge.projectUpdated.on.mockImplementation((listener: (event: { projectId: string }) => void) => {
      onUpdate = listener;
      return unsubscribe;
    });
    const { view } = renderRoute();
    await screen.findByRole('heading', { level: 1, name: 'Launch film' });

    await act(async () => onUpdate?.({ projectId: 'other-project' }));
    expect(bridge.getProject.invoke).toHaveBeenCalledTimes(2);
    await act(async () => onUpdate?.({ projectId: 'project-1' }));
    expect(bridge.getProject.invoke).toHaveBeenCalledTimes(3);

    view.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('keeps the current project visible while a matching event refetches in the background', async () => {
    let onUpdate: ((event: { projectId: string }) => void) | undefined;
    bridge.projectUpdated.on.mockImplementation((listener: (event: { projectId: string }) => void) => {
      onUpdate = listener;
      return () => {};
    });
    renderRoute();
    await screen.findByRole('heading', { level: 1, name: 'Launch film' });

    const pending = deferred<StudioCommandResult<StudioRendererProject | null>>();
    bridge.getProject.invoke.mockReturnValueOnce(pending.promise);
    act(() => onUpdate?.({ projectId: 'project-1' }));

    expect(screen.getByRole('heading', { level: 1, name: 'Launch film' })).toBeInTheDocument();
    expect(screen.queryByText('conversation.creativeStudio.project.loading')).not.toBeInTheDocument();

    pending.resolve(ok(project('project-1', { name: 'Updated film', revision: 3 })));
    expect(await screen.findByRole('heading', { level: 1, name: 'Updated film' })).toBeInTheDocument();
  });

  it('keeps the current project visible when a background refetch returns a typed error', async () => {
    let onUpdate: ((event: { projectId: string }) => void) | undefined;
    bridge.projectUpdated.on.mockImplementation((listener: (event: { projectId: string }) => void) => {
      onUpdate = listener;
      return () => {};
    });
    renderRoute();
    await screen.findByRole('heading', { level: 1, name: 'Launch film' });
    bridge.getProject.invoke.mockResolvedValueOnce(failure());

    act(() => onUpdate?.({ projectId: 'project-1' }));

    expect(await screen.findByText('conversation.creativeStudio.errors.storage')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Launch film' })).toBeInTheDocument();
  });

  it('ignores an older matching-event response that resolves after a newer canonical fetch', async () => {
    let onUpdate: ((event: { projectId: string }) => void) | undefined;
    bridge.projectUpdated.on.mockImplementation((listener: (event: { projectId: string }) => void) => {
      onUpdate = listener;
      return () => {};
    });
    renderRoute();
    await screen.findByRole('heading', { level: 1, name: 'Launch film' });

    const older = deferred<StudioCommandResult<StudioRendererProject | null>>();
    const newer = deferred<StudioCommandResult<StudioRendererProject | null>>();
    bridge.getProject.invoke.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);

    act(() => {
      onUpdate?.({ projectId: 'project-1' });
      onUpdate?.({ projectId: 'project-1' });
    });
    newer.resolve(ok(project('project-1', { name: 'Newest film', revision: 4 })));
    expect(await screen.findByRole('heading', { level: 1, name: 'Newest film' })).toBeInTheDocument();

    older.resolve(ok(project('project-1', { name: 'Older film', revision: 3 })));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Newest film' })).toBeInTheDocument());
    expect(screen.queryByRole('heading', { level: 1, name: 'Older film' })).not.toBeInTheDocument();
  });

  it('adopts a higher revision from an earlier overlapping request even while a later request is pending', async () => {
    let onUpdate: ((event: { projectId: string }) => void) | undefined;
    bridge.projectUpdated.on.mockImplementation((listener: (event: { projectId: string }) => void) => {
      onUpdate = listener;
      return () => {};
    });
    renderRoute();
    await screen.findByRole('heading', { level: 1, name: 'Launch film' });

    const earlier = deferred<StudioCommandResult<StudioRendererProject | null>>();
    const later = deferred<StudioCommandResult<StudioRendererProject | null>>();
    bridge.getProject.invoke.mockReturnValueOnce(earlier.promise).mockReturnValueOnce(later.promise);
    act(() => {
      onUpdate?.({ projectId: 'project-1' });
      onUpdate?.({ projectId: 'project-1' });
    });

    earlier.resolve(ok(project('project-1', { name: 'Revision five', revision: 5 })));
    expect(await screen.findByRole('heading', { level: 1, name: 'Revision five' })).toBeInTheDocument();

    later.resolve(ok(project('project-1', { name: 'Revision four', revision: 4 })));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Revision five' })).toBeInTheDocument());
    expect(screen.queryByRole('heading', { level: 1, name: 'Revision four' })).not.toBeInTheDocument();
  });

  it('clears a later failed refresh when an earlier overlapping response advances the canonical revision', async () => {
    let onUpdate: ((event: { projectId: string }) => void) | undefined;
    bridge.projectUpdated.on.mockImplementation((listener: (event: { projectId: string }) => void) => {
      onUpdate = listener;
      return () => {};
    });
    renderRoute();
    await screen.findByRole('heading', { level: 1, name: 'Launch film' });

    const earlier = deferred<StudioCommandResult<StudioRendererProject | null>>();
    const later = deferred<StudioCommandResult<StudioRendererProject | null>>();
    bridge.getProject.invoke.mockReturnValueOnce(earlier.promise).mockReturnValueOnce(later.promise);
    act(() => {
      onUpdate?.({ projectId: 'project-1' });
      onUpdate?.({ projectId: 'project-1' });
    });

    later.resolve(failure());
    expect(await screen.findByText('conversation.creativeStudio.errors.storage')).toBeInTheDocument();

    earlier.resolve(ok(project('project-1', { name: 'Recovered revision five', revision: 5 })));
    expect(await screen.findByRole('heading', { level: 1, name: 'Recovered revision five' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText('conversation.creativeStudio.errors.storage')).not.toBeInTheDocument()
    );
  });

  it('adopts an earlier authoritative absence after a later overlapping refresh fails', async () => {
    let onUpdate: ((event: { projectId: string }) => void) | undefined;
    bridge.projectUpdated.on.mockImplementation((listener: (event: { projectId: string }) => void) => {
      onUpdate = listener;
      return () => {};
    });
    renderRoute();
    await screen.findByRole('heading', { level: 1, name: 'Launch film' });

    const earlier = deferred<StudioCommandResult<StudioRendererProject | null>>();
    const later = deferred<StudioCommandResult<StudioRendererProject | null>>();
    bridge.getProject.invoke.mockReturnValueOnce(earlier.promise).mockReturnValueOnce(later.promise);
    act(() => {
      onUpdate?.({ projectId: 'project-1' });
      onUpdate?.({ projectId: 'project-1' });
    });

    later.resolve(failure());
    expect(await screen.findByText('conversation.creativeStudio.errors.storage')).toBeInTheDocument();

    earlier.resolve(ok(null));
    expect(await screen.findByText('conversation.creativeStudio.project.notFound')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'Launch film' })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText('conversation.creativeStudio.errors.storage')).not.toBeInTheDocument()
    );
  });

  it('does not let an older authoritative absence replace a newer canonical project', async () => {
    let onUpdate: ((event: { projectId: string }) => void) | undefined;
    bridge.projectUpdated.on.mockImplementation((listener: (event: { projectId: string }) => void) => {
      onUpdate = listener;
      return () => {};
    });
    renderRoute();
    await screen.findByRole('heading', { level: 1, name: 'Launch film' });

    const earlier = deferred<StudioCommandResult<StudioRendererProject | null>>();
    const later = deferred<StudioCommandResult<StudioRendererProject | null>>();
    bridge.getProject.invoke.mockReturnValueOnce(earlier.promise).mockReturnValueOnce(later.promise);
    act(() => {
      onUpdate?.({ projectId: 'project-1' });
      onUpdate?.({ projectId: 'project-1' });
    });

    later.resolve(ok(project('project-1', { name: 'Newest film', revision: 4 })));
    expect(await screen.findByRole('heading', { level: 1, name: 'Newest film' })).toBeInTheDocument();

    earlier.resolve(ok(null));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Newest film' })).toBeInTheDocument());
    expect(screen.queryByText('conversation.creativeStudio.project.notFound')).not.toBeInTheDocument();
  });

  it('does not let older project data cross a newer authoritative absence', async () => {
    let onUpdate: ((event: { projectId: string }) => void) | undefined;
    bridge.projectUpdated.on.mockImplementation((listener: (event: { projectId: string }) => void) => {
      onUpdate = listener;
      return () => {};
    });
    renderRoute();
    await screen.findByRole('heading', { level: 1, name: 'Launch film' });

    const earlier = deferred<StudioCommandResult<StudioRendererProject | null>>();
    const later = deferred<StudioCommandResult<StudioRendererProject | null>>();
    bridge.getProject.invoke.mockReturnValueOnce(earlier.promise).mockReturnValueOnce(later.promise);
    act(() => {
      onUpdate?.({ projectId: 'project-1' });
      onUpdate?.({ projectId: 'project-1' });
    });

    later.resolve(ok(null));
    expect(await screen.findByText('conversation.creativeStudio.project.notFound')).toBeInTheDocument();

    earlier.resolve(ok(project('project-1', { name: 'Resurrected stale film', revision: 5 })));
    await waitFor(() => expect(screen.getByText('conversation.creativeStudio.project.notFound')).toBeInTheDocument());
    expect(screen.queryByRole('heading', { level: 1, name: 'Resurrected stale film' })).not.toBeInTheDocument();
  });

  it('exposes an explicit background refetch for the storyboard editor', async () => {
    render(<ProjectHookHarness />);
    await screen.findByText('Launch film');
    bridge.getProject.invoke.mockResolvedValueOnce(ok(project('project-1', { name: 'Refetched film', revision: 3 })));

    fireEvent.click(screen.getByRole('button', { name: 'Refetch project' }));

    expect(await screen.findByText('Refetched film')).toBeInTheDocument();
    expect(bridge.getProject.invoke).toHaveBeenCalledTimes(2);
  });
});
