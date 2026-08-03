/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { app, dialog } from 'electron';
import { collectFeedbackLogAttachment } from '@/process/feedback/logs';

type FakeFrame = {
  url: string;
};

type FakeInvokeEvent = {
  sender: unknown;
  senderFrame: unknown;
};

const handlers = new Map<string, (event: FakeInvokeEvent, input?: unknown) => unknown>();
const eventListeners = new Map<string, unknown>();

type FakeWebContents = {
  capturePage: () => Promise<{ toPNG: () => Buffer }>;
  isDestroyed: () => boolean;
  mainFrame: FakeFrame;
};

type FakeWindow = {
  isDestroyed: () => boolean;
  webContents: FakeWebContents;
};

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: { sender: unknown }, input?: unknown) => unknown) => {
      handlers.set(channel, fn);
    },
    on: (channel: string, listener: unknown) => eventListeners.set(channel, listener),
  },
  app: {
    getPath: vi.fn((name: string) => (name === 'downloads' ? tmpdir() : '/tmp/weprompt-test-logs-nonexistent')),
  },
  dialog: { showSaveDialog: vi.fn() },
}));

const PNG_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00];
const JPEG_BYTES = [0xff, 0xd8, 0xff, 0xe0, 0x00];
const TRUSTED_FILE_DOCUMENT = 'file:///Applications/WePrompt.app/Contents/Resources/app.asar/renderer/index.html';
const TRUSTED_DEV_DOCUMENT = 'http://localhost:5173/';

function validInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    collectLogs: false,
    description: 'Conversation stuck',
    module: 'conversation-session',
    moduleLabel: 'Conversation & Sessions',
    screenshots: [],
    tags: { agent_error_code: 'USER_AGENT_ACP_INIT_FAILED' },
    ...overrides,
  };
}

function readArchive(outputPath: string) {
  return JSON.parse(gunzipSync(readFileSync(outputPath)).toString('utf8')) as {
    privacy: Record<string, unknown>;
    report: {
      attachments: Array<{ content_type: string; data_base64: string; filename: string }>;
      description: string;
      module: string;
      module_label: string;
      tags?: Record<string, string>;
    };
    schema_version: string;
  };
}

let mainWindow: FakeWindow;

function authorizedEvent(url = TRUSTED_FILE_DOCUMENT): FakeInvokeEvent {
  mainWindow.webContents.mainFrame.url = url;
  return {
    sender: mainWindow.webContents,
    senderFrame: mainWindow.webContents.mainFrame,
  };
}

beforeEach(async () => {
  handlers.clear();
  eventListeners.clear();
  vi.resetModules();
  mainWindow = {
    isDestroyed: () => false,
    webContents: {
      capturePage: vi.fn(async () => ({ toPNG: () => Buffer.from(PNG_BYTES) })),
      isDestroyed: () => false,
      mainFrame: { url: TRUSTED_FILE_DOCUMENT },
    },
  };
  const { initializeFeedbackBridge } = await import('@/process/bridge/feedbackBridge');
  initializeFeedbackBridge(mainWindow as never, [TRUSTED_FILE_DOCUMENT, TRUSTED_DEV_DOCUMENT]);
});

afterEach(() => vi.clearAllMocks());

