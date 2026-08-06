/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { chmod, mkdtemp, readFile, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import { PRESENTATION_RUN_LIMITS } from '@/common/config/constants';
import { parseOfficeCliEnvelope } from '@/process/services/office-artifact/officeCliJson';
import {
  createOfficeCliRunner,
  type OfficeCliExecFile,
  type OfficeCliProcessTreeSpawn,
  type OfficeCliSpawn,
  type OfficeCliWatchProcess,
} from '@/process/services/office-artifact/officeCliRunner';

import docxTextFixture from './fixtures/officecli-docx-text.json';
import pptxTextFixture from './fixtures/officecli-pptx-text.json';

function execFileWithStdout(stdout: string): OfficeCliExecFile {
  return (_file, _args, _options, callback) => callback(null, stdout, '');
}

function padToUtf8Bytes(output: string, byteLength: number): string {
  return `${output}${' '.repeat(byteLength - Buffer.byteLength(output, 'utf8'))}`;
}

type TestWatchProcess = OfficeCliWatchProcess & {
  emit: EventEmitter['emit'];
  stdout: PassThrough;
  stderr: PassThrough;
};

function createWatchProcess(): TestWatchProcess {
  const emitter = new EventEmitter();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  return Object.assign(emitter, {
    stdout,
    stderr,
    kill: vi.fn(() => {
      queueMicrotask(() => emitter.emit('exit', 0, null));
      return true;
    }),
  });
}

function spawnWithResult(stdout: string, code: number | null, signal: NodeJS.Signals | null = null): OfficeCliSpawn {
  return () => {
    const child = createWatchProcess();
    queueMicrotask(() => {
      child.stdout.end(stdout);
      child.emit('close', code, signal);
    });
    return child;
  };
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readProcessId(filePath: string, attempts = 500): Promise<number> {
  try {
    return Number(await readFile(filePath, 'utf8'));
  } catch {
    if (attempts <= 1) return 0;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return readProcessId(filePath, attempts - 1);
  }
}

describe('createOfficeCliRunner', () => {
  it('invokes an allowlisted command without a shell', async () => {
    const execFile = vi.fn<OfficeCliExecFile>((_file, _args, options, callback) => {
      expect(options).toMatchObject({ shell: false, windowsHide: true });
      callback(null, JSON.stringify({ success: true, data: { matches: 0, results: [] } }), '');
    });
    const runner = createOfficeCliRunner({ binaryPath: '/opt/officecli', execFile });

    await runner.get('/workspace/a.docx', '/body/p[1]');

    expect(execFile).toHaveBeenCalledWith(
      '/opt/officecli',
      ['get', '/workspace/a.docx', '/body/p[1]', '--json'],
      expect.objectContaining({ shell: false }),
      expect.any(Function)
    );
  });

  it('builds fixed argument shapes for each supported mutation', async () => {
    const execFile = vi.fn<OfficeCliExecFile>((_file, _args, _options, callback) => {
      callback(null, JSON.stringify({ success: true, data: {}, matched: 1 }), '');
    });
    const runner = createOfficeCliRunner({ binaryPath: '/opt/officecli', execFile });

    await expect(runner.replaceText('/workspace/a.docx', '/body/p[1]', 'old', 'new')).resolves.toEqual({ matched: 1 });
    await runner.formatRange('/workspace/a.docx', '/body/p[1]', 2, 4, 'underline', false);
    await runner.setCell('/workspace/a.xlsx', '/sheets/1/cells/A1', '=SUM(B1:B2)');
    await runner.validate('/workspace/a.docx');
    await runner.close('/workspace/a.docx');

    expect(execFile.mock.calls.map(([, args]) => args)).toEqual([
      ['set', '/workspace/a.docx', '/body/p[1]', '--find', 'old', '--replace', 'new', '--json'],
      ['set', '/workspace/a.docx', '/body/p[1]', '--prop', 'range=2:4', '--prop', 'underline=none', '--json'],
      ['set', '/workspace/a.xlsx', '/sheets/1/cells/A1', '--prop', 'formula=SUM(B1:B2)', '--json'],
      ['validate', '/workspace/a.docx', '--json'],
      ['close', '/workspace/a.docx', '--json'],
    ]);
  });

  it('invokes bounded text inspection without a shell', async () => {
    const execFile = vi.fn<OfficeCliExecFile>(execFileWithStdout(JSON.stringify(pptxTextFixture)));
    const runner = createOfficeCliRunner({ binaryPath: '/opt/officecli', execFile });

    await runner.viewText('/workspace/business-review.pptx', 'pptx');

    expect(execFile).toHaveBeenCalledWith(
      '/opt/officecli',
      ['view', '/workspace/business-review.pptx', 'text', '--json'],
      {
        shell: false,
        windowsHide: true,
        timeout: 30_000,
        maxBuffer: PRESENTATION_RUN_LIMITS.MAX_OFFICECLI_STDOUT_BYTES,
      },
      expect.any(Function)
    );
  });

  it('renders one slide to an app-owned output with a bounded shell-free command', async () => {
    const spawn = vi.fn<OfficeCliSpawn>(
      spawnWithResult(JSON.stringify({ success: true, data: { output: '/private/render/slide-4.png' } }), 0)
    );
    const runner = createOfficeCliRunner({ binaryPath: '/opt/officecli', spawn });

    await expect(
      runner.renderSlide('/private/inspection/candidate.pptx', 4, '/private/render/slide-4.png')
    ).resolves.toBeUndefined();

    expect(spawn).toHaveBeenCalledWith(
      '/opt/officecli',
      [
        'view',
        '/private/inspection/candidate.pptx',
        'screenshot',
        '--page',
        '4',
        '-o',
        '/private/render/slide-4.png',
        '--json',
      ],
      {
        detached: process.platform !== 'win32',
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
  });

  it('preserves a redacted render-timeout signal for readiness policy', async () => {
    const runner = createOfficeCliRunner({
      binaryPath: '/opt/officecli',
      spawn: spawnWithResult('', null, 'SIGTERM'),
    });

    await expect(
      runner.renderSlide('/private/inspection/candidate.pptx', 1, '/private/render/slide-1.png')
    ).rejects.toMatchObject({ code: 'ETIMEDOUT', message: 'ETIMEDOUT' });
  });

  it('fails closed when Windows tree termination exits unsuccessfully', async () => {
    const renderProcess = Object.assign(createWatchProcess(), { pid: 99_999 });
    const failedTaskkillProcess = Object.assign(createWatchProcess(), { exitCode: 1 });
    const successfulTaskkillProcess = Object.assign(createWatchProcess(), { exitCode: 0 });
    const processTreeSpawn = vi
      .fn<OfficeCliProcessTreeSpawn>()
      .mockReturnValueOnce(failedTaskkillProcess)
      .mockImplementationOnce(() => {
        Object.assign(renderProcess, { signalCode: 'SIGKILL' });
        queueMicrotask(() => renderProcess.emit('exit', null, 'SIGKILL'));
        return successfulTaskkillProcess;
      });
    const spawn = vi.fn<OfficeCliSpawn>(() => {
      queueMicrotask(() => {
        renderProcess.stdout.write(Buffer.alloc(PRESENTATION_RUN_LIMITS.MAX_OFFICECLI_STDOUT_BYTES + 1));
      });
      return renderProcess;
    });
    const runner = createOfficeCliRunner({
      binaryPath: 'C:\\officecli.exe',
      platform: 'win32',
      processTreeSpawn,
      spawn,
    });

    await expect(
      runner.renderSlide('C:\\inspection\\candidate.pptx', 1, 'C:\\render\\slide-1.png')
    ).rejects.toMatchObject({ code: 'OFFICECLI_FAILED' });
    expect(processTreeSpawn).toHaveBeenCalledTimes(2);
    expect(processTreeSpawn).toHaveBeenCalledWith('taskkill', ['/F', '/PID', '99999', '/T'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  });

  it('stops a timed-out Windows cleanup helper before retrying tree termination', async () => {
    vi.useFakeTimers();
    try {
      const renderProcess = Object.assign(createWatchProcess(), { pid: 99_999 });
      const stalledTaskkillProcess = Object.assign(createWatchProcess(), { pid: 88_888 });
      const successfulTaskkillProcess = Object.assign(createWatchProcess(), { exitCode: 0 });
      const processTreeSpawn = vi
        .fn<OfficeCliProcessTreeSpawn>()
        .mockReturnValueOnce(stalledTaskkillProcess)
        .mockImplementationOnce(() => {
          Object.assign(renderProcess, { signalCode: 'SIGKILL' });
          queueMicrotask(() => renderProcess.emit('exit', null, 'SIGKILL'));
          return successfulTaskkillProcess;
        });
      const runner = createOfficeCliRunner({
        binaryPath: 'C:\\officecli.exe',
        platform: 'win32',
        processTreeSpawn,
        spawn: () => {
          queueMicrotask(() => {
            renderProcess.stdout.write(Buffer.alloc(PRESENTATION_RUN_LIMITS.MAX_OFFICECLI_STDOUT_BYTES + 1));
          });
          return renderProcess;
        },
      });

      const pending = runner.renderSlide('C:\\inspection\\candidate.pptx', 1, 'C:\\render\\slide-1.png');
      const rejection = expect(pending).rejects.toMatchObject({ code: 'OFFICECLI_FAILED' });
      await vi.advanceTimersByTimeAsync(5_250);

      await rejection;
      expect(stalledTaskkillProcess.kill).toHaveBeenCalledWith('SIGKILL');
      expect(processTreeSpawn).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it.runIf(process.platform !== 'win32')(
    'retries a failed Windows tree termination before rejecting and releasing the render workspace',
    async () => {
      const root = await mkdtemp(path.join(tmpdir(), 'officecli-windows-render-tree-'));
      const executable = path.join(root, 'fake-officecli');
      const outputPath = path.join(root, 'slide-1.png');
      const pidPath = `${outputPath}.pid`;
      const heartbeatPath = `${outputPath}.heartbeat`;
      const heartbeatProgram = `
        const { appendFileSync } = require('node:fs');
        const heartbeatPath = ${JSON.stringify(heartbeatPath)};
        appendFileSync(heartbeatPath, 'x');
        setInterval(() => appendFileSync(heartbeatPath, 'x'), 10);
      `;
      await writeFile(
        executable,
        `#!/usr/bin/env node
          const { spawn } = require('node:child_process');
          const { writeFileSync } = require('node:fs');
          const child = spawn(process.execPath, ['-e', ${JSON.stringify(heartbeatProgram)}], { stdio: 'ignore' });
          writeFileSync(${JSON.stringify(pidPath)}, String(child.pid));
          setInterval(() => undefined, 1_000);
        `,
        { mode: 0o700 }
      );

      let descendantPid = 0;
      let renderProcess: ChildProcess | undefined;
      let taskkillAttempt = 0;
      const spawn: OfficeCliSpawn = (file, args, options) => {
        renderProcess = nodeSpawn(file, args, { ...options, detached: true });
        return renderProcess as unknown as OfficeCliWatchProcess;
      };
      const processTreeSpawn = vi.fn<OfficeCliProcessTreeSpawn>((_file, args) => {
        const taskkill = createWatchProcess();
        taskkillAttempt += 1;
        const attempt = taskkillAttempt;
        queueMicrotask(() => {
          if (attempt === 1) {
            Object.assign(taskkill, { exitCode: 1 });
            taskkill.emit('close', 1, null);
            return;
          }
          process.kill(-Number(args[2]), 'SIGKILL');
          Object.assign(taskkill, { exitCode: 0 });
          taskkill.emit('close', 0, null);
        });
        return taskkill;
      });
      const runner = createOfficeCliRunner({
        binaryPath: executable,
        platform: 'win32',
        processTreeSpawn,
        spawn,
      });

      try {
        const pending = runner.renderSlide('/inspection/candidate.pptx', 1, outputPath);
        descendantPid = await readProcessId(pidPath);
        expect(descendantPid).toBeGreaterThan(1);
        await writeFile(outputPath, '');
        await truncate(outputPath, PRESENTATION_RUN_LIMITS.MAX_RENDER_BYTES_PER_SLIDE + 1);

        await expect(pending).rejects.toMatchObject({ code: 'OFFICECLI_FAILED' });
        expect(processTreeSpawn).toHaveBeenCalledTimes(2);
        const heartbeatAtRejection = await readFile(heartbeatPath);
        await new Promise((resolve) => setTimeout(resolve, 250));
        expect(await readFile(heartbeatPath)).toEqual(heartbeatAtRejection);
      } finally {
        if (descendantPid > 1 && isProcessAlive(descendantPid)) process.kill(descendantPid, 'SIGKILL');
        if (renderProcess?.pid && isProcessAlive(renderProcess.pid)) renderProcess.kill('SIGKILL');
        await rm(root, { recursive: true, force: true });
      }
    }
  );

  it.runIf(process.platform !== 'win32')('kills a descendant writer before a timed-out render rejects', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'officecli-render-tree-'));
    const executable = path.join(root, 'fake-officecli');
    const outputPath = path.join(root, 'slide-1.png');
    const pidPath = `${outputPath}.pid`;
    const heartbeatPath = `${outputPath}.heartbeat`;
    const heartbeatProgram = `
      const { appendFileSync } = require('node:fs');
      const heartbeatPath = ${JSON.stringify(heartbeatPath)};
      appendFileSync(heartbeatPath, 'x');
      setInterval(() => appendFileSync(heartbeatPath, 'x'), 10);
    `;
    await writeFile(
      executable,
      `#!/usr/bin/env node
        const { spawn } = require('node:child_process');
        const { writeFileSync } = require('node:fs');
        const pidPath = ${JSON.stringify(pidPath)};
        writeFileSync(${JSON.stringify(heartbeatPath)}, '');
        const child = spawn(process.execPath, ['-e', ${JSON.stringify(heartbeatProgram)}], { stdio: 'ignore' });
        writeFileSync(pidPath, String(child.pid));
        setInterval(() => undefined, 1_000);
      `,
      { mode: 0o700 }
    );
    await chmod(executable, 0o700);
    let renderProcess: ChildProcess | undefined;
    const spawn: OfficeCliSpawn = (file, args, options) => {
      renderProcess = nodeSpawn(file, args, options);
      return renderProcess as unknown as OfficeCliWatchProcess;
    };
    const runner = createOfficeCliRunner({ binaryPath: executable, spawn });
    let descendantPid = 0;

    try {
      const pending = runner.renderSlide('/private/inspection/candidate.pptx', 1, outputPath);
      descendantPid = await readProcessId(pidPath);
      expect(Number.isSafeInteger(descendantPid) && descendantPid > 1).toBe(true);
      renderProcess?.kill('SIGTERM');
      await expect(pending).rejects.toMatchObject({
        code: 'ETIMEDOUT',
      });
      const heartbeatAtRejection = await readFile(heartbeatPath);
      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(await readFile(heartbeatPath)).toEqual(heartbeatAtRejection);
    } finally {
      if (descendantPid > 1 && isProcessAlive(descendantPid)) process.kill(descendantPid, 'SIGKILL');
      if (renderProcess?.pid && isProcessAlive(renderProcess.pid)) renderProcess.kill('SIGKILL');
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects while an in-flight render output grows beyond the byte ceiling', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'officecli-render-limit-'));
    const outputPath = path.join(root, 'slide-1.png');
    const spawn = vi.fn<OfficeCliSpawn>(() => createWatchProcess());
    const runner = createOfficeCliRunner({ binaryPath: '/opt/officecli', spawn });

    try {
      const pending = runner.renderSlide('/private/inspection/candidate.pptx', 1, outputPath);
      await writeFile(outputPath, '');
      await truncate(outputPath, PRESENTATION_RUN_LIMITS.MAX_RENDER_BYTES_PER_SLIDE + 1);
      const outcome = await Promise.race([
        pending.then(
          () => ({ status: 'resolved' as const, error: null }),
          (error: unknown) => ({ status: 'rejected' as const, error })
        ),
        new Promise<{ status: 'pending'; error: null }>((resolve) =>
          setTimeout(() => resolve({ status: 'pending', error: null }), 250)
        ),
      ]);

      expect(outcome).toMatchObject({ status: 'rejected', error: { code: 'EFBIG' } });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('maps a nonzero render exit to a redacted typed failure', async () => {
    const runner = createOfficeCliRunner({ binaryPath: '/opt/officecli', spawn: spawnWithResult('', 2) });

    await expect(
      runner.renderSlide('/private/inspection/candidate.pptx', 1, '/private/render/slide-1.png')
    ).rejects.toMatchObject({ code: 'OFFICECLI_FAILED', message: 'OFFICECLI_FAILED' });
  });

  it('rejects an unsuccessful render envelope even when the process exits cleanly', async () => {
    const runner = createOfficeCliRunner({
      spawn: spawnWithResult(
        JSON.stringify({
          success: false,
          error: { code: 'no_screenshot_backend', error: '/private/inspection/candidate.pptx' },
        }),
        0
      ),
    });

    await expect(
      runner.renderSlide('/private/inspection/candidate.pptx', 1, '/private/render/slide-1.png')
    ).rejects.toMatchObject({ code: 'OFFICECLI_FAILED', message: 'OFFICECLI_FAILED' });
  });

  it('normalizes the observed PPTX text object without losing slide order', async () => {
    const runner = createOfficeCliRunner({
      execFile: execFileWithStdout(JSON.stringify(pptxTextFixture)),
    });

    const result = await runner.viewText('/workspace/business-review.pptx', 'pptx');

    expect(result).toMatchObject({ totalItems: 8, returnedItems: 8 });
    expect(result.textItems).toHaveLength(64);
    expect([result.textItems[0], result.textItems.at(-1)]).toEqual([
      'Q3',
      'Prepared by Finance — data as of 30 September',
    ]);
  });

  it('normalizes the observed DOCX object with tables and blank paragraphs intact', async () => {
    const runner = createOfficeCliRunner({
      execFile: execFileWithStdout(JSON.stringify(docxTextFixture)),
    });

    const result = await runner.viewText('/workspace/business-report.docx', 'docx');

    expect(result).toMatchObject({ totalItems: 39, returnedItems: 38 });
    expect(result.textItems.slice(5, 8)).toEqual(['Author: Strategy and Planning', '', 'Contents']);
    expect(result.textItems).toContain('[Table: 5 rows]');
  });

  it('accepts a structurally valid empty Office text object for caller-level empty handling', async () => {
    const runner = createOfficeCliRunner({
      execFile: execFileWithStdout(JSON.stringify({ success: true, data: { totalElements: 0, elements: [] } })),
    });

    await expect(runner.viewText('/workspace/empty.docx', 'docx')).resolves.toEqual({
      totalItems: 0,
      returnedItems: 0,
      textItems: [],
    });
  });

  it.each([
    ['plain text', 'Heading\nBody'],
    ['an unenveloped object', JSON.stringify(pptxTextFixture.data)],
    ['string envelope data', JSON.stringify({ success: true, data: 'Heading\nBody' })],
    ['the other format schema', JSON.stringify(docxTextFixture)],
  ])('rejects %s instead of guessing a PPTX text schema', async (_label, stdout) => {
    const runner = createOfficeCliRunner({ execFile: execFileWithStdout(stdout) });

    await expect(runner.viewText('/workspace/business-review.pptx', 'pptx')).rejects.toMatchObject({
      code: 'OFFICECLI_FAILED',
    });
  });

  it.each([
    ['a non-integer count', { totalSlides: 1.5, slides: [] }],
    ['more slides than reported', { totalSlides: 0, slides: [{ index: 1, path: '/slide[1]', texts: [] }] }],
    ['a missing trailing slide', { totalSlides: 2, slides: [{ index: 1, path: '/slide[1]', texts: ['Title'] }] }],
    ['an invalid slide index', { totalSlides: 1, slides: [{ index: 0, path: '/slide[1]', texts: [] }] }],
    [
      'duplicate slide indexes',
      {
        totalSlides: 2,
        slides: [
          { index: 1, path: '/slide[1]', texts: [] },
          { index: 1, path: '/slide[1]', texts: [] },
        ],
      },
    ],
    [
      'reordered slide indexes',
      {
        totalSlides: 2,
        slides: [
          { index: 2, path: '/slide[2]', texts: [] },
          { index: 1, path: '/slide[1]', texts: [] },
        ],
      },
    ],
    [
      'a gap in slide indexes',
      {
        totalSlides: 3,
        slides: [
          { index: 1, path: '/slide[1]', texts: [] },
          { index: 3, path: '/slide[3]', texts: [] },
        ],
      },
    ],
    ['a non-string slide path', { totalSlides: 1, slides: [{ index: 1, path: null, texts: [] }] }],
    ['a non-string text item', { totalSlides: 1, slides: [{ index: 1, path: '/slide[1]', texts: [1] }] }],
  ])('rejects a PPTX object with %s', async (_label, data) => {
    const runner = createOfficeCliRunner({
      execFile: execFileWithStdout(JSON.stringify({ success: true, data })),
    });

    await expect(runner.viewText('/workspace/business-review.pptx', 'pptx')).rejects.toMatchObject({
      code: 'OFFICECLI_FAILED',
    });
  });

  it.each([
    ['a negative count', { totalElements: -1, elements: [] }],
    ['a non-array collection', { totalElements: 1, elements: {} }],
    ['a non-string element path', { totalElements: 1, elements: [{ path: null, type: 'paragraph', text: '' }] }],
    ['a non-string element type', { totalElements: 1, elements: [{ path: '/body/p[1]', type: 1, text: '' }] }],
    [
      'a non-string element text',
      { totalElements: 1, elements: [{ path: '/body/p[1]', type: 'paragraph', text: null }] },
    ],
  ])('rejects a DOCX object with %s', async (_label, data) => {
    const runner = createOfficeCliRunner({
      execFile: execFileWithStdout(JSON.stringify({ success: true, data })),
    });

    await expect(runner.viewText('/workspace/business-report.docx', 'docx')).rejects.toMatchObject({
      code: 'OFFICECLI_FAILED',
    });
  });

  it('accepts OfficeCLI stdout at the exact byte ceiling', async () => {
    const output = JSON.stringify({ success: true, data: { totalElements: 0, elements: [] } });
    const runner = createOfficeCliRunner({
      execFile: execFileWithStdout(padToUtf8Bytes(output, PRESENTATION_RUN_LIMITS.MAX_OFFICECLI_STDOUT_BYTES)),
    });

    await expect(runner.viewText('/workspace/empty.docx', 'docx')).resolves.toMatchObject({
      totalItems: 0,
    });
  });

  it('rejects OfficeCLI stdout one byte above the ceiling', async () => {
    const output = JSON.stringify({ success: true, data: { totalElements: 0, elements: [] } });
    const runner = createOfficeCliRunner({
      execFile: execFileWithStdout(padToUtf8Bytes(output, PRESENTATION_RUN_LIMITS.MAX_OFFICECLI_STDOUT_BYTES + 1)),
    });

    await expect(runner.viewText('/workspace/empty.docx', 'docx')).rejects.toMatchObject({
      code: 'OFFICECLI_FAILED',
    });
  });

  it('measures the stdout ceiling in UTF-8 bytes rather than JavaScript characters', async () => {
    const output = JSON.stringify({
      success: true,
      data: {
        totalElements: 1,
        elements: [
          {
            path: '/body/p[1]',
            type: 'paragraph',
            text: 'é'.repeat(PRESENTATION_RUN_LIMITS.MAX_OFFICECLI_STDOUT_BYTES / 2),
          },
        ],
      },
    });
    const runner = createOfficeCliRunner({ execFile: execFileWithStdout(output) });

    expect(output.length).toBeLessThan(PRESENTATION_RUN_LIMITS.MAX_OFFICECLI_STDOUT_BYTES);
    await expect(runner.viewText('/workspace/large.docx', 'docx')).rejects.toMatchObject({
      code: 'OFFICECLI_FAILED',
    });
  });

  it.each([
    ['a timeout', Object.assign(new Error('/private/source.docx'), { code: 'ETIMEDOUT' })],
    ['a nonzero exit', Object.assign(new Error('/private/source.docx'), { code: 2 })],
  ])('maps %s to a redacted typed text-view failure', async (_label, error) => {
    const execFile = vi.fn<OfficeCliExecFile>((_file, _args, _options, callback) => {
      callback(error, JSON.stringify(docxTextFixture), '/private/source.docx');
    });
    const runner = createOfficeCliRunner({ execFile });

    await expect(runner.viewText('/private/source.docx', 'docx')).rejects.toMatchObject({
      code: 'OFFICECLI_FAILED',
      message: 'OFFICECLI_FAILED',
    });
  });

  it('rejects malformed or unsuccessful OfficeCLI JSON', () => {
    expect(() => parseOfficeCliEnvelope('not-json')).toThrowError(
      expect.objectContaining({ code: 'OFFICECLI_FAILED' })
    );
    expect(() => parseOfficeCliEnvelope('{"success":false,"message":"bad"}')).toThrowError(
      expect.objectContaining({ code: 'OFFICECLI_FAILED' })
    );
  });

  it('maps a missing OfficeCLI binary to a typed error', async () => {
    const error = Object.assign(new Error('missing'), { code: 'ENOENT' });
    const execFile = vi.fn<OfficeCliExecFile>((_file, _args, _options, callback) => {
      callback(error, '', '');
    });
    const runner = createOfficeCliRunner({ binaryPath: '/opt/officecli', execFile });

    await expect(runner.validate('/workspace/a.docx')).rejects.toMatchObject({ code: 'OFFICECLI_NOT_FOUND' });
  });

  it('maps a synchronous missing OfficeCLI binary error to a typed error', async () => {
    const error = Object.assign(new Error('/private/workspace/a.docx'), { code: 'ENOENT' });
    const execFile = vi.fn<OfficeCliExecFile>(() => {
      throw error;
    });
    const runner = createOfficeCliRunner({ binaryPath: '/opt/officecli', execFile });

    await expect(runner.validate('/workspace/a.docx')).rejects.toMatchObject({ code: 'OFFICECLI_NOT_FOUND' });
  });

  it('maps a synchronous OfficeCLI throw to a typed error', async () => {
    const execFile = vi.fn<OfficeCliExecFile>(() => {
      throw new Error('/private/workspace/a.docx');
    });
    const runner = createOfficeCliRunner({ binaryPath: '/opt/officecli', execFile });

    await expect(runner.get('/workspace/a.docx', '/body/p[1]')).rejects.toMatchObject({ code: 'OFFICECLI_FAILED' });
  });

  it('waits for a local watch server beyond the backend timeout and stops its child process', async () => {
    vi.useFakeTimers();
    const child = createWatchProcess();
    const spawn = vi.fn<OfficeCliSpawn>(() => child);
    const runner = createOfficeCliRunner({
      binaryPath: '/opt/officecli',
      spawn,
      allocatePort: async () => 26318,
    });

    const pending = runner.watch('/private/preview/model.xlsx');
    child.stdout.write('Watch: http://local');
    child.stdout.write('host:26318\n');
    const session = await pending;

    expect(spawn).toHaveBeenCalledWith(
      '/opt/officecli',
      ['watch', '/private/preview/model.xlsx', '--port', '26318'],
      expect.objectContaining({ shell: false, windowsHide: true })
    );
    expect(session.url).toBe('http://127.0.0.1:26318/');

    await session.stop();
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    vi.useRealTimers();
  });

  it('terminates a watch process that does not become ready within sixty seconds', async () => {
    vi.useFakeTimers();
    const child = createWatchProcess();
    const runner = createOfficeCliRunner({
      binaryPath: '/opt/officecli',
      spawn: () => child,
      allocatePort: async () => 26318,
    });

    const pending = runner.watch('/private/preview/model.xlsx');
    const assertion = expect(pending).rejects.toMatchObject({ code: 'PREVIEW_FAILED' });
    await vi.advanceTimersByTimeAsync(60_000);

    await assertion;
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    vi.useRealTimers();
  });
});
