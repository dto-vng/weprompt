/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { open, rename, stat, unlink } from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';
import { app } from 'electron';
import type { LocalFeedbackDiagnosticExportInput } from '@/common/types/platform/electron';
import { collectFeedbackLogAttachment } from './logs';

const gzipAsync = promisify(gzip);

const MAX_DESCRIPTION_LENGTH = 2_000;
const MAX_MODULE_LENGTH = 80;
const MAX_MODULE_LABEL_LENGTH = 160;
const MAX_SCREENSHOTS = 3;
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_SCREENSHOT_BYTES = 12 * 1024 * 1024;
const MAX_TAGS = 16;
const MAX_TAG_VALUE_LENGTH = 160;

const ALLOWED_INPUT_KEYS = new Set(['collectLogs', 'description', 'module', 'moduleLabel', 'screenshots', 'tags']);
const ALLOWED_TAG_KEYS = new Set([
  'agent_error_code',
  'agent_error_ownership',
  'agent_error_resolution',
  'agent_error_retryable',
  'kind',
  'message',
  'aionui.installation_integrity.user_report',
  'aionui.installation_integrity.report_source',
  'aionui.installation_integrity.failure_kind',
  'aionui.runtime_resource',
  'aionui.runtime_resource_id',
  'aionui.runtime_scope',
  'aionui.backend_startup_failure.reason',
  'aionui.backend_startup_failure.backend_boundary_code',
  'aionui.backend_startup_failure.backend_boundary_stage',
]);
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff] as const;

type NormalizedInput = {
  collectLogs: boolean;
  description: string;
  module: string;
  moduleLabel: string;
  screenshots: Array<{ content_type: 'image/jpeg' | 'image/png'; data_base64: string; filename: string }>;
  tags?: Record<string, string>;
};

function assertPlainRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object`);
  }
}

function assertExactKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, label: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} contains an unknown field`);
  }
}

