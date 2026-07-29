/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// syncFolder: the Knowledge Base folder is the source of truth, diffed against
// the manifest by fileName + content hash. The single most important behavior
// in this suite is the missing-folder guard: an unreadable folder is an error
// state, NEVER a deletion signal. If you change the guard, the first tests
// here must fail.

import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { chmod, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KNOWLEDGE_FOLDER_NAME } from '@/common/knowledge/constants';
import { readChunks, writeChunks, writeManifest } from '@/common/knowledge/store';
import type { KnowledgeManifest, KnowledgeManifestSource } from '@/common/knowledge/types';
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

describe('projectKnowledgeService.syncFolder', () => {
  let root: string;
  let workspace: string;
  let kb: string;
  let service: ProjectKnowledgeService;
  let embedMock: ReturnType<typeof vi.fn>;

  const makeService = (overrides: Partial<ProjectKnowledgeServiceDeps> = {}): ProjectKnowledgeService =>
    createProjectKnowledgeService({
      storeRootDir: root,
      listProviders: async () => [EMBED_PROVIDER],
      embedTextsImpl: embedMock as never,
      convertToMarkdown: async () => '# converted docx body',
      getServerScriptPath: () => '/x.js',
      onUpdated: () => {},
      ...overrides,
    });

  beforeEach(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'kb-sync-root-'));
    workspace = mkdtempSync(path.join(tmpdir(), 'kb-sync-ws-'));
    kb = path.join(workspace, KNOWLEDGE_FOLDER_NAME);
    await mkdir(kb, { recursive: true });
    embedMock = vi.fn(async (texts: string[]) => texts.map(() => [1, 0, 0]));
    service = makeService();
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  });

  const writeKb = (name: string, content: string): Promise<void> => writeFile(path.join(kb, name), content, 'utf8');

  const synced = async (projectId = 'p1'): Promise<void> => {
    await service.syncFolder(projectId, workspace);
    await service.whenIdle(projectId);
  };

  // ------------------------------------------------------------------
  // THE GUARD — a missing folder must never be read as "delete my index"
  // ------------------------------------------------------------------

  it('performs ZERO deletions and flags folderMissing when the folder disappears', async () => {
    await writeKb('a.md', 'alpha content for retrieval');
    await writeKb('b.md', 'beta content for retrieval');
    await synced();
    expect((await service.listSources('p1')).sources).toHaveLength(2);

    rmSync(kb, { recursive: true, force: true });
    await synced();

    const result = await service.listSources('p1');
    expect(result.folderMissing).toBe(true);
    expect(result.sources).toHaveLength(2);
    expect(result.sources.every((s) => s.status === 'ready')).toBe(true);
    expect((await readChunks(path.join(root, 'p1'))).length).toBeGreaterThan(0);
  });

  it('treats an unreadable folder (a file at the path) as missing, not as empty', async () => {
    await writeKb('a.md', 'alpha content');
    await synced();

    rmSync(kb, { recursive: true, force: true });
    await writeFile(kb, 'now I am a file', 'utf8');
    await synced();

    const result = await service.listSources('p1');
    expect(result.folderMissing).toBe(true);
    expect(result.sources).toHaveLength(1);
  });

  it('recovers without re-ingesting when the folder returns with the same files', async () => {
    await writeKb('a.md', 'stable content');
    await synced();
    const before = (await service.listSources('p1')).sources[0];

    rmSync(kb, { recursive: true, force: true });
    await synced();
    expect((await service.listSources('p1')).folderMissing).toBe(true);

    await mkdir(kb, { recursive: true });
    await writeKb('a.md', 'stable content');
    await synced();

    const result = await service.listSources('p1');
    expect(result.folderMissing).toBe(false);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].id).toBe(before.id);
    expect(result.sources[0].addedAt).toBe(before.addedAt);
  });

  it('does not flag a brand-new project (no sources) whose folder simply does not exist yet', async () => {
    rmSync(kb, { recursive: true, force: true });
    await synced();
    const result = await service.listSources('p1');
    expect(result.folderMissing).toBe(false);
    expect(result.sources).toHaveLength(0);
  });

  // ------------------------------------------------------------------
  // Diff semantics on a readable folder
  // ------------------------------------------------------------------

  it('indexes files dropped into the folder without any add call', async () => {
    await writeKb('dropped.md', 'the visa letter process requires HR sign-off');
    await synced();
    const { sources } = await service.listSources('p1');
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ fileName: 'dropped.md', status: 'ready' });
    const chunks = await readChunks(path.join(root, 'p1'));
    expect(chunks.some((c) => c.text.includes('visa letter process'))).toBe(true);
  });

  it('re-ingests a file whose content changed', async () => {
    await writeKb('doc.md', 'original wording about reimbursement');
    await synced();
    await writeKb('doc.md', 'rewritten wording about travel budgets');
    await synced();

    const { sources } = await service.listSources('p1');
    expect(sources).toHaveLength(1);
    const chunks = await readChunks(path.join(root, 'p1'));
    expect(chunks.some((c) => c.text.includes('travel budgets'))).toBe(true);
    expect(chunks.some((c) => c.text.includes('reimbursement'))).toBe(false);
  });

  it('is a no-op when nothing changed', async () => {
    await writeKb('same.md', 'unchanging content');
    await synced();
    const before = (await service.listSources('p1')).sources[0];
    await synced();
    const after = (await service.listSources('p1')).sources[0];
    expect(after.id).toBe(before.id);
    expect(after.addedAt).toBe(before.addedAt);
    expect(after.chunkCount).toBe(before.chunkCount);
  });

  it('removes the index rows of a file deleted from a still-readable folder', async () => {
    await writeKb('keep.md', 'keep this knowledge available');
    await writeKb('gone.md', 'this knowledge is about to vanish');
    await synced();

    rmSync(path.join(kb, 'gone.md'));
    await synced();

    const result = await service.listSources('p1');
    expect(result.folderMissing).toBe(false);
    expect(result.sources.map((s) => s.fileName)).toEqual(['keep.md']);
    const chunks = await readChunks(path.join(root, 'p1'));
    expect(chunks.some((c) => c.text.includes('vanish'))).toBe(false);
    expect(chunks.some((c) => c.text.includes('keep this knowledge'))).toBe(true);
  });

  it('tracks unsupported files as rows and drops the row when the file goes', async () => {
    await writeKb('photo.png', 'binary-ish');
    await synced();
    let { sources } = await service.listSources('p1');
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ fileName: 'photo.png', status: 'unsupported' });

    rmSync(path.join(kb, 'photo.png'));
    await synced();
    ({ sources } = await service.listSources('p1'));
    expect(sources).toHaveLength(0);
  });

  it('marks an oversize file failed without reading it', async () => {
    const bytes = 15 * 1024 * 1024 + 1;
    await writeFile(path.join(kb, 'huge.txt'), Buffer.alloc(bytes, 121));
    await synced();
    const { sources } = await service.listSources('p1');
    expect(sources[0].status).toBe('failed');
    expect(sources[0].error).toMatch(/15 MB/);
  });

  it('does not retry a failed source on every sync while its content is unchanged', async () => {
    const converter = vi.fn(async (): Promise<string> => {
      throw new Error('converter crashed');
    });
    const svc = makeService({ convertToMarkdown: converter });
    await writeKb('broken.docx', 'binary');
    await svc.syncFolder('p2', workspace);
    await svc.whenIdle('p2');
    expect((await svc.listSources('p2')).sources[0].status).toBe('failed');
    expect(converter).toHaveBeenCalledTimes(1);

    await svc.syncFolder('p2', workspace);
    await svc.whenIdle('p2');
    expect((await svc.listSources('p2')).sources[0].status).toBe('failed');
    expect(converter).toHaveBeenCalledTimes(1); // sync must not hammer a failing source
  });

  // ------------------------------------------------------------------
  // processPending reads from the folder
  // ------------------------------------------------------------------

  it('leaves rows indexing (not failed) when the folder vanishes before processing', async () => {
    const storeDir = path.join(root, 'p1');
    const manifest: KnowledgeManifest = {
      schemaVersion: 1,
      projectId: 'p1',
      embedding: null,
      sources: [
        {
          id: 'abcdef123456',
          fileName: 'ghost.md',
          contentHash: `sha256:${'0'.repeat(64)}`,
          byteSize: 5,
          status: 'indexing',
          chunkCount: 0,
          vectorCount: 0,
          addedAt: 1,
          error: null,
        },
      ],
    };
    await writeManifest(storeDir, manifest);
    rmSync(kb, { recursive: true, force: true });

    await service.retrySource('p1', 'abcdef123456', workspace);
    await service.whenIdle('p1');

    const result = await service.listSources('p1');
    expect(result.sources[0].status).toBe('indexing');
    expect(result.folderMissing).toBe(true);
  });

  it('fails only the unreadable file when the folder itself is fine', async () => {
    const storeDir = path.join(root, 'p1');
    const manifest: KnowledgeManifest = {
      schemaVersion: 1,
      projectId: 'p1',
      embedding: null,
      sources: [
        {
          id: 'abcdef123456',
          fileName: 'ghost.md',
          contentHash: `sha256:${'0'.repeat(64)}`,
          byteSize: 5,
          status: 'indexing',
          chunkCount: 0,
          vectorCount: 0,
          addedAt: 1,
          error: null,
        },
      ],
    };
    await writeManifest(storeDir, manifest);

    await service.retrySource('p1', 'abcdef123456', workspace);
    await service.whenIdle('p1');

    const result = await service.listSources('p1');
    expect(result.sources[0].status).toBe('failed');
    expect(result.sources[0].error).toBe('Could not read the file.');
    expect(result.folderMissing).toBe(false);
  });

  // ------------------------------------------------------------------
  // addSources copies into the folder (folder is the only source of truth)
  // ------------------------------------------------------------------

  it('copies picked files into the folder and keeps no store snapshot', async () => {
    const inbox = mkdtempSync(path.join(tmpdir(), 'kb-sync-inbox-'));
    try {
      const picked = path.join(inbox, 'notes.md');
      await writeFile(picked, 'notes about the quarterly budget', 'utf8');
      await service.addSources('p1', [picked], workspace);
      await service.whenIdle('p1');

      expect(existsSync(path.join(kb, 'notes.md'))).toBe(true);
      const { sources } = await service.listSources('p1');
      expect(sources[0]).toMatchObject({ fileName: 'notes.md', status: 'ready' });
      const sourceDir = path.join(root, 'p1', 'sources', sources[0].id);
      const files = await readdir(sourceDir);
      expect(files).toEqual(['converted.md']); // no original.<ext> snapshot any more
    } finally {
      rmSync(inbox, { recursive: true, force: true });
    }
  });

  it('creates the folder on add when it does not exist yet', async () => {
    rmSync(kb, { recursive: true, force: true });
    const inbox = mkdtempSync(path.join(tmpdir(), 'kb-sync-inbox2-'));
    try {
      const picked = path.join(inbox, 'first.md');
      await writeFile(picked, 'the very first knowledge file', 'utf8');
      await service.addSources('p1', [picked], workspace);
      await service.whenIdle('p1');
      expect(existsSync(path.join(kb, 'first.md'))).toBe(true);
      expect((await service.listSources('p1')).sources[0].status).toBe('ready');
    } finally {
      rmSync(inbox, { recursive: true, force: true });
    }
  });

  it('accepts a picked file that already lives inside the folder without copying onto itself', async () => {
    await writeKb('inplace.md', 'already where it belongs');
    await service.addSources('p1', [path.join(kb, 'inplace.md')], workspace);
    await service.whenIdle('p1');
    const { sources } = await service.listSources('p1');
    expect(sources[0]).toMatchObject({ fileName: 'inplace.md', status: 'ready' });
  });

  // ------------------------------------------------------------------
  // Migration: legacy store snapshots move into the folder exactly once
  // ------------------------------------------------------------------

  /** Seed a pre-folder store: manifest row + original snapshot + converted.md + one chunk. */
  const seedLegacyStore = async (projectId: string, fileName: string, content: string): Promise<string> => {
    const storeDir = path.join(root, projectId);
    const contentHash = `sha256:${createHash('sha256').update(content).digest('hex')}`;
    const id = contentHash.slice(7, 19);
    const sourceDir = path.join(storeDir, 'sources', id);
    await mkdir(sourceDir, { recursive: true });
    await writeFile(path.join(sourceDir, `original${path.extname(fileName)}`), content, 'utf8');
    await writeFile(path.join(sourceDir, 'converted.md'), content, 'utf8');
    const existing = await readChunks(storeDir);
    await writeChunks(storeDir, [
      ...existing,
      { chunkId: `${id}#0`, sourceId: id, chunkIndex: 0, text: content, hasVector: true },
    ]);
    const row: KnowledgeManifestSource = {
      id,
      fileName,
      contentHash,
      byteSize: Buffer.byteLength(content),
      status: 'ready',
      chunkCount: 1,
      vectorCount: 1,
      addedAt: 1,
      error: null,
    };
    const manifest: KnowledgeManifest = { schemaVersion: 1, projectId, embedding: null, sources: [row] };
    await writeManifest(storeDir, manifest);
    return id;
  };

  it('exports a legacy snapshot into the folder, verifies it, then drops the snapshot', async () => {
    const id = await seedLegacyStore('pm', 'legacy.md', 'legacy alpha body');
    await service.syncFolder('pm', workspace);
    await service.whenIdle('pm');

    expect(await readFile(path.join(kb, 'legacy.md'), 'utf8')).toBe('legacy alpha body');
    const sourceFiles = await readdir(path.join(root, 'pm', 'sources', id));
    expect(sourceFiles).toEqual(['converted.md']);
    const { sources } = await service.listSources('pm');
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ id, fileName: 'legacy.md', status: 'ready', addedAt: 1 });
    const chunks = await readChunks(path.join(root, 'pm'));
    expect(chunks).toHaveLength(1); // straight export — no re-ingest churn
  });

  it('drops the snapshot without writing when the folder already has the same content', async () => {
    const id = await seedLegacyStore('pm', 'legacy.md', 'identical body');
    await writeKb('legacy.md', 'identical body');
    await service.syncFolder('pm', workspace);
    await service.whenIdle('pm');

    expect(await readdir(path.join(root, 'pm', 'sources', id))).toEqual(['converted.md']);
    expect((await service.listSources('pm')).sources[0]).toMatchObject({ id, status: 'ready' });
  });

  it('exports under a suffixed name when the folder has different content for that name, and indexes both', async () => {
    await seedLegacyStore('pm', 'policy.md', 'the legacy store version');
    await writeKb('policy.md', 'the newer folder version');
    await service.syncFolder('pm', workspace);
    await service.whenIdle('pm');

    expect(await readFile(path.join(kb, 'policy.md'), 'utf8')).toBe('the newer folder version');
    expect(await readFile(path.join(kb, 'policy (from knowledge base).md'), 'utf8')).toBe('the legacy store version');
    const { sources } = await service.listSources('pm');
    expect(sources.map((s) => s.fileName).toSorted()).toEqual(['policy (from knowledge base).md', 'policy.md']);
    expect(sources.every((s) => s.status === 'ready')).toBe(true);
    const chunkTexts = (await readChunks(path.join(root, 'pm'))).map((c) => c.text).join('\n');
    expect(chunkTexts).toContain('the newer folder version');
    expect(chunkTexts).toContain('the legacy store version');
  });

  it('does not migrate (and keeps the snapshot) when the workspace itself is gone', async () => {
    const id = await seedLegacyStore('pm', 'legacy.md', 'body');
    rmSync(workspace, { recursive: true, force: true });
    await service.syncFolder('pm', workspace);
    await service.whenIdle('pm');

    const result = await service.listSources('pm');
    expect(result.folderMissing).toBe(true);
    expect(result.sources).toHaveLength(1);
    expect((await readdir(path.join(root, 'pm', 'sources', id))).toSorted()).toEqual(['converted.md', 'original.md']);
  });

  it('keeps the row and the snapshot when the export fails, and settles on a later sync', async () => {
    const id = await seedLegacyStore('pm', 'legacy.md', 'precious body');
    await chmod(kb, 0o555); // folder readable but not writable — export must fail
    try {
      await service.syncFolder('pm', workspace);
      await service.whenIdle('pm');
      const during = await service.listSources('pm');
      expect(during.sources.map((s) => s.id)).toEqual([id]); // row protected from the diff
      expect((await readdir(path.join(root, 'pm', 'sources', id))).toSorted()).toEqual(['converted.md', 'original.md']);
    } finally {
      await chmod(kb, 0o755);
    }

    await service.syncFolder('pm', workspace);
    await service.whenIdle('pm');
    expect(await readFile(path.join(kb, 'legacy.md'), 'utf8')).toBe('precious body');
    expect(await readdir(path.join(root, 'pm', 'sources', id))).toEqual(['converted.md']);
    expect((await service.listSources('pm')).sources.map((s) => s.id)).toEqual([id]);
  });

  it('re-adding a previously failed file retries it, reusing the row', async () => {
    let fail = true;
    const converter = vi.fn(async (): Promise<string> => {
      if (fail) throw new Error('converter crashed');
      return '# recovered body';
    });
    const svc = makeService({ convertToMarkdown: converter });
    const inbox = mkdtempSync(path.join(tmpdir(), 'kb-sync-inbox3-'));
    try {
      const picked = path.join(inbox, 'spec.docx');
      await writeFile(picked, 'binary');
      await svc.addSources('p3', [picked], workspace);
      await svc.whenIdle('p3');
      const failedRow = (await svc.listSources('p3')).sources[0];
      expect(failedRow.status).toBe('failed');

      fail = false;
      await svc.addSources('p3', [picked], workspace);
      await svc.whenIdle('p3');
      const { sources } = await svc.listSources('p3');
      expect(sources).toHaveLength(1);
      expect(sources[0].id).toBe(failedRow.id);
      expect(sources[0].status).toBe('ready');
    } finally {
      rmSync(inbox, { recursive: true, force: true });
    }
  });
});
