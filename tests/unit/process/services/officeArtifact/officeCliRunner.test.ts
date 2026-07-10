/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';

import { parseOfficeCliEnvelope } from '@/process/services/office-artifact/officeCliJson';
import { createOfficeCliRunner, type OfficeCliExecFile } from '@/process/services/office-artifact/officeCliRunner';

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

    expect(execFile.mock.calls.map(([, args]) => args)).toEqual([
      ['set', '/workspace/a.docx', '/body/p[1]', '--find', 'old', '--replace', 'new', '--json'],
      ['set', '/workspace/a.docx', '/body/p[1]', '--prop', 'range=2:4', '--prop', 'underline=none', '--json'],
      ['set', '/workspace/a.xlsx', '/sheets/1/cells/A1', '--prop', 'formula=SUM(B1:B2)', '--json'],
      ['validate', '/workspace/a.docx', '--json'],
    ]);
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
});
