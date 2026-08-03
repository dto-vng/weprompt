/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
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
  let workspace: string;
  let service: ProjectKnowledgeService;
  let embedMock: ReturnType<typeof vi.fn>;
  let updates: string[];

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'kb-svc-root-'));
    inbox = mkdtempSync(path.join(tmpdir(), 'kb-svc-in-'));
    workspace = mkdtempSync(path.join(tmpdir(), 'kb-svc-ws-'));
    embedMock = vi.fn(async (texts: string[]) => texts.map(() => [1, 0, 0]));
    updates = [];
    service = createProjectKnowledgeService({
      storeRootDir: root,
      listProviders: async () => [EMBED_PROVIDER],
      embedTextsImpl: embedMock as never,
      convertToMarkdown: async () => {
        throw new Error('not used for md/txt');
      },
      trashItem: async () => {},
      getServerScriptPath: () => '/out/main/builtin-mcp-knowledge.js',
      onUpdated: (projectId) => updates.push(projectId),
    });
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(inbox, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  });

  const addFile = async (name: string, content: string): Promise<string> => {
    const p = path.join(inbox, name);
    await writeFile(p, content, 'utf8');
    return p;
  };

  it('ingests a markdown file end-to-end (register → ready → embedded)', async () => {
    const file = await addFile('notes.md', '# Visa\n\nThe visa letter process requires HR sign-off.');
    await service.addSources('proj-1', [file], workspace);
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
    await service.addSources('proj-1', [file], workspace);
    await service.whenIdle('proj-1');
    const { sources, summary } = await service.listSources('proj-1');
    expect(sources[0].status).toBe('ready');
    expect(sources[0].vectorCount).toBe(0);
    expect(summary.semantic).toBe('off');
  });

  it('re-embeds stale hasVector chunks by upserting rows, never duplicating chunk ids', async () => {
    // Full ingest: source ready, every chunk embedded, vectors on disk.
    const file = await addFile('policy.md', 'travel policy: submit the visa letter request early');
    await service.addSources('proj-1', [file], workspace);
    await service.whenIdle('proj-1');
    const storeDir = path.join(root, 'proj-1');
    const chunks = await readChunks(storeDir);
    expect(chunks.length).toBeGreaterThan(0);

    // Simulate the documented partial-write window (see removeSourceRows):
    // writeVectors succeeded but the follow-up writeChunks did not, so
    // chunks.json claims "no vector" while vectors.bin already has the rows.
    await writeChunks(
      storeDir,
      chunks.map((c) => ({ ...c, hasVector: false }))
    );

    // Any queue pass ends with the embed step re-running for "missing" chunks.
    await service.syncFolder('proj-1', workspace);
    await service.whenIdle('proj-1');

    const meta = JSON.parse(readFileSync(path.join(storeDir, 'index', 'vectors.meta.json'), 'utf8')) as {
      rowChunkIds: string[];
    };
    // One row per chunk: a duplicate id means recovery appended instead of upserting.
    expect(meta.rowChunkIds.length).toBe(chunks.length);
    expect(new Set(meta.rowChunkIds).size).toBe(meta.rowChunkIds.length);
    const vectors = await readVectors(storeDir);
    expect(vectors!.rows.size).toBe(chunks.length);
  });

  it('marks unsupported extensions and oversized files without indexing them', async () => {
    const pptx = await addFile('deck.pptx', 'x');
    const big = await addFile('big.txt', 'x'.repeat(16 * 1024 * 1024));
    await service.addSources('proj-1', [pptx, big], workspace);
    await service.whenIdle('proj-1');
    const { sources } = await service.listSources('proj-1');
    const byName = Object.fromEntries(sources.map((s) => [s.fileName, s]));
    expect(byName['deck.pptx'].status).toBe('unsupported');
    expect(byName['deck.pptx'].error).toMatch(/\.pdf/); // the hint now advertises PDF
    expect(byName['big.txt'].status).toBe('failed');
    expect(byName['big.txt'].error).toMatch(/15 MB/);
  });

  it('dedupes an unchanged re-add by content hash', async () => {
    const file = await addFile('same.md', 'identical content');
    await service.addSources('proj-1', [file], workspace);
    await service.whenIdle('proj-1');
    await service.addSources('proj-1', [file], workspace);
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
    await svc.addSources('proj-2', [file], workspace);
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
    await svc.addSources('proj-3', [file], workspace);
    await svc.whenIdle('proj-3');
    let list = await svc.listSources('proj-3');
    expect(list.sources).toHaveLength(1);
    expect(list.sources[0].status).toBe('failed');
    const failedId = list.sources[0].id;

    fail = false;
    await svc.addSources('proj-3', [file], workspace);
    await svc.whenIdle('proj-3');
    list = await svc.listSources('proj-3');
    expect(list.sources).toHaveLength(1);
    expect(list.sources[0].id).toBe(failedId);
    expect(list.sources[0].status).toBe('ready');
  });

  it("does not prune a surviving source's vectors when an unrelated source is removed, even if hasVector lags reality", async () => {
    const keepFile = await addFile('keep.md', 'keep this content around for retrieval please');
    const dropFile = await addFile('drop.md', 'drop this content, it is going away soon');
    await service.addSources('proj-1', [keepFile, dropFile], workspace);
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

    await service.removeSource('proj-1', dropSource.id, workspace);

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
    await service.addSources('proj-1', [file], workspace);
    await service.whenIdle('proj-1');

    const { sources } = await service.listSources('proj-1');
    expect(sources[0].status).toBe('ready');
    expect(sources[0].chunkCount).toBe(2000);
    expect(sources[0].error).toMatch(/Truncated/);
  });

  it('ingests a real text-layer PDF, citing page numbers', async () => {
    const file = path.join(inbox, 'policy.pdf');
    await writeFile(file, readFileSync(path.resolve(__dirname, '../../fixtures/knowledge/text-layer.pdf')));
    await service.addSources('proj-1', [file], workspace);
    await service.whenIdle('proj-1');

    const { sources } = await service.listSources('proj-1');
    expect(sources[0]).toMatchObject({ fileName: 'policy.pdf', status: 'ready', error: null, progress: null });
    expect(sources[0].chunkCount).toBeGreaterThan(0);

    const chunks = await readChunks(path.join(root, 'proj-1'));
    expect(chunks.some((c) => c.text.includes('ten working days before departure'))).toBe(true);
    // The page heading is what makes a citation point at a page. Both fixture
    // pages fit in one chunk, so the label must name the whole span — the
    // chunker on its own would have said "Page 2", where the chunk ends.
    expect(chunks).toHaveLength(1);
    expect(chunks[0].headingPath).toBe('Pages 1–2');
    // What lands on disk must be readable markdown, not a serialized blob.
    const converted = await readFile(path.join(root, 'proj-1', 'sources', sources[0].id, 'converted.md'), 'utf8');
    expect(converted).toMatch(/^## Page 1\n\nVisa Letter Policy/);
  });

  it('fails a scanned PDF actionably when no model can transcribe it', async () => {
    // The default provider in this suite offers only an embedding model, so
    // transcription cannot even be attempted. The message has to name that,
    // not just report failure — see the OCR suite for the transcribing paths.
    const file = path.join(inbox, 'scan.pdf');
    await writeFile(file, readFileSync(path.resolve(__dirname, '../../fixtures/knowledge/image-only.pdf')));
    await service.addSources('proj-1', [file], workspace);
    await service.whenIdle('proj-1');

    const { sources } = await service.listSources('proj-1');
    expect(sources[0].status).toBe('failed');
    expect(sources[0].error).toMatch(/scan/i);
    expect(sources[0].error).toMatch(/read images/i);
    expect(await readChunks(path.join(root, 'proj-1'))).toEqual([]);
  });

  it('routes only .pdf through the PDF extractor', async () => {
    const extractPdfTextImpl = vi.fn(async () => ({
      pages: ['extracted body text'],
      pageCount: 1,
      hasTextLayer: true,
      truncated: false,
    }));
    const svc = createProjectKnowledgeService({
      storeRootDir: root,
      listProviders: async () => [],
      embedTextsImpl: embedMock as never,
      extractPdfTextImpl: extractPdfTextImpl as never,
      convertToMarkdown: async () => '# Docx\n\ndocx body',
      getServerScriptPath: () => '/x.js',
      onUpdated: () => {},
    });

    await svc.addSources(
      'proj-r',
      [await addFile('a.md', 'markdown body'), await addFile('b.docx', 'binary')],
      workspace
    );
    await svc.whenIdle('proj-r');
    expect(extractPdfTextImpl).not.toHaveBeenCalled();

    const pdf = path.join(inbox, 'c.pdf');
    await writeFile(pdf, readFileSync(path.resolve(__dirname, '../../fixtures/knowledge/text-layer.pdf')));
    await svc.addSources('proj-r', [pdf], workspace);
    await svc.whenIdle('proj-r');
    expect(extractPdfTextImpl).toHaveBeenCalledTimes(1);
    expect(extractPdfTextImpl.mock.calls[0][1]).toMatchObject({ maxPages: 50 });
  });

  it('truncates a PDF past the page cap but keeps it ready and searchable', async () => {
    const svc = createProjectKnowledgeService({
      storeRootDir: root,
      listProviders: async () => [],
      embedTextsImpl: embedMock as never,
      extractPdfTextImpl: async () => ({
        pages: ['visa letter guidance on the first page'],
        pageCount: 120,
        hasTextLayer: true,
        truncated: true,
      }),
      convertToMarkdown: async () => '',
      getServerScriptPath: () => '/x.js',
      onUpdated: () => {},
    });
    const pdf = path.join(inbox, 'long.pdf');
    await writeFile(pdf, readFileSync(path.resolve(__dirname, '../../fixtures/knowledge/text-layer.pdf')));
    await svc.addSources('proj-cap', [pdf], workspace);
    await svc.whenIdle('proj-cap');

    const { sources } = await svc.listSources('proj-cap');
    expect(sources[0].status).toBe('ready');
    expect(sources[0].error).toBe('Truncated to 50 pages.');
    expect(sources[0].chunkCount).toBeGreaterThan(0);
  });

  it('publishes reading progress while a PDF is being read, and clears it when done', async () => {
    const snapshots: Array<Record<string, unknown> | undefined> = [];
    const svc = createProjectKnowledgeService({
      storeRootDir: root,
      listProviders: async () => [],
      embedTextsImpl: embedMock as never,
      extractPdfTextImpl: async (_data, options) => {
        await options?.onProgress?.(5, 12);
        await options?.onProgress?.(12, 12);
        return { pages: ['page body text'], pageCount: 12, hasTextLayer: true, truncated: false };
      },
      convertToMarkdown: async () => '',
      getServerScriptPath: () => '/x.js',
      // Manifest writes are atomic (temp + rename), so reading it back the
      // moment it is announced captures each intermediate state.
      onUpdated: (projectId) => {
        try {
          const raw = readFileSync(path.join(root, projectId, 'manifest.json'), 'utf8');
          snapshots.push((JSON.parse(raw) as { sources: Array<Record<string, unknown>> }).sources[0]);
        } catch {
          snapshots.push(undefined);
        }
      },
    });
    const pdf = path.join(inbox, 'prog.pdf');
    await writeFile(pdf, readFileSync(path.resolve(__dirname, '../../fixtures/knowledge/text-layer.pdf')));
    await svc.addSources('proj-prog', [pdf], workspace);
    await svc.whenIdle('proj-prog');

    const progresses = snapshots.map((s) => s?.progress).filter(Boolean);
    expect(progresses).toContainEqual({ stage: 'reading', done: 5, total: 12 });
    expect(progresses).toContainEqual({ stage: 'reading', done: 12, total: 12 });
    const { sources } = await svc.listSources('proj-prog');
    expect(sources[0].status).toBe('ready');
    expect(sources[0].progress).toBeNull();
  });

  it('keeps vectors from batches that succeeded when a later batch fails, and Retry finishes the rest', async () => {
    // > 32 chunks so the embed pass spans several batches. Each hard-split
    // chunk advances 2800 chars (chunker defaults), so ~126k chars ≈ 45 chunks.
    const file = await addFile('big.md', 'word '.repeat(25_200));
    let calls = 0;
    embedMock.mockImplementation(async (texts: string[]) => {
      calls += 1;
      if (calls === 2) throw new Error('rate limited');
      return texts.map(() => [1, 0, 0]);
    });

    await service.addSources('proj-1', [file], workspace);
    await service.whenIdle('proj-1');

    const partial = (await service.listSources('proj-1')).sources[0];
    expect(partial.status).toBe('ready'); // BM25 search still works
    expect(partial.chunkCount).toBeGreaterThan(32);
    expect(partial.vectorCount).toBe(32); // the first batch survived the failure
    expect(partial.progress).toBeNull();
    const vectors = await readVectors(path.join(root, 'proj-1'));
    expect(vectors?.rows.size).toBe(32);

    embedMock.mockImplementation(async (texts: string[]) => texts.map(() => [1, 0, 0]));
    await service.retrySource('proj-1', partial.id, workspace);
    await service.whenIdle('proj-1');

    const done = (await service.listSources('proj-1')).sources[0];
    expect(done.vectorCount).toBe(done.chunkCount);
    expect((await readVectors(path.join(root, 'proj-1')))?.rows.size).toBe(done.chunkCount);
  });

  it('listSources returns empty result for an unknown project', async () => {
    expect(await service.listSources('nope')).toEqual({
      sources: [],
      summary: { fileCount: 0, passageCount: 0, semantic: 'off' },
      folderMissing: false,
    });
  });
});
