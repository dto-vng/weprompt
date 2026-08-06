/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from 'node:child_process';
import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type {
  StudioAspectRatio,
  StudioAsset,
  StudioProject,
  StudioResolution,
  StudioScene,
} from '@/common/types/project/creativeStudioTypes';
import { isCanonicalStudioGeneratedTake } from '@/common/types/project/creativeStudioCanonicalTake';
import type { StudioMediaStore } from './mediaStore';
import type { CreativeStudioStore } from './store';

const RENDER_FPS = 30;
const RENDER_PIXEL_FORMAT = 'yuv420p';
const STDERR_TAIL_BYTES = 16 * 1024;
const NORMALISE_PROGRESS_SHARE = 0.75;
const CONCAT_PROGRESS_SHARE = 0.24;

const RENDER_DIMENSIONS = {
  '720p': {
    '16:9': { width: 1280, height: 720 },
    '9:16': { width: 720, height: 1280 },
    '1:1': { width: 720, height: 720 },
    '4:3': { width: 960, height: 720 },
    '3:4': { width: 720, height: 960 },
  },
  '1080p': {
    '16:9': { width: 1920, height: 1080 },
    '9:16': { width: 1080, height: 1920 },
    '1:1': { width: 1080, height: 1080 },
    '4:3': { width: 1440, height: 1080 },
    '3:4': { width: 1080, height: 1440 },
  },
} as const satisfies Record<StudioResolution, Record<StudioAspectRatio, { width: number; height: number }>>;

export const resolveStudioRenderDimensions = (
  resolution: StudioResolution,
  aspectRatio: StudioAspectRatio
): { width: number; height: number } => ({ ...RENDER_DIMENSIONS[resolution][aspectRatio] });

export type StudioRenderResult =
  | { status: 'rendered'; assetId: string; missingSceneIds: string[] }
  | { status: 'no_renderable_scenes'; missingSceneIds: string[] }
  | { status: 'cancelled'; missingSceneIds: string[] };

export type StudioRenderOperation = {
  result: Promise<StudioRenderResult>;
  cancel(): void;
};

export type StudioRenderSpawn = (
  command: string,
  args: string[],
  options: SpawnOptionsWithoutStdio
) => ChildProcessWithoutNullStreams;

export type StudioRenderDeps = {
  store: Pick<CreativeStudioStore, 'getProject'>;
  mediaStore: Pick<StudioMediaStore, 'resolveAsset' | 'persistProjectOutput'>;
  onProgress?: (progress: number) => void;
  environment?: NodeJS.ProcessEnv;
  temporaryRoot?: string;
  spawnProcess?: StudioRenderSpawn;
};

export class CreativeStudioRenderError extends Error {
  readonly code: 'ffmpeg_unavailable' | 'render_failed';
  readonly stderrTail?: string;

  constructor(code: CreativeStudioRenderError['code'], stderrTail?: string) {
    super(code);
    this.name = 'CreativeStudioRenderError';
    this.code = code;
    if (stderrTail !== undefined) this.stderrTail = stderrTail;
  }
}

type RenderSegment = {
  scene: StudioScene;
  asset: StudioAsset;
  openVerifiedStream: () => Promise<Readable>;
  inputPath?: string;
  outputPath?: string;
};

type RenderState = {
  cancelled: boolean;
  activeProcess: ChildProcessWithoutNullStreams | null;
  activeStream: Readable | null;
};

type FfmpegRunResult = {
  code: number | null;
  stderrTail: string;
};

class RenderCancelledError extends Error {}

const appendTail = (current: string, chunk: Buffer): string => {
  const combined = current + chunk.toString('utf8');
  return Buffer.byteLength(combined, 'utf8') <= STDERR_TAIL_BYTES
    ? combined
    : Buffer.from(combined, 'utf8').subarray(-STDERR_TAIL_BYTES).toString('utf8');
};

const parseProgressTime = (line: string): number | null => {
  if (!line.startsWith('out_time=')) return null;
  const match = /^out_time=(\d+):(\d+):(\d+(?:\.\d+)?)$/.exec(line);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const value = hours * 3600 + minutes * 60 + seconds;
  return Number.isFinite(value) ? value : null;
};

