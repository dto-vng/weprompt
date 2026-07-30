/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import type { PresentationTemplateManifest } from '@/common/types/office/presentationTemplate';
import editorialThemeMd from './editorial-field-report/THEME.md?raw';
import editorialPreviewSvg from './editorial-field-report/preview.svg?raw';
import simpleLightThemeMd from './simple-light/THEME.md?raw';
import simpleLightPreviewSvg from './simple-light/preview.svg?raw';
import simpleDarkThemeMd from './simple-dark/THEME.md?raw';
import simpleDarkPreviewSvg from './simple-dark/preview.svg?raw';
import marketTrendsThemeMd from './market-trends-report/THEME.md?raw';
import marketTrendsPreviewSvg from './market-trends-report/preview.svg?raw';
import businessReviewThemeMd from './business-review/THEME.md?raw';
import businessReviewPreviewSvg from './business-review/preview.svg?raw';
import projectKickoffThemeMd from './project-kickoff/THEME.md?raw';
import projectKickoffPreviewSvg from './project-kickoff/preview.svg?raw';
import monthlySteercoThemeMd from './monthly-steerco/THEME.md?raw';
import monthlySteercoPreviewSvg from './monthly-steerco/preview.svg?raw';
import connectedOpsThemeMd from './connected-ops/THEME.md?raw';
import connectedOpsPreviewSvg from './connected-ops/preview.svg?raw';
import businessReportThemeMd from './business-report/THEME.md?raw';
import businessReportPreviewSvg from './business-report/preview.svg?raw';
import decisionMemoThemeMd from './decision-memo/THEME.md?raw';
import decisionMemoPreviewSvg from './decision-memo/preview.svg?raw';
import operationsGuideThemeMd from './operations-guide/THEME.md?raw';
import operationsGuidePreviewSvg from './operations-guide/preview.svg?raw';
import proposalSowThemeMd from './proposal-sow/THEME.md?raw';
import proposalSowPreviewSvg from './proposal-sow/preview.svg?raw';

export type BuiltinTemplatePack = {
  manifest: PresentationTemplateManifest;
  themeMd: string;
  previewSvg: string;
  /** PPTX and docx packs resolve their bundled reference file lazily (needs electron `app`). */
  referenceSourcePath?: () => string;
};

const CREATED_AT = '2026-07-22T00:00:00Z';
const DOCX_CREATED_AT = '2026-07-28T00:00:00Z';

/**
 * Bundled binary resources: packaged builds read from process.resourcesPath
 * (electron-builder extraResources); dev reads from the repo's
 * packages/desktop/resources directory. Lazy `require('electron')` keeps this
 * module importable from Vitest (node) where electron is unavailable.
 */
const resolveBundledReference = (fileName: string): string => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require('electron') as typeof import('electron');
  if (app.isPackaged) return path.join(process.resourcesPath, 'presentation-templates', fileName);
  const candidates = [
    path.join(app.getAppPath(), 'resources', 'presentation-templates', fileName),
    path.join(app.getAppPath(), 'packages', 'desktop', 'resources', 'presentation-templates', fileName),
    path.join(process.cwd(), 'packages', 'desktop', 'resources', 'presentation-templates', fileName),
    path.join(process.cwd(), 'resources', 'presentation-templates', fileName),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
};

