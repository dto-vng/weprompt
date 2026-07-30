/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BuiltinDashboardPack } from '@process/resources/dashboard-templates/index';
import { DashboardStoreService } from './DashboardStoreService';

const BUILTIN: BuiltinDashboardPack = {
  manifest: {
    id: 'vng-headcount',
    name: 'VNG People Analytics',
    description: 'builtin',
    source: 'builtin',
    templateFile: 'template.html',
    specFile: 'SPEC.md',
    preview: 'preview.svg',
    dataSource: 'x.y.z',
    version: 1,
    createdAt: '2026-07-27T00:00:00Z',
  },
  templateHtml: '<!doctype html><title>Built-in</title><body>builtin</body>',
  specMd: '# spec',
  previewSvg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
};

describe('DashboardStoreService', () => {
  let rootDir: string;
  let svc: DashboardStoreService;

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), 'aionui-dash-'));
    svc = new DashboardStoreService({ rootDir, builtinPacks: [BUILTIN] });
  });
  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it('syncs the builtin pack and lists it', async () => {
    const list = await svc.list();
    expect(list.map((d) => d.manifest.id)).toContain('vng-headcount');
    expect(list[0].manifest.source).toBe('builtin');
    expect(list[0].previewDataUrl.startsWith('data:image/svg+xml')).toBe(true);
    expect(await svc.read('vng-headcount')).toContain('builtin');
  });

  it('publishes HTML as a user dashboard and reads it back', async () => {
    const summary = await svc.publish({
      name: 'Q3 Headcount!!',
      html: '<!doctype html><title>Q3</title><body>hi</body>',
    });
    expect(summary.manifest.source).toBe('user');
    expect(summary.manifest.id).toBe('q3-headcount');
    const list = await svc.list();
    expect(list.map((d) => d.manifest.id).sort()).toEqual(['q3-headcount', 'vng-headcount']);
    expect(await svc.read('q3-headcount')).toContain('hi');
  });

  it('de-duplicates ids and rejects empty content', async () => {
    const a = await svc.publish({ name: 'Dupe', html: '<html>a</html>' });
    const b = await svc.publish({ name: 'Dupe', html: '<html>b</html>' });
    expect(a.manifest.id).toBe('dupe');
    expect(b.manifest.id).toBe('dupe-2');
    await expect(svc.publish({ name: 'x', html: '   ' })).rejects.toThrow();
  });

  it('removes user dashboards but protects builtins', async () => {
    await svc.publish({ name: 'Temp', html: '<html>t</html>' });
    expect(await svc.remove('temp')).toBe(true);
    expect((await svc.list()).map((d) => d.manifest.id)).not.toContain('temp');
    await expect(svc.remove('vng-headcount')).rejects.toThrow();
  });
});
