/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * @vitest-environment node
 */

import { createHash } from 'node:crypto';
import { execFile as execFileCallback, spawn, spawnSync } from 'node:child_process';
import { createReadStream, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type {
  StudioAsset,
  StudioCut,
  StudioMediaKind,
  StudioRenderProgressEvent,
  StudioScene,
} from '@/common/types/project/creativeStudioTypes';
import { createStudioMediaStore } from '@process/services/creative-studio/mediaStore';
import {
  createStudioRenderRunner,
  CreativeStudioRenderError,
  renderCut,
  resolveStudioRenderDimensions,
  type StudioRenderOperation,
  type StudioRenderSpawn,
  type StudioRenderResult,
} from '@process/services/creative-studio/renderService';
import { createCreativeStudioStore, type CreativeStudioStore } from '@process/services/creative-studio/store';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const execFile = promisify(execFileCallback);
const ffmpegPath = process.env.FFMPEG_PATH ?? 'ffmpeg';
const ffprobePath = ffmpegPath.includes(path.sep) ? path.join(path.dirname(ffmpegPath), 'ffprobe') : 'ffprobe';
const ffmpegAvailable =
  spawnSync(ffmpegPath, ['-version'], { stdio: 'ignore' }).status === 0 &&
  spawnSync(ffprobePath, ['-version'], { stdio: 'ignore' }).status === 0;

type FixturePaths = {
  image: string;
  silentVideo: string;
  videoWithAudio: string;
};

type SceneInput = {
  id: string;
  mediaKind: StudioMediaKind;
  durationSeconds: number;
  fixture?: keyof FixturePaths;
  assetDurationSeconds?: number;
  collection?: StudioAsset['managedAsset']['collection'];
};

type RenderHarness = {
  rootDir: string;
  temporaryRoot: string;
  store: CreativeStudioStore;
  mediaStore: ReturnType<typeof createStudioMediaStore>;
  projectRevision: number;
  outputPath: string;
};

let fixtureRoot = '';
let fixtures: FixturePaths;
const createdRoots: string[] = [];

const deferred = <T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason: unknown) => void } => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const run = async (command: string, args: string[]): Promise<{ stdout: string; stderr: string }> => {
  const result = await execFile(command, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  return { stdout: result.stdout, stderr: result.stderr };
};

const createFixtures = async (): Promise<FixturePaths> => {
  fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aionui-studio-render-fixtures-'));
  const image = path.join(fixtureRoot, 'frame.png');
  const silentVideo = path.join(fixtureRoot, 'silent.mp4');
  const videoWithAudio = path.join(fixtureRoot, 'with-audio.mp4');
  await run(ffmpegPath, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=0x336699:s=320x240',
    '-frames:v',
    '1',
    image,
  ]);
  await run(ffmpegPath, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=s=320x240:r=30:d=1',
    '-an',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    silentVideo,
  ]);
  await run(ffmpegPath, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=s=640x360:r=24:d=1',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=880:sample_rate=44100:duration=1',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    videoWithAudio,
  ]);
  return { image, silentVideo, videoWithAudio };
};

const makeScene = (input: SceneInput, assetId: string | null): StudioScene => ({
  id: input.id,
  title: input.id,
  purpose: '',
  visualPrompt: '',
  narration: '',
  onScreenText: '',
  mediaKind: input.mediaKind,
  durationSeconds: input.durationSeconds,
  referenceAssetId: null,
  selectedAssetId: assetId,
  assetIds: assetId === null ? [] : [assetId],
  jobIds: [],
  reviewState: assetId === null ? 'draft' : 'complete',
});