const unavailableSpawnError = (error: unknown): boolean => {
  const code = (error as NodeJS.ErrnoException).code;
  return code === 'ENOENT' || code === 'EACCES' || code === 'ENOTDIR';
};

const runFfmpeg = (
  binary: string,
  args: string[],
  options: {
    state: RenderState;
    environment: NodeJS.ProcessEnv;
    spawnProcess: StudioRenderSpawn;
    cwd?: string;
    onOutTime?: (seconds: number) => void;
  }
): Promise<FfmpegRunResult> => {
  if (options.state.cancelled) return Promise.reject(new RenderCancelledError());
  return new Promise<FfmpegRunResult>((resolve, reject) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = options.spawnProcess(binary, args, {
        cwd: options.cwd,
        env: options.environment,
        windowsHide: true,
      });
    } catch (error) {
      reject(
        unavailableSpawnError(error)
          ? new CreativeStudioRenderError('ffmpeg_unavailable')
          : new CreativeStudioRenderError('render_failed')
      );
      return;
    }
    options.state.activeProcess = child;
    let settled = false;
    let stderrTail = '';
    let progressBuffer = '';
    const finish = (work: () => void): void => {
      if (settled) return;
      settled = true;
      if (options.state.activeProcess === child) options.state.activeProcess = null;
      work();
    };
    child.stderr.on('data', (chunk: Buffer) => {
      stderrTail = appendTail(stderrTail, chunk);
    });
    child.stdout.on('data', (chunk: Buffer) => {
      progressBuffer += chunk.toString('utf8');
      const lines = progressBuffer.split(/\r?\n/);
      progressBuffer = lines.pop() ?? '';
      for (const line of lines) {
        const seconds = parseProgressTime(line);
        if (seconds !== null) options.onOutTime?.(seconds);
      }
    });
    child.once('error', (error) => {
      finish(() => {
        if (options.state.cancelled) reject(new RenderCancelledError());
        else if (unavailableSpawnError(error)) reject(new CreativeStudioRenderError('ffmpeg_unavailable'));
        else reject(new CreativeStudioRenderError('render_failed'));
      });
    });
    child.once('close', (code) => {
      finish(() => {
        if (options.state.cancelled) reject(new RenderCancelledError());
        else resolve({ code, stderrTail });
      });
    });
  });
};

const sanitizedTail = (tail: string, temporaryDirectory: string): string =>
  tail.replaceAll(temporaryDirectory, '[render-temp]').trim().slice(-STDERR_TAIL_BYTES);

const requireSuccess = (result: FfmpegRunResult, temporaryDirectory: string): void => {
  if (result.code === 0) return;
  const tail = sanitizedTail(result.stderrTail, temporaryDirectory);
  throw new CreativeStudioRenderError('render_failed', tail || undefined);
};

const selectEncoder = async (
  binary: string,
  dimensions: { width: number; height: number },
  runOptions: Omit<Parameters<typeof runFfmpeg>[2], 'onOutTime'>,
  temporaryDirectory: string
): Promise<'h264_videotoolbox' | 'libx264'> => {
  const probe = (encoder: 'h264_videotoolbox' | 'libx264') =>
    runFfmpeg(
      binary,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        `color=c=black:s=${dimensions.width}x${dimensions.height}:r=${RENDER_FPS}:d=0.04`,
        '-frames:v',
        '1',
        '-an',
        '-c:v',
        encoder,
        '-pix_fmt',
        RENDER_PIXEL_FORMAT,
        '-f',
        'null',
        '-',
      ],
      runOptions
    );
  const hardware = await probe('h264_videotoolbox');
  if (hardware.code === 0) return 'h264_videotoolbox';
  const software = await probe('libx264');
  requireSuccess(software, temporaryDirectory);
  return 'libx264';
};

