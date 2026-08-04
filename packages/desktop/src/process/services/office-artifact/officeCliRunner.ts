/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFile as nodeExecFile, spawn as nodeSpawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

import { PRESENTATION_RUN_LIMITS } from '@/common/config/constants';
import { OfficeArtifactError, parseOfficeCliEnvelope, parseOfficeCliMatchedEnvelope } from './officeCliJson';

type OfficeCliExecFileOptions = {
  shell: false;
  windowsHide: true;
  timeout: number;
  maxBuffer: number;
};

type OfficeCliExecFileError = Error & {
  code?: string | number | null;
  killed?: boolean;
  signal?: NodeJS.Signals | null;
};

type OfficeCliSpawnOptions = {
  shell: false;
  windowsHide: true;
  stdio: ['ignore', 'pipe', 'pipe'];
};

type OfficeCliWatchStream = {
  on: (event: 'data', listener: (chunk: Buffer | string) => void) => unknown;
};

export type OfficeCliWatchProcess = {
  stdout: OfficeCliWatchStream;
  stderr: OfficeCliWatchStream;
  once: {
    (event: 'error', listener: (error: OfficeCliExecFileError) => void): unknown;
    (event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
  };
  kill: (signal: NodeJS.Signals) => boolean;
};

export type OfficeCliSpawn = (file: string, args: string[], options: OfficeCliSpawnOptions) => OfficeCliWatchProcess;

export type OfficeCliPreviewSession = {
  url: string;
  stop: () => Promise<void>;
};

export type OfficeCliTextFormat = 'docx' | 'pptx';

export type OfficeCliTextView = {
  totalItems: number;
  returnedItems: number;
  textItems: string[];
};

export type OfficeCliExecFile = (
  file: string,
  args: string[],
  options: OfficeCliExecFileOptions,
  callback: (error: OfficeCliExecFileError | null, stdout: string, stderr: string) => void
) => unknown;

export type OfficeCliRunner = {
  get: (file: string, path: string) => Promise<unknown>;
  replaceText: (file: string, path: string, find: string, replace: string) => Promise<unknown>;
  formatRange: (
    file: string,
    path: string,
    start: number,
    end: number,
    property: 'bold' | 'italic' | 'underline',
    enabled: boolean
  ) => Promise<unknown>;
  setCell: (file: string, path: string, input: string) => Promise<unknown>;
  validate: (file: string) => Promise<unknown>;
  viewText: (file: string, format: OfficeCliTextFormat) => Promise<OfficeCliTextView>;
  close: (file: string) => Promise<unknown>;
  watch: (file: string) => Promise<OfficeCliPreviewSession>;
};

/** Narrow OfficeCLI capability used by exact-hash presentation inspection. */
export type OfficeCliRenderRunner = {
  renderSlide: (file: string, page: number, outputPath: string) => Promise<void>;
};

export type FullOfficeCliRunner = OfficeCliRunner & OfficeCliRenderRunner;

export type OfficeCliRunnerDependencies = {
  binaryPath?: string;
  execFile?: OfficeCliExecFile;
  spawn?: OfficeCliSpawn;
  allocatePort?: () => Promise<number>;
  environment?: NodeJS.ProcessEnv;
  exists?: (path: string) => boolean;
  homeDirectory?: string;
  platform?: NodeJS.Platform;
};

const EXEC_OPTIONS: OfficeCliExecFileOptions = {
  shell: false,
  windowsHide: true,
  timeout: 30_000,
  maxBuffer: PRESENTATION_RUN_LIMITS.MAX_OFFICECLI_STDOUT_BYTES,
};

const RENDER_EXEC_OPTIONS: OfficeCliExecFileOptions = {
  ...EXEC_OPTIONS,
  timeout: 90_000,
};

const WATCH_OPTIONS: OfficeCliSpawnOptions = {
  shell: false,
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
};
const WATCH_READY_TIMEOUT_MS = 60_000;
const WATCH_STOP_TIMEOUT_MS = 5_000;

const defaultExecFile: OfficeCliExecFile = (file, args, options, callback) => {
  nodeExecFile(file, args, options, (error, stdout, stderr) => {
    callback(error, stdout.toString(), stderr.toString());
  });
};

const defaultSpawn: OfficeCliSpawn = (file, args, options) =>
  nodeSpawn(file, args, options) as unknown as OfficeCliWatchProcess;

function allocatePreviewPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new OfficeArtifactError('PREVIEW_FAILED'));
        return;
      }
      server.close((error) => {
        if (error) reject(new OfficeArtifactError('PREVIEW_FAILED'));
        else resolve(address.port);
      });
    });
  });
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function resolveOfficeCliBinary(dependencies: OfficeCliRunnerDependencies): string {
  if (dependencies.binaryPath) return dependencies.binaryPath;

  const environmentBinary = (dependencies.environment ?? process.env).OFFICECLI_PATH;
  if (environmentBinary && isAbsolute(environmentBinary)) return environmentBinary;

  const platform = dependencies.platform ?? process.platform;
  const localBinary = join(
    dependencies.homeDirectory ?? homedir(),
    '.local',
    'bin',
    platform === 'win32' ? 'officecli.exe' : 'officecli'
  );
  if ((dependencies.exists ?? existsSync)(localBinary)) return localBinary;

  return 'officecli';
}