const createHarness = async (
  sceneInputs: SceneInput[],
  options: { aspectRatio?: '16:9' | '9:16'; resolution?: '720p' | '1080p' } = {}
): Promise<RenderHarness> => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aionui-studio-render-store-'));
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aionui-studio-render-temp-root-'));
  createdRoots.push(rootDir, temporaryRoot);
  const store = createCreativeStudioStore({ rootDir, createId: () => 'project_1' });
  await store.createProject({
    name: 'Fixture project',
    brief: '',
    aspectRatio: options.aspectRatio ?? '16:9',
    targetDurationSeconds: 5,
    resolution: options.resolution ?? '720p',
  });
  const projectDirectory = (await store.getVerifiedProjectDirectory('project_1'))!;
  const assetsDirectory = path.join(projectDirectory, 'assets');
  const importsDirectory = path.join(projectDirectory, 'imports');
  await Promise.all([fs.mkdir(assetsDirectory), fs.mkdir(importsDirectory)]);

  const assets: Record<string, StudioAsset> = {};
  const scenes: Record<string, StudioScene> = {};
  await Promise.all(
    sceneInputs.map(async (input) => {
      const assetId = input.fixture === undefined ? null : `asset_${input.id}`;
      scenes[input.id] = makeScene(input, assetId);
      if (assetId === null) return;
      const source = fixtures[input.fixture];
      const extension = path.extname(source);
      const collection = input.collection ?? 'assets';
      const fileName = `${assetId}${extension}`;
      const destination = path.join(collection === 'imports' ? importsDirectory : assetsDirectory, fileName);
      const bytes = await fs.readFile(source);
      await fs.writeFile(destination, bytes);
      assets[assetId] = {
        id: assetId,
        projectId: 'project_1',
        sceneId: input.id,
        mediaKind: input.mediaKind,
        mimeType: input.mediaKind === 'image' ? 'image/png' : 'video/mp4',
        managedAsset: { collection, fileName },
        byteSize: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        ...(input.assetDurationSeconds === undefined ? {} : { durationSeconds: input.assetDurationSeconds }),
        createdAt: '2026-08-06T00:00:00.000Z',
      };
    })
  );
  const project = await store.updateProject('project_1', (current) => ({
    ...current,
    sceneOrder: sceneInputs.map((scene) => scene.id),
    scenes,
    assets,
  }));
  const mediaStore = createStudioMediaStore({
    store,
    createId: () => 'render_asset',
    now: () => '2026-08-06T00:00:00.000Z',
  });
  return {
    rootDir,
    temporaryRoot,
    store,
    mediaStore,
    projectRevision: project.revision,
    outputPath: path.join(assetsDirectory, 'render_asset.mp4'),
  };
};

const setActiveCut = async (
  harness: RenderHarness,
  input: {
    orderMode: StudioCut['orderMode'];
    clipSceneIds: string[];
    clipOrderSceneIds?: string[];
  }
): Promise<void> => {
  const project = await harness.store.getProject('project_1');
  if (project === null) throw new Error('Missing render fixture project');
  const clips: StudioCut['clips'] = {};
  for (const sceneId of input.clipSceneIds) {
    const scene = project.scenes[sceneId];
    const assetId = scene?.selectedAssetId;
    if (!scene || !assetId) throw new Error(`Missing cut fixture for ${sceneId}`);
    const clipId = `clip_${sceneId}`;
    clips[clipId] = {
      id: clipId,
      sceneId,
      assetId,
      sourceInSeconds: null,
      sourceOutSeconds: null,
      crop: null,
      filters: [],
    };
  }
  const cut: StudioCut = {
    id: 'cut_1',
    name: 'Fixture cut',
    orderMode: input.orderMode,
    clipOrder: (input.clipOrderSceneIds ?? input.clipSceneIds).map((sceneId) => `clip_${sceneId}`),
    clips,
  };
  await harness.store.updateProject('project_1', (current) => ({
    ...current,
    cuts: { [cut.id]: cut },
    activeCutId: cut.id,
  }));
};

const storeWithNonCanonicalClipAssets = async (
  harness: RenderHarness,
  sceneIds: string[]
): Promise<Pick<CreativeStudioStore, 'getProject'>> => {
  const project = structuredClone(await harness.store.getProject('project_1'));
  if (project === null || project.activeCutId === null || project.activeCutId === undefined) {
    throw new Error('Missing active cut fixture');
  }
  const cut = project.cuts?.[project.activeCutId];
  if (cut === undefined) throw new Error('Missing active cut fixture');
  for (const sceneId of sceneIds) {
    const scene = project.scenes[sceneId];
    const selected = scene?.selectedAssetId === null ? undefined : project.assets[scene?.selectedAssetId ?? ''];
    const clip = cut.clips[`clip_${sceneId}`];
    if (!scene || !selected || !clip) throw new Error(`Missing cut fixture for ${sceneId}`);
    const assetId = `import_${sceneId}`;
    project.assets[assetId] = {
      ...selected,
      id: assetId,
      managedAsset: { collection: 'imports', fileName: `${assetId}${path.extname(selected.managedAsset.fileName)}` },
    };
    scene.assetIds.push(assetId);
    clip.assetId = assetId;
  }
  return { getProject: async (projectId) => (projectId === project.id ? project : null) };
};

