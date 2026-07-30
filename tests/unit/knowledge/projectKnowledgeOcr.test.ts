/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Ingestion of scanned PDFs: the transcription branch of processPending.

import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IProvider } from '@/common/config/storage';
import { KNOWLEDGE_FOLDER_NAME } from '@/common/knowledge/constants';
import { readChunks, readManifest, writeManifest } from '@/common/knowledge/store';
import {
  createProjectKnowledgeService,
  type ProjectKnowledgeService,
  type ProjectKnowledgeServiceDeps,
} from '@/process/services/projectKnowledge/projectKnowledgeService';

const VISION_PROVIDER = {
  id: 'maas',
  platform: 'openai',
  name: 'MaaS',
  base_url: 'https://maas.example/v1',
  api_key: 'sk-1',
  models: ['google/gemma-4-31b-it'],
} as IProvider;

const fixtureBytes = (name: string): Buffer => readFileSync(path.resolve(__dirname, '../../fixtures/knowledge', name));

describe('projectKnowledgeService — scanned PDFs', () => {
  let root: string;
  let inbox: string;
  let workspace: string;
  let updates: string[];

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'kb-ocr-root-'));
    inbox = mkdtempSync(path.join(tmpdir(), 'kb-ocr-in-'));
    workspace = mkdtempSync(path.join(tmpdir(), 'kb-ocr-ws-'));
    updates = [];
  });
  afterEach(() => {
    for (const dir of [root, inbox, workspace]) rmSync(dir, { recursive: true, force: true });
  });

  /**
   * A service whose transcription and model resolution are both injected.
   *
   * Resolution is stubbed BY DEFAULT and not only where a test cares: the real
   * `resolveOcrModel` probes the provider over the network, so leaving it in
   * would turn every case below into a live call that fails with "fetch failed"
   * before reaching the behaviour under test.
   */
  const makeService = (over: Partial<ProjectKnowledgeServiceDeps> = {}): ProjectKnowledgeService =>
    createProjectKnowledgeService({
      storeRootDir: root,
      listProviders: async () => [VISION_PROVIDER],
      resolveOcrModelImpl: (async () => ({
        status: 'resolved' as const,
        config: { baseUrl: VISION_PROVIDER.base_url, apiKey: 'sk-1', model: 'google/gemma-4-31b-it' },
      })) as never,
      embedTextsImpl: (async (texts: string[]) => texts.map(() => [1, 0, 0])) as never,
      convertToMarkdown: async () => {
        throw new Error('not used here');
      },
      trashItem: async () => {},
      getServerScriptPath: () => '/out/main/builtin-mcp-knowledge.js',
      onUpdated: (projectId) => updates.push(projectId),
      ...over,
    });

  /** Copy a fixture into the inbox under a given name and return its path. */
  const stageFixture = async (fixture: string, asName: string): Promise<string> => {
    const target = path.join(inbox, asName);
    await writeFile(target, fixtureBytes(fixture));
    return target;
  };

  const storeDirOf = (projectId: string): string => path.join(root, projectId);

  it('transcribes a scan into markdown and indexes it, recording the model used', async () => {
    const ocrPdfPagesImpl = vi.fn(async () => ({
      pages: ['# HỢP ĐỒNG\n\nĐiều 1: Thời hạn hợp đồng là mười hai tháng.'],
      skippedPages: [],
      transcribedCount: 1,
      pageCount: 1,
      truncated: false,
    }));
    const service = makeService({ ocrPdfPagesImpl: ocrPdfPagesImpl as never });
    await service.addSources('p1', [await stageFixture('ocr-flatbed.pdf', 'contract.pdf')], workspace);
    await service.whenIdle('p1');

    const { sources } = await service.listSources('p1');
    expect(sources[0]).toMatchObject({ fileName: 'contract.pdf', status: 'ready', error: null, progress: null });
    // Provenance is per-source, not a global pin: transcription quality varies
    // by document and re-transcribing one source must stay possible.
    expect(sources[0].ocr).toEqual({ model: 'google/gemma-4-31b-it', skippedPages: [] });

    // What lands on disk has to be readable markdown with the diacritics intact
    // — the whole point of a multimodal model over field-extraction JSON.
    const converted = await readFile(path.join(storeDirOf('p1'), 'sources', sources[0].id, 'converted.md'), 'utf8');
    expect(converted).toContain('HỢP ĐỒNG');
    expect(converted).toMatch(/^## Page 1\n/);
    const chunks = await readChunks(storeDirOf('p1'));
    expect(chunks.some((c) => c.text.includes('mười hai tháng'))).toBe(true);
  });

  it('never transcribes a PDF that has a text layer', async () => {
    // The cost assertion. A text-layer PDF costs milliseconds locally; routing
    // one through the model would cost a call per page of the user's own quota.
    const ocrPdfPagesImpl = vi.fn();
    const service = makeService({ ocrPdfPagesImpl: ocrPdfPagesImpl as never });
    await service.addSources('p1', [await stageFixture('text-layer.pdf', 'policy.pdf')], workspace);
    await service.whenIdle('p1');

    expect(ocrPdfPagesImpl).not.toHaveBeenCalled();
    const { sources } = await service.listSources('p1');
    expect(sources[0]).toMatchObject({ status: 'ready', ocr: null });
  });

  it('resolves the transcription model once per run, not once per page or source', async () => {
    const resolveOcrModelImpl = vi.fn(async () => ({
      status: 'resolved' as const,
      config: { baseUrl: 'https://maas.example/v1', apiKey: 'sk-1', model: 'm' },
    }));
    const service = makeService({
      resolveOcrModelImpl: resolveOcrModelImpl as never,
      ocrPdfPagesImpl: (async () => ({
        pages: ['transcribed body text'],
        skippedPages: [],
        transcribedCount: 1,
        pageCount: 1,
        truncated: false,
      })) as never,
    });
    await service.addSources(
      'p1',
      [await stageFixture('ocr-flatbed.pdf', 'a.pdf'), await stageFixture('image-only.pdf', 'b.pdf')],
      workspace
    );
    await service.whenIdle('p1');
    // Two scans in one batch, one resolution — probing is a network round trip
    // per candidate and the answer cannot change mid-run.
    expect(resolveOcrModelImpl).toHaveBeenCalledTimes(1);
  });

  it('keeps a partly-transcribed scan ready and says which pages were skipped', async () => {
    const service = makeService({
      ocrPdfPagesImpl: (async () => ({
        pages: ['page one text', '', 'page three text'],
        skippedPages: [2],
        transcribedCount: 2,
        pageCount: 3,
        truncated: false,
      })) as never,
    });
    await service.addSources('p1', [await stageFixture('ocr-flatbed.pdf', 'mixed.pdf')], workspace);
    await service.whenIdle('p1');

    const { sources } = await service.listSources('p1');
    // Partial success stays a success: 2 of 3 pages indexed beats refusing all 3.
    expect(sources[0].status).toBe('ready');
    expect(sources[0].error).toMatch(/skipped 1 page\(s\): 2\./);
    expect(sources[0].ocr).toEqual({ model: 'google/gemma-4-31b-it', skippedPages: [2] });

    // The skipped page must leave a hole, not shift page 3 up to page 2 — a
    // citation pointing at the wrong page is worse than no citation.
    const converted = await readFile(path.join(storeDirOf('p1'), 'sources', sources[0].id, 'converted.md'), 'utf8');
    expect(converted).toContain('## Page 1');
    expect(converted).not.toContain('## Page 2');
    expect(converted).toContain('## Page 3');
  });

  it('fails a scan whose pages are all composites, and says why', async () => {
    const service = makeService({
      ocrPdfPagesImpl: (async () => ({
        pages: ['', ''],
        skippedPages: [1, 2],
        transcribedCount: 0,
        pageCount: 2,
        truncated: false,
      })) as never,
    });
    await service.addSources('p1', [await stageFixture('ocr-composite.pdf', 'deck.pdf')], workspace);
    await service.whenIdle('p1');

    const { sources } = await service.listSources('p1');
    expect(sources[0].status).toBe('failed');
    expect(sources[0].error).toMatch(/single full-page image/i);
    expect(sources[0].ocr).toBeNull(); // nothing was transcribed, so claim nothing
    expect(await readChunks(storeDirOf('p1'))).toEqual([]);
  });

  it('distinguishes an unreachable model from a document that cannot be transcribed', async () => {
    const service = makeService({
      ocrPdfPagesImpl: (async () => ({
        pages: ['', ''],
        skippedPages: [1, 2],
        transcribedCount: 0,
        pageCount: 2,
        truncated: false,
        lastError: 'the transcription model returned HTTP 503: upstream timeout',
      })) as never,
    });
    await service.addSources('p1', [await stageFixture('ocr-flatbed.pdf', 'scan.pdf')], workspace);
    await service.whenIdle('p1');

    const { sources } = await service.listSources('p1');
    expect(sources[0].status).toBe('failed');
    // Worth retrying, unlike a composite — so it must not read the same.
    expect(sources[0].error).toMatch(/HTTP 503/);
  });

  it('fails actionably when nothing on the provider can read images', async () => {
    const ocrPdfPagesImpl = vi.fn();
    const service = makeService({
      resolveOcrModelImpl: (async () => ({
        status: 'unavailable' as const,
        reason: 'none of the 38 model(s) on your configured provider(s) looks able to read images',
      })) as never,
      ocrPdfPagesImpl: ocrPdfPagesImpl as never,
    });
    await service.addSources('p1', [await stageFixture('ocr-flatbed.pdf', 'scan.pdf')], workspace);
    await service.whenIdle('p1');

    const { sources } = await service.listSources('p1');
    expect(sources[0].status).toBe('failed');
    expect(sources[0].error).toMatch(/looks able to read images/);
    expect(sources[0].error).toMatch(/provider settings/);
    expect(ocrPdfPagesImpl).not.toHaveBeenCalled(); // no point encoding pages
  });

  it('publishes transcribing progress per page and clears it when the source settles', async () => {
    const snapshots: Array<Record<string, unknown> | undefined> = [];
    const service = makeService({
      ocrPdfPagesImpl: (async (_data: unknown, _config: unknown, options: { onProgress?: Function }) => {
        await options.onProgress?.(1, 3);
        await options.onProgress?.(3, 3);
        return {
          pages: ['a', 'b', 'c'],
          skippedPages: [],
          transcribedCount: 3,
          pageCount: 3,
          truncated: false,
        };
      }) as never,
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
    await service.addSources('p1', [await stageFixture('ocr-flatbed.pdf', 'long-scan.pdf')], workspace);
    await service.whenIdle('p1');

    const progresses = snapshots.map((s) => s?.progress).filter(Boolean);
    // A 50-page scan holds the project's queue for minutes; a motionless
    // "Indexing…" tag for that long reads as a hang.
    expect(progresses).toContainEqual({ stage: 'transcribing', done: 1, total: 3 });
    expect(progresses).toContainEqual({ stage: 'transcribing', done: 3, total: 3 });
    const { sources } = await service.listSources('p1');
    expect(sources[0].progress).toBeNull();
  });

  it('records the page cap on a scan longer than the cap', async () => {
    const service = makeService({
      ocrPdfPagesImpl: (async () => ({
        pages: ['first page of a very long scan'],
        skippedPages: [],
        transcribedCount: 1,
        pageCount: 120,
        truncated: true,
      })) as never,
    });
    await service.addSources('p1', [await stageFixture('ocr-flatbed.pdf', 'long.pdf')], workspace);
    await service.whenIdle('p1');
    const { sources } = await service.listSources('p1');
    expect(sources[0].status).toBe('ready');
    expect(sources[0].error).toMatch(/Truncated to 50 pages\./);
  });

  it('passes the page cap down to the transcriber', async () => {
    const ocrPdfPagesImpl = vi.fn(async () => ({
      pages: ['body'],
      skippedPages: [],
      transcribedCount: 1,
      pageCount: 1,
      truncated: false,
    }));
    const service = makeService({ ocrPdfPagesImpl: ocrPdfPagesImpl as never });
    await service.addSources('p1', [await stageFixture('ocr-flatbed.pdf', 'scan.pdf')], workspace);
    await service.whenIdle('p1');
    expect(ocrPdfPagesImpl.mock.calls[0][2]).toMatchObject({ maxPages: 50 });
  });

  it('does not blame the knowledge folder when transcription throws', async () => {
    // The misleading-UI guard. A folder-level failure legitimately sets
    // `folderMissing` and leaves rows `indexing`; a model outage must NOT, or a
    // transient upstream error tells the user their documents have vanished.
    const service = makeService({
      ocrPdfPagesImpl: (async () => {
        throw new Error('socket hang up');
      }) as never,
    });
    await service.addSources('p1', [await stageFixture('ocr-flatbed.pdf', 'scan.pdf')], workspace);
    await service.whenIdle('p1');

    const result = await service.listSources('p1');
    expect(result.folderMissing).toBe(false);
    expect(result.sources[0].status).toBe('failed');
    expect(result.sources[0].error).toMatch(/socket hang up/);
    const manifest = await readManifest(storeDirOf('p1'));
    expect(manifest?.folderMissing).toBeUndefined();
  });

  it('drops stale transcription provenance when a source is re-ingested', async () => {
    // The reachable path is the one processPending already documents: a row left
    // `indexing` after a crash mid-ingest gets re-ingested by the next retry.
    // If that pass now finds a text layer, a leftover `ocr` marker would keep
    // telling the user this text came from a model when it did not.
    let scanned = true;
    const service = makeService({
      extractPdfTextImpl: (async () => ({
        pages: scanned ? [''] : ['a real text layer with plenty of readable words in it'],
        pageCount: 1,
        hasTextLayer: !scanned,
        truncated: false,
      })) as never,
      ocrPdfPagesImpl: (async () => ({
        pages: ['transcribed once'],
        skippedPages: [3],
        transcribedCount: 1,
        pageCount: 1,
        truncated: false,
      })) as never,
    });
    await service.addSources('p1', [await stageFixture('ocr-flatbed.pdf', 'scan.pdf')], workspace);
    await service.whenIdle('p1');
    const first = (await service.listSources('p1')).sources[0];
    expect(first.ocr).toMatchObject({ skippedPages: [3] });

    // Reproduce the crash-mid-ingest end state directly: provenance persisted,
    // status never settled.
    const manifest = await readManifest(storeDirOf('p1'));
    manifest!.sources[0].status = 'indexing';
    await writeManifest(storeDirOf('p1'), manifest!);

    scanned = false;
    await service.retrySource('p1', first.id, workspace);
    await service.whenIdle('p1');
    const after = (await service.listSources('p1')).sources[0];
    expect(after.status).toBe('ready');
    expect(after.ocr).toBeNull();
  });

  it('leaves a dot-folder inside the knowledge folder unindexed', async () => {
    // Guarding the self-indexing loop from the other side: anything the app
    // writes beside the user's files (a `.text/` cache, `.DS_Store`) must never
    // come back as a source row and be re-ingested.
    const knowledgeDir = path.join(workspace, KNOWLEDGE_FOLDER_NAME);
    mkdirSync(path.join(knowledgeDir, '.text'), { recursive: true });
    await writeFile(path.join(knowledgeDir, '.text', 'contract.pdf.md'), '# transcribed contract\n\nbody', 'utf8');
    await writeFile(path.join(knowledgeDir, '.DS_Store'), 'junk', 'utf8');
    await writeFile(path.join(knowledgeDir, 'real.md'), 'the only real knowledge file', 'utf8');

    const service = makeService();
    await service.syncFolder('p1', workspace);
    await service.whenIdle('p1');

    const { sources } = await service.listSources('p1');
    expect(sources.map((s) => s.fileName)).toEqual(['real.md']);
  });
});
