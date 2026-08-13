/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Binary sources (.pdf/.docx/.xlsx) are unreadable by the agent's file tools —
// `Read` on a PDF returns "(binary file, N bytes)". Their extracted text is
// therefore materialized into `Knowledge Base/.text/` so whole-document
// questions work for the formats where they matter most.
//
// The load-bearing constraint is that `.text/` must never feed back into the
// index: it lives inside the watched folder, so a broken ignore rule would
// index the extraction as a second source and double every passage.

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EXTRACTED_TEXT_DIR_NAME, KNOWLEDGE_FOLDER_NAME } from '@/common/knowledge/constants';
import type { IProvider } from '@/common/config/storage';
import {
  createProjectKnowledgeService,
  type ProjectKnowledgeService,
  type ProjectKnowledgeServiceDeps,
} from '@/process/services/projectKnowledge/projectKnowledgeService';

const EMBED_PROVIDER = {
  id: 'embed',
  platform: 'openai',
  name: 'E',
  base_url: 'https://api.x.com/v1',
  api_key: 'sk-1',
  models: ['text-embedding-3-small'],
} as IProvider;

describe('extracted text materialization', () => {
  let root: string;
  let workspace: string;
  let kb: string;
  let textDir: string;
  let service: ProjectKnowledgeService;

  const makeService = (overrides: Partial<ProjectKnowledgeServiceDeps> = {}): ProjectKnowledgeService =>
    createProjectKnowledgeService({
      storeRootDir: root,
      listProviders: async () => [EMBED_PROVIDER],
      embedTextsImpl: (async (texts: string[]) => texts.map(() => [1, 0, 0])) as never,
      convertToMarkdown: async () => '# Converted\n\nthe docx body text',
      extractPdfTextImpl: async () => ({
        pages: ['the pdf body text on page one'],
        pageCount: 1,
        hasTextLayer: true,
        truncated: false,
      }),
      trashItem: async (filePath: string) => {
        rmSync(filePath, { force: true });
      },
      getServerScriptPath: () => '/x.js',
      onUpdated: () => {},
      ...overrides,
    });

  beforeEach(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'kb-text-root-'));
    workspace = mkdtempSync(path.join(tmpdir(), 'kb-text-ws-'));
    kb = path.join(workspace, KNOWLEDGE_FOLDER_NAME);
    textDir = path.join(kb, EXTRACTED_TEXT_DIR_NAME);
    await mkdir(kb, { recursive: true });
    service = makeService();
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  });

  const sync = async (projectId = 'p1'): Promise<void> => {
    await service.syncFolder(projectId, workspace);
    await service.whenIdle(projectId);
  };

  it('writes the extracted text of a PDF where file tools can reach it', async () => {
    await writeFile(path.join(kb, 'report.pdf'), 'binary-ish');
    await sync();

    const materialized = path.join(textDir, 'report.pdf.md');
    expect(existsSync(materialized)).toBe(true);
    expect(await readFile(materialized, 'utf8')).toContain('the pdf body text on page one');
  });

  it('writes the extracted text of a docx', async () => {
    await writeFile(path.join(kb, 'spec.docx'), 'binary-ish');
    await sync();

    expect(await readFile(path.join(textDir, 'spec.docx.md'), 'utf8')).toContain('the docx body text');
  });

  // The original is already the readable form; a copy would be pure duplication
  // and would show up as a second candidate when the agent globs for a name.
  it('writes nothing for markdown and text sources', async () => {
    await writeFile(path.join(kb, 'notes.md'), '# Notes\n\nplain markdown body', 'utf8');
    await writeFile(path.join(kb, 'log.txt'), 'plain text body', 'utf8');
    await sync();

    expect(existsSync(textDir)).toBe(false);
  });

  // Keeping the original extension in the name is what stops `a.pdf` and
  // `a.docx` from writing to the same `a.md`.
  it('keeps same-basename sources in separate files', async () => {
    await writeFile(path.join(kb, 'a.pdf'), 'binary-ish');
    await writeFile(path.join(kb, 'a.docx'), 'binary-ish-too');
    await sync();

    const written = (await readdir(textDir)).toSorted();
    expect(written).toEqual(['a.docx.md', 'a.pdf.md']);
    expect(await readFile(path.join(textDir, 'a.pdf.md'), 'utf8')).toContain('pdf body text');
    expect(await readFile(path.join(textDir, 'a.docx.md'), 'utf8')).toContain('docx body text');
  });

  // ---- the self-indexing guard ------------------------------------------

  it('never indexes anything inside the extracted-text folder', async () => {
    await writeFile(path.join(kb, 'report.pdf'), 'binary-ish');
    await sync();
    expect(existsSync(path.join(textDir, 'report.pdf.md'))).toBe(true);

    // A second sync sees `.text/` already populated; it must stay invisible.
    await sync();

    const { sources } = await service.listSources('p1');
    expect(sources).toHaveLength(1);
    expect(sources[0].fileName).toBe('report.pdf');
  });

  it('ignores a stray markdown file dropped directly into the extracted-text folder', async () => {
    await mkdir(textDir, { recursive: true });
    await writeFile(path.join(textDir, 'stray.md'), 'this must never become a source', 'utf8');
    await sync();

    const { sources } = await service.listSources('p1');
    expect(sources).toHaveLength(0);
  });

  // ---- staying in step with the index ------------------------------------

  it('rewrites the extracted text when the source content changes', async () => {
    let body = 'first extraction body';
    const svc = makeService({
      extractPdfTextImpl: async () => ({ pages: [body], pageCount: 1, hasTextLayer: true, truncated: false }),
    });
    await writeFile(path.join(kb, 'report.pdf'), 'v1');
    await svc.syncFolder('p2', workspace);
    await svc.whenIdle('p2');
    expect(await readFile(path.join(textDir, 'report.pdf.md'), 'utf8')).toContain('first extraction body');

    body = 'second extraction body';
    await writeFile(path.join(kb, 'report.pdf'), 'v2-different-bytes');
    await svc.syncFolder('p2', workspace);
    await svc.whenIdle('p2');

    const text = await readFile(path.join(textDir, 'report.pdf.md'), 'utf8');
    expect(text).toContain('second extraction body');
    expect(text).not.toContain('first extraction body');
  });

  it('removes the extracted text when the source file is deleted from the folder', async () => {
    await writeFile(path.join(kb, 'report.pdf'), 'binary-ish');
    await sync();
    expect(existsSync(path.join(textDir, 'report.pdf.md'))).toBe(true);

    rmSync(path.join(kb, 'report.pdf'));
    await sync();

    expect(existsSync(path.join(textDir, 'report.pdf.md'))).toBe(false);
    expect((await service.listSources('p1')).sources).toHaveLength(0);
  });

  it('removes the extracted text when the source is deleted through the card', async () => {
    await writeFile(path.join(kb, 'report.pdf'), 'binary-ish');
    await sync();
    const source = (await service.listSources('p1')).sources[0];

    await service.removeSource('p1', source.id, workspace);
    await service.whenIdle('p1');

    expect(existsSync(path.join(textDir, 'report.pdf.md'))).toBe(false);
  });

  // Decision: sync no-ops on an unchanged hash, so without an explicit repair a
  // `.text/` entry lost with the folder would never come back after a restore.
  it('repairs a missing extracted-text file even when the source hash is unchanged', async () => {
    await writeFile(path.join(kb, 'report.pdf'), 'binary-ish');
    await sync();
    const before = (await service.listSources('p1')).sources[0];

    rmSync(textDir, { recursive: true, force: true });
    expect(existsSync(path.join(textDir, 'report.pdf.md'))).toBe(false);

    await sync();

    expect(existsSync(path.join(textDir, 'report.pdf.md'))).toBe(true);
    const after = (await service.listSources('p1')).sources[0];
    expect(after.id).toBe(before.id); // repaired, not re-ingested
    expect(after.addedAt).toBe(before.addedAt);
  });

  it('survives a folder that disappears without throwing', async () => {
    await writeFile(path.join(kb, 'report.pdf'), 'binary-ish');
    await sync();

    rmSync(kb, { recursive: true, force: true });
    await expect(sync()).resolves.toBeUndefined();

    const result = await service.listSources('p1');
    expect(result.folderMissing).toBe(true);
    expect(result.sources).toHaveLength(1); // index preserved, as always
  });

  it('writes nothing for a source that failed to ingest', async () => {
    const svc = makeService({
      extractPdfTextImpl: async () => ({ pages: [], pageCount: 0, hasTextLayer: false, truncated: false }),
    });
    await writeFile(path.join(kb, 'scan.pdf'), 'binary-ish');
    await svc.syncFolder('p3', workspace);
    await svc.whenIdle('p3');

    expect((await svc.listSources('p3')).sources[0].status).toBe('failed');
    expect(existsSync(path.join(textDir, 'scan.pdf.md'))).toBe(false);
  });

  it('does not let a failed extracted-text write break ingestion', async () => {
    await writeFile(path.join(kb, 'report.pdf'), 'binary-ish');
    // A file where the directory needs to be makes the write fail.
    await writeFile(textDir, 'not a directory', 'utf8');

    await sync();

    const { sources } = await service.listSources('p1');
    expect(sources[0].status).toBe('ready');
    expect(sources[0].chunkCount).toBeGreaterThan(0);
  });
});

