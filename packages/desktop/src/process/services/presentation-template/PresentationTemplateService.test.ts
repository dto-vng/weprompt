/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from 'node:crypto';
import { renameSync } from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import {
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  truncate,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRESENTATION_RUN_LIMITS } from '@/common/config/constants';
import type { PresentationTemplateManifest } from '@/common/types/office/presentationTemplate';
import {
  BUILTIN_TEMPLATE_INVENTORY,
  BUILTIN_TEMPLATE_PACKS,
  type BuiltinTemplatePack,
} from '@process/resources/presentation-templates/index';
import { PresentationRunFiles } from './run';
import { PresentationTemplateService } from './PresentationTemplateService';

vi.mock('node:fs/promises', { spy: true });

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

const sha256 = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');

async function createPptxPack(
  rootDir: string,
  id = 'business-review'
): Promise<{
  manifest: PresentationTemplateManifest;
  directory: string;
  themePath: string;
  referencePath: string;
  themeBytes: Buffer;
  referenceBytes: Buffer;
}> {
  const directory = path.join(rootDir, id);
  const themePath = path.join(directory, 'THEME.md');
  const referencePath = path.join(directory, 'reference.pptx');
  const themeBytes = Buffer.from('# Business Review\nUse a restrained executive style.\n', 'utf-8');
  const referenceBytes = Buffer.from('PK\u0003\u0004bounded-test-reference', 'binary');
  const manifest: PresentationTemplateManifest = {
    id,
    name: 'Business Review',
    description: 'A bounded PPTX template fixture',
    format: 'pptx',
    kind: 'deck',
    source: 'builtin',
    themeFile: 'THEME.md',
    referenceFile: 'reference.pptx',
    preview: 'preview.svg',
    version: 1,
    createdAt: '2026-07-22T00:00:00Z',
  };
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(path.join(directory, 'template.json'), JSON.stringify(manifest), 'utf-8'),
    writeFile(themePath, themeBytes),
    writeFile(referencePath, referenceBytes),
  ]);
  return { manifest, directory, themePath, referencePath, themeBytes, referenceBytes };
}

