/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ArtifactScratchAllocation,
  PresentationTemplateSummary,
} from '@/common/types/office/presentationTemplate';
import { PRESENTATION_RUN_DIRECTIVE_PREFIX } from '@/common/config/constants';

/**
 * First sentence of each directive. Exported so the chat renderer can detect
 * templated sends without duplicating strings that would silently drift.
 */
export const HTML_DIRECTIVE_PREFIX = 'Create a presentation/report from the request below.';
export { PRESENTATION_RUN_DIRECTIVE_PREFIX as PPTX_DIRECTIVE_PREFIX };
export const DOCX_DIRECTIVE_PREFIX = 'Create a Word document from the request below.';

export const TEMPLATE_CREATION_DIRECTIVE_PREFIX = 'Template creation instructions:';

export const TEMPLATE_CREATION_DIRECTIVE = [
  `${TEMPLATE_CREATION_DIRECTIVE_PREFIX} write a complete reusable HTML template specification to a file named \`THEME.md\` inside the conversation workspace (your current working directory); never write it outside that workspace.`,
  `Resolve the file's absolute path for the marker. Make the specification self-contained and actionable: include its purpose, visual system (palette and typography), layout and reusable-component catalog, content and data rules, responsive and accessibility behavior, hard bans, and delivery/QA checks.`,
  `Briefly explain in prose what you created and that confirming the review card installs it into the local Template Gallery for future use.`,
  `Only if you successfully wrote that file during this turn, append exactly one marker as the standalone final line, outside any Markdown fence: \`<!-- AIONUI_TEMPLATE_REVIEW_V1 {"file_path":"<absolute path to THEME.md>"} -->\`.`,
  `Replace the placeholder with the JSON-escaped absolute path. Never emit the marker for a file you did not just write, never emit more than one marker, and put nothing after it.`,
].join(' ');

const TEMPLATE_CREATION_INTENT_PATTERNS = [
  /\b(?:create|make|build|generate|draft)\s+(?:me\s+)?(?:(?:an?|the|this|that|new|reusable)\s+)*(?:template|theme)\b/i,
  /\b(?:save|capture|extract|derive|reuse)\s+(?:this|that|the|current)\s+(?:(?:look|style|design|visual\s+system|theme)\s+)?as\s+(?:an?\s+)?(?:reusable\s+)?(?:template|theme)\b/i,
  /\b(?:turn|convert)\s+(?:this|that|the|current)(?:\s+(?:look|style|design|visual\s+(?:style|system)|theme))?\s+into\s+(?:an?\s+)?(?:reusable\s+)?(?:template|theme)\b/i,
];

const hasTemplateCreationIntent = (message: string): boolean =>
  TEMPLATE_CREATION_INTENT_PATTERNS.some((pattern) => pattern.test(message.normalize('NFKC')));

const htmlDirective = (themeFile: string): string =>
  [
    HTML_DIRECTIVE_PREFIX,
    `Read the attached ${themeFile} and follow it exactly: produce ONE self-contained HTML file`,
    `(all CSS/JS inline; only CDN assets the theme spec explicitly allows).`,
    `If the user attached source documents (Excel, Word, CSV, PDF), extract their real content first and build from that data;`,
    `never invent numbers when sources are attached. officecli is a command-line program run through your shell/execute tool`,
    `(it will not appear in your tool list): \`officecli view <file> text\` reads Office files; use plain shell tools for CSV/text.`,
    `If officecli is genuinely missing from the shell, extract what you can with other tools and say so — do not stop.`,
    `Save it into the conversation workspace with a descriptive snake_case file name.`,
    `Do not invent facts to fill template slots.`,
  ].join(' ');

/** User attachments that the agent should mine for content via officecli. */
const OFFICE_SOURCE_EXT_RE = /\.(xlsx|xls|docx|doc|pptx|pdf|odt|ods|odp)$/i;