function toOfficeArtifactError(error: unknown): OfficeArtifactError {
  const isMissingBinary = typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
  return new OfficeArtifactError(isMissingBinary ? 'OFFICECLI_NOT_FOUND' : 'OFFICECLI_FAILED');
}

function toOfficeCliRenderError(error: unknown): Error {
  if (
    typeof error === 'object' &&
    error !== null &&
    (('code' in error && error.code === 'ETIMEDOUT') || ('killed' in error && error.killed === true))
  ) {
    return Object.assign(new Error('ETIMEDOUT'), { name: 'OfficeCliRenderTimeoutError', code: 'ETIMEDOUT' as const });
  }
  return toOfficeArtifactError(error);
}

function textViewFailure(): never {
  throw new OfficeArtifactError('OFFICECLI_FAILED');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function normalizePptxTextView(data: unknown): OfficeCliTextView {
  if (!isRecord(data) || !isNonNegativeSafeInteger(data.totalSlides) || !Array.isArray(data.slides)) {
    return textViewFailure();
  }
  if (data.slides.length !== data.totalSlides) return textViewFailure();

  const textItems: string[] = [];
  for (const [position, slide] of data.slides.entries()) {
    if (
      !isRecord(slide) ||
      typeof slide.index !== 'number' ||
      !Number.isSafeInteger(slide.index) ||
      slide.index < 1 ||
      slide.index > data.totalSlides ||
      slide.index !== position + 1 ||
      typeof slide.path !== 'string' ||
      !Array.isArray(slide.texts) ||
      !slide.texts.every((text) => typeof text === 'string')
    ) {
      return textViewFailure();
    }
    textItems.push(...slide.texts);
  }

  return { totalItems: data.totalSlides, returnedItems: data.slides.length, textItems };
}

function normalizeDocxTextView(data: unknown): OfficeCliTextView {
  if (!isRecord(data) || !isNonNegativeSafeInteger(data.totalElements) || !Array.isArray(data.elements)) {
    return textViewFailure();
  }
  if (data.elements.length > data.totalElements) return textViewFailure();

  const textItems: string[] = [];
  for (const element of data.elements) {
    if (
      !isRecord(element) ||
      typeof element.path !== 'string' ||
      typeof element.type !== 'string' ||
      typeof element.text !== 'string'
    ) {
      return textViewFailure();
    }
    textItems.push(element.text);
  }

  return { totalItems: data.totalElements, returnedItems: data.elements.length, textItems };
}

function parseOfficeCliTextView(output: string, format: OfficeCliTextFormat): OfficeCliTextView {
  const data = parseOfficeCliEnvelope<unknown>(output);
  return format === 'pptx' ? normalizePptxTextView(data) : normalizeDocxTextView(data);
}

export function createOfficeCliRunner(dependencies: OfficeCliRunnerDependencies = {}): FullOfficeCliRunner {
  const binaryPath = resolveOfficeCliBinary(dependencies);
  const execFile = dependencies.execFile ?? defaultExecFile;
  const spawn = dependencies.spawn ?? defaultSpawn;
  const allocatePort = dependencies.allocatePort ?? allocatePreviewPort;

  const invoke = <T = unknown>(
    args: string[],
    parseOutput: (output: string) => T = parseOfficeCliEnvelope<T>,
    options: OfficeCliExecFileOptions = EXEC_OPTIONS,
    mapError: (error: unknown) => Error = toOfficeArtifactError
  ): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      try {
        execFile(binaryPath, args, options, (error, stdout) => {
          if (error) {
            reject(mapError(error));
            return;
          }

          if (Buffer.byteLength(stdout, 'utf8') > options.maxBuffer) {
            reject(new OfficeArtifactError('OFFICECLI_FAILED'));
            return;
          }

          try {
            resolve(parseOutput(stdout));
          } catch (parseError) {
            reject(parseError);
          }
        });
      } catch (error) {
        reject(toOfficeArtifactError(error));
      }
    });

  const watch = async (file: string): Promise<OfficeCliPreviewSession> => {
    const port = await allocatePort();
    let child: OfficeCliWatchProcess;
    try {
      child = spawn(binaryPath, ['watch', file, '--port', String(port)], WATCH_OPTIONS);
    } catch (error) {
      throw toOfficeArtifactError(error);
    }

    let exited = false;
    let stopPromise: Promise<void> | undefined;
    let resolveExit: (() => void) | undefined;
    const exitPromise = new Promise<void>((resolve) => {
      resolveExit = resolve;
    });
    child.once('exit', () => {
      exited = true;
      resolveExit?.();
    });

    const stop = (): Promise<void> => {
      if (stopPromise) return stopPromise;
      stopPromise = (async () => {
        if (exited) return;
        child.kill('SIGTERM');
        await Promise.race([exitPromise, wait(WATCH_STOP_TIMEOUT_MS)]);
        if (!exited) {
          child.kill('SIGKILL');
          await exitPromise;
        }
      })();
      return stopPromise;
    };

    return new Promise<OfficeCliPreviewSession>((resolve, reject) => {
      let settled = false;
      let stdoutBuffer = '';
      const rejectStart = (error: OfficeArtifactError): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        void stop().finally(() => reject(error));
      };
      const timeout = setTimeout(() => rejectStart(new OfficeArtifactError('PREVIEW_FAILED')), WATCH_READY_TIMEOUT_MS);

      child.once('error', (error) => rejectStart(toOfficeArtifactError(error)));
      child.once('exit', () => rejectStart(new OfficeArtifactError('PREVIEW_FAILED')));
      child.stderr.on('data', () => undefined);
      child.stdout.on('data', (chunk) => {
        if (settled) return;
        stdoutBuffer = `${stdoutBuffer}${chunk.toString()}`.slice(-4096);
        if (!stdoutBuffer.includes(`Watch: http://localhost:${port}`)) return;
        settled = true;
        clearTimeout(timeout);
        resolve({ url: `http://127.0.0.1:${port}/`, stop });
      });
    });
  };

  return {
    get: (file, path) => invoke(['get', file, path, '--json']),
    replaceText: (file, path, find, replace) =>
      invoke(['set', file, path, '--find', find, '--replace', replace, '--json'], parseOfficeCliMatchedEnvelope),
    formatRange: (file, path, start, end, property, enabled) =>
      invoke([
        'set',
        file,
        path,
        '--prop',
        `range=${start}:${end}`,
        '--prop',
        `${property}=${property === 'underline' ? (enabled ? 'single' : 'none') : String(enabled)}`,
        '--json',
      ]),
    setCell: (file, path, input) =>
      invoke([
        'set',
        file,
        path,
        '--prop',
        input.startsWith('=') ? `formula=${input.slice(1)}` : `value=${input}`,
        '--json',
      ]),
    validate: (file) => invoke(['validate', file, '--json']),
    viewText: (file, format) =>
      invoke(['view', file, 'text', '--json'], (output) => parseOfficeCliTextView(output, format)),
    renderSlide: async (file, page, outputPath) => {
      await invoke(
        ['view', file, 'screenshot', '--page', String(page), '-o', outputPath, '--json'],
        parseOfficeCliEnvelope,
        RENDER_EXEC_OPTIONS,
        toOfficeCliRenderError
      );
    },
    close: (file) => invoke(['close', file, '--json']),
    watch,
  };
}