export const BUILTIN_TEMPLATE_PACKS: BuiltinTemplatePack[] = [
  {
    manifest: {
      id: 'editorial-field-report',
      name: 'Editorial Field Report',
      description: 'Print-influenced editorial HTML report — serif type, one red accent, prose over bullets',
      format: 'html',
      kind: 'report',
      source: 'builtin',
      themeFile: 'THEME.md',
      referenceFile: null,
      preview: 'preview.svg',
      version: 1,
      createdAt: CREATED_AT,
    },
    themeMd: editorialThemeMd,
    previewSvg: editorialPreviewSvg,
  },
  {
    manifest: {
      id: 'simple-light',
      name: 'Simple Light',
      description: 'Minimal light slide deck — one idea per slide, single blue accent',
      format: 'html',
      kind: 'deck',
      source: 'builtin',
      themeFile: 'THEME.md',
      referenceFile: null,
      preview: 'preview.svg',
      version: 1,
      createdAt: CREATED_AT,
    },
    themeMd: simpleLightThemeMd,
    previewSvg: simpleLightPreviewSvg,
  },
  {
    manifest: {
      id: 'simple-dark',
      name: 'Simple Dark',
      description: 'Minimal dark slide deck for technical content — code-friendly, green accent',
      format: 'html',
      kind: 'deck',
      source: 'builtin',
      themeFile: 'THEME.md',
      referenceFile: null,
      preview: 'preview.svg',
      version: 1,
      createdAt: CREATED_AT,
    },
    themeMd: simpleDarkThemeMd,
    previewSvg: simpleDarkPreviewSvg,
  },
  {
    manifest: {
      id: 'market-trends-report',
      name: 'Market Trends Report',
      description: 'Data-forward scrolling report built around Chart.js exhibits',
      format: 'html',
      kind: 'report',
      source: 'builtin',
      themeFile: 'THEME.md',
      referenceFile: null,
      preview: 'preview.svg',
      version: 1,
      createdAt: CREATED_AT,
    },
    themeMd: marketTrendsThemeMd,
    previewSvg: marketTrendsPreviewSvg,
  },
  {
    manifest: {
      id: 'business-review',
      name: 'Business Review',
      description: 'Navy-and-amber quarterly business review deck (PPTX, cloned from a retained reference)',
      format: 'pptx',
      kind: 'deck',
      source: 'builtin',
      themeFile: 'THEME.md',
      referenceFile: 'reference.pptx',
      preview: 'preview.svg',
      version: 3,
      createdAt: CREATED_AT,
    },
    themeMd: businessReviewThemeMd,
    previewSvg: businessReviewPreviewSvg,
    referenceSourcePath: () => resolveBundledReference('business-review.pptx'),
  },
  {
    manifest: {
      id: 'project-kickoff',
      name: 'Project Kickoff',
      description: 'Clean teal project kickoff deck (PPTX, cloned from a retained reference)',
      format: 'pptx',
      kind: 'deck',
      source: 'builtin',
      themeFile: 'THEME.md',
      referenceFile: 'reference.pptx',
      preview: 'preview.svg',
      version: 3,
      createdAt: CREATED_AT,
    },
    themeMd: projectKickoffThemeMd,
    previewSvg: projectKickoffPreviewSvg,
    referenceSourcePath: () => resolveBundledReference('project-kickoff.pptx'),
  },
  {
    manifest: {
      id: 'monthly-steerco',
      name: 'Monthly SteerCo',
      description: 'Serif-and-gold executive steering committee deck (PPTX, cloned from a retained reference)',
      format: 'pptx',
      kind: 'deck',
      source: 'builtin',
      themeFile: 'THEME.md',
      referenceFile: 'reference.pptx',
      preview: 'preview.svg',
      version: 3,
      createdAt: CREATED_AT,
    },
    themeMd: monthlySteercoThemeMd,
    previewSvg: monthlySteercoPreviewSvg,
    referenceSourcePath: () => resolveBundledReference('monthly-steerco.pptx'),
  },
  {
    manifest: {
      id: 'connected-ops',
      name: 'Connected Ops',
      description: 'Green-and-hex industrial operations review deck (PPTX, cloned from a retained reference)',
      format: 'pptx',
      kind: 'deck',
      source: 'builtin',
      themeFile: 'THEME.md',
      referenceFile: 'reference.pptx',
      preview: 'preview.svg',
      version: 3,
      createdAt: CREATED_AT,
    },
    themeMd: connectedOpsThemeMd,
    previewSvg: connectedOpsPreviewSvg,
    referenceSourcePath: () => resolveBundledReference('connected-ops.pptx'),
  },
  {
    manifest: {
      id: 'business-report',
      name: 'Business Report',
      description: 'Long-form formal report — cover, contents, data tables, navy serif headings',
      format: 'docx',
      kind: 'document',
      source: 'builtin',
      themeFile: 'THEME.md',
      referenceFile: 'reference.docx',
      preview: 'preview.svg',
      version: 3,
      createdAt: DOCX_CREATED_AT,
    },
    themeMd: businessReportThemeMd,
    previewSvg: businessReportPreviewSvg,
    referenceSourcePath: () => resolveBundledReference('business-report.docx'),
  },
  {
    manifest: {
      id: 'decision-memo',
      name: 'Decision Memo',
      description: 'Short decision memo — TO/FROM/RE block, recommendation up front, no cover',
      format: 'docx',
      kind: 'document',
      source: 'builtin',
      themeFile: 'THEME.md',
      referenceFile: 'reference.docx',
      preview: 'preview.svg',
      version: 2,
      createdAt: DOCX_CREATED_AT,
    },
    themeMd: decisionMemoThemeMd,
    previewSvg: decisionMemoPreviewSvg,
    referenceSourcePath: () => resolveBundledReference('decision-memo.docx'),
  },
  {
    manifest: {
      id: 'operations-guide',
      name: 'Operations Guide',
      description: 'Compact SOP — numbered steps, note boxes, checklists, teal accent',
      format: 'docx',
      kind: 'document',
      source: 'builtin',
      themeFile: 'THEME.md',
      referenceFile: 'reference.docx',
      preview: 'preview.svg',
      version: 2,
      createdAt: DOCX_CREATED_AT,
    },
    themeMd: operationsGuideThemeMd,
    previewSvg: operationsGuidePreviewSvg,
    referenceSourcePath: () => resolveBundledReference('operations-guide.docx'),
  },
  {
    manifest: {
      id: 'proposal-sow',
      name: 'Proposal / SOW',
      description: 'Client proposal — scope, timeline, pricing table, signature block',
      format: 'docx',
      kind: 'document',
      source: 'builtin',
      themeFile: 'THEME.md',
      referenceFile: 'reference.docx',
      preview: 'preview.svg',
      version: 2,
      createdAt: DOCX_CREATED_AT,
    },
    themeMd: proposalSowThemeMd,
    previewSvg: proposalSowPreviewSvg,
    referenceSourcePath: () => resolveBundledReference('proposal-sow.docx'),
  },
];