const videoHasAudio = async (
  binary: string,
  inputPath: string,
  runOptions: Omit<Parameters<typeof runFfmpeg>[2], 'onOutTime'>,
  temporaryDirectory: string
): Promise<boolean> => {
  const result = await runFfmpeg(
    binary,
    ['-hide_banner', '-loglevel', 'error', '-i', inputPath, '-map', '0:a:0', '-frames:a', '1', '-f', 'null', '-'],
    runOptions
  );
  if (result.code === 0) return true;
  if (/matches no streams|does not contain any stream/i.test(result.stderrTail)) return false;
  requireSuccess(result, temporaryDirectory);
  return false;
};

const normalizationFilter = ({ width, height }: { width: number; height: number }): string =>
  [
    `scale=${width}:${height}:force_original_aspect_ratio=decrease:force_divisible_by=2`,
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
    'setsar=1',
    `fps=${RENDER_FPS}`,
    `format=${RENDER_PIXEL_FORMAT}`,
    'setpts=PTS-STARTPTS',
  ].join(',');

const encodeSegment = async (
  binary: string,
  encoder: 'h264_videotoolbox' | 'libx264',
  segment: RenderSegment,
  dimensions: { width: number; height: number },
  runOptions: Omit<Parameters<typeof runFfmpeg>[2], 'onOutTime'>,
  temporaryDirectory: string,
  onOutTime: (seconds: number) => void
): Promise<void> => {
  const inputPath = segment.inputPath!;
  const outputPath = segment.outputPath!;
  const inputArgs: string[] = [];
  const mappingArgs: string[] = ['-map', '0:v:0'];
  const durationArgs: string[] = [];
  let audioFilter: string;
  if (segment.scene.mediaKind === 'image') {
    inputArgs.push('-loop', '1', '-t', String(segment.scene.durationSeconds), '-i', inputPath);
    inputArgs.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
    mappingArgs.push('-map', '1:a:0');
    durationArgs.push('-t', String(segment.scene.durationSeconds));
    audioFilter = 'asetpts=PTS-STARTPTS';
  } else if (await videoHasAudio(binary, inputPath, runOptions, temporaryDirectory)) {
    inputArgs.push('-i', inputPath);
    mappingArgs.push('-map', '0:a:0');
    audioFilter = 'aresample=48000:async=1:first_pts=0,apad,asetpts=PTS-STARTPTS';
  } else {
    inputArgs.push('-i', inputPath);
    inputArgs.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
    mappingArgs.push('-map', '1:a:0');
    audioFilter = 'asetpts=PTS-STARTPTS';
  }
  const result = await runFfmpeg(
    binary,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      ...inputArgs,
      ...mappingArgs,
      '-vf',
      normalizationFilter(dimensions),
      '-af',
      audioFilter,
      ...durationArgs,
      '-shortest',
      '-c:v',
      encoder,
      '-profile:v',
      'high',
      '-pix_fmt',
      RENDER_PIXEL_FORMAT,
      '-r',
      String(RENDER_FPS),
      '-fps_mode',
      'cfr',
      '-g',
      String(RENDER_FPS * 2),
      '-b:v',
      dimensions.height >= 1080 || dimensions.width >= 1920 ? '8M' : '5M',
      '-video_track_timescale',
      '90000',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-ar',
      '48000',
      '-ac',
      '2',
      '-avoid_negative_ts',
      'make_zero',
      '-movflags',
      '+faststart',
      '-progress',
      'pipe:1',
      '-nostats',
      '-y',
      outputPath,
    ],
    { ...runOptions, onOutTime }
  );
  requireSuccess(result, temporaryDirectory);
};