const officeArtifactScratchRules = (scratch?: ArtifactScratchAllocation): string[] => {
  if (!scratch) {
    return [
      `Before creating QA or intermediate files, allocate one secure temporary directory outside the conversation workspace`,
      `(use mktemp -d on macOS/Linux, or a GUID-named folder under the system temp directory on Windows) and retain its exact path.`,
      `All QA renders, repair scripts, command payloads, backups, and intermediate copies must use explicit paths inside that scratch directory;`,
      `only user sources and the declared final deliverable belong in the conversation workspace.`,
      `After the final deliverable is installed and every delivery gate passes, remove only that exact scratch directory — never clean by filename pattern, extension, or wildcard.`,
      `If the run fails or is interrupted, preserve the scratch directory and report its exact path so recovery remains possible.`,
    ];
  }

  return [
    `Use this app-managed scratch directory: \`${scratch.directory}\`.`,
    `All QA renders, repair scripts, command payloads, backups, and intermediate copies must use explicit paths inside that scratch directory;`,
    `only user sources and the declared final deliverable belong in the conversation workspace.`,
    `After the final deliverable is installed and every delivery gate passes, write the delivery-ready marker \`${scratch.readyMarker}\`.`,
    `Do not delete the scratch directory yourself; the app removes that exact owned directory after the successful turn.`,
    `Never clean by filename pattern, extension, or wildcard.`,
    `If the run fails or is interrupted, preserve the scratch directory and report its exact path so recovery remains possible.`,
  ];
};

const pptxDirective = (themeFile: string, referenceFile: string, scratch?: ArtifactScratchAllocation): string =>
  [
    PRESENTATION_RUN_DIRECTIVE_PREFIX,
    `officecli is a command-line program you run through your shell/execute tool — it is not a chat tool and will never appear in your tool list.`,
    `Before concluding anything about availability, run \`officecli --version\` in the shell;`,
    `only if that command itself fails should you stop — tell the user, quoting the failing command and its output; never conclude officecli is unavailable without running it.`,
    `Before building anything: read the attached ${themeFile} in full and run \`officecli load_skill pptx\`; follow both.`,
    `Copy the attached ${referenceFile} to the output file, then edit the copy with officecli —`,
    `preserve its masters, layouts, typography, and slide chrome; duplicate its slides to match content types per the theme spec and replace their content.`,
    `Never build a deck from scratch and never write raw OOXML.`,
    `If the user attached source documents (Excel, Word, CSV, PDF), extract their real content first —`,
    `\`officecli view <file> text\` reads Office files — and build slide content and chart data from it; never invent numbers when sources are attached.`,
    `If \`officecli view <file> text\` returns empty or unusable content for any required source, stop and ask the user for a readable source — never proceed to build from missing source content.`,
    `Every content slide needs a non-text visual (chart, shape, or image) and speaker notes.`,
    ...officeArtifactScratchRules(scratch),
    `Before declaring done, ALL delivery gates must pass: \`officecli validate\`; \`officecli view issues\` clean;`,
    `no leftover placeholder text; and a per-slide visual audit — render every slide with \`officecli view screenshot --page N\`,`,
    `inspect each image for text overflow, overlap, contrast, and margin problems, fix, and re-render until a full pass finds zero new issues (max 3 cycles).`,
    `Save the result into the conversation workspace.`,
    `For any follow-up change request later in this conversation, follow the "Follow-up edits" section of ${themeFile}:`,
    `edit the existing deck in place, re-run the validate and issues gates, and show the re-rendered changed slide(s) in your reply as a markdown image.`,
    `Do not invent facts to fill template slots.`,
  ].join(' ');

