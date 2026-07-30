/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { BUILTIN_DASHBOARD_PACKS } from './index';

/** DASH_DATA slots (attrition + cohort). Demographic series are computed live from FACTS. */
const SLOTS = ['attrKpis', 'reasonGroups', 'attrByBu', 'monthlyFlow', 'waterfall', 'cohort', 'bubble', 'sankey'];

describe('BUILTIN_DASHBOARD_PACKS', () => {
  it('contains the vng-headcount pack with unique builtin ids', () => {
    const ids = BUILTIN_DASHBOARD_PACKS.map((p) => p.manifest.id);
    expect(ids).toContain('vng-headcount');
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of BUILTIN_DASHBOARD_PACKS) expect(p.manifest.source).toBe('builtin');
  });

  it('every pack has a complete manifest and non-empty assets', () => {
    for (const p of BUILTIN_DASHBOARD_PACKS) {
      const m = p.manifest;
      for (const field of ['id', 'name', 'description', 'templateFile', 'specFile', 'preview', 'dataSource'] as const) {
        expect(m[field], `${m.id}.${field}`).toBeTruthy();
      }
      expect(m.version).toBeGreaterThanOrEqual(1);
      expect(p.templateHtml.length).toBeGreaterThan(1000);
      expect(p.specMd.length).toBeGreaterThan(500);
      expect(p.previewSvg.trim().startsWith('<svg')).toBe(true);
    }
  });

  it('embeds a FACTS cross-tab and wires client-side slicers', () => {
    const html = BUILTIN_DASHBOARD_PACKS[0].templateHtml;
    // FACTS injected (not the null placeholder)
    expect(html).toMatch(/window\.FACTS = \{"snaps":\[/);
    expect(html).not.toContain('/*__FACTS__*/');
    // slicer machinery present
    for (const fn of ['computeCUR', 'populateFilters', 'onFilter', 'sliceAt']) {
      expect(html, `missing ${fn}`).toContain(fn);
    }
    // all four slicers wired to onFilter
    expect((html.match(/onchange="onFilter\(\)"/g) || []).length).toBeGreaterThanOrEqual(4);
    // FACTS parses and has the expected shape
    const m = html.match(/window\.FACTS = (\{[\s\S]*?\});<\/script>/);
    expect(m).toBeTruthy();
    const facts = JSON.parse(m![1]) as {
      snaps: string[];
      market: Record<string, number[]>;
      data: Record<string, unknown>;
    };
    expect(facts.snaps.length).toBeGreaterThan(6);
    expect(Object.keys(facts.data)).toEqual(expect.arrayContaining(facts.snaps));
    expect(Object.keys(facts.market)).toEqual(expect.arrayContaining(facts.snaps));
  });

  it('template.html is a self-contained hybrid-chart dashboard', () => {
    const html = BUILTIN_DASHBOARD_PACKS[0].templateHtml;
    expect(html).toContain('window.DASH_DATA');
    // three tabs
    expect(html).toContain('id="tab-demo"');
    expect(html).toContain('id="tab-attr"');
    expect(html).toContain('id="tab-cohort"');
    // hybrid engines both present
    expect(html).toMatch(/Chart\.js/i);
    expect(html).toMatch(/echarts/i);
    // light default with a dark override path
    expect(html).toContain('data-theme="light"');
    expect(html).toContain('[data-theme="dark"]');
  });

  it('DASH_DATA slots are consistent between template and spec', () => {
    const { templateHtml, specMd } = BUILTIN_DASHBOARD_PACKS[0];
    for (const slot of SLOTS) {
      expect(templateHtml, `template missing slot ${slot}`).toContain(`SLOT:${slot}`);
      expect(templateHtml, `template missing key ${slot}`).toMatch(new RegExp(`\\b${slot}\\s*:`));
      expect(specMd, `spec missing slot ${slot}`).toContain(`SLOT:${slot}`);
    }
  });

  it('spec queries only the manifest data source', () => {
    const { manifest, specMd } = BUILTIN_DASHBOARD_PACKS[0];
    expect(specMd).toContain(manifest.dataSource);
    // no cross-schema leakage into permission-denied schemas
    expect(specMd).not.toMatch(/\.hruser\.v_hr_headcount|\.hrmgr\.v_hr_headcount/);
  });

  it('carries no unfilled authoring placeholders', () => {
    for (const p of BUILTIN_DASHBOARD_PACKS) {
      for (const asset of [p.templateHtml, p.specMd]) {
        expect(asset).not.toMatch(/TODO|TBD|FIXME|\{\{|XXX_/);
      }
    }
  });
});