const probe = async (
  filePath: string
): Promise<{
  streams: Array<{
    codec_type: string;
    codec_name?: string;
    profile?: string;
    pix_fmt?: string;
    width?: number;
    height?: number;
    duration?: string;
    r_frame_rate?: string;
    avg_frame_rate?: string;
    time_base?: string;
    sample_rate?: string;
    channels?: number;
  }>;
  format: { duration: string };
}> => {
  const { stdout } = await run(ffprobePath, [
    '-v',
    'error',
    '-show_entries',
    'stream=codec_type,codec_name,profile,pix_fmt,width,height,duration,r_frame_rate,avg_frame_rate,time_base,sample_rate,channels:format=duration',
    '-of',
    'json',
    filePath,
  ]);
  return JSON.parse(stdout) as {
    streams: Array<{
      codec_type: string;
      codec_name?: string;
      profile?: string;
      pix_fmt?: string;
      width?: number;
      height?: number;
      duration?: string;
      r_frame_rate?: string;
      avg_frame_rate?: string;
      time_base?: string;
      sample_rate?: string;
      channels?: number;
    }>;
    format: { duration: string };
  };
};

const probeVideoKeyframeTimes = async (filePath: string): Promise<number[]> => {
  const { stdout } = await run(ffprobePath, [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_packets',
    '-show_entries',
    'packet=pts_time,flags',
    '-of',
    'json',
    filePath,
  ]);
  const result = JSON.parse(stdout) as { packets: Array<{ pts_time?: string; flags?: string }> };
  return result.packets
    .filter((packet) => packet.flags?.includes('K'))
    .map((packet) => Number(packet.pts_time))
    .filter(Number.isFinite);
};

beforeAll(async () => {
  if (ffmpegAvailable) fixtures = await createFixtures();
}, 30_000);

afterAll(async () => {
  await Promise.all(
    [...createdRoots.splice(0), fixtureRoot]
      .filter(Boolean)
      .map((directory) => fs.rm(directory, { recursive: true, force: true }))
  );
});

describe('resolveStudioRenderDimensions', () => {
  it.each([
    ['720p', '16:9', 1280, 720],
    ['720p', '9:16', 720, 1280],
    ['720p', '1:1', 720, 720],
    ['720p', '4:3', 960, 720],
    ['720p', '3:4', 720, 960],
    ['1080p', '16:9', 1920, 1080],
    ['1080p', '9:16', 1080, 1920],
    ['1080p', '1:1', 1080, 1080],
    ['1080p', '4:3', 1440, 1080],
    ['1080p', '3:4', 1080, 1440],
  ] as const)('maps %s %s to an even %sx%s frame', (resolution, aspectRatio, width, height) => {
    expect(resolveStudioRenderDimensions(resolution, aspectRatio)).toEqual({ width, height });
  });
});

