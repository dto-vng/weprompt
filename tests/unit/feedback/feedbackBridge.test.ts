/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Node-environment tests for feedbackBridge's IPC handlers.
 * Covers the new feedback:capture-screenshot handler (main-process side).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { app, dialog } from 'electron';
import { collectFeedbackLogAttachment } from '@/process/feedback/logs';

// Table of handlers registered via ipcMain.handle during module import.
const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();

type FakeWebContents = {
  capturePage?: () => Promise<{ toPNG: () => Buffer }>;
};

type FakeWindow = {
  isDestroyed: () => boolean;
  webContents: FakeWebContents;
};

let currentWindow: FakeWindow | null = null;

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, ...args: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    },
    on: vi.fn(),
  },
  app: {
    getPath: vi.fn((name: string) => (name === 'downloads' ? '/tmp' : '/tmp/aionui-test-logs-nonexistent')),
    getVersion: vi.fn(() => '0.0.0'),
  },
  dialog: {
    showSaveDialog: vi.fn(),
  },
  BrowserWindow: {
    fromWebContents: vi.fn(() => currentWindow),
  },
}));

beforeEach(async () => {
  handlers.clear();
  currentWindow = null;
  vi.resetModules();
  // Importing registers the ipcMain.handle callbacks into our map.
  await import('@/process/bridge/feedbackBridge');
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('feedbackBridge — capture-screenshot', () => {
  it('registers the feedback:capture-screenshot channel on import', () => {
    expect(handlers.has('feedback:capture-screenshot')).toBe(true);
  });

  it('returns png bytes and a timestamped filename on success', async () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x01, 0x02, 0x03]);
    currentWindow = {
      isDestroyed: () => false,
      webContents: {
        capturePage: vi.fn(async () => ({ toPNG: () => pngBytes })),
      },
    };

    const handler = handlers.get('feedback:capture-screenshot')!;
    const result = (await handler({ sender: {} })) as { filename: string; data: number[] } | null;

    expect(result).not.toBeNull();
    expect(result!.filename).toMatch(/^screenshot-.*\.png$/);
    expect(result!.data).toEqual(Array.from(pngBytes));
  });

  it('returns null when no owning BrowserWindow is resolved', async () => {
    currentWindow = null;
    const handler = handlers.get('feedback:capture-screenshot')!;
    const result = await handler({ sender: {} });
    expect(result).toBeNull();
  });

  it('returns null when the owning BrowserWindow is destroyed', async () => {
    currentWindow = {
      isDestroyed: () => true,
      webContents: {
        capturePage: vi.fn(),
      },
    };
    const handler = handlers.get('feedback:capture-screenshot')!;
    const result = await handler({ sender: {} });
    expect(result).toBeNull();
    expect(currentWindow.webContents.capturePage).not.toHaveBeenCalled();
  });

  it('returns null when capturePage yields an empty buffer', async () => {
    currentWindow = {
      isDestroyed: () => false,
      webContents: {
        capturePage: vi.fn(async () => ({ toPNG: () => Buffer.alloc(0) })),
      },
    };

    const handler = handlers.get('feedback:capture-screenshot')!;
    const result = await handler({ sender: {} });
    expect(result).toBeNull();
  });

  it('returns null and does not throw when capturePage rejects', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    currentWindow = {
      isDestroyed: () => false,
      webContents: {
        capturePage: vi.fn(async () => {
          throw new Error('capture refused');
        }),
      },
    };

    const handler = handlers.get('feedback:capture-screenshot')!;
    const result = await handler({ sender: {} });
    expect(result).toBeNull();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe('feedbackBridge — local diagnostic export', () => {
  it('writes a timestamped gzip package only after the user selects a destination', async () => {
    const exportDir = mkdtempSync(path.join(tmpdir(), 'weprompt-diagnostics-'));
    const outputPath = path.join(exportDir, 'diagnostics.json.gz');
    try {
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({ canceled: false, filePath: outputPath });
      const handler = handlers.get('feedback:export-local');

      expect(handler).toBeDefined();
      const result = (await handler!(
        {},
        {
          attachments: [{ contentType: 'text/plain', data: [108, 111, 103], filename: 'weprompt.log' }],
          description: 'AionCore could not start',
          extra: { installation_integrity: { source: 'backend_startup_failure' } },
          module: 'installation-integrity',
          moduleLabel: 'WePrompt installation is incomplete',
          tags: { 'aionui.installation_integrity.report_source': 'backend_startup_failure' },
        }
      )) as { status: string; path?: string };

      expect(result).toEqual({ status: 'saved', path: outputPath });
      expect(dialog.showSaveDialog).toHaveBeenCalledWith({
        defaultPath: expect.stringMatching(/^.*weprompt-diagnostics-.*\.json\.gz$/),
      });
      expect(statSync(outputPath).mode & 0o777).toBe(0o600);
      const payload = JSON.parse(gunzipSync(readFileSync(outputPath)).toString('utf8')) as Record<string, unknown>;
      expect(payload).toMatchObject({
        schema_version: 'weprompt-diagnostics/v1',
        report: {
          description: 'AionCore could not start',
          module: 'installation-integrity',
          module_label: 'WePrompt installation is incomplete',
        },
      });
    } finally {
      rmSync(exportDir, { recursive: true, force: true });
    }
  });

  it('returns cancelled without writing an archive when the save dialog is dismissed', async () => {
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({ canceled: true, filePath: undefined });
    const handler = handlers.get('feedback:export-local');

    await expect(
      handler!({}, { attachments: [], description: 'Cancelled', module: 'test', moduleLabel: 'Test' })
    ).resolves.toEqual({ status: 'cancelled' });
  });

  it('returns failed when the selected archive cannot be written', async () => {
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({
      canceled: false,
      filePath: '/definitely-not-writable/weprompt-diagnostics.json.gz',
    });
    const handler = handlers.get('feedback:export-local');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      handler!({}, { attachments: [], description: 'Write failed', module: 'test', moduleLabel: 'Test' })
    ).resolves.toEqual({ status: 'failed' });
    consoleError.mockRestore();
  });

  it('redacts secrets, prompts, conversation bodies, and raw provider errors before writing', async () => {
    const exportDir = mkdtempSync(path.join(tmpdir(), 'weprompt-diagnostics-redaction-'));
    const outputPath = path.join(exportDir, 'diagnostics.json.gz');
    const blockedValue = ['local', 'test', 'credential'].join('-');
    try {
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({ canceled: false, filePath: outputPath });
      const handler = handlers.get('feedback:export-local')!;

      await handler(
        {},
        {
          attachments: [],
          description: `Authorization: ${blockedValue}`,
          extra: {
            api_key: 'not-exported',
            provider_error: { message: 'not-exported' },
            conversation_body: 'not-exported',
            prompt: 'not-exported',
            safe_code: 'BACKEND_UNAVAILABLE',
          },
          module: 'test',
          moduleLabel: 'Test',
        }
      );

      const content = gunzipSync(readFileSync(outputPath)).toString('utf8');
      expect(content).not.toContain(blockedValue);
      expect(content).not.toContain('not-exported');
      expect(content).toContain('BACKEND_UNAVAILABLE');
    } finally {
      rmSync(exportDir, { recursive: true, force: true });
    }
  });

  it('recursively redacts sensitive subtrees in a gzipped JSON attachment', async () => {
    const exportDir = mkdtempSync(path.join(tmpdir(), 'weprompt-diagnostics-json-redaction-'));
    const outputPath = path.join(exportDir, 'diagnostics.json.gz');
    const blockedValues = ['conversation-value', 'prompt-value', 'provider-error-value'].map((value) =>
      ['blocked', value].join('-')
    );
    try {
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({ canceled: false, filePath: outputPath });
      const handler = handlers.get('feedback:export-local')!;
      const nestedJson = gzipSync(
        JSON.stringify({
          conversation: { body: blockedValues[0], nested: { content: blockedValues[0] } },
          prompt: { text: blockedValues[1] },
          provider_error: { message: blockedValues[2] },
          safe: { code: 'BACKEND_UNAVAILABLE' },
        })
      );

      await handler(
        {},
        {
          attachments: [
            {
              contentType: 'application/gzip',
              data: Array.from(nestedJson),
              filename: 'db-diagnostics.json.gz',
            },
          ],
          description: 'Safe description',
          module: 'test',
          moduleLabel: 'Test',
        }
      );

      const archive = JSON.parse(gunzipSync(readFileSync(outputPath)).toString('utf8')) as {
        report: { attachments: Array<{ data_base64: string }> };
      };
      const sanitizedJson = gunzipSync(Buffer.from(archive.report.attachments[0].data_base64, 'base64')).toString(
        'utf8'
      );
      for (const blockedValue of blockedValues) expect(sanitizedJson).not.toContain(blockedValue);
      expect(sanitizedJson).toContain('BACKEND_UNAVAILABLE');
    } finally {
      rmSync(exportDir, { recursive: true, force: true });
    }
  });

  it('preserves benign conversation module metadata', async () => {
    const exportDir = mkdtempSync(path.join(tmpdir(), 'weprompt-diagnostics-benign-metadata-'));
    const outputPath = path.join(exportDir, 'diagnostics.json.gz');
    try {
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({ canceled: false, filePath: outputPath });
      const handler = handlers.get('feedback:export-local')!;

      await handler(
        {},
        {
          attachments: [],
          description: 'Conversation stuck',
          module: 'conversation-session',
          moduleLabel: 'Conversation & Sessions',
        }
      );

      const archive = JSON.parse(gunzipSync(readFileSync(outputPath)).toString('utf8')) as {
        report: { description: string; module: string; module_label: string };
      };
      expect(archive.report).toMatchObject({
        description: 'Conversation stuck',
        module: 'conversation-session',
        module_label: 'Conversation & Sessions',
      });
    } finally {
      rmSync(exportDir, { recursive: true, force: true });
    }
  });

  it('replaces sensitive module labels and attachment filenames with stable archive metadata', async () => {
    const exportDir = mkdtempSync(path.join(tmpdir(), 'weprompt-diagnostics-metadata-redaction-'));
    const blockedValue = ['blocked', 'metadata', 'credential'].join('-');
    try {
      const handler = handlers.get('feedback:export-local')!;
      const unsafeMetadata = [
        {
          module: `Authorization: Bearer ${blockedValue}`,
          moduleLabel: `Bearer ${blockedValue}`,
        },
        {
          module: 'sk-1234567890abcdef',
          moduleLabel: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signaturevalue',
        },
      ];

      for (const [index, metadata] of unsafeMetadata.entries()) {
        const outputPath = path.join(exportDir, `diagnostics-${index}.json.gz`);
        vi.mocked(dialog.showSaveDialog).mockResolvedValueOnce({ canceled: false, filePath: outputPath });

        await handler(
          {},
          {
            attachments: [
              {
                contentType: 'text/plain',
                data: [108, 111, 103],
                filename: `token-${blockedValue}.log`,
              },
            ],
            description: 'Safe description',
            ...metadata,
          }
        );

        const archiveText = gunzipSync(readFileSync(outputPath)).toString('utf8');
        const archive = JSON.parse(archiveText) as {
          report: { attachments: Array<{ filename: string }>; module: string; module_label: string };
        };
        expect(archiveText).not.toContain(blockedValue);
        expect(archive.report).toMatchObject({
          attachments: [{ filename: 'diagnostic-attachment' }],
          module: 'diagnostic-module',
          module_label: 'Diagnostic report',
        });
      }
    } finally {
      rmSync(exportDir, { recursive: true, force: true });
    }
  });
});

describe('feedback logs', () => {
  it('collects top-level frontend logs and nested backend logs through the IPC handler', async () => {
    const logsDir = mkdtempSync(path.join(tmpdir(), 'aionui-feedback-bridge-'));
    try {
      const backendLogsDir = path.join(logsDir, 'logs');
      mkdirSync(backendLogsDir);
      writeFileSync(path.join(logsDir, '2026-05-25.log'), 'frontend renderer log\n');
      writeFileSync(path.join(backendLogsDir, '2026-05-25.log'), 'backend process log\n');
      writeFileSync(path.join(backendLogsDir, '2026-05-24.log'), 'second day backend log\n');
      writeFileSync(path.join(backendLogsDir, '2026-05-23.log'), 'third day backend log\n');
      writeFileSync(path.join(backendLogsDir, '2026-05-22.log'), 'too old backend log\n');

      vi.mocked(app.getPath).mockImplementation((name: string) => {
        if (name === 'logs') return logsDir;
        return path.join(logsDir, 'userData');
      });

      const handler = handlers.get('feedback:collect-logs')!;
      const result = (await handler({})) as { filename: string; data: number[] } | null;

      expect(result).not.toBeNull();
      const content = gunzipSync(Buffer.from(result!.data)).toString('utf8');
      expect(content).toContain('frontend renderer log');
      expect(content).toContain('backend process log');
      expect(content).toContain('second day backend log');
      expect(content).toContain('third day backend log');
      expect(content).not.toContain('too old backend log');
    } finally {
      rmSync(logsDir, { recursive: true, force: true });
    }
  });

  it('collects the same recent three log days used by user feedback reports', () => {
    const logsDir = mkdtempSync(path.join(tmpdir(), 'aionui-feedback-logs-'));
    try {
      writeFileSync(path.join(logsDir, '2026-05-25.log'), 'today frontend\n');
      writeFileSync(path.join(logsDir, '2026-05-25.aioncore.log'), 'today backend\n');
      writeFileSync(path.join(logsDir, '2026-05-24.aionrs.log'), 'yesterday rust\n');
      writeFileSync(path.join(logsDir, '2026-05-23.log'), 'third day frontend\n');
      writeFileSync(path.join(logsDir, '2026-05-22.log'), 'too old frontend\n');
      writeFileSync(path.join(logsDir, '2026-05-25.txt'), 'not a log\n');

      const attachment = collectFeedbackLogAttachment(logsDir);

      expect(attachment).not.toBeNull();
      expect(attachment!.filename).toBe('logs.gz');
      expect(attachment!.contentType).toBe('application/gzip');
      const content = gunzipSync(attachment!.data).toString('utf8');
      expect(content).toContain('today frontend');
      expect(content).toContain('today backend');
      expect(content).toContain('yesterday rust');
      expect(content).toContain('third day frontend');
      expect(content).not.toContain('too old frontend');
      expect(content).not.toContain('not a log');
    } finally {
      rmSync(logsDir, { recursive: true, force: true });
    }
  });

  it('collects recent logs from dated year/month/day directories', () => {
    const logsDir = mkdtempSync(path.join(tmpdir(), 'aionui-feedback-dated-logs-'));
    try {
      const recentDir = path.join(logsDir, '2026', '07', '02');
      const previousDir = path.join(logsDir, '2026', '07', '01');
      const oldDir = path.join(logsDir, '2026', '06', '30');
      mkdirSync(recentDir, { recursive: true });
      mkdirSync(previousDir, { recursive: true });
      mkdirSync(oldDir, { recursive: true });
      writeFileSync(path.join(recentDir, '2026-07-02.log'), 'today frontend nested\n');
      writeFileSync(path.join(recentDir, '2026-07-02.aioncore.log'), 'today backend nested\n');
      writeFileSync(path.join(previousDir, '2026-07-01.aionrs.log'), 'yesterday rust nested\n');
      writeFileSync(path.join(oldDir, '2026-06-30.log'), 'third day frontend nested\n');
      writeFileSync(path.join(logsDir, '2026-06-29.log'), 'too old flat\n');

      const attachment = collectFeedbackLogAttachment(logsDir);

      expect(attachment).not.toBeNull();
      const content = gunzipSync(attachment!.data).toString('utf8');
      expect(content).toContain('today frontend nested');
      expect(content).toContain('today backend nested');
      expect(content).toContain('yesterday rust nested');
      expect(content).toContain('third day frontend nested');
      expect(content).not.toContain('too old flat');
      expect(content).toContain('2026/07/02/2026-07-02.aioncore.log');
    } finally {
      rmSync(logsDir, { recursive: true, force: true });
    }
  });
});
