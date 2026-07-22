/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  PresentationTemplateFormat,
  PresentationTemplateKind,
  PresentationTemplateManifest,
  PresentationTemplateSource,
} from '@/common/types/office/presentationTemplate';

export const TEMPLATE_ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;

const FORMATS = new Set<PresentationTemplateFormat>(['html', 'pptx']);
const KINDS = new Set<PresentationTemplateKind>(['deck', 'report']);
const SOURCES: PresentationTemplateSource[] = ['builtin', 'user'];

const fail = (reason: string): never => {
  throw new Error(`invalid manifest: ${reason}`);
};

const isPlainFileName = (value: string): boolean =>
  value.length > 0 && !value.includes('/') && !value.includes('\\') && value !== '.' && value !== '..';

const isLocaleMap = (value: unknown): value is Record<string, string> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((v) => typeof v === 'string');

/** Validates raw JSON into a manifest; throws Error('invalid manifest: …') on any violation. */
export function validateTemplateManifest(raw: unknown): PresentationTemplateManifest {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) fail('not an object');
  const m = raw as Record<string, unknown>;

  if (typeof m.id !== 'string' || !TEMPLATE_ID_RE.test(m.id)) fail(`bad id: ${String(m.id)}`);
  if (typeof m.name !== 'string' || m.name.trim().length === 0) fail('missing name');
  if (typeof m.description !== 'string') fail('missing description');
  if (m.nameI18n !== undefined && !isLocaleMap(m.nameI18n)) fail('bad nameI18n');
  if (m.descriptionI18n !== undefined && !isLocaleMap(m.descriptionI18n)) fail('bad descriptionI18n');
  if (typeof m.format !== 'string' || !FORMATS.has(m.format as PresentationTemplateFormat))
    fail(`bad format: ${String(m.format)}`);
  if (typeof m.kind !== 'string' || !KINDS.has(m.kind as PresentationTemplateKind)) fail(`bad kind: ${String(m.kind)}`);
  if (typeof m.source !== 'string' || !SOURCES.includes(m.source as PresentationTemplateSource))
    fail(`bad source: ${String(m.source)}`);
  if (typeof m.themeFile !== 'string' || !isPlainFileName(m.themeFile)) fail('bad themeFile');
  if (m.referenceFile !== null && (typeof m.referenceFile !== 'string' || !isPlainFileName(m.referenceFile)))
    fail('bad referenceFile');
  if (m.format === 'pptx' && m.referenceFile === null) fail('pptx template requires referenceFile');
  if (typeof m.preview !== 'string' || !isPlainFileName(m.preview)) fail('bad preview');
  if (typeof m.version !== 'number' || !Number.isInteger(m.version) || m.version < 1) fail('bad version');
  if (typeof m.createdAt !== 'string' || m.createdAt.length === 0) fail('bad createdAt');

  return {
    id: m.id as string,
    name: m.name as string,
    nameI18n: m.nameI18n as Record<string, string> | undefined,
    description: m.description as string,
    descriptionI18n: m.descriptionI18n as Record<string, string> | undefined,
    format: m.format as PresentationTemplateFormat,
    kind: m.kind as PresentationTemplateKind,
    source: m.source as PresentationTemplateSource,
    themeFile: m.themeFile as string,
    referenceFile: m.referenceFile as string | null,
    preview: m.preview as string,
    version: m.version as number,
    createdAt: m.createdAt as string,
  };
}
