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
  /** Attachments that belong to the template pack (THEME.md, reference.pptx). */
  templateFiles: string[];
  /** The user's own attachments — still shown as file chips. */
  userFiles: string[];
};

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
