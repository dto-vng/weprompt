/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * IPC handler for collecting and compressing recent log files
 * for the bug report feature.
 */

import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { chmod, writeFile } from 'node:fs/promises';
import * as path from 'path';
import { gzipSync, gunzipSync } from 'node:zlib';
import type {
  FeedbackDiagnosticAttachment,
  LocalFeedbackDiagnosticExportInput,
  LocalFeedbackDiagnosticExportResult,
} from '@/common/types/platform/electron';
import { collectFeedbackLogAttachment } from '../feedback/logs';

type RendererFeedbackLogPayload = {
  details?: unknown;
  level?: unknown;
  message?: unknown;
};

type JsonValue = JsonValue[] | { [key: string]: JsonValue } | boolean | null | number | string;

const REDACTED_VALUE = '[redacted]';
const SENSITIVE_KEY =
  /(?:api[_-]?key|auth(?:orization)?|bearer|credential|password|secret|token|prompt|conversation(?:[_-]?(?:body|content|message))?|(?:raw|provider)[_-]?error|stack)/i;
const SENSITIVE_TEXT =
  /(?:api[_ -]?key|authorization|bearer|credential|password|secret|(?:^|[^A-Za-z])token(?:[^A-Za-z]|$)|(?:^|[^A-Za-z])prompt(?:[^A-Za-z]|$)|conversation[_ -]+(?:body|content|message)|(?:raw|provider)[_-]?error|stack)/i;
const SENSITIVE_TOKEN_VALUE = /(?:\bsk-[A-Za-z0-9_-]{8,}\b|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b)/;
const SENSITIVE_METADATA_VALUE =
  /(?:\b(?:api[_ -]?key|authorization|credential|password|secret|token)\s*[:=]\s*\S+|\bbearer\s+\S+)/i;

function containsSensitiveText(value: string): boolean {
  return SENSITIVE_TEXT.test(value) || SENSITIVE_TOKEN_VALUE.test(value);
}

function containsSensitiveMetadataValue(value: string): boolean {
  return SENSITIVE_METADATA_VALUE.test(value) || SENSITIVE_TOKEN_VALUE.test(value);
}

function redactDiagnosticValue(value: unknown, key = ''): JsonValue | undefined {
  if (SENSITIVE_KEY.test(key)) return undefined;
  if (typeof value === 'string') {
    return containsSensitiveText(value) ? REDACTED_VALUE : value;
  }
  if (value === null) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value
      .map((entry) => redactDiagnosticValue(entry))
      .filter((entry): entry is JsonValue => entry !== undefined);
  }
  if (typeof value !== 'object') return undefined;

  const record: Record<string, JsonValue> = {};
  for (const [entryKey, entryValue] of Object.entries(value)) {
    const redacted = redactDiagnosticValue(entryValue, entryKey);
    if (redacted !== undefined) record[entryKey] = redacted;
  }
  return record;
}

function safeText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function redactFreeText(value: unknown, fallback = ''): string {
  const text = safeText(value, fallback);
  return containsSensitiveText(text) ? REDACTED_VALUE : text;
}

function sanitizeFilename(value: unknown): string {
  const filename = path.basename(safeText(value, 'diagnostic-attachment'));
  if (containsSensitiveText(filename)) return 'diagnostic-attachment';
  return filename.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 160) || 'diagnostic-attachment';
}

function sanitizeMetadataText(value: unknown, fallback: string): string {
  const text = safeText(value);
  return !text || containsSensitiveMetadataValue(text) ? fallback : text;
}

function sanitizeTextAttachment(content: Buffer<ArrayBufferLike>): Buffer<ArrayBufferLike> {
  const text = content.toString('utf8');
  const sanitized = text
    .split(/\r?\n/)
    .map((line) => (containsSensitiveText(line) ? REDACTED_VALUE : line))
    .join('\n');
  return Buffer.from(sanitized, 'utf8');
}

function sanitizeJsonAttachment(content: Buffer<ArrayBufferLike>): Buffer<ArrayBufferLike> | null {
  try {
    const parsed = JSON.parse(content.toString('utf8')) as unknown;
    return Buffer.from(JSON.stringify(redactDiagnosticValue(parsed) ?? null), 'utf8');
  } catch {
    return null;
  }
}

function sanitizeAttachment(attachment: FeedbackDiagnosticAttachment): {
  content_type: string;
  data_base64: string;
  filename: string;
} {
  const contentType = safeText(attachment.contentType, 'application/octet-stream');
  let data: Buffer<ArrayBufferLike> = Buffer.from(Array.isArray(attachment.data) ? attachment.data : []);

  if (contentType === 'application/gzip') {
    try {
      const decompressed = gunzipSync(data);
      data = gzipSync(sanitizeJsonAttachment(decompressed) ?? sanitizeTextAttachment(decompressed));
    } catch {
      data = gzipSync(Buffer.from(REDACTED_VALUE, 'utf8'));
    }
  } else if (contentType.startsWith('text/') || contentType === 'application/json') {
    data =
      contentType === 'application/json'
        ? (sanitizeJsonAttachment(data) ?? sanitizeTextAttachment(data))
        : sanitizeTextAttachment(data);
  }

  return {
    content_type: contentType,
    data_base64: data.toString('base64'),
    filename: sanitizeFilename(attachment.filename),
  };
}