const docxDirective = (themeFile: string, referenceFile: string, scratch?: ArtifactScratchAllocation): string =>
  [
    DOCX_DIRECTIVE_PREFIX,
    `officecli is a command-line program you run through your shell/execute tool — it is not a chat tool and will never appear in your tool list.`,
    `Before concluding anything about availability, run \`officecli --version\` in the shell;`,
    `only if that command itself fails should you stop — tell the user, quoting the failing command and its output; never conclude officecli is unavailable without running it.`,
    `Before building anything: read the attached ${themeFile} in full and run \`officecli load_skill docx\`; follow both.`,
    `Copy the attached ${referenceFile} to the output file, then edit the copy with officecli —`,
    `preserve its Word styles, numbering definitions, page setup, and header/footer parts; replace the sample content wholesale.`,
    `Never build a document from scratch and never write raw OOXML.`,
    ...officeArtifactScratchRules(scratch),
    `If the user attached source documents (Excel, Word, CSV, PDF), extract their real content first —`,
    `\`officecli view <file> text\` reads Office files — and build sections and tables from it; never invent numbers when sources are attached.`,
    `If \`officecli view <file> text\` returns empty or unusable content for any required source, stop and ask the user for a readable source — never proceed to build from missing source content.`,
    `Before declaring done, ALL delivery gates must pass: \`officecli validate\` returning "no errors found";`,
    `\`officecli view issues\` clean; no leftover placeholder text;`,
    `and a whole-document visual audit — render a contact sheet with \`officecli view <file> screenshot --grid auto\`,`,
    `inspect it for pagination faults, blank pages, table overflow, heading rhythm, and margin problems,`,
    `confirm any fine call on the suspect page with \`screenshot --page N\`, fix, and re-render until a full pass finds zero new issues (max 3 cycles).`,
    `Save the result into the conversation workspace with a descriptive snake_case file name.`,
    `For any follow-up change request later in this conversation, follow the "Follow-up edits" section of ${themeFile}:`,
    `edit the existing document in place, re-run the validate and issues gates, and show the re-rendered changed page(s) in your reply as a markdown image.`,
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
  files: string[],
  scratch?: ArtifactScratchAllocation
): { input: string; files: string[]; injectSkills: string[]; artifactScratchRunId?: string } {
  const { manifest } = template;
  const hasReference = Boolean(template.referencePath && manifest.referenceFile);
  let directive: string;
  if (manifest.format === 'pptx' && hasReference) {
    directive = pptxDirective(manifest.themeFile, manifest.referenceFile!, scratch);
  } else if (manifest.format === 'docx' && hasReference) {
    directive = docxDirective(manifest.themeFile, manifest.referenceFile!, scratch);
  } else {
    // No retained reference resolved (corrupt pack): never tell the agent to copy
    // a file that is not attached — fall back to the spec-only directive.
    directive = htmlDirective(manifest.themeFile);
  }

  const attachments = [...files];
  for (const extra of [template.themePath, template.referencePath]) {
    if (extra && !attachments.includes(extra)) attachments.push(extra);
  }

  const clonesReference = manifest.format === 'pptx' || manifest.format === 'docx';
  return {
    input: `${directive}\n\n${message}`,
    files: attachments,
    // Only the generic officecli skill resolves by name in the backend skill
    // registry; the specialized pptx/docx design rules are pulled in-band via
    // the directive's mandatory `officecli load_skill` step instead. HTML sends
    // get the skill too when the user attached Office source documents the
    // agent must read with officecli.
    injectSkills: clonesReference || files.some((f) => OFFICE_SOURCE_EXT_RE.test(f)) ? ['officecli'] : [],
    ...(scratch ? { artifactScratchRunId: scratch.runId } : {}),
  };
}

/**
 * Adds assistant-only template-creation guidance for explicit creation intent.
 * Existing presentation prefixes remain byte-for-byte stable because the extra
 * guidance is inserted after their directive paragraph and before user text.
 */
export function composeAssistantSend(
  template: PresentationTemplateSummary | null,
  message: string,
  files: string[],
  scratch?: ArtifactScratchAllocation
): { input: string; files: string[]; injectSkills: string[]; artifactScratchRunId?: string } {
  const composed = template
    ? composePresentationSend(template, message, files, scratch)
    : { input: message, files, injectSkills: [] as string[] };
  if (!hasTemplateCreationIntent(message)) return composed;

  if (template) {
    const directiveEnd = composed.input.indexOf('\n\n');
    return {
      ...composed,
      input: `${composed.input.slice(0, directiveEnd)} ${TEMPLATE_CREATION_DIRECTIVE}${composed.input.slice(directiveEnd)}`,
    };
  }

  return { ...composed, input: `${TEMPLATE_CREATION_DIRECTIVE}\n\n${message}` };
}
