/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import { PRESENTATION_RUN_LIMITS } from '@/common/config/constants';
import { parseOfficeCliEnvelope } from '@/process/services/office-artifact/officeCliJson';
import {
  createOfficeCliRunner,
  type OfficeCliExecFile,
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

function createWatchProcess(): OfficeCliWatchProcess & { emit: EventEmitter['emit'] } {
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
