/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PresentationTemplateManifest } from '@/common/types/office/presentationTemplate';
import editorialThemeMd from './editorial-field-report/THEME.md?raw';
import editorialPreviewSvg from './editorial-field-report/preview.svg?raw';
import simpleLightThemeMd from './simple-light/THEME.md?raw';
import simpleLightPreviewSvg from './simple-light/preview.svg?raw';
import simpleDarkThemeMd from './simple-dark/THEME.md?raw';
import simpleDarkPreviewSvg from './simple-dark/preview.svg?raw';
import marketTrendsThemeMd from './market-trends-report/THEME.md?raw';
import marketTrendsPreviewSvg from './market-trends-report/preview.svg?raw';

export type BuiltinTemplatePack = {
  manifest: PresentationTemplateManifest;
  themeMd: string;
  previewSvg: string;
  /** PPTX packs resolve their bundled reference deck lazily (needs electron `app`). */
  referenceSourcePath?: () => string;
};

const CREATED_AT = '2026-07-22T00:00:00Z';

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
];