describe('PresentationTemplateService', () => {
  let rootDir: string;
  let workspaceDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), 'ptpl-'));
    workspaceDir = await mkdtemp(path.join(tmpdir(), 'ptpl-workspace-'));
  });

  afterEach(async () => {
    await Promise.all([
      rm(rootDir, { recursive: true, force: true }),
      rm(workspaceDir, { recursive: true, force: true }),
    ]);
  });

  const createBoundService = (): PresentationTemplateService =>
    new PresentationTemplateService({
      rootDir,
      builtinPacks: [],
      workspaceSourceAuthorizer: new PresentationRunFiles({
        userDataDir: path.join(rootDir, 'run-data'),
        tempDir: path.join(rootDir, 'run-temp'),
      }),
    });

  it('syncs builtin packs on init and lists them', async () => {
    const service = new PresentationTemplateService({ rootDir, builtinPacks: [pack('alpha'), pack('beta')] });
    await service.ensureInitialized();
    const list = await service.list();
    expect(list.map((s) => s.manifest.id)).toEqual(['alpha', 'beta']);
    expect(list[0].themePath).toBe(path.join(rootDir, 'alpha', 'THEME.md'));
    expect(list[0].previewDataUrl.startsWith('data:image/svg+xml;base64,')).toBe(true);
  });

  it('installs every packaged-inventory builtin into the gallery', async () => {
    const packagedResourcesDir = path.resolve(__dirname, '../../../../resources/presentation-templates');
    const inventoryById = new Map(BUILTIN_TEMPLATE_INVENTORY.map((entry) => [entry.id, entry]));
    const packagedPacks = BUILTIN_TEMPLATE_PACKS.map((builtin): BuiltinTemplatePack => {
      const packagedReferenceFile = inventoryById.get(builtin.manifest.id)?.packagedReferenceFile;
      return {
        manifest: builtin.manifest,
        themeMd: builtin.themeMd,
        previewSvg: builtin.previewSvg,
        referenceSourcePath:
          packagedReferenceFile === null || packagedReferenceFile === undefined
            ? undefined
            : () => path.join(packagedResourcesDir, packagedReferenceFile),
      };
    });
    const service = new PresentationTemplateService({ rootDir, builtinPacks: packagedPacks });

    const installedIds = (await service.list()).map((summary) => summary.manifest.id).toSorted();

    expect(installedIds).toEqual(BUILTIN_TEMPLATE_INVENTORY.map((entry) => entry.id).toSorted());
  });

  it('rejects a symlinked template root before syncing a nonempty builtin pack', async () => {
    const outsideRoot = await mkdtemp(path.join(tmpdir(), 'ptpl-outside-root-'));
    const sentinelPath = path.join(outsideRoot, 'sentinel.txt');
    await writeFile(sentinelPath, 'unchanged', 'utf-8');
    await rm(rootDir, { recursive: true, force: true });
    await symlink(outsideRoot, rootDir, 'dir');
    const service = new PresentationTemplateService({ rootDir, builtinPacks: [pack('alpha')] });

    try {
      await expect(service.ensureInitialized()).rejects.toMatchObject({ code: 'TEMPLATE_UNSUPPORTED' });
      expect(await readdir(outsideRoot)).toEqual(['sentinel.txt']);
      expect(await readFile(sentinelPath, 'utf-8')).toBe('unchanged');
    } finally {
      await rm(rootDir, { force: true });
      await rm(outsideRoot, { recursive: true, force: true });
    }
  });

  it('skips a symlinked builtin pack without changing its external target', async () => {
    const outsidePack = await mkdtemp(path.join(tmpdir(), 'ptpl-outside-pack-'));
    const sentinelPath = path.join(outsidePack, 'sentinel.txt');
    await writeFile(sentinelPath, 'unchanged', 'utf-8');
    await symlink(outsidePack, path.join(rootDir, 'alpha'), 'dir');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const service = new PresentationTemplateService({ rootDir, builtinPacks: [pack('alpha'), pack('beta')] });

    try {
      await expect(service.ensureInitialized()).resolves.toBeUndefined();
      expect(await readdir(outsidePack)).toEqual(['sentinel.txt']);
      expect(await readFile(sentinelPath, 'utf-8')).toBe('unchanged');
      expect((await service.list()).map((summary) => summary.manifest.id)).toEqual(['beta']);
      expect(warnSpy).toHaveBeenCalledWith(
        '[PresentationTemplates] failed to sync builtin pack',
        'alpha',
        expect.anything()
      );
    } finally {
      warnSpy.mockRestore();
      await rm(outsidePack, { recursive: true, force: true });
    }
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

  describe('hash-bound workspace imports', () => {
    const conversationId = '2be7b8fc-6af5-42b8-aed5-03644735c730';

    it('installs the exact bytes described by the main process', async () => {
      const service = createBoundService();
      const themeBytes = Buffer.from('# Bound Theme\n\n--accent: #c8341e\nfamily=Fraunces&display=swap', 'utf-8');
      const filePath = path.join(workspaceDir, 'THEME.md');
      await writeFile(filePath, themeBytes);

      const described = await service.describeThemeSpec({ conversationId, workspaceRoot: workspaceDir, filePath });
      const installed = await service.importThemeSpecBound({
        conversationId,
        workspaceRoot: workspaceDir,
        filePath,
        expectedSha256: described.sha256,
      });

      expect(described).toMatchObject({
        name: 'Bound Theme',
        tokens: { colors: ['#c8341e'], fonts: ['Fraunces'] },
        sha256: sha256(themeBytes),
        byte_length: themeBytes.byteLength,
      });
      expect(await readFile(installed.themePath)).toEqual(themeBytes);
    });

    it('refuses content swapped after describe without creating a partial pack', async () => {
      const service = createBoundService();
      const filePath = path.join(workspaceDir, 'THEME.md');
      await writeFile(filePath, '# Original Theme\n#112233', 'utf-8');
      const described = await service.describeThemeSpec({ conversationId, workspaceRoot: workspaceDir, filePath });
      await writeFile(filePath, '# Swapped Theme\n#abcdef', 'utf-8');

      await expect(
        service.importThemeSpecBound({
          conversationId,
          workspaceRoot: workspaceDir,
          filePath,
          expectedSha256: described.sha256,
        })
      ).rejects.toMatchObject({ code: 'CANDIDATE_CHANGED' });
      expect(await service.list()).toEqual([]);
    });

    it('refuses a caller-supplied digest that the main process never minted', async () => {
      const service = createBoundService();
      const themeBytes = Buffer.from('# Unminted Theme\n#112233', 'utf-8');
      const filePath = path.join(workspaceDir, 'THEME.md');
      await writeFile(filePath, themeBytes);

      await expect(
        service.importThemeSpecBound({
          conversationId,
          workspaceRoot: workspaceDir,
          filePath,
          expectedSha256: sha256(themeBytes),
        })
      ).rejects.toMatchObject({ code: 'CONFIRMATION_NOT_MINTED' });
      expect(await service.list()).toEqual([]);
    });

    it('refuses a lexical escape from the authorized workspace', async () => {
      const service = createBoundService();
      const outsidePath = path.join(path.dirname(workspaceDir), 'outside-theme.md');
      const traversalPath = `${workspaceDir}/../${path.basename(outsidePath)}`;
      await writeFile(outsidePath, '# Outside Theme\n#112233', 'utf-8');

      try {
        await expect(
          service.describeThemeSpec({ conversationId, workspaceRoot: workspaceDir, filePath: traversalPath })
        ).rejects.toMatchObject({ code: 'CANDIDATE_OUTSIDE_WORKSPACE' });
        expect(await service.list()).toEqual([]);
      } finally {
        await rm(outsidePath, { force: true });
      }
    });

    it('refuses a symlink escape from the authorized workspace', async () => {
      const service = createBoundService();
      const outsideDir = await mkdtemp(path.join(tmpdir(), 'ptpl-outside-workspace-'));
      const outsidePath = path.join(outsideDir, 'THEME.md');
      const linkedPath = path.join(workspaceDir, 'THEME.md');
      await writeFile(outsidePath, '# Linked Outside Theme\n#112233', 'utf-8');
      await symlink(outsidePath, linkedPath);

      try {
        await expect(
          service.describeThemeSpec({ conversationId, workspaceRoot: workspaceDir, filePath: linkedPath })
        ).rejects.toMatchObject({ code: 'CANDIDATE_OUTSIDE_WORKSPACE' });
        expect(await service.list()).toEqual([]);
      } finally {
        await rm(outsideDir, { recursive: true, force: true });
      }
    });

    it('returns a typed size failure without creating partial state', async () => {
      const service = createBoundService();
      const filePath = path.join(workspaceDir, 'THEME.md');
      await writeFile(filePath, '# Oversized Theme', 'utf-8');
      await truncate(filePath, PRESENTATION_RUN_LIMITS.MAX_THEME_BYTES + 1);

      await expect(
        service.describeThemeSpec({ conversationId, workspaceRoot: workspaceDir, filePath })
      ).rejects.toMatchObject({ code: 'CANDIDATE_TOO_LARGE' });
      expect(await service.list()).toEqual([]);
    });

    it('treats repeated install confirmation as idempotent', async () => {
      const service = createBoundService();
      const filePath = path.join(workspaceDir, 'THEME.md');
      await writeFile(filePath, '# Install Once\n#112233', 'utf-8');
      const described = await service.describeThemeSpec({ conversationId, workspaceRoot: workspaceDir, filePath });
      const input = {
        conversationId,
        workspaceRoot: workspaceDir,
        filePath,
        expectedSha256: described.sha256,
      };

      const first = await service.importThemeSpecBound(input);
      const second = await service.importThemeSpecBound(input);

      expect(second.manifest.id).toBe(first.manifest.id);
      expect((await service.list()).map((template) => template.manifest.id)).toEqual(['install-once']);
      expect(await readdir(rootDir)).not.toContain('install-once-2');
    });

    it('keeps an interrupted bound install hidden from the gallery', async () => {
      const service = createBoundService();
      const filePath = path.join(workspaceDir, 'THEME.md');
      await writeFile(filePath, '# Interrupted Bound Theme\n#112233', 'utf-8');
      const described = await service.describeThemeSpec({ conversationId, workspaceRoot: workspaceDir, filePath });
      const actualFsPromises = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
      const writeSpy = vi.spyOn(fsPromises, 'writeFile').mockImplementation(async (file, data, options) => {
        if (path.basename(file.toString()) === 'preview.svg') throw new Error('injected bound install interruption');
        return actualFsPromises.writeFile(file, data, options);
      });

      try {
        await expect(
          service.importThemeSpecBound({
            conversationId,
            workspaceRoot: workspaceDir,
            filePath,
            expectedSha256: described.sha256,
          })
        ).rejects.toThrow('injected bound install interruption');
      } finally {
        writeSpy.mockRestore();
      }

      expect(await service.list()).toEqual([]);
      expect(await readdir(rootDir)).not.toContain('interrupted-bound-theme');
    });
  });

  it('uses only a gallery-hidden temporary while a failed import is incomplete', async () => {
    const service = new PresentationTemplateService({ rootDir, builtinPacks: [] });
    await service.ensureInitialized();
    const specPath = path.join(rootDir, 'crash-safe-theme.md');
    await writeFile(specPath, '# Crash Safe Theme\ncontent', 'utf-8');
    let incompleteEntries: string[] = [];
    let listedIdsDuringImport: string[] = [];
    const actualFsPromises = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    const writeSpy = vi.spyOn(fsPromises, 'writeFile').mockImplementation(async (file, data, options) => {
      if (path.basename(file.toString()) === 'preview.svg') {
        incompleteEntries = await actualFsPromises.readdir(rootDir);
        listedIdsDuringImport = (await service.list()).map((summary) => summary.manifest.id);
        throw new Error('injected preview write failure');
      }
      return actualFsPromises.writeFile(file, data, options);
    });

    try {
      await expect(service.importThemeSpec(specPath)).rejects.toThrow('injected preview write failure');
    } finally {
      writeSpy.mockRestore();
    }

    expect({
      hasFinalPath: incompleteEntries.includes('crash-safe-theme'),
      temporaryCount: incompleteEntries.filter((name) => name.startsWith('.aionui-template-install-')).length,
      listedIdsDuringImport,
    }).toEqual({ hasFinalPath: false, temporaryCount: 1, listedIdsDuringImport: [] });
    expect(await readdir(rootDir)).not.toContain('crash-safe-theme');
  });

  it('retries a failed import with the intended id', async () => {
    const service = new PresentationTemplateService({ rootDir, builtinPacks: [] });
    await service.ensureInitialized();
    const specPath = path.join(rootDir, 'retry-theme.md');
    await writeFile(specPath, '# Retry Theme\ncontent', 'utf-8');
    const actualFsPromises = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    const writeSpy = vi.spyOn(fsPromises, 'writeFile').mockImplementation(async (file, data, options) => {
      if (path.basename(file.toString()) === 'preview.svg') throw new Error('injected preview write failure');
      return actualFsPromises.writeFile(file, data, options);
    });

    await expect(service.importThemeSpec(specPath)).rejects.toThrow('injected preview write failure');
    writeSpy.mockRestore();

    const retried = await service.importThemeSpec(specPath);

    expect(retried.manifest.id).toBe('retry-theme');
  });

  it('removes at most twenty stale install temporaries during initialization', async () => {
    const staleTime = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const staleNames = Array.from(
      { length: 22 },
      (_, index) => `.aionui-template-install-stale-${index.toString().padStart(2, '0')}-ABC123`
    );
    await Promise.all(
      staleNames.map(async (name) => {
        const directory = path.join(rootDir, name);
        await mkdir(directory);
        await utimes(directory, staleTime, staleTime);
      })
    );
    const recentName = '.aionui-template-install-recent-ABC123';
    await mkdir(path.join(rootDir, recentName));
    const service = new PresentationTemplateService({ rootDir, builtinPacks: [] });

    await service.ensureInitialized();

    const remainingTemporaries = (await readdir(rootDir)).filter((name) =>
      name.startsWith('.aionui-template-install-')
    );
    expect(remainingTemporaries).toHaveLength(3);
    expect(remainingTemporaries).toContain(recentName);
  });

  it('never cleans nonmatching directories or matching regular files', async () => {
    const staleTime = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const similarDirectory = path.join(rootDir, '.aionui-template-install-not-ours');
    const matchingFile = path.join(rootDir, '.aionui-template-install-file-ABC123');
    await mkdir(similarDirectory);
    await writeFile(matchingFile, 'keep', 'utf-8');
    await Promise.all([utimes(similarDirectory, staleTime, staleTime), utimes(matchingFile, staleTime, staleTime)]);
    const service = new PresentationTemplateService({ rootDir, builtinPacks: [] });

    await service.ensureInitialized();

    expect(await readdir(rootDir)).toEqual([
      '.aionui-template-install-file-ABC123',
      '.aionui-template-install-not-ours',
    ]);
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

  it('continues syncing other packs when one builtin pack fails (e.g. missing reference file)', async () => {
    const brokenPack: BuiltinTemplatePack = {
      manifest: {
        id: 'broken-pptx',
        name: 'Broken Pptx',
        description: 'test pack with a missing reference file',
        format: 'pptx',
        kind: 'deck',
        source: 'builtin',
        themeFile: 'THEME.md',
        referenceFile: 'reference.pptx',
        preview: 'preview.svg',
        version: 1,
        createdAt: '2026-07-22T00:00:00Z',
      },
      themeMd: '# Broken Pptx — Theme Specification v1\n#123456',
      previewSvg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      referenceSourcePath: () => path.join(rootDir, 'does-not-exist.pptx'),
    };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const service = new PresentationTemplateService({ rootDir, builtinPacks: [pack('alpha'), brokenPack] });
    await expect(service.ensureInitialized()).resolves.toBeUndefined();

    const list = await service.list();
    expect(list.map((s) => s.manifest.id)).toEqual(['alpha']);
    expect(warnSpy).toHaveBeenCalledWith(
      '[PresentationTemplates] failed to sync builtin pack',
      'broken-pptx',
      expect.anything()
    );

    warnSpy.mockRestore();
  });

  it('skips corrupt packs in list()', async () => {
    const service = new PresentationTemplateService({ rootDir, builtinPacks: [pack('alpha')] });
    await service.ensureInitialized();
    const badDir = path.join(rootDir, 'corrupt');
    await writeFile(path.join(rootDir, 'stray-file.txt'), 'not a dir entry', 'utf-8').catch(() => {});
    await mkdir(badDir, { recursive: true });
    await writeFile(path.join(badDir, 'template.json'), '{ not json', 'utf-8');
    const list = await service.list();
    expect(list.map((s) => s.manifest.id)).toEqual(['alpha']);
  });

  it('resolves a PPTX template to stable bounded bytes and hashes without returning paths', async () => {
    const fixture = await createPptxPack(rootDir);
    const service = new PresentationTemplateService({ rootDir, builtinPacks: [] });

    const resolved = await service.getById(fixture.manifest.id);

    expect(resolved).toEqual({
      manifest: fixture.manifest,
      theme: {
        fileName: fixture.manifest.themeFile,
        bytes: fixture.themeBytes,
        byteLength: fixture.themeBytes.byteLength,
        sha256: sha256(fixture.themeBytes),
      },
      reference: {
        fileName: fixture.manifest.referenceFile,
        bytes: fixture.referenceBytes,
        byteLength: fixture.referenceBytes.byteLength,
        sha256: sha256(fixture.referenceBytes),
      },
    });
    expect(JSON.stringify(resolved)).not.toContain(rootDir);
  });

  it('returns null for an invalid or missing template id', async () => {
    const service = new PresentationTemplateService({ rootDir, builtinPacks: [] });

    await expect(service.getById('../escape')).resolves.toBeNull();
    await expect(service.getById('missing-template')).resolves.toBeNull();
  });

  it('rejects a present pack whose manifest is missing', async () => {
    const fixture = await createPptxPack(rootDir);
    await rm(path.join(fixture.directory, 'template.json'));
    const service = new PresentationTemplateService({ rootDir, builtinPacks: [] });

    await expect(service.getById(fixture.manifest.id)).rejects.toMatchObject({ code: 'TEMPLATE_UNSUPPORTED' });
  });

  it('rejects a symlinked template root', async () => {
    const linkedRoot = await mkdtemp(path.join(tmpdir(), 'ptpl-linked-'));
    const fixture = await createPptxPack(linkedRoot);
    await rm(rootDir, { recursive: true, force: true });
    await symlink(linkedRoot, rootDir, 'dir');
    const service = new PresentationTemplateService({ rootDir, builtinPacks: [] });

    try {
      await expect(service.getById(fixture.manifest.id)).rejects.toMatchObject({ code: 'TEMPLATE_UNSUPPORTED' });
    } finally {
      await rm(rootDir, { force: true });
      await rm(linkedRoot, { recursive: true, force: true });
    }
  });

  it('rejects an ancestor ABA swap even when the original pack path is restored', async () => {
    const fixture = await createPptxPack(rootDir);
    const replacementRoot = await mkdtemp(path.join(tmpdir(), 'ptpl-replacement-'));
    const replacement = await createPptxPack(replacementRoot, fixture.manifest.id);
    await writeFile(replacement.themePath, '# Replacement generation\n', 'utf-8');
    const heldRoot = `${rootDir}-held`;
    const probe = await open(fixture.themePath, 'r');
    const eventEmitterPrototype = Object.getPrototypeOf(Object.getPrototypeOf(probe)) as {
      emit: (eventName: string | symbol, ...args: unknown[]) => boolean;
    };
    await probe.close();
    const originalEmit = eventEmitterPrototype.emit;
    let closedFiles = 0;
    let rootIsSwapped = false;
    const emitSpy = vi.spyOn(eventEmitterPrototype, 'emit').mockImplementation(function (
      this: object,
      eventName,
      ...args
    ) {
      const emitted = originalEmit.call(this, eventName, ...args);
      if (eventName !== 'close') return emitted;
      closedFiles += 1;
      if (closedFiles === 1) {
        renameSync(rootDir, heldRoot);
        renameSync(replacementRoot, rootDir);
        rootIsSwapped = true;
      } else if (closedFiles === 2) {
        renameSync(rootDir, replacementRoot);
        renameSync(heldRoot, rootDir);
        rootIsSwapped = false;
      }
      return emitted;
    });
    const service = new PresentationTemplateService({ rootDir, builtinPacks: [] });

    try {
      await expect(service.getById(fixture.manifest.id)).rejects.toMatchObject({ code: 'TEMPLATE_UNSUPPORTED' });
    } finally {
      emitSpy.mockRestore();
      if (rootIsSwapped) {
        await rename(rootDir, replacementRoot);
        await rename(heldRoot, rootDir);
      }
      await rm(replacementRoot, { recursive: true, force: true });
      await rm(heldRoot, { recursive: true, force: true });
    }
  });

  it.each(['theme', 'reference'] as const)('rejects a symlinked %s file', async (target) => {
    const fixture = await createPptxPack(rootDir);
    const targetPath = target === 'theme' ? fixture.themePath : fixture.referencePath;
    const outsidePath = path.join(rootDir, `outside-${target}`);
    await writeFile(outsidePath, target === 'theme' ? '# Outside' : 'outside');
    await rm(targetPath);
    await symlink(outsidePath, targetPath);
    const service = new PresentationTemplateService({ rootDir, builtinPacks: [] });

    await expect(service.getById(fixture.manifest.id)).rejects.toMatchObject({ code: 'TEMPLATE_UNSUPPORTED' });
  });

  it('rejects a nonregular or missing declared reference file', async () => {
    const fixture = await createPptxPack(rootDir);
    const service = new PresentationTemplateService({ rootDir, builtinPacks: [] });
    await rm(fixture.referencePath);
    await mkdir(fixture.referencePath);

    await expect(service.getById(fixture.manifest.id)).rejects.toMatchObject({ code: 'TEMPLATE_UNSUPPORTED' });

    await rm(fixture.referencePath, { recursive: true });
    await expect(service.getById(fixture.manifest.id)).rejects.toMatchObject({ code: 'TEMPLATE_UNSUPPORTED' });
  });

  it.each([
    ['theme', PRESENTATION_RUN_LIMITS.MAX_THEME_BYTES],
    ['reference', PRESENTATION_RUN_LIMITS.MAX_REFERENCE_BYTES],
  ] as const)('rejects a %s file over its declared byte limit', async (target, limit) => {
    const fixture = await createPptxPack(rootDir);
    await truncate(target === 'theme' ? fixture.themePath : fixture.referencePath, limit + 1);
    const service = new PresentationTemplateService({ rootDir, builtinPacks: [] });

    await expect(service.getById(fixture.manifest.id)).rejects.toMatchObject({ code: 'RESOURCE_LIMIT_EXCEEDED' });
  });

  it.each([
    ['theme', PRESENTATION_RUN_LIMITS.MAX_THEME_BYTES],
    ['reference', PRESENTATION_RUN_LIMITS.MAX_REFERENCE_BYTES],
  ] as const)('accepts a %s file at its exact declared byte limit', async (target, limit) => {
    const fixture = await createPptxPack(rootDir);
    await truncate(target === 'theme' ? fixture.themePath : fixture.referencePath, limit);
    const service = new PresentationTemplateService({ rootDir, builtinPacks: [] });

    const resolved = await service.getById(fixture.manifest.id);
    const resolvedFile = target === 'theme' ? resolved?.theme : resolved?.reference;

    expect(resolvedFile?.byteLength).toBe(limit);
  });

  it.each(['theme', 'reference'] as const)('rejects an empty %s file', async (target) => {
    const fixture = await createPptxPack(rootDir);
    await truncate(target === 'theme' ? fixture.themePath : fixture.referencePath, 0);
    const service = new PresentationTemplateService({ rootDir, builtinPacks: [] });

    await expect(service.getById(fixture.manifest.id)).rejects.toMatchObject({ code: 'TEMPLATE_UNSUPPORTED' });
  });
});