describe('feedbackBridge authorization and surface', () => {
  it('registers only screenshot and local-export feedback handlers after binding the main window', () => {
    expect([...handlers.keys()].toSorted()).toEqual(['feedback:capture-screenshot', 'feedback:export-local']);
    expect(eventListeners.has('feedback:renderer-log')).toBe(false);
    expect(handlers.has('feedback:collect-logs')).toBe(false);
  });

  it.each(['feedback:capture-screenshot', 'feedback:export-local'])(
    'rejects a sender other than the bound main window on %s',
    async (channel) => {
      const result = await handlers.get(channel)!(
        { sender: {}, senderFrame: mainWindow.webContents.mainFrame },
        validInput()
      );
      expect(result).toEqual(channel.endsWith('capture-screenshot') ? null : { status: 'failed' });
      expect(dialog.showSaveDialog).not.toHaveBeenCalled();
    }
  );

  it.each([TRUSTED_FILE_DOCUMENT, `${TRUSTED_DEV_DOCUMENT}#/settings`])(
    'captures a screenshot only from the exact main frame at trusted document %s',
    async (url) => {
      const result = (await handlers.get('feedback:capture-screenshot')!(authorizedEvent(url))) as {
        data: number[];
        filename: string;
      };
      expect(result.filename).toMatch(/^screenshot-.*\.png$/);
      expect(result.data).toEqual(PNG_BYTES);
    }
  );

  it('rejects the bound WebContents after its top-level frame navigates to a foreign document', async () => {
    await expect(
      handlers.get('feedback:capture-screenshot')!(authorizedEvent('https://example.test/foreign'))
    ).resolves.toBeNull();
    expect(mainWindow.webContents.capturePage).not.toHaveBeenCalled();
  });

  it('rejects a subframe even when it reports a trusted application document', async () => {
    await expect(
      handlers.get('feedback:capture-screenshot')!({
        sender: mainWindow.webContents,
        senderFrame: { url: TRUSTED_FILE_DOCUMENT },
      })
    ).resolves.toBeNull();
    expect(mainWindow.webContents.capturePage).not.toHaveBeenCalled();
  });

  it.each([
    ['arbitrary file URL', 'file:///tmp/untrusted/index.html'],
    ['arbitrary path on the trusted loopback origin', 'http://localhost:5173/untrusted'],
    ['arbitrary loopback origin', 'http://127.0.0.1:5174/'],
  ])('rejects the bound main frame at an %s', async (_label, url) => {
    await expect(handlers.get('feedback:capture-screenshot')!(authorizedEvent(url))).resolves.toBeNull();
    expect(mainWindow.webContents.capturePage).not.toHaveBeenCalled();
  });

  it('rejects capture after the bound main window is destroyed', async () => {
    mainWindow.isDestroyed = () => true;
    await expect(handlers.get('feedback:capture-screenshot')!(authorizedEvent())).resolves.toBeNull();
    expect(mainWindow.webContents.capturePage).not.toHaveBeenCalled();
  });
});

