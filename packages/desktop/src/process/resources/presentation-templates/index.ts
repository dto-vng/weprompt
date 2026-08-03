/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import type { PresentationTemplateManifest } from '@/common/types/office/presentationTemplate';
import packagedTemplateInventory from '../../../../resources/presentation-templates/manifest.json';
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

type BuiltinTemplateInventoryEntry = {
  id: string;
  format: PresentationTemplateManifest['format'];
  packagedReferenceFile: string | null;
};

export const BUILTIN_TEMPLATE_INVENTORY = packagedTemplateInventory as BuiltinTemplateInventoryEntry[];

const inventoryById = new Map(BUILTIN_TEMPLATE_INVENTORY.map((entry) => [entry.id, entry]));

const requireInventoryEntry = (id: string): BuiltinTemplateInventoryEntry => {
  const entry = inventoryById.get(id);
  if (!entry) throw new Error(`Missing builtin presentation template inventory entry: ${id}`);
  return entry;
};

const requirePackagedReference = (entry: BuiltinTemplateInventoryEntry): string => {
  if (entry.packagedReferenceFile === null) {
    throw new Error(`Builtin presentation template has no packaged reference: ${entry.id}`);
  }
  return entry.packagedReferenceFile;
};

const editorialFieldReportInventory = requireInventoryEntry('editorial-field-report');
const simpleLightInventory = requireInventoryEntry('simple-light');
const simpleDarkInventory = requireInventoryEntry('simple-dark');
const marketTrendsReportInventory = requireInventoryEntry('market-trends-report');
const businessReviewInventory = requireInventoryEntry('business-review');
const projectKickoffInventory = requireInventoryEntry('project-kickoff');
const monthlySteercoInventory = requireInventoryEntry('monthly-steerco');
const connectedOpsInventory = requireInventoryEntry('connected-ops');
const businessReportInventory = requireInventoryEntry('business-report');
const decisionMemoInventory = requireInventoryEntry('decision-memo');
const operationsGuideInventory = requireInventoryEntry('operations-guide');
const proposalSowInventory = requireInventoryEntry('proposal-sow');

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
      id: editorialFieldReportInventory.id,
      name: 'Editorial Field Report',
      description: 'Long-read report — serif type, prose over bullets, one red accent.',
      format: editorialFieldReportInventory.format,
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
      id: simpleLightInventory.id,
      name: 'Simple Light',
      description: 'Minimal light deck — one idea per slide, single blue accent.',
      format: simpleLightInventory.format,
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
      id: simpleDarkInventory.id,
      name: 'Simple Dark',
      description: 'Minimal dark deck for technical talks — code-friendly, green accent.',
      format: simpleDarkInventory.format,
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
      id: marketTrendsReportInventory.id,
      name: 'Market Trends Report',
      description: 'Data-forward scrolling report — charted exhibits with sourced notes.',
      format: marketTrendsReportInventory.format,
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
      id: businessReviewInventory.id,
      name: 'Business Review',
      description: 'Quarterly results deck — KPI summary, segment detail, outlook. Navy and amber.',
      format: businessReviewInventory.format,
      kind: 'deck',
      source: 'builtin',
      themeFile: 'THEME.md',
      referenceFile: 'reference.pptx',
      preview: 'preview.svg',
      version: 4,
      createdAt: CREATED_AT,
    },
    themeMd: businessReviewThemeMd,
    previewSvg: businessReviewPreviewSvg,
    referenceSourcePath: () => resolveBundledReference(requirePackagedReference(businessReviewInventory)),
  },
  {
    manifest: {
      id: projectKickoffInventory.id,
      name: 'Project Kickoff',
      description: 'Kickoff deck — scope, team, timeline, next steps. Clean teal.',
      format: projectKickoffInventory.format,
      kind: 'deck',
      source: 'builtin',
      themeFile: 'THEME.md',
      referenceFile: 'reference.pptx',
      preview: 'preview.svg',
      version: 4,
      createdAt: CREATED_AT,
    },
    themeMd: projectKickoffThemeMd,
    previewSvg: projectKickoffPreviewSvg,
    referenceSourcePath: () => resolveBundledReference(requirePackagedReference(projectKickoffInventory)),
  },
  {
    manifest: {
      id: monthlySteercoInventory.id,
      name: 'Monthly SteerCo',
      description: 'Steering committee update — portfolio status, risks, decisions needed. Serif and gold.',
      format: monthlySteercoInventory.format,
      kind: 'deck',
      source: 'builtin',
      themeFile: 'THEME.md',
      referenceFile: 'reference.pptx',
      preview: 'preview.svg',
      version: 4,
      createdAt: CREATED_AT,
    },
    themeMd: monthlySteercoThemeMd,
    previewSvg: monthlySteercoPreviewSvg,
    referenceSourcePath: () => resolveBundledReference(requirePackagedReference(monthlySteercoInventory)),
  },
  {
    manifest: {
      id: connectedOpsInventory.id,
      name: 'Connected Ops',
      description: 'Operations review — site metrics, uptime, incidents. Industrial green.',
      format: connectedOpsInventory.format,
      kind: 'deck',
      source: 'builtin',
      themeFile: 'THEME.md',
      referenceFile: 'reference.pptx',
      preview: 'preview.svg',
      version: 4,
      createdAt: CREATED_AT,
    },
    themeMd: connectedOpsThemeMd,
    previewSvg: connectedOpsPreviewSvg,
    referenceSourcePath: () => resolveBundledReference(requirePackagedReference(connectedOpsInventory)),
  },
  {
    manifest: {
      id: businessReportInventory.id,
      name: 'Business Report',
      description: 'Long-form formal report — cover, contents, data tables, navy serif headings.',
      format: businessReportInventory.format,
      kind: 'document',
      source: 'builtin',
      themeFile: 'THEME.md',
      referenceFile: 'reference.docx',
      preview: 'preview.svg',
      version: 4,
      createdAt: DOCX_CREATED_AT,
    },
    themeMd: businessReportThemeMd,
    previewSvg: businessReportPreviewSvg,
    referenceSourcePath: () => resolveBundledReference(requirePackagedReference(businessReportInventory)),
  },
  {
    manifest: {
      id: decisionMemoInventory.id,
      name: 'Decision Memo',
      description: 'Short decision memo — TO/FROM/RE block, recommendation up front, no cover.',
      format: decisionMemoInventory.format,
      kind: 'document',
      source: 'builtin',
      themeFile: 'THEME.md',
      referenceFile: 'reference.docx',
      preview: 'preview.svg',
      version: 3,
      createdAt: DOCX_CREATED_AT,
    },
    themeMd: decisionMemoThemeMd,
    previewSvg: decisionMemoPreviewSvg,
    referenceSourcePath: () => resolveBundledReference(requirePackagedReference(decisionMemoInventory)),
  },
  {
    manifest: {
      id: operationsGuideInventory.id,
      name: 'Operations Guide',
      description: 'Compact SOP — numbered steps, note boxes, checklists, teal accent.',
      format: operationsGuideInventory.format,
      kind: 'document',
      source: 'builtin',
      themeFile: 'THEME.md',
      referenceFile: 'reference.docx',
      preview: 'preview.svg',
      version: 3,
      createdAt: DOCX_CREATED_AT,
    },
    themeMd: operationsGuideThemeMd,
    previewSvg: operationsGuidePreviewSvg,
    referenceSourcePath: () => resolveBundledReference(requirePackagedReference(operationsGuideInventory)),
  },
  {
    manifest: {
      id: proposalSowInventory.id,
      name: 'Proposal / SOW',
      description: 'Client proposal — scope, timeline, pricing table, signature block.',
      format: proposalSowInventory.format,
      kind: 'document',
      source: 'builtin',
      themeFile: 'THEME.md',
      referenceFile: 'reference.docx',
      preview: 'preview.svg',
      version: 3,
      createdAt: DOCX_CREATED_AT,
    },
    themeMd: proposalSowThemeMd,
    previewSvg: proposalSowPreviewSvg,
    referenceSourcePath: () => resolveBundledReference(requirePackagedReference(proposalSowInventory)),
  },
];
