/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PresentationTemplateSummary } from '@/common/types/office/presentationTemplate';

const htmlDirective = (themeFile: string): string =>
  [
    `Create a presentation/report from the request below.`,
    `Read the attached ${themeFile} and follow it exactly: produce ONE self-contained HTML file`,
    `(all CSS/JS inline; only CDN assets the theme spec explicitly allows).`,
    `Save it into the conversation workspace with a descriptive snake_case file name.`,
    `Do not invent facts to fill template slots.`,
  ].join(' ');

const pptxDirective = (themeFile: string, referenceFile: string): string =>
  [
    `Create a presentation from the request below.`,
    `Before building anything: read the attached ${themeFile} in full and run \`officecli load_skill pptx\`; follow both.`,
    `Copy the attached ${referenceFile} to the output file, then edit the copy with officecli —`,
    `preserve its masters, layouts, typography, and slide chrome; duplicate its slides to match content types per the theme spec and replace their content.`,
    `Never build a deck from scratch and never write raw OOXML.`,
    `If the officecli tool is not available in this environment, stop and tell the user this template requires an officecli-capable agent — do not attempt to build the deck another way.`,
    `Every content slide needs a non-text visual (chart, shape, or image) and speaker notes.`,
    `Before declaring done, ALL delivery gates must pass: \`officecli validate\`; \`officecli view issues\` clean;`,
    `no leftover placeholder text; and a per-slide visual audit — render every slide with \`officecli view screenshot --page N\`,`,
    `inspect each image for text overflow, overlap, contrast, and margin problems, fix, and re-render until a full pass finds zero new issues (max 3 cycles).`,
    `Save the result into the conversation workspace.`,
    `Do not invent facts to fill template slots.`,
  ].join(' ');

/**
 * Composes the outgoing message for a template send: directive + user text,
 * template files appended to the attachment list (deduped). The same output
 * shape works for both ACP and aionrs send paths; `injectSkills` is consumed
 * only by the aionrs path.
 */
export function composePresentationSend(
  template: PresentationTemplateSummary,
  message: string,
  files: string[]
): { input: string; files: string[]; injectSkills: string[] } {
  const { manifest } = template;
  const directive =
    manifest.format === 'pptx' && template.referencePath && manifest.referenceFile
      ? pptxDirective(manifest.themeFile, manifest.referenceFile)
      : htmlDirective(manifest.themeFile);

  const attachments = [...files];
  for (const extra of [template.themePath, template.referencePath]) {
    if (extra && !attachments.includes(extra)) attachments.push(extra);
  }

  return {
    input: `${directive}\n\n${message}`,
    files: attachments,
    // Only the generic officecli skill resolves by name in the backend skill
    // registry; the specialized pptx design rules are pulled in-band via the
    // directive's mandatory `officecli load_skill pptx` step instead.
    injectSkills: manifest.format === 'pptx' ? ['officecli'] : [],
  };
}