const concatSegments = async (
  binary: string,
  segments: RenderSegment[],
  temporaryDirectory: string,
  runOptions: Omit<Parameters<typeof runFfmpeg>[2], 'onOutTime'>,
  onOutTime: (seconds: number) => void
): Promise<string> => {
  const concatPath = path.join(temporaryDirectory, 'concat.txt');
  await fs.writeFile(
    concatPath,
    segments.map((segment) => `file '${path.basename(segment.outputPath!)}'`).join('\n') + '\n',
    'utf8'
  );
  const outputPath = path.join(temporaryDirectory, 'render.mp4');
  const result = await runFfmpeg(
    binary,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'concat',
      '-safe',
      '1',
      '-i',
      path.basename(concatPath),
      '-map',
      '0:v:0',
      '-map',
      '0:a:0',
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      '-progress',
      'pipe:1',
      '-nostats',
      '-y',
      path.basename(outputPath),
    ],
    { ...runOptions, cwd: temporaryDirectory, onOutTime }
  );
  requireSuccess(result, temporaryDirectory);
  return outputPath;
};

const readSegments = async (
  project: StudioProject,
  mediaStore: StudioRenderDeps['mediaStore'],
  state: RenderState
): Promise<{ segments: RenderSegment[]; missingSceneIds: string[] }> => {
  const segments: RenderSegment[] = [];
  const missingSceneIds: string[] = [];
  for (const sceneId of project.sceneOrder) {
    if (state.cancelled) throw new RenderCancelledError();
    const scene = project.scenes[sceneId];
    const selected =
      scene?.selectedAssetId === null || scene === undefined ? undefined : project.assets[scene.selectedAssetId];
    if (!scene || !selected || !isCanonicalStudioGeneratedTake(selected, project.id, scene)) {
      missingSceneIds.push(sceneId);
      continue;
    }
    // Selection and verification stay ordered so cancellation never leaves parallel reads alive.
    // eslint-disable-next-line no-await-in-loop
    const resolved = await mediaStore.resolveAsset(project.id, selected.id);
    if (
      !resolved ||
      resolved.asset.id !== selected.id ||
      !isCanonicalStudioGeneratedTake(resolved.asset, project.id, scene)
    ) {
      missingSceneIds.push(sceneId);
      continue;
    }
    segments.push({
      scene,
      asset: resolved.asset,
      openVerifiedStream: resolved.openVerifiedStream,
    });
  }
  return { segments, missingSceneIds };
};

