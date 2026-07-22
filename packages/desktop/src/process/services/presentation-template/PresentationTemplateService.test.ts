/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BuiltinTemplatePack } from '@process/resources/presentation-templates/index';
import { PresentationTemplateService } from './PresentationTemplateService';

const pack = (id: string, version = 1): BuiltinTemplatePack => ({
  manifest: {
    id,
    name: `Pack ${id}`,
    description: 'test pack',
    format: 'html',
    kind: 'deck',
    source: 'builtin',
    themeFile: 'THEME.md',
    referenceFile: null,
    preview: 'preview.svg',
    version,
    createdAt: '2026-07-22T00:00:00Z',
  },
  themeMd: `# Pack ${id} — Theme Specification v${version}\n#123456`,
  previewSvg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
});

describe('PresentationTemplateService', () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), 'ptpl-'));
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it('syncs builtin packs on init and lists them', async () => {
    const service = new PresentationTemplateService({ rootDir, builtinPacks: [pack('alpha'), pack('beta')] });
    await service.ensureInitialized();
    const list = await service.list();
    expect(list.map((s) => s.manifest.id)).toEqual(['alpha', 'beta']);
    expect(list[0].themePath).toBe(path.join(rootDir, 'alpha', 'THEME.md'));
    expect(list[0].previewDataUrl.startsWith('data:image/svg+xml;base64,')).toBe(true);
  });

  it('re-syncs a builtin only when the bundled version is newer', async () => {
    const v1 = new PresentationTemplateService({ rootDir, builtinPacks: [pack('alpha', 1)] });
    await v1.ensureInitialized();
    const themePath = path.join(rootDir, 'alpha', 'THEME.md');
    await writeFile(themePath, 'user-touched', 'utf-8');

    // same version → untouched
    const v1again = new PresentationTemplateService({ rootDir, builtinPacks: [pack('alpha', 1)] });
    await v1again.ensureInitialized();
    expect(await readFile(themePath, 'utf-8')).toBe('user-touched');

    // newer version → overwritten
    const v2 = new PresentationTemplateService({ rootDir, builtinPacks: [pack('alpha', 2)] });
    await v2.ensureInitialized();
    expect(await readFile(themePath, 'utf-8')).toContain('v2');
  });

  it('imports a .md theme spec as a user template with generated thumbnail', async () => {
    const service = new PresentationTemplateService({ rootDir, builtinPacks: [] });
    await service.ensureInitialized();
    const specPath = path.join(rootDir, 'My Fancy Theme.md');
    await writeFile(specPath, '# My Fancy Theme\n\n--accent: #c8341e\nfamily=Fraunces&display=swap', 'utf-8');

    const summary = await service.importThemeSpec(specPath);
    expect(summary.manifest.id).toBe('my-fancy-theme');
    expect(summary.manifest.source).toBe('user');
    expect(summary.manifest.format).toBe('html');
    expect(summary.previewDataUrl).toContain('base64');
    expect((await service.list()).map((s) => s.manifest.id)).toContain('my-fancy-theme');
  });

  it('dedupes imported ids with a numeric suffix', async () => {
    const service = new PresentationTemplateService({ rootDir, builtinPacks: [] });
    await service.ensureInitialized();
    const specPath = path.join(rootDir, 'spec.md');
    await writeFile(specPath, '# Same Name\ncontent', 'utf-8');
    const first = await service.importThemeSpec(specPath);
    const second = await service.importThemeSpec(specPath);
    expect(first.manifest.id).toBe('same-name');
    expect(second.manifest.id).toBe('same-name-2');
  });

  it('rejects non-md files', async () => {
    const service = new PresentationTemplateService({ rootDir, builtinPacks: [] });
    await service.ensureInitialized();
    await expect(service.importThemeSpec('/tmp/deck.pptx')).rejects.toThrow('unsupported file type');
  });

  it('removes user templates but refuses builtins', async () => {
    const service = new PresentationTemplateService({ rootDir, builtinPacks: [pack('alpha')] });
    await service.ensureInitialized();
    const specPath = path.join(rootDir, 'spec.md');
    await writeFile(specPath, '# Removable\ncontent', 'utf-8');
    await service.importThemeSpec(specPath);

    await expect(service.remove('alpha')).rejects.toThrow('builtin template cannot be removed');
    expect(await service.remove('removable')).toBe(true);
    expect(await service.remove('removable')).toBe(false);
    expect((await service.list()).map((s) => s.manifest.id)).toEqual(['alpha']);
  });

  it('skips corrupt packs in list()', async () => {
    const service = new PresentationTemplateService({ rootDir, builtinPacks: [pack('alpha')] });
    await service.ensureInitialized();
    const badDir = path.join(rootDir, 'corrupt');
    await writeFile(path.join(rootDir, 'stray-file.txt'), 'not a dir entry', 'utf-8').catch(() => {});
    const { mkdir } = await import('node:fs/promises');
    await mkdir(badDir, { recursive: true });
    await writeFile(path.join(badDir, 'template.json'), '{ not json', 'utf-8');
    const list = await service.list();
    expect(list.map((s) => s.manifest.id)).toEqual(['alpha']);
  });
});