function normalizeDiagnosticExport(input: unknown): {
  attachments: Array<{ content_type: string; data_base64: string; filename: string }>;
  description: string;
  extra: JsonValue | undefined;
  module: string;
  moduleLabel: string;
  tags: JsonValue | undefined;
} {
  const payload = input as Partial<LocalFeedbackDiagnosticExportInput>;
  const attachments = Array.isArray(payload.attachments) ? payload.attachments.map(sanitizeAttachment) : [];
  return {
    attachments,
    description: redactFreeText(payload.description),
    extra: redactDiagnosticValue(payload.extra),
    module: sanitizeMetadataText(payload.module, 'diagnostic-module'),
    moduleLabel: sanitizeMetadataText(payload.moduleLabel, 'Diagnostic report'),
    tags: redactDiagnosticValue(payload.tags),
  };
}

function buildDiagnosticArchive(input: unknown): Buffer {
  const report = normalizeDiagnosticExport(input);
  return gzipSync(
    JSON.stringify({
      generated_at: new Date().toISOString(),
      privacy: {
        api_keys_included: false,
        auth_tokens_included: false,
        conversation_bodies_included: false,
        prompts_included: false,
        raw_provider_errors_included: false,
      },
      report: {
        attachments: report.attachments,
        description: report.description,
        extra: report.extra,
        module: report.module,
        module_label: report.moduleLabel,
        tags: report.tags,
      },
      schema_version: 'weprompt-diagnostics/v1',
    })
  );
}

function createDiagnosticFilename(): string {
  return `weprompt-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.json.gz`;
}

function normalizeRendererFeedbackLogPayload(payload: RendererFeedbackLogPayload): {
  details?: unknown;
  level: 'info' | 'warn' | 'error';
  message: string;
} {
  const level = payload.level === 'warn' || payload.level === 'error' ? payload.level : 'info';
  const message = typeof payload.message === 'string' && payload.message.trim() ? payload.message : 'feedback log';
  return {
    level,
    message,
    details: payload.details,
  };
}

ipcMain.on('feedback:renderer-log', (_event, payload: RendererFeedbackLogPayload) => {
  const log = normalizeRendererFeedbackLogPayload(payload ?? {});
  const args = [`[FeedbackReport:renderer] ${log.message}`];
  if (log.details !== undefined) {
    args.push(log.details as string);
  }

  if (log.level === 'error') {
    console.error(...args);
  } else if (log.level === 'warn') {
    console.warn(...args);
  } else {
    console.info(...args);
  }
});

ipcMain.handle('feedback:collect-logs', async () => {
  try {
    let logsDir: string;
    try {
      logsDir = app.getPath('logs');
    } catch {
      logsDir = path.join(app.getPath('userData'), 'logs');
    }

    const logDirs = [logsDir, path.join(logsDir, 'logs')];
    const attachment = collectFeedbackLogAttachment(logDirs);
    if (!attachment) return null;

    // Return as number array for IPC serialization (Buffer is not serializable)
    return {
      filename: attachment.filename,
      data: Array.from(attachment.data),
    };
  } catch (error) {
    console.error('[feedbackBridge] Failed to collect logs:', error);
    return null;
  }
});

ipcMain.handle(
  'feedback:export-local',
  async (_event, input: unknown): Promise<LocalFeedbackDiagnosticExportResult> => {
    try {
      const result = await dialog.showSaveDialog({
        defaultPath: path.join(app.getPath('downloads'), createDiagnosticFilename()),
      });
      if (result.canceled) return { status: 'cancelled' };
      if (!result.filePath) return { status: 'failed' };

      await writeFile(result.filePath, buildDiagnosticArchive(input), { mode: 0o600 });
      await chmod(result.filePath, 0o600);
      return { path: result.filePath, status: 'saved' };
    } catch (error) {
      console.error('[feedbackBridge] Failed to export local diagnostics:', error);
      return { status: 'failed' };
    }
  }
);

ipcMain.handle('feedback:capture-screenshot', async (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) {
      return null;
    }

    const image = await win.webContents.capturePage();
    const png = image.toPNG();
    if (!png || png.length === 0) {
      return null;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return {
      filename: `screenshot-${timestamp}.png`,
      data: Array.from(png),
    };
  } catch (error) {
    console.error('[feedbackBridge] Failed to capture screenshot:', error);
    return null;
  }
});