describe('feedbackBridge local diagnostic export', () => {
  it('writes a valid gzip archive through a 0600 file after the user selects a destination', async () => {
    const exportDir = mkdtempSync(path.join(tmpdir(), 'weprompt-diagnostics-'));
    const outputPath = path.join(exportDir, 'diagnostics.json.gz');
    try {
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({ canceled: false, filePath: outputPath });
      const result = await handlers.get('feedback:export-local')!(authorizedEvent(), validInput());

      expect(result).toEqual({ status: 'saved', path: outputPath });
      expect(statSync(outputPath).mode & 0o777).toBe(0o600);
      const archive = readArchive(outputPath);
      expect(archive).toMatchObject({
        schema_version: 'weprompt-diagnostics/v2',
        privacy: {
          automatic_logs: 'not-included',
          automatic_metadata: 'allowlisted',
          network_upload: false,
          user_description: 'included-unredacted',
          user_screenshots: 'not-included',
        },
        report: {
          description: 'Conversation stuck',
          module: 'conversation-session',
          module_label: 'Conversation & Sessions',
          tags: { agent_error_code: 'USER_AGENT_ACP_INIT_FAILED' },
        },
      });
      expect(readdirSync(exportDir)).toEqual(['diagnostics.json.gz']);
    } finally {
      rmSync(exportDir, { recursive: true, force: true });
    }
  });

  it('does no collection or write when the save dialog is cancelled', async () => {
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({ canceled: true, filePath: undefined });
    await expect(
      handlers.get('feedback:export-local')!(authorizedEvent(), validInput({ collectLogs: true }))
    ).resolves.toEqual({ status: 'cancelled' });
  });

  it('keeps user-authored description wording and labels it truthfully as unredacted', async () => {
    const exportDir = mkdtempSync(path.join(tmpdir(), 'weprompt-description-'));
    const outputPath = path.join(exportDir, 'diagnostics.json.gz');
    try {
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({ canceled: false, filePath: outputPath });
      await handlers.get('feedback:export-local')!(authorizedEvent(), validInput());
      const archive = readArchive(outputPath);
      expect(archive.report.description).toBe('Conversation stuck');
      expect(archive.privacy.user_description).toBe('included-unredacted');
    } finally {
      rmSync(exportDir, { recursive: true, force: true });
    }
  });

  it.each([
    ['png', 'image/png', PNG_BYTES],
    ['jpeg', 'image/jpeg', JPEG_BYTES],
  ] as const)('accepts a bounded %s screenshot with a matching signature', async (_name, contentType, data) => {
    const exportDir = mkdtempSync(path.join(tmpdir(), 'weprompt-image-'));
    const outputPath = path.join(exportDir, 'diagnostics.json.gz');
    try {
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({ canceled: false, filePath: outputPath });
      const result = await handlers.get('feedback:export-local')!(
        authorizedEvent(),
        validInput({
          screenshots: [
            { contentType, data: [...data], filename: `shot.${contentType === 'image/png' ? 'png' : 'jpg'}` },
          ],
        })
      );
      expect(result).toEqual({ status: 'saved', path: outputPath });
      const archive = readArchive(outputPath);
      expect(archive.privacy.user_screenshots).toBe('included-unredacted');
      expect(archive.report.attachments).toEqual([
        expect.objectContaining({ content_type: contentType, data_base64: Buffer.from(data).toString('base64') }),
      ]);
    } finally {
      rmSync(exportDir, { recursive: true, force: true });
    }
  });

  it.each([
    ['unknown top-level field', validInput({ extra: { nested: { prompt: 'private' } } })],
    ['unknown attachment schema', validInput({ attachments: [{ contentType: 'application/gzip', data: [1] }] })],
    ['unknown tag', validInput({ tags: { arbitrary: 'value' } })],
    ['nested tag value', validInput({ tags: { agent_error_code: { nested: 'value' } } })],
    [
      'wrong image signature',
      validInput({ screenshots: [{ contentType: 'image/png', data: JPEG_BYTES, filename: 'fake.png' }] }),
    ],
    [
      'unknown image type',
      validInput({ screenshots: [{ contentType: 'image/gif', data: [0x47, 0x49, 0x46], filename: 'shot.gif' }] }),
    ],
    [
      'too many screenshots',
      validInput({
        screenshots: Array.from({ length: 4 }, (_, index) => ({
          contentType: 'image/png',
          data: PNG_BYTES,
          filename: `${index}.png`,
        })),
      }),
    ],
    ['oversized description', validInput({ description: 'x'.repeat(2_001) })],
    [
      'too many tags',
      validInput({ tags: Object.fromEntries(Array.from({ length: 17 }, (_, index) => [`tag-${index}`, 'value'])) }),
    ],
  ])('rejects malformed or unbounded input: %s', async (_name, input) => {
    const exportDir = mkdtempSync(path.join(tmpdir(), 'weprompt-reject-'));
    const outputPath = path.join(exportDir, 'diagnostics.json.gz');
    try {
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({ canceled: false, filePath: outputPath });
      await expect(handlers.get('feedback:export-local')!(authorizedEvent(), input)).resolves.toEqual({
        status: 'failed',
      });
      expect(dialog.showSaveDialog).not.toHaveBeenCalled();
      expect(readdirSync(exportDir)).toEqual([]);
    } finally {
      rmSync(exportDir, { recursive: true, force: true });
    }
  });

  it('cleans the 0600 temporary file when the atomic replacement fails', async () => {
    const exportDir = mkdtempSync(path.join(tmpdir(), 'weprompt-atomic-'));
    const occupiedDestination = path.join(exportDir, 'occupied');
    mkdirSync(occupiedDestination);
    try {
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({ canceled: false, filePath: occupiedDestination });
      await expect(handlers.get('feedback:export-local')!(authorizedEvent(), validInput())).resolves.toEqual({
        status: 'failed',
      });
      expect(readdirSync(exportDir)).toEqual(['occupied']);
    } finally {
      rmSync(exportDir, { recursive: true, force: true });
    }
  });
});

