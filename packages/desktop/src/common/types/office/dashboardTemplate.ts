/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type DashboardTemplateSource = 'builtin' | 'user';

/** Contents of a dashboard template pack's manifest. */
export type DashboardTemplateManifest = {
  id: string;
  name: string;
  nameI18n?: Record<string, string>;
  description: string;
  descriptionI18n?: Record<string, string>;
  source: DashboardTemplateSource;
  /** File name (no path separators) of the seeded HTML template inside the pack dir. */
  templateFile: string;
  /** File name of the build/refresh spec (metric definitions + SQL) inside the pack dir. */
  specFile: string;
  /** File name of the gallery thumbnail (SVG or PNG). */
  preview: string;
  /** Fully-qualified data source the spec queries. */
  dataSource: string;
  /** Monotonic version for builtin re-sync. */
  version: number;
  createdAt: string;
};

/** What a consumer (gallery / creator agent) receives per dashboard template. */
export type DashboardTemplateSummary = {
  manifest: DashboardTemplateManifest;
  /** Absolute path of the seeded HTML template on disk. */
  templatePath: string;
  /** Absolute path of the build/refresh spec on disk. */
  specPath: string;
  /** data: URL for the thumbnail (image/svg+xml or image/png). */
  previewDataUrl: string;
};
