/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DashboardTemplateManifest, DashboardTemplateSummary } from '@/common/types/office/dashboardTemplate';
import type { BuiltinDashboardPack } from '@process/resources/dashboard-templates/index';

const MANIFEST_FILE = 'dashboard.json';
const TEMPLATE_FILE = 'template.html';
export const DASHBOARD_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

const slugify = (name: string): string =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'dashboard';

const svgToDataUrl = (svg: string): string => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

/** Simple branded thumbnail for a published (user) dashboard — no HTML snapshot needed. */
const placeholderPreview = (name: string): string => {
  const label = (name || 'Dashboard').slice(0, 22).replace(/[<>&]/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200"><rect width="320" height="200" fill="#eef2f7"/><rect x="0" y="0" width="320" height="24" fill="#fff"/><circle cx="12" cy="12" r="3" fill="#F26F21"/><circle cx="20" cy="12" r="3" fill="#2F7FF0"/><circle cx="28" cy="12" r="3" fill="#16A34A"/><g fill="#2F7FF0"><rect x="16" y="52" width="150" height="12" rx="3"/><rect x="16" y="74" width="120" height="12" rx="3"/><rect x="16" y="96" width="86" height="12" rx="3"/></g><rect x="184" y="52" width="120" height="92" rx="7" fill="#fff" stroke="#e4e9f1"/><polyline points="192,120 208,110 224,116 240,98 256,104 288,92" fill="none" stroke="#16A34A" stroke-width="2"/><text x="16" y="176" font-family="Inter,system-ui,sans-serif" font-size="15" font-weight="700" fill="#0f172a">${label}</text></svg>`;
};

/**
 * Owns the on-disk dashboards directory (one folder per dashboard). Builtin
 * packs are synced in (versioned); user dashboards are published from HTML.
 * Mirrors PresentationTemplateService.
 */
export class DashboardStoreService {
  private readonly rootDir: string;
  private readonly builtinPacks: BuiltinDashboardPack[];
  private initialized: Promise<void> | null = null;

  constructor(options: { rootDir: string; builtinPacks: BuiltinDashboardPack[] }) {
    this.rootDir = options.rootDir;
    this.builtinPacks = options.builtinPacks;
  }

  ensureInitialized(): Promise<void> {
    this.initialized ??= this.syncBuiltins();
    return this.initialized;
  }

  private async syncBuiltins(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
    for (const pack of this.builtinPacks) {
      try {
        const dir = path.join(this.rootDir, pack.manifest.id);
        const installed = await this.readManifest(dir);
        if (installed && installed.version >= pack.manifest.version) continue;
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, pack.manifest.templateFile), pack.templateHtml, 'utf-8');
        await writeFile(path.join(dir, pack.manifest.specFile), pack.specMd, 'utf-8');
        await writeFile(path.join(dir, pack.manifest.preview), pack.previewSvg, 'utf-8');
        await writeFile(path.join(dir, MANIFEST_FILE), JSON.stringify(pack.manifest, null, 2), 'utf-8');
      } catch (error) {
        console.warn('[Dashboards] failed to sync builtin pack', pack.manifest.id, error);
      }
    }
  }

  private async readManifest(dir: string): Promise<DashboardTemplateManifest | null> {
    try {
      const raw = JSON.parse(await readFile(path.join(dir, MANIFEST_FILE), 'utf-8')) as DashboardTemplateManifest;
      if (!raw || !DASHBOARD_ID_RE.test(raw.id) || !raw.name) return null;
      return raw;
    } catch {
      return null;
    }
  }

  private async toSummary(manifest: DashboardTemplateManifest): Promise<DashboardTemplateSummary> {
    const dir = path.join(this.rootDir, manifest.id);
    const previewPath = path.join(dir, manifest.preview);
    const previewDataUrl = manifest.preview.endsWith('.png')
      ? `data:image/png;base64,${(await readFile(previewPath)).toString('base64')}`
      : svgToDataUrl(await readFile(previewPath, 'utf-8'));
    return {
      manifest,
      templatePath: path.join(dir, manifest.templateFile),
      specPath: path.join(dir, manifest.specFile),
      previewDataUrl,
    };
  }

  async list(): Promise<DashboardTemplateSummary[]> {
    await this.ensureInitialized();
    const entries = await readdir(this.rootDir, { withFileTypes: true });
    const summaries: DashboardTemplateSummary[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifest = await this.readManifest(path.join(this.rootDir, entry.name));
      if (!manifest || manifest.id !== entry.name) continue;
      try {
        summaries.push(await this.toSummary(manifest));
      } catch {
        // corrupt pack (missing preview) — skip rather than break the gallery
      }
    }
    return summaries.toSorted((a, b) => {
      if (a.manifest.source !== b.manifest.source) return a.manifest.source === 'builtin' ? -1 : 1;
      return a.manifest.name.localeCompare(b.manifest.name);
    });
  }

  /** The rendered HTML of a stored dashboard (what the gallery loads into the webview). */
  async read(id: string): Promise<string> {
    await this.ensureInitialized();
    if (!DASHBOARD_ID_RE.test(id)) throw new Error('invalid dashboard id');
    const manifest = await this.readManifest(path.join(this.rootDir, id));
    if (!manifest) throw new Error('dashboard not found');
    return readFile(path.join(this.rootDir, id, manifest.templateFile), 'utf-8');
  }

  private async uniqueId(base: string): Promise<string> {
    const existing = new Set((await readdir(this.rootDir, { withFileTypes: true })).map((e) => e.name));
    if (!existing.has(base)) return base;
    for (let n = 2; ; n += 1) {
      const candidate = `${base}-${n}`;
      if (!existing.has(candidate)) return candidate;
    }
  }

  /** Publish arbitrary HTML (e.g. from Preview) as a new user dashboard. */
  async publish(input: { name: string; html: string }): Promise<DashboardTemplateSummary> {
    await this.ensureInitialized();
    const html = String(input.html ?? '');
    if (!html.trim()) throw new Error('empty dashboard content');
    const name = (input.name || 'Dashboard').trim().slice(0, 80);
    const id = await this.uniqueId(slugify(name));
    const manifest: DashboardTemplateManifest = {
      id,
      name,
      description: 'Published from Preview',
      source: 'user',
      templateFile: TEMPLATE_FILE,
      specFile: '',
      preview: 'preview.svg',
      dataSource: '',
      version: 1,
      createdAt: new Date().toISOString(),
    };
    const dir = path.join(this.rootDir, id);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, TEMPLATE_FILE), html, 'utf-8');
    await writeFile(path.join(dir, 'preview.svg'), placeholderPreview(name), 'utf-8');
    await writeFile(path.join(dir, MANIFEST_FILE), JSON.stringify(manifest, null, 2), 'utf-8');
    return this.toSummary(manifest);
  }

  async remove(id: string): Promise<boolean> {
    await this.ensureInitialized();
    if (!DASHBOARD_ID_RE.test(id)) return false;
    const manifest = await this.readManifest(path.join(this.rootDir, id));
    if (!manifest) return false;
    if (manifest.source === 'builtin') throw new Error('builtin dashboard cannot be removed');
    await rm(path.join(this.rootDir, id), { recursive: true, force: true });
    return true;
  }
}