describe('Studio render runner', () => {
  it('rejects a second render for the same project without starting another operation', async () => {
    const pending = deferred<StudioRenderResult>();
    const startOperation = vi.fn(() => ({ result: pending.promise, cancel: vi.fn() }));
    const runner = createStudioRenderRunner({ startOperation, onStateChanged: vi.fn() });

    const first = runner.renderCut('project_1');

    await expect(runner.renderCut('project_1')).rejects.toMatchObject({ code: 'busy' });
    expect(startOperation).toHaveBeenCalledOnce();
    expect(runner.getState('project_1')).toMatchObject({ status: 'running', progress: 0 });

    pending.resolve({ status: 'rendered', assetId: 'render_1', missingSceneIds: [] });
    await expect(first).resolves.toEqual({ assetId: 'render_1', missingSceneIds: [] });
  });

  it('relays monotonic progress and exposes the succeeded terminal state', async () => {
    const pending = deferred<StudioRenderResult>();
    let reportProgress: ((progress: number) => void) | undefined;
    const states: StudioRenderProgressEvent[] = [];
    const runner = createStudioRenderRunner({
      startOperation: (_projectId, onProgress) => {
        reportProgress = onProgress;
        return { result: pending.promise, cancel: vi.fn() };
      },
      onStateChanged: (state) => states.push(state),
    });

    const result = runner.renderCut('project_1');
    reportProgress?.(0.45);
    reportProgress?.(0.2);
    pending.resolve({ status: 'rendered', assetId: 'render_1', missingSceneIds: ['scene_2'] });

    await expect(result).resolves.toEqual({ assetId: 'render_1', missingSceneIds: ['scene_2'] });
    expect(states.map(({ status, progress }) => [status, progress])).toEqual([
      ['running', 0],
      ['running', 0.45],
      ['succeeded', 1],
    ]);
    expect(runner.getState('project_1')).toEqual({
      projectId: 'project_1',
      status: 'succeeded',
      progress: 1,
      assetId: 'render_1',
      missingSceneIds: ['scene_2'],
    });
  });

  it('cancels the active operation and exposes cancellation only after it terminates', async () => {
    const pending = deferred<StudioRenderResult>();
    const cancel = vi.fn(() => pending.resolve({ status: 'cancelled', missingSceneIds: ['scene_2'] }));
    const runner = createStudioRenderRunner({
      startOperation: (): StudioRenderOperation => ({ result: pending.promise, cancel }),
      onStateChanged: vi.fn(),
    });

    const result = runner.renderCut('project_1');

    expect(runner.cancelRender('project_1')).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
    await expect(result).rejects.toMatchObject({ code: 'cancelled' });
    expect(runner.getState('project_1')).toEqual({
      projectId: 'project_1',
      status: 'cancelled',
      progress: 0,
      missingSceneIds: ['scene_2'],
    });
  });

  it.each([
    [
      () => Promise.resolve<StudioRenderResult>({ status: 'no_renderable_scenes', missingSceneIds: ['scene_1'] }),
      'no_renderable_scenes',
      ['scene_1'],
    ],
    [() => Promise.reject(new CreativeStudioRenderError('ffmpeg_unavailable')), 'ffmpeg_unavailable', undefined],
    [() => Promise.reject(new CreativeStudioRenderError('render_failed')), 'render_failed', undefined],
  ] as const)('exposes a failed terminal state for %s', async (createResult, code, missingSceneIds) => {
    const runner = createStudioRenderRunner({
      startOperation: () => ({ result: createResult(), cancel: vi.fn() }),
      onStateChanged: vi.fn(),
    });

    await expect(runner.renderCut('project_1')).rejects.toMatchObject({ code });
    expect(runner.getState('project_1')).toEqual({
      projectId: 'project_1',
      status: 'failed',
      progress: 0,
      errorCode: code,
      ...(missingSceneIds === undefined ? {} : { missingSceneIds }),
    });
  });
});

