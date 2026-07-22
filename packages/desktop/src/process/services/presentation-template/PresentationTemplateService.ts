/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  PresentationTemplateManifest,
  PresentationTemplateSummary,
} from '@/common/types/office/presentationTemplate';
import type { BuiltinTemplatePack } from '@process/resources/presentation-templates/index';
import { TEMPLATE_ID_RE, validateTemplateManifest } from './templateManifest';
import { parseThemeTokens, renderThemeThumbnailSvg, svgToDataUrl } from './themeThumbnail';

const MANIFEST_FILE = 'template.json';

const slugify = (name: string): string =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'template';

/**
 * Owns the on-disk template pack directory (one folder per template).
 * All methods are async and safe to call repeatedly; builtin sync is
 * versioned so user edits to builtin files survive same-version restarts.
 */
export class PresentationTemplateService {
  private readonly rootDir: string;
  private readonly builtinPacks: BuiltinTemplatePack[];
  private initialized: Promise<void> | null = null;

  constructor(options: { rootDir: string; builtinPacks: BuiltinTemplatePack[] }) {
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
      const dir = path.join(this.rootDir, pack.manifest.id);
      const installed = await this.readManifest(dir);
      if (installed && installed.version >= pack.manifest.version) continue;
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, pack.manifest.themeFile), pack.themeMd, 'utf-8');
      await writeFile(path.join(dir, pack.manifest.preview), pack.previewSvg, 'utf-8');
      if (pack.manifest.referenceFile && pack.referenceSourcePath) {
        await copyFile(pack.referenceSourcePath(), path.join(dir, pack.manifest.referenceFile));
      }
      await writeFile(path.join(dir, MANIFEST_FILE), JSON.stringify(pack.manifest, null, 2), 'utf-8');
    }
  }

  private async readManifest(dir: string): Promise<PresentationTemplateManifest | null> {
    try {
      const raw = await readFile(path.join(dir, MANIFEST_FILE), 'utf-8');
      return validateTemplateManifest(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  private async toSummary(manifest: PresentationTemplateManifest): Promise<PresentationTemplateSummary> {
    const dir = path.join(this.rootDir, manifest.id);
    const previewPath = path.join(dir, manifest.preview);
    let previewDataUrl: string;
    if (manifest.preview.endsWith('.png')) {
      previewDataUrl = `data:image/png;base64,${(await readFile(previewPath)).toString('base64')}`;
    } else {
      previewDataUrl = svgToDataUrl(await readFile(previewPath, 'utf-8'));
    }
    return {
      manifest,
      themePath: path.join(dir, manifest.themeFile),
      referencePath: manifest.referenceFile ? path.join(dir, manifest.referenceFile) : null,
      previewDataUrl,
    };
  }

  async list(): Promise<PresentationTemplateSummary[]> {
    await this.ensureInitialized();
    const entries = await readdir(this.rootDir, { withFileTypes: true });
    const summaries: PresentationTemplateSummary[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifest = await this.readManifest(path.join(this.rootDir, entry.name));
      if (!manifest || manifest.id !== entry.name) continue;
      try {
        summaries.push(await this.toSummary(manifest));
      } catch {
        // corrupt pack (missing preview/theme) — skip rather than break the gallery
      }
    }
    return summaries.toSorted((a, b) => {
      if (a.manifest.source !== b.manifest.source) return a.manifest.source === 'builtin' ? -1 : 1;
      return a.manifest.name.localeCompare(b.manifest.name);
    });
  }

  private async uniqueId(base: string): Promise<string> {
    const existing = new Set((await readdir(this.rootDir, { withFileTypes: true })).map((e) => e.name));
    if (!existing.has(base)) return base;
    for (let n = 2; ; n += 1) {
      const candidate = `${base}-${n}`;
      if (!existing.has(candidate)) return candidate;
    }
  }

  async importThemeSpec(filePath: string): Promise<PresentationTemplateSummary> {
    await this.ensureInitialized();
    if (!filePath.toLowerCase().endsWith('.md')) throw new Error('unsupported file type');
    const themeMd = await readFile(filePath, 'utf-8');
    const nameMatch = themeMd.match(/^#\s+(.+)$/m);
    const name = (nameMatch ? nameMatch[1] : path.basename(filePath, '.md'))
      .replace(/\s*[—-]\s*Theme Spec.*$/i, '')
      .trim();
    const id = await this.uniqueId(slugify(name));
    if (!TEMPLATE_ID_RE.test(id)) throw new Error(`invalid manifest: bad id: ${id}`);

    const tokens = parseThemeTokens(themeMd);
    const manifest: PresentationTemplateManifest = {
      id,
      name,
      description: tokens.fonts.length > 0 ? `Custom theme · ${tokens.fonts.join(', ')}` : 'Custom imported theme',
      format: 'html',
      kind: 'report',
      source: 'user',
      themeFile: 'THEME.md',
      referenceFile: null,
      preview: 'preview.svg',
      version: 1,
      createdAt: new Date().toISOString(),
    };
    const dir = path.join(this.rootDir, id);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'THEME.md'), themeMd, 'utf-8');
    await writeFile(
      path.join(dir, 'preview.svg'),
      renderThemeThumbnailSvg({ name, format: 'html', colors: tokens.colors, fonts: tokens.fonts }),
      'utf-8'
    );
    await writeFile(path.join(dir, MANIFEST_FILE), JSON.stringify(manifest, null, 2), 'utf-8');
    return this.toSummary(manifest);
  }

  async remove(id: string): Promise<boolean> {
    await this.ensureInitialized();
    if (!TEMPLATE_ID_RE.test(id)) return false;
    const dir = path.join(this.rootDir, id);
    const manifest = await this.readManifest(dir);
    if (!manifest) return false;
    if (manifest.source === 'builtin') throw new Error('builtin template cannot be removed');
    await rm(dir, { recursive: true, force: true });
    return true;
  }
}
