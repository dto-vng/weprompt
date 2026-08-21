/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type PresentationTemplateFormat = 'html' | 'pptx' | 'docx';
export type PresentationTemplateKind = 'deck' | 'report' | 'document';
export type PresentationTemplateSource = 'builtin' | 'user';

/** Contents of a template pack's template.json. */
export type PresentationTemplateManifest = {
  id: string;
  name: string;
  nameI18n?: Record<string, string>;
  description: string;
  descriptionI18n?: Record<string, string>;
  format: PresentationTemplateFormat;
  kind: PresentationTemplateKind;
  source: PresentationTemplateSource;
  /** File name (no path separators) of the theme spec inside the pack dir. */
  themeFile: string;
  /** File name of the retained reference file (deck or document); required for pptx and docx formats. */
  referenceFile: string | null;
  /** File name of the gallery thumbnail (SVG or PNG). */
  preview: string;
  /** Monotonic version for builtin re-sync. */
  version: number;
  createdAt: string;
};

/** What the renderer gallery receives per template. */
export type PresentationTemplateSummary = {
  manifest: PresentationTemplateManifest;
  /** Absolute path of the theme spec on disk. */
  themePath: string;
  /** Absolute path of the reference file (deck or document), when the template has one. */
  referencePath: string | null;
  /** data: URL for the thumbnail (image/svg+xml or image/png). */
  previewDataUrl: string;
};

export type PresentationTemplateCandidateDescription = {
  name: string;
  tokens: { colors: string[]; fonts: string[] };
  preview_data_url: string;
  sha256: string;
  byte_length: number;
};

export type PresentationTemplateCandidateFailureCode =
  | 'INVALID_REQUEST'
  | 'RUN_NOT_FOUND'
  | 'RUN_FORBIDDEN'
  | 'SCOPE_UNAVAILABLE'
  | 'TEAM_SCOPE_UNSUPPORTED'
  | 'CANDIDATE_OUTSIDE_WORKSPACE'
  | 'CANDIDATE_UNSUPPORTED'
  | 'CANDIDATE_TOO_LARGE'
  | 'CANDIDATE_CHANGED'
  | 'CONFIRMATION_NOT_MINTED'
  | 'INSTALL_FAILED';

export type PresentationTemplateCandidateFailure = {
  ok: false;
  code: PresentationTemplateCandidateFailureCode;
};

export type DescribePresentationTemplateCandidateResult =
  | { ok: true; candidate: PresentationTemplateCandidateDescription }
  | PresentationTemplateCandidateFailure;

export type ImportPresentationTemplateCandidateResult =
  | { ok: true; template: PresentationTemplateSummary }
  | PresentationTemplateCandidateFailure;

/** Exact app-owned scratch location for one Office artifact run. */
export type ArtifactScratchAllocation = {
  runId: string;
  directory: string;
  readyMarker: string;
};

export type ArtifactScratchResult =
  | { status: 'cleaned' }
  | {
      status: 'retained';
      directory: string;
      reason: 'delivery_not_ready' | 'failed' | 'interrupted';
    };