describe.skipIf(!ffmpegAvailable)('renderCut with real ffmpeg and ffprobe', () => {
  it('renders a manual cut in clip order instead of scene order', async () => {
    const harness = await createHarness([
      { id: 'scene_short', mediaKind: 'image', durationSeconds: 1, fixture: 'image' },
      { id: 'scene_long', mediaKind: 'image', durationSeconds: 2, fixture: 'image' },
    ]);
    await setActiveCut(harness, {
      orderMode: 'manual',
      clipSceneIds: ['scene_short', 'scene_long'],
      clipOrderSceneIds: ['scene_long', 'scene_short'],
    });

    const result = await renderCut('project_1', {
      store: harness.store,
      mediaStore: harness.mediaStore,
      environment: { ...process.env, FFMPEG_PATH: ffmpegPath },
      temporaryRoot: harness.temporaryRoot,
    }).result;

    expect(result).toEqual({ status: 'rendered', assetId: 'render_asset', missingSceneIds: [] });
    const keyframeTimes = await probeVideoKeyframeTimes(harness.outputPath);
    // The second segment starts at 2s only when the two-second clip renders first; scene order starts it at 1s.
    expect(keyframeTimes[1]).toBeCloseTo(2, 1);
  }, 60_000);

  it('renders a storyboard cut identically to the legacy no-cut project', async () => {
    const inputs: SceneInput[] = [
      { id: 'scene_short', mediaKind: 'image', durationSeconds: 1, fixture: 'image' },
      { id: 'scene_long', mediaKind: 'image', durationSeconds: 2, fixture: 'image' },
    ];
    const legacyHarness = await createHarness(inputs);
    const storyboardHarness = await createHarness(inputs);
    await setActiveCut(storyboardHarness, {
      orderMode: 'storyboard',
      clipSceneIds: ['scene_short', 'scene_long'],
    });

    const [legacyResult, storyboardResult] = await Promise.all(
      [legacyHarness, storyboardHarness].map(
        (harness) =>
          renderCut('project_1', {
            store: harness.store,
            mediaStore: harness.mediaStore,
            environment: { ...process.env, FFMPEG_PATH: ffmpegPath },
            temporaryRoot: harness.temporaryRoot,
          }).result
      )
    );

    expect(storyboardResult).toEqual(legacyResult);
    expect(await probe(storyboardHarness.outputPath)).toEqual(await probe(legacyHarness.outputPath));
    const legacyKeyframes = await probeVideoKeyframeTimes(legacyHarness.outputPath);
    expect(await probeVideoKeyframeTimes(storyboardHarness.outputPath)).toEqual(legacyKeyframes);
    expect(legacyKeyframes[1]).toBeCloseTo(1, 1);
  }, 60_000);

  it('drops a non-canonical clip asset and reports it with scenes that have no clip', async () => {
    const harness = await createHarness([
      { id: 'scene_valid', mediaKind: 'image', durationSeconds: 1, fixture: 'image' },
      { id: 'scene_invalid', mediaKind: 'image', durationSeconds: 1, fixture: 'image' },
      { id: 'scene_without_clip', mediaKind: 'image', durationSeconds: 1, fixture: 'image' },
    ]);
    await setActiveCut(harness, {
      orderMode: 'manual',
      clipSceneIds: ['scene_valid', 'scene_invalid'],
    });
    const store = await storeWithNonCanonicalClipAssets(harness, ['scene_invalid']);

    const result = await renderCut('project_1', {
      store,
      mediaStore: harness.mediaStore,
      environment: { ...process.env, FFMPEG_PATH: ffmpegPath },
      temporaryRoot: harness.temporaryRoot,
    }).result;

    // The selected take stays canonical so this fails if render ignores clip.assetId.
    expect(result).toEqual({
      status: 'rendered',
      assetId: 'render_asset',
      missingSceneIds: ['scene_invalid', 'scene_without_clip'],
    });
    expect(Number((await probe(harness.outputPath)).format.duration)).toBeCloseTo(1, 1);
  }, 60_000);

  it('returns no_renderable_scenes when every active-cut clip asset is non-canonical', async () => {
    const harness = await createHarness([
      { id: 'scene_one', mediaKind: 'image', durationSeconds: 1, fixture: 'image' },
      { id: 'scene_two', mediaKind: 'image', durationSeconds: 1, fixture: 'image' },
    ]);
    await setActiveCut(harness, {
      orderMode: 'manual',
      clipSceneIds: ['scene_one', 'scene_two'],
    });
    const store = await storeWithNonCanonicalClipAssets(harness, ['scene_one', 'scene_two']);
    let spawnCount = 0;
    const spawnProcess: StudioRenderSpawn = (command, args, options) => {
      spawnCount += 1;
      return spawn(command, args, options);
    };

    const result = await renderCut('project_1', {
      store,
      mediaStore: harness.mediaStore,
      spawnProcess,
      environment: { ...process.env, FFMPEG_PATH: ffmpegPath },
      temporaryRoot: harness.temporaryRoot,
    }).result;

    expect(result).toEqual({
      status: 'no_renderable_scenes',
      missingSceneIds: ['scene_one', 'scene_two'],
    });
    expect(spawnCount).toBe(0);
    await expect(fs.access(harness.outputPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('renders an image and video into a revision-neutral 720p cut and reports a missing scene', async () => {
    const harness = await createHarness([
      { id: 'scene_image', mediaKind: 'image', durationSeconds: 1, fixture: 'image' },
      {
        id: 'scene_video',
        mediaKind: 'video',
        durationSeconds: 1,
        fixture: 'videoWithAudio',
        assetDurationSeconds: 1,
      },
      { id: 'scene_missing', mediaKind: 'video', durationSeconds: 1 },
    ]);

    const operation = renderCut('project_1', {
      store: harness.store,
      mediaStore: harness.mediaStore,
      environment: { ...process.env, FFMPEG_PATH: ffmpegPath },
      temporaryRoot: harness.temporaryRoot,
    });
    const result = await operation.result;

    expect(result).toEqual({
      status: 'rendered',
      assetId: 'render_asset',
      missingSceneIds: ['scene_missing'],
    });
    const details = await probe(harness.outputPath);
    const video = details.streams.find((stream) => stream.codec_type === 'video');
    const audio = details.streams.find((stream) => stream.codec_type === 'audio');
    expect(details.streams.map((stream) => stream.codec_type).toSorted()).toEqual(['audio', 'video']);
    expect(video).toMatchObject({
      codec_name: 'h264',
      profile: 'High',
      pix_fmt: 'yuv420p',
      width: 1280,
      height: 720,
      time_base: '1/90000',
    });
    const [frameRateNumerator, frameRateDenominator] = video?.avg_frame_rate?.split('/').map(Number) ?? [];
    expect(frameRateNumerator! / frameRateDenominator!).toBeCloseTo(30, 0);
    expect(audio).toMatchObject({ codec_name: 'aac', sample_rate: '48000', channels: 2 });
    expect(Number(details.format.duration)).toBeCloseTo(2, 1);

    const stored = await harness.store.getProject('project_1');
    expect(stored?.revision).toBe(harness.projectRevision);
    expect(stored).not.toHaveProperty('cuts');
    await expect(harness.mediaStore.resolveAsset('project_1', 'render_asset')).resolves.toMatchObject({
      asset: { sceneId: null, managedAsset: { collection: 'assets' } },
    });
    await expect(fs.readdir(harness.temporaryRoot)).resolves.toEqual([]);
  }, 60_000);

  it('keeps one aligned audio stream when a silent take precedes a non-silent take', async () => {
    const harness = await createHarness([
      { id: 'scene_silent', mediaKind: 'video', durationSeconds: 1, fixture: 'silentVideo' },
      { id: 'scene_audio', mediaKind: 'video', durationSeconds: 1, fixture: 'videoWithAudio' },
    ]);
    const progress: number[] = [];

    const result = await renderCut('project_1', {
      store: harness.store,
      mediaStore: harness.mediaStore,
      environment: { ...process.env, FFMPEG_PATH: ffmpegPath },
      temporaryRoot: harness.temporaryRoot,
      onProgress: (value) => progress.push(value),
    }).result;

    expect(result.status).toBe('rendered');
    const details = await probe(harness.outputPath);
    const video = details.streams.find((stream) => stream.codec_type === 'video');
    const audio = details.streams.find((stream) => stream.codec_type === 'audio');
    expect(audio).toBeDefined();
    expect(Math.abs(Number(video?.duration) - Number(audio?.duration))).toBeLessThan(0.12);

    const { stderr } = await run(ffmpegPath, [
      '-hide_banner',
      '-ss',
      '1.1',
      '-t',
      '0.7',
      '-i',
      harness.outputPath,
      '-map',
      '0:a:0',
      '-af',
      'volumedetect',
      '-f',
      'null',
      '-',
    ]);
    const meanVolume = /mean_volume:\s*(-?[\d.]+) dB/.exec(stderr);
    expect(Number(meanVolume?.[1])).toBeGreaterThan(-50);
    expect(progress.at(-1)).toBe(1);
    expect(progress.every((value, index) => index === 0 || value >= progress[index - 1]!)).toBe(true);
  }, 60_000);

  it('returns no_renderable_scenes without invoking ffmpeg for a selected import', async () => {
    const harness = await createHarness([
      {
        id: 'scene_import',
        mediaKind: 'image',
        durationSeconds: 1,
        fixture: 'image',
        collection: 'imports',
      },
    ]);
    let spawnCount = 0;
    const spawnProcess: StudioRenderSpawn = (command, args, options) => {
      spawnCount += 1;
      return spawn(command, args, options);
    };

    const result = await renderCut('project_1', {
      store: harness.store,
      mediaStore: harness.mediaStore,
      spawnProcess,
      environment: { ...process.env, FFMPEG_PATH: ffmpegPath },
      temporaryRoot: harness.temporaryRoot,
    }).result;

    expect(result).toEqual({ status: 'no_renderable_scenes', missingSceneIds: ['scene_import'] });
    expect(spawnCount).toBe(0);
    await expect(fs.readdir(harness.temporaryRoot)).resolves.toEqual([]);
  });

  it('kills the active ffmpeg process and removes its private temp directory on cancellation', async () => {
    const harness = await createHarness(
      [{ id: 'scene_long', mediaKind: 'image', durationSeconds: 60, fixture: 'image' }],
      { resolution: '1080p' }
    );
    let segmentProcessId: number | undefined;
    let operation: ReturnType<typeof renderCut>;
    const spawnProcess: StudioRenderSpawn = (command, args, options) => {
      const child = spawn(command, args, options);
      if (args.some((argument) => argument.endsWith('segment-0000.mp4'))) {
        segmentProcessId = child.pid;
        queueMicrotask(() => operation.cancel());
      }
      return child;
    };

    operation = renderCut('project_1', {
      store: harness.store,
      mediaStore: harness.mediaStore,
      spawnProcess,
      environment: { ...process.env, FFMPEG_PATH: ffmpegPath },
      temporaryRoot: harness.temporaryRoot,
    });
    const result = await operation.result;

    expect(result).toEqual({ status: 'cancelled', missingSceneIds: [] });
    expect(segmentProcessId).toBeTypeOf('number');
    expect(() => process.kill(segmentProcessId!, 0)).toThrow();
    await expect(fs.readdir(harness.temporaryRoot)).resolves.toEqual([]);
    await expect(fs.access(harness.outputPath)).rejects.toMatchObject({ code: 'ENOENT' });
  }, 60_000);

  it('reports ffmpeg_unavailable without changing the project or leaving temporary files', async () => {
    const harness = await createHarness([
      { id: 'scene_image', mediaKind: 'image', durationSeconds: 1, fixture: 'image' },
    ]);
    const before = await harness.store.getProject('project_1');

    await expect(
      renderCut('project_1', {
        store: harness.store,
        mediaStore: harness.mediaStore,
        environment: { ...process.env, FFMPEG_PATH: '/nonexistent' },
        temporaryRoot: harness.temporaryRoot,
      }).result
    ).rejects.toMatchObject<Partial<CreativeStudioRenderError>>({ code: 'ffmpeg_unavailable' });

    await expect(harness.store.getProject('project_1')).resolves.toEqual(before);
    await expect(fs.readdir(harness.temporaryRoot)).resolves.toEqual([]);
    await expect(fs.access(harness.outputPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('reports render_failed with a sanitized stderr tail and cleans up a bad input', async () => {
    const harness = await createHarness([
      { id: 'scene_video', mediaKind: 'video', durationSeconds: 1, fixture: 'silentVideo' },
    ]);
    const corruptInput = path.join(harness.rootDir, 'corrupt.mp4');
    await fs.writeFile(corruptInput, 'not a media file');
    const resolved = (await harness.mediaStore.resolveAsset('project_1', 'asset_scene_video'))!;

    let caught: CreativeStudioRenderError | undefined;
    try {
      await renderCut('project_1', {
        store: harness.store,
        mediaStore: {
          resolveAsset: async () => ({
            asset: resolved.asset,
            openVerifiedStream: async () => createReadStream(corruptInput),
          }),
          persistProjectOutput: harness.mediaStore.persistProjectOutput,
        },
        environment: { ...process.env, FFMPEG_PATH: ffmpegPath },
        temporaryRoot: harness.temporaryRoot,
      }).result;
    } catch (error) {
      caught = error as CreativeStudioRenderError;
    }

    expect(caught).toMatchObject({ code: 'render_failed', message: 'render_failed' });
    expect(caught?.stderrTail).toContain('[render-temp]');
    expect(caught?.stderrTail).not.toContain('aionui-studio-render-');
    await expect(fs.readdir(harness.temporaryRoot)).resolves.toEqual([]);
    await expect(fs.access(harness.outputPath)).rejects.toMatchObject({ code: 'ENOENT' });
  }, 60_000);
});