const executeRender = async (
  projectId: string,
  deps: StudioRenderDeps,
  state: RenderState,
  reportProgress: (progress: number) => void
): Promise<StudioRenderResult> => {
  let temporaryDirectory: string | null = null;
  let missingSceneIds: string[] = [];
  try {
    const project = await deps.store.getProject(projectId);
    if (project === null) throw new CreativeStudioRenderError('render_failed');
    const selection = await readSegments(project, deps.mediaStore, state);
    missingSceneIds = selection.missingSceneIds;
    if (selection.segments.length === 0) {
      return { status: 'no_renderable_scenes', missingSceneIds };
    }
    if (state.cancelled) throw new RenderCancelledError();
    temporaryDirectory = await fs.mkdtemp(
      path.join(
        deps.temporaryRoot === undefined ? os.tmpdir() : path.resolve(deps.temporaryRoot),
        'aionui-studio-render-'
      )
    );
    reportProgress(0);
    for (const [index, segment] of selection.segments.entries()) {
      if (state.cancelled) throw new RenderCancelledError();
      const extension = path.extname(segment.asset.managedAsset.fileName);
      segment.inputPath = path.join(temporaryDirectory, `input-${String(index).padStart(4, '0')}${extension}`);
      segment.outputPath = path.join(temporaryDirectory, `segment-${String(index).padStart(4, '0')}.mp4`);
      // One active stream makes cancellation deterministic and bounds temporary disk writes.
      // eslint-disable-next-line no-await-in-loop
      const input = await segment.openVerifiedStream();
      state.activeStream = input;
      // eslint-disable-next-line no-await-in-loop
      await pipeline(input, createWriteStream(segment.inputPath, { flags: 'wx' }));
      if (state.activeStream === input) state.activeStream = null;
    }
    const environment = deps.environment ?? process.env;
    const binary = environment.FFMPEG_PATH?.trim() || 'ffmpeg';
    const spawnProcess: StudioRenderSpawn =
      deps.spawnProcess ?? ((command, args, options) => spawn(command, args, options));
    const runOptions = { state, environment, spawnProcess };
    const dimensions = resolveStudioRenderDimensions(project.resolution, project.aspectRatio);
    const encoder = await selectEncoder(binary, dimensions, runOptions, temporaryDirectory);
    const expectedDurations = selection.segments.map((segment) =>
      segment.scene.mediaKind === 'image' ? segment.scene.durationSeconds : segment.asset.durationSeconds
    );
    const hasKnownDuration = expectedDurations.every((duration): duration is number => duration !== undefined);
    const totalDuration = hasKnownDuration ? expectedDurations.reduce((total, duration) => total + duration, 0) : null;
    let completedDuration = 0;
    for (const [index, segment] of selection.segments.entries()) {
      const segmentDuration = expectedDurations[index];
      // Sequential encoding keeps ffmpeg resource use bounded and produces deterministic progress.
      // eslint-disable-next-line no-await-in-loop
      await encodeSegment(binary, encoder, segment, dimensions, runOptions, temporaryDirectory, (outTime) => {
        if (totalDuration !== null) {
          reportProgress(NORMALISE_PROGRESS_SHARE * Math.min(1, (completedDuration + outTime) / totalDuration));
        }
      });
      if (totalDuration !== null && segmentDuration !== undefined) {
        completedDuration += segmentDuration;
        reportProgress(NORMALISE_PROGRESS_SHARE * Math.min(1, completedDuration / totalDuration));
      } else {
        reportProgress(NORMALISE_PROGRESS_SHARE * ((index + 1) / selection.segments.length));
      }
    }
    const outputPath = await concatSegments(binary, selection.segments, temporaryDirectory, runOptions, (outTime) => {
      if (totalDuration !== null) {
        reportProgress(NORMALISE_PROGRESS_SHARE + CONCAT_PROGRESS_SHARE * Math.min(1, outTime / totalDuration));
      }
    });
    reportProgress(NORMALISE_PROGRESS_SHARE + CONCAT_PROGRESS_SHARE);
    if (state.cancelled) throw new RenderCancelledError();
    const stats = await fs.stat(outputPath);
    const output = createReadStream(outputPath);
    state.activeStream = output;
    const asset = await deps.mediaStore.persistProjectOutput({
      projectId,
      declaredMimeType: 'video/mp4',
      declaredByteSize: stats.size,
      width: dimensions.width,
      height: dimensions.height,
      ...(totalDuration === null ? {} : { durationSeconds: totalDuration }),
      body: output,
    });
    if (state.activeStream === output) state.activeStream = null;
    if (state.cancelled) throw new RenderCancelledError();
    reportProgress(1);
    return { status: 'rendered', assetId: asset.id, missingSceneIds };
  } catch (error) {
    if (state.cancelled || error instanceof RenderCancelledError) return { status: 'cancelled', missingSceneIds };
    if (error instanceof CreativeStudioRenderError) throw error;
    throw new CreativeStudioRenderError('render_failed');
  } finally {
    state.activeStream = null;
    state.activeProcess = null;
    if (temporaryDirectory !== null) {
      await fs.rm(temporaryDirectory, { recursive: true, force: true }).catch((): undefined => undefined);
    }
  }
};

/** Starts a pristine-cut render without entering the project's serialized mutation queue. */
export const renderCut = (projectId: string, deps: StudioRenderDeps): StudioRenderOperation => {
  const state: RenderState = { cancelled: false, activeProcess: null, activeStream: null };
  let lastProgress = 0;
  const reportProgress = (progress: number): void => {
    const next = Math.max(lastProgress, Math.min(1, progress));
    if (next === lastProgress && next !== 0) return;
    lastProgress = next;
    try {
      deps.onProgress?.(next);
    } catch {
      // A relay callback cannot invalidate a local render.
    }
  };
  const operation: StudioRenderOperation = {
    result: executeRender(projectId, deps, state, reportProgress),
    cancel(): void {
      if (state.cancelled) return;
      state.cancelled = true;
      state.activeStream?.destroy(new RenderCancelledError());
      state.activeProcess?.kill('SIGKILL');
    },
  };
  return operation;
};
