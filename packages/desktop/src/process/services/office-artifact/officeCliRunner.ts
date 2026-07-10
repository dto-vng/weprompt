/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFile as nodeExecFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

import { OfficeArtifactError, parseOfficeCliEnvelope } from './officeCliJson';

type OfficeCliExecFileOptions = {
  shell: false;
  windowsHide: true;
  timeout: number;
  maxBuffer: number;
};

type OfficeCliExecFileError = Error & { code?: string | number };

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
};

export type OfficeCliRunnerDependencies = {
  binaryPath?: string;
  execFile?: OfficeCliExecFile;
  environment?: NodeJS.ProcessEnv;
  exists?: (path: string) => boolean;
  homeDirectory?: string;
  platform?: NodeJS.Platform;
};

const EXEC_OPTIONS: OfficeCliExecFileOptions = {
  shell: false,
  windowsHide: true,
  timeout: 30_000,
  maxBuffer: 8 * 1024 * 1024,
};

const defaultExecFile: OfficeCliExecFile = (file, args, options, callback) => {
  nodeExecFile(file, args, options, (error, stdout, stderr) => {
    callback(error, stdout.toString(), stderr.toString());
  });
};

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

function isMissingBinaryError(error: OfficeCliExecFileError): boolean {
  return error.code === 'ENOENT';
}

export function createOfficeCliRunner(dependencies: OfficeCliRunnerDependencies = {}): OfficeCliRunner {
  const binaryPath = resolveOfficeCliBinary(dependencies);
  const execFile = dependencies.execFile ?? defaultExecFile;

  const invoke = (args: string[]): Promise<unknown> =>
    new Promise((resolve, reject) => {
      execFile(binaryPath, args, EXEC_OPTIONS, (error, stdout) => {
        if (error) {
          reject(new OfficeArtifactError(isMissingBinaryError(error) ? 'OFFICECLI_NOT_FOUND' : 'OFFICECLI_FAILED'));
          return;
        }

        try {
          resolve(parseOfficeCliEnvelope(stdout));
        } catch (parseError) {
          reject(parseError);
        }
      });
    });

  return {
    get: (file, path) => invoke(['get', file, path, '--json']),
    replaceText: (file, path, find, replace) =>
      invoke(['set', file, path, '--find', find, '--replace', replace, '--json']),
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
  };
}
