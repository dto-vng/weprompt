/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DOCX_DIRECTIVE_PREFIX,
  HTML_DIRECTIVE_PREFIX,
  PPTX_DIRECTIVE_PREFIX,
} from '@/renderer/components/chat/TemplateGallery/directive';

const THEME_PATH_RE = /[/\\]presentation-templates[/\\]([^/\\]+)[/\\]THEME\.md$/i;
const TEMPLATE_FILE_RE = /[/\\]presentation-templates[/\\]([^/\\]+)[/\\][^/\\]+$/i;

export type TemplatedSend = {
  templateId: string;
  /** What the user actually typed (everything after the directive paragraph). */
  userText: string;
  /** Attachments that belong to the template pack (THEME.md, reference.pptx/.docx). */
  templateFiles: string[];
  /** The user's own attachments — still shown as file chips. */
  userFiles: string[];
};

export const TEMPLATE_REVIEW_MARKER_PREFIX = '<!-- AIONUI_TEMPLATE_REVIEW_V1 ';

export type TemplateReviewAnnouncement = {
  visibleText: string;
  filePath: string;
};

const FENCE_LINE_RE = /^\s*(`{3,}|~{3,})/;

/**
 * Extract a reserved, terminal assistant metadata comment without interpreting
 * marker-shaped examples inside Markdown fences. Only file_path is read from
 * the payload: conversation authority and the confirmation digest come from
 * trusted runtime state.
 */
export function parseTemplateReviewAnnouncement(text: string): TemplateReviewAnnouncement | null {
  const lines = text.split(/\r?\n/);
  let fence: { character: string; length: number } | null = null;
  let markerIndex = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const fenceMatch = lines[index].match(FENCE_LINE_RE);
    if (fenceMatch) {
      const token = fenceMatch[1];
      if (fence === null) {
        fence = { character: token[0], length: token.length };
      } else if (token[0] === fence.character && token.length >= fence.length) {
        fence = null;
      }
      continue;
    }
    if (fence === null && lines[index].startsWith(TEMPLATE_REVIEW_MARKER_PREFIX)) markerIndex = index;
  }

  if (markerIndex === -1 || lines.slice(markerIndex + 1).some((line) => line.trim() !== '')) return null;
  const markerLine = lines[markerIndex];
  if (!markerLine.endsWith(' -->')) return null;

  try {
    const payload = JSON.parse(markerLine.slice(TEMPLATE_REVIEW_MARKER_PREFIX.length, -4)) as unknown;
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;
    const filePath = 'file_path' in payload ? payload.file_path : undefined;
    if (typeof filePath !== 'string' || filePath.length === 0 || filePath.length > 4096 || filePath.includes('\0')) {
      return null;
    }
    return {
      visibleText: lines.slice(0, markerIndex).join('\n').trimEnd(),
      filePath,
    };
  } catch {
    return null;
  }
}

/**
 * Detect a presentation-template send from its two independent signals: the
 * directive prefix in the text AND an attached template THEME.md. Returns null
 * when either signal is missing so the caller renders the message unchanged —
 * never hide content we cannot classify.
 */
export function parseTemplatedSend(text: string, files: string[]): TemplatedSend | null {
  const PREFIXES = [PPTX_DIRECTIVE_PREFIX, HTML_DIRECTIVE_PREFIX, DOCX_DIRECTIVE_PREFIX];
  if (!PREFIXES.some((prefix) => text.startsWith(prefix))) return null;
  const themeFile = files.find((f) => THEME_PATH_RE.test(f));
  if (!themeFile) return null;
  const templateId = themeFile.match(THEME_PATH_RE)![1];
  const splitAt = text.indexOf('\n\n');
  if (splitAt === -1) return null;
  const userText = text.slice(splitAt + 2);
  const templateFiles = files.filter((f) => f.match(TEMPLATE_FILE_RE)?.[1] === templateId);
  const userFiles = files.filter((f) => !templateFiles.includes(f));
  return { templateId, userText, templateFiles, userFiles };
}
