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
    `Use the officecli skill to clone the attached ${referenceFile} — preserve its masters, layouts,`,
    `typography, and slide chrome; replace only the content. The attached ${themeFile} describes the visual system.`,
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
    injectSkills: manifest.format === 'pptx' ? ['officecli'] : [],
  };
}
