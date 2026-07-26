/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readChunks, readManifest, readVectors, writeChunks } from '@/common/knowledge/store';
import { chunkMarkdown } from '@/common/knowledge/chunker';
import type { IProvider } from '@/common/config/storage';
import {
  createProjectKnowledgeService,
  type ProjectKnowledgeService,
} from '@/process/services/projectKnowledge/projectKnowledgeService';

const EMBED_PROVIDER = {
  id: 'embed',
  platform: 'openai',
  name: 'E',
  base_url: 'https://api.x.com/v1',
  api_key: 'sk-1',
  models: ['text-embedding-3-small'],
} as IProvider;

describe('projectKnowledgeService', () => {
  let root: string;
  let inbox: string;
  let service: ProjectKnowledgeService;
  let embedMock: ReturnType<typeof vi.fn>;
  let updates: string[];

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'kb-svc-root-'));
    inbox = mkdtempSync(path.join(tmpdir(), 'kb-svc-in-'));
    embedMock = vi.fn(async (texts: string[]) => texts.map(() => [1, 0, 0]));
    updates = [];
    service = createProjectKnowledgeService({
      storeRootDir: root,
      listProviders: async () => [EMBED_PROVIDER],
      embedTextsImpl: embedMock as never,
      convertToMarkdown: async () => {
        throw new Error('not used for md/txt');
      },
      getServerScriptPath: () => '/out/main/builtin-mcp-knowledge.js',
      onUpdated: (projectId) => updates.push(projectId),
    });
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(inbox, { recursive: true, force: true });
  });

  const addFile = async (name: string, content: string): Promise<string> => {
    const p = path.join(inbox, name);
    await writeFile(p, content, 'utf8');
    return p;
  };

  it('ingests a markdown file end-to-end (register → ready → embedded)', async () => {
    const file = await addFile('notes.md', '# Visa\n\nThe visa letter process requires HR sign-off.');
    await service.addSources('proj-1', [file]);
    const registered = await service.listSources('proj-1');
    expect(registered.sources).toHaveLength(1);
    await service.whenIdle('proj-1');

    const { sources, summary } = await service.listSources('proj-1');
    expect(sources[0]).toMatchObject({ fileName: 'notes.md', status: 'ready', error: null });
    expect(sources[0].chunkCount).toBeGreaterThan(0);
    expect(sources[0].vectorCount).toBe(sources[0].chunkCount);
    expect(summary).toEqual({ fileCount: 1, passageCount: sources[0].chunkCount, semantic: 'on' });

    const manifest = await readManifest(path.join(root, 'proj-1'));
    expect(manifest!.embedding).toEqual({ model: 'text-embedding-3-small', dim: 3 });
    const chunks = await readChunks(path.join(root, 'proj-1'));
    expect(chunks.some((c) => c.text.includes('visa letter process'))).toBe(true);
    expect(updates.filter((p) => p === 'proj-1').length).toBeGreaterThanOrEqual(2);
  });

  it('stays ready with BM25 only when embedding fails', async () => {
    embedMock.mockRejectedValue(new Error('rate limited'));
    const file = await addFile('a.md', 'expense policy: thirty day deadline');
    await service.addSources('proj-1', [file]);
    await service.whenIdle('proj-1');
    const { sources, summary } = await service.listSources('proj-1');
    expect(sources[0].status).toBe('ready');
    expect(sources[0].vectorCount).toBe(0);
    expect(summary.semantic).toBe('off');
  });

  it('marks unsupported extensions and oversized files without indexing them', async () => {
    const pdf = await addFile('doc.pdf', 'x');
    const big = await addFile('big.txt', 'x'.repeat(16 * 1024 * 1024));
    await service.addSources('proj-1', [pdf, big]);
    await service.whenIdle('proj-1');
    const { sources } = await service.listSources('proj-1');
    const byName = Object.fromEntries(sources.map((s) => [s.fileName, s]));
    expect(byName['doc.pdf'].status).toBe('unsupported');
    expect(byName['big.txt'].status).toBe('failed');
    expect(byName['big.txt'].error).toMatch(/15 MB/);
  });

  it('dedupes an unchanged re-add by content hash', async () => {
    const file = await addFile('same.md', 'identical content');
    await service.addSources('proj-1', [file]);
    await service.whenIdle('proj-1');
    await service.addSources('proj-1', [file]);
    await service.whenIdle('proj-1');
    expect((await service.listSources('proj-1')).sources).toHaveLength(1);
  });

  it('converts docx via the injected converter', async () => {
    const svc = createProjectKnowledgeService({
      storeRootDir: root,
      listProviders: async () => [],
      embedTextsImpl: embedMock as never,
      convertToMarkdown: async () => '# From Docx\n\nconverted body text',
      getServerScriptPath: () => '/x.js',
      onUpdated: () => {},
    });
    const file = await addFile('spec.docx', 'binary-ish');
    await svc.addSources('proj-2', [file]);
    await svc.whenIdle('proj-2');
    const { sources } = await svc.listSources('proj-2');
    expect(sources[0].status).toBe('ready');
    const chunks = await readChunks(path.join(root, 'proj-2'));
    expect(chunks[0].text).toContain('converted body text');
  });

  it('reuses the existing row when re-adding a file whose ingestion previously failed', async () => {
    let fail = true;
    const svc = createProjectKnowledgeService({
      storeRootDir: root,
      listProviders: async () => [],
      embedTextsImpl: embedMock as never,
      convertToMarkdown: async () => {
        if (fail) throw new Error('converter crashed');
        return '# ok\n\nrecovered body';
      },
      getServerScriptPath: () => '/x.js',
      onUpdated: () => {},
    });
    const file = await addFile('spec.docx', 'binary');
    await svc.addSources('proj-3', [file]);
    await svc.whenIdle('proj-3');
    let list = await svc.listSources('proj-3');
    expect(list.sources).toHaveLength(1);
    expect(list.sources[0].status).toBe('failed');
    const failedId = list.sources[0].id;

    fail = false;
    await svc.addSources('proj-3', [file]);
    await svc.whenIdle('proj-3');
    list = await svc.listSources('proj-3');
    expect(list.sources).toHaveLength(1);
    expect(list.sources[0].id).toBe(failedId);
    expect(list.sources[0].status).toBe('ready');
  });

  it("does not prune a surviving source's vectors when an unrelated source is removed, even if hasVector lags reality", async () => {
    const keepFile = await addFile('keep.md', 'keep this content around for retrieval please');
    const dropFile = await addFile('drop.md', 'drop this content, it is going away soon');
    await service.addSources('proj-1', [keepFile, dropFile]);
    await service.whenIdle('proj-1');

    const { sources } = await service.listSources('proj-1');
    const keepSource = sources.find((s) => s.fileName === 'keep.md')!;
    const dropSource = sources.find((s) => s.fileName === 'drop.md')!;
    expect(keepSource.vectorCount).toBeGreaterThan(0);
    expect(dropSource.vectorCount).toBeGreaterThan(0);

    // Simulate the desync this guards against: writeVectors succeeds but a
    // later writeChunks fails (transient ENOSPC/EACCES) inside
    // embedMissingVectors's best-effort try/catch, leaving chunks.json stale —
    // it still says hasVector:false for chunks that DO have a vector row on
    // disk. We reproduce that end state directly rather than injecting a
    // filesystem failure.
    const storeDir = path.join(root, 'proj-1');
    const chunksBefore = await readChunks(storeDir);
    const desynced = chunksBefore.map((c) => (c.sourceId === keepSource.id ? { ...c, hasVector: false } : c));
    await writeChunks(storeDir, desynced);

    await service.removeSource('proj-1', dropSource.id);

    const vectorsAfter = await readVectors(storeDir);
    const keepChunkIds = desynced.filter((c) => c.sourceId === keepSource.id).map((c) => c.chunkId);
    expect(keepChunkIds.length).toBeGreaterThan(0);
    for (const chunkId of keepChunkIds) {
      expect(vectorsAfter?.rows.has(chunkId)).toBe(true);
    }
  });

  it('truncates a source that exceeds MAX_CHUNKS_PER_SOURCE but keeps it ready', async () => {
    // Each hard-split chunk advances the cursor by (maxChars - overlapChars) =
    // 3200 - 400 = 2800 chars (see chunker.ts's default options), so getting
    // > 2000 raw chunks needs > 2000 * 2800 = 5,600,000 chars. Repeating a
    // short word with no blank lines keeps this one giant paragraph (one
    // block), so chunkMarkdown takes the hard-split path instead of packing
    // it with neighboring paragraphs.
    const hugeText = 'word '.repeat(1_200_000); // 6,000,000 chars
    const rawChunks = chunkMarkdown(hugeText);
    expect(rawChunks.length).toBeGreaterThan(2000); // sanity: the cap must bind, not the input running dry

    const file = await addFile('huge.md', hugeText);
    await service.addSources('proj-1', [file]);
    await service.whenIdle('proj-1');

    const { sources } = await service.listSources('proj-1');
    expect(sources[0].status).toBe('ready');
    expect(sources[0].chunkCount).toBe(2000);
    expect(sources[0].error).toMatch(/Truncated/);
  });

  it('listSources returns empty result for an unknown project', async () => {
    expect(await service.listSources('nope')).toEqual({
      sources: [],
      summary: { fileCount: 0, passageCount: 0, semantic: 'off' },
    });
  });
});
