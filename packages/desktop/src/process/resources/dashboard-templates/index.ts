/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DashboardTemplateManifest } from '@/common/types/office/dashboardTemplate';
import vngHeadcountTemplateHtml from './vng-headcount/template.html?raw';
import vngHeadcountSpecMd from './vng-headcount/SPEC.md?raw';
import vngHeadcountPreviewSvg from './vng-headcount/preview.svg?raw';

/**
 * A builtin dashboard template pack: a seeded, self-contained HTML dashboard plus the spec the
 * creator agent follows to (re)populate it from live data. Mirrors the presentation-templates
 * registry — the agent reads `specMd`, queries the data source, and rewrites the template's
 * `window.DASH_DATA` block, which the Preview panel renders live.
 */
export type BuiltinDashboardPack = {
  manifest: DashboardTemplateManifest;
  /** Raw seeded HTML template (contains the DASH_DATA contract + render logic). */
  templateHtml: string;
  /** Raw build/refresh spec (metric definitions + parameterized SQL per data slot). */
  specMd: string;
  /** Raw gallery thumbnail. */
  previewSvg: string;
};

const CREATED_AT = '2026-07-27T00:00:00Z';

export const BUILTIN_DASHBOARD_PACKS: BuiltinDashboardPack[] = [
  {
    manifest: {
      id: 'vng-headcount',
      name: 'VNG People Analytics',
      description:
        'Headcount, attrition, and new-hire cohort retention for VNG — light theme, hybrid Chart.js + ECharts, driven by TSE Datahub',
      source: 'builtin',
      templateFile: 'template.html',
      specFile: 'SPEC.md',
      preview: 'preview.svg',
      dataSource: 'hr_data_headcount_dev.hrdev.v_hr_headcount',
      version: 1,
      createdAt: CREATED_AT,
    },
    templateHtml: vngHeadcountTemplateHtml,
    specMd: vngHeadcountSpecMd,
    previewSvg: vngHeadcountPreviewSvg,
  },
];