function boundedString(value: unknown, maxLength: number, label: string, allowWhitespace: boolean): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`);
  const text = value.trim();
  if (!text || text.length > maxLength) throw new Error(`${label} is outside its allowed length`);
  if (!allowWhitespace && !SAFE_IDENTIFIER.test(text)) throw new Error(`${label} contains unsupported characters`);
  return text;
}

function sanitizeFilename(value: unknown, contentType: 'image/jpeg' | 'image/png', index: number): string {
  if (typeof value !== 'string' || value.length > 160) {
    return `screenshot-${index + 1}.${contentType === 'image/png' ? 'png' : 'jpg'}`;
  }
  const base = path
    .basename(value)
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .slice(0, 160);
  return base || `screenshot-${index + 1}.${contentType === 'image/png' ? 'png' : 'jpg'}`;
}

function hasSignature(data: readonly number[], signature: readonly number[]): boolean {
  return data.length >= signature.length && signature.every((byte, index) => data[index] === byte);
}

function normalizeScreenshot(value: unknown, index: number): NormalizedInput['screenshots'][number] {
  assertPlainRecord(value, 'screenshot');
  assertExactKeys(value, new Set(['contentType', 'data', 'filename']), 'screenshot');
  const contentType = value.contentType;
  if (contentType !== 'image/png' && contentType !== 'image/jpeg') {
    throw new Error('screenshot content type is unsupported');
  }
  if (!Array.isArray(value.data) || value.data.length === 0 || value.data.length > MAX_SCREENSHOT_BYTES) {
    throw new Error('screenshot size is outside its allowed range');
  }
  if (!value.data.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
    throw new Error('screenshot bytes are malformed');
  }
  const signature = contentType === 'image/png' ? PNG_SIGNATURE : JPEG_SIGNATURE;
  if (!hasSignature(value.data, signature)) throw new Error('screenshot signature does not match its content type');

  return {
    content_type: contentType,
    data_base64: Buffer.from(value.data).toString('base64'),
    filename: sanitizeFilename(value.filename, contentType, index),
  };
}

function normalizeTags(value: unknown): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  assertPlainRecord(value, 'tags');
  const entries = Object.entries(value);
  if (entries.length > MAX_TAGS) throw new Error('too many diagnostic tags');

  const tags: Record<string, string> = {};
  for (const [key, rawValue] of entries) {
    if (!ALLOWED_TAG_KEYS.has(key)) throw new Error('diagnostic tag is not allowlisted');
    tags[key] = boundedString(rawValue, MAX_TAG_VALUE_LENGTH, 'diagnostic tag value', false);
  }
  return tags;
}

function normalizeInput(value: unknown): NormalizedInput {
  assertPlainRecord(value, 'diagnostic export');
  assertExactKeys(value, ALLOWED_INPUT_KEYS, 'diagnostic export');
  if (typeof value.collectLogs !== 'boolean') throw new Error('collectLogs must be a boolean');
  if (!Array.isArray(value.screenshots) || value.screenshots.length > MAX_SCREENSHOTS) {
    throw new Error('screenshots are malformed or exceed the allowed count');
  }

  const screenshots = value.screenshots.map(normalizeScreenshot);
  const totalScreenshotBytes = value.screenshots.reduce((total, screenshot) => {
    assertPlainRecord(screenshot, 'screenshot');
    return total + (Array.isArray(screenshot.data) ? screenshot.data.length : 0);
  }, 0);
  if (totalScreenshotBytes > MAX_TOTAL_SCREENSHOT_BYTES) throw new Error('screenshots exceed the total size limit');

  return {
    collectLogs: value.collectLogs,
    description: boundedString(value.description, MAX_DESCRIPTION_LENGTH, 'description', true),
    module: boundedString(value.module, MAX_MODULE_LENGTH, 'module', false),
    moduleLabel: boundedString(value.moduleLabel, MAX_MODULE_LABEL_LENGTH, 'module label', true),
    screenshots,
    tags: normalizeTags(value.tags),
  };
}

export function validateLocalDiagnosticExportInput(input: unknown): void {
  normalizeInput(input);
}

export async function buildLocalDiagnosticArchive(input: LocalFeedbackDiagnosticExportInput): Promise<Buffer> {
  const report = normalizeInput(input);
  const logAttachment = report.collectLogs ? await collectFeedbackLogAttachment(resolveLogDirectories()) : null;
  const payload = {
    generated_at: new Date().toISOString(),
    privacy: {
      automatic_logs: logAttachment ? 'metadata-only-no-content' : 'not-included',
      automatic_metadata: 'allowlisted',
      network_upload: false,
      user_description: 'included-unredacted',
      user_screenshots: report.screenshots.length > 0 ? 'included-unredacted' : 'not-included',
    },
    report: {
      attachments: [
        ...(logAttachment
          ? [
              {
                content_type: logAttachment.contentType,
                data_base64: logAttachment.data.toString('base64'),
                filename: logAttachment.filename,
              },
            ]
          : []),
        ...report.screenshots,
      ],
      description: report.description,
      module: report.module,
      module_label: report.moduleLabel,
      tags: report.tags,
    },
    schema_version: 'weprompt-diagnostics/v2',
  };
  return Buffer.from(await gzipAsync(Buffer.from(JSON.stringify(payload), 'utf8')));
}

function resolveLogDirectories(): string[] {
  let logsDir: string;
  try {
    logsDir = app.getPath('logs');
  } catch {
    logsDir = path.join(app.getPath('userData'), 'logs');
  }
  return [logsDir, path.join(logsDir, 'logs')];
}

export function createDiagnosticFilename(): string {
  return `weprompt-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.json.gz`;
}

export async function writeArchiveAtomically(destination: string, archive: Buffer): Promise<void> {
  const directory = path.dirname(destination);
  const temporaryPath = path.join(directory, `.${path.basename(destination)}.${randomUUID()}.tmp`);
  let temporaryCreated = false;

  try {
    const handle = await open(temporaryPath, 'wx', 0o600);
    temporaryCreated = true;
    try {
      await handle.writeFile(archive);
      await handle.sync();
      await handle.chmod(0o600);
    } finally {
      await handle.close();
    }

    if (process.platform !== 'win32') {
      const mode = (await stat(temporaryPath)).mode & 0o777;
      if (mode !== 0o600) throw new Error('temporary diagnostic archive permissions are unsafe');
    }
    await rename(temporaryPath, destination);
    temporaryCreated = false;
  } finally {
    if (temporaryCreated) await unlink(temporaryPath).catch((): undefined => undefined);
  }
}
