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
import { readChunks, readManifest } from '@/common/knowledge/store';
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

  it('listSources returns empty result for an unknown project', async () => {
    expect(await service.listSources('nope')).toEqual({
      sources: [],
      summary: { fileCount: 0, passageCount: 0, semantic: 'off' },
    });
  });
});