describe('feedback log collection', () => {
  it('collects only bounded recent log metadata and never reads log content', async () => {
    const logsDir = mkdtempSync(path.join(tmpdir(), 'weprompt-feedback-logs-'));
    try {
      writeFileSync(path.join(logsDir, '2026-05-25.log'), 'startup ready\nAuthorization: Bearer private-value\n');
      writeFileSync(path.join(logsDir, '2026-05-24.aioncore.log'), 'backend ready\n"content": "private prompt"\n');
      writeFileSync(path.join(logsDir, '2026-05-23.aionrs.log'), 'third day healthy\n');
      writeFileSync(path.join(logsDir, '2026-05-22.log'), 'too old\n');

      const attachment = await collectFeedbackLogAttachment(logsDir);
      expect(attachment).not.toBeNull();
      expect(attachment).toMatchObject({ contentType: 'application/json', filename: 'logs-metadata.json' });
      const content = attachment!.data.toString('utf8');
      const metadata = JSON.parse(content) as {
        files: Array<{ date: string; name: string; size_bytes: number }>;
        schema_version: string;
      };
      expect(metadata.schema_version).toBe('weprompt-log-metadata/v1');
      expect(metadata.files.map((file) => file.name)).toEqual([
        '2026-05-25.log',
        '2026-05-24.aioncore.log',
        '2026-05-23.aionrs.log',
      ]);
      expect(metadata.files.every((file) => file.size_bytes > 0)).toBe(true);
      expect(content).not.toContain('startup ready');
      expect(content).not.toContain('private-value');
      expect(content).not.toContain('private prompt');
      expect(content).not.toContain('too old');
    } finally {
      rmSync(logsDir, { recursive: true, force: true });
    }
  });

  it('includes main-collected logs in the final archive without a raw-log IPC channel', async () => {
    const logsDir = mkdtempSync(path.join(tmpdir(), 'weprompt-bridge-logs-'));
    const exportDir = mkdtempSync(path.join(tmpdir(), 'weprompt-bridge-export-'));
    const outputPath = path.join(exportDir, 'diagnostics.json.gz');
    try {
      writeFileSync(path.join(logsDir, '2026-05-25.log'), 'main-only safe log\n');
      vi.mocked(app.getPath).mockImplementation((name: string) => (name === 'logs' ? logsDir : exportDir));
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({ canceled: false, filePath: outputPath });

      await handlers.get('feedback:export-local')!(authorizedEvent(), validInput({ collectLogs: true }));
      const archive = readArchive(outputPath);
      expect(archive.privacy.automatic_logs).toBe('metadata-only-no-content');
      expect(archive.report.attachments[0]).toEqual(
        expect.objectContaining({ content_type: 'application/json', filename: 'logs-metadata.json' })
      );
      const logMetadata = Buffer.from(archive.report.attachments[0].data_base64, 'base64').toString('utf8');
      expect(logMetadata).toContain('2026-05-25.log');
      expect(logMetadata).not.toContain('main-only safe log');
      expect(handlers.has('feedback:collect-logs')).toBe(false);
    } finally {
      rmSync(logsDir, { recursive: true, force: true });
      rmSync(exportDir, { recursive: true, force: true });
    }
  });
});