describe('extracted text is invisible to the folder scan', () => {
  it('skips the extracted-text directory by name', async () => {
    const { scanKnowledgeFolder } = await import('@/process/services/projectKnowledge/folderScan');
    const workspace = mkdtempSync(path.join(tmpdir(), 'kb-text-scan-'));
    const kb = path.join(workspace, KNOWLEDGE_FOLDER_NAME);
    const textDir = path.join(kb, EXTRACTED_TEXT_DIR_NAME);
    try {
      await mkdir(textDir, { recursive: true });
      await writeFile(path.join(textDir, 'report.pdf.md'), 'extraction', 'utf8');
      await writeFile(path.join(kb, 'real.md'), 'a real source', 'utf8');

      const scan = await scanKnowledgeFolder(kb);

      expect(scan.ok).toBe(true);
      if (!scan.ok) return;
      expect(scan.entries.map((e) => e.fileName)).toEqual(['real.md']);
      expect(scan.unsupported).toEqual([]);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});

// The description is the only thing that tells the model this path exists.
describe('tool description', () => {
  it('points at the extracted text for binary formats without over-promising the originals', async () => {
    const { buildToolDescription } = await import('@/process/resources/builtinMcp/knowledgeServer');
    const description = buildToolDescription([]);

    expect(description).toContain(`${KNOWLEDGE_FOLDER_NAME}/${EXTRACTED_TEXT_DIR_NAME}/`);
    expect(description).toMatch(/PDF|Office/);
    expect(description).toMatch(/\.md.*\.txt|\.txt.*\.md/s); // says which originals are directly readable
  });
});

// Guard against the constant drifting: the scan's ignore rule keys off the
// leading dot, so a rename to a non-dot directory would start self-indexing.
describe('EXTRACTED_TEXT_DIR_NAME', () => {
  it('starts with a dot so the scanner ignores it', () => {
    expect(EXTRACTED_TEXT_DIR_NAME.startsWith('.')).toBe(true);
  });
});
