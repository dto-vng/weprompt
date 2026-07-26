/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readChunks } from '@/common/knowledge/store';
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

describe('projectKnowledgeService lifecycle', () => {
  let root: string;
  let inbox: string;
  let embedMock: ReturnType<typeof vi.fn>;
  let providers: IProvider[];
  let service: ProjectKnowledgeService;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'kb-life-root-'));
    inbox = mkdtempSync(path.join(tmpdir(), 'kb-life-in-'));
    embedMock = vi.fn(async (texts: string[]) => texts.map(() => [0.5, 0.5]));
    providers = [EMBED_PROVIDER];
    service = createProjectKnowledgeService({
      storeRootDir: root,
      listProviders: async () => providers,
      embedTextsImpl: embedMock as never,
      convertToMarkdown: async () => '# converted',
      getServerScriptPath: () => '/out/main/builtin-mcp-knowledge.js',
      onUpdated: () => {},
    });
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(inbox, { recursive: true, force: true });
  });

  const seed = async (name: string, content: string): Promise<string> => {
    const p = path.join(inbox, name);
    await writeFile(p, content, 'utf8');
    await service.addSources('p1', [p]);
    await service.whenIdle('p1');
    const { sources } = await service.listSources('p1');
    return sources.find((s) => s.fileName === name)!.id;
  };

  it('removeSource drops chunks, vectors, snapshot dir, and manifest row', async () => {
    const keepId = await seed('keep.md', 'keep this content');
    const dropId = await seed('drop.md', 'drop this content');
    await service.removeSource('p1', dropId);
    await service.whenIdle('p1');
    const { sources } = await service.listSources('p1');
    expect(sources.map((s) => s.id)).toEqual([keepId]);
    const chunks = await readChunks(path.join(root, 'p1'));
    expect(chunks.every((c) => c.sourceId === keepId)).toBe(true);
    expect(existsSync(path.join(root, 'p1', 'sources', dropId))).toBe(false);
  });

  it('removeSource on an unknown id is a safe no-op', async () => {
    const keepId = await seed('keep.md', 'keep this content safe');
    const chunksBefore = await readChunks(path.join(root, 'p1'));
    await expect(service.removeSource('p1', 'does-not-exist')).resolves.toBeUndefined();
    await service.whenIdle('p1');
    const { sources } = await service.listSources('p1');
    expect(sources.map((s) => s.id)).toEqual([keepId]);
    const chunksAfter = await readChunks(path.join(root, 'p1'));
    expect(chunksAfter).toEqual(chunksBefore);
  });

  it('retrySource re-embeds a ready source with missing vectors', async () => {
    embedMock.mockRejectedValueOnce(new Error('down'));
    const id = await seed('a.md', 'alpha beta gamma');
    expect((await service.listSources('p1')).sources[0].vectorCount).toBe(0);
    await service.retrySource('p1', id);
    await service.whenIdle('p1');
    expect((await service.listSources('p1')).sources[0].vectorCount).toBeGreaterThan(0);
  });

  it('retrySource re-runs a failed source from its snapshot', async () => {
    let fail = true;
    const svc = createProjectKnowledgeService({
      storeRootDir: root,
      listProviders: async () => [],
      embedTextsImpl: embedMock as never,
      convertToMarkdown: async () => {
        if (fail) throw new Error('converter crashed');
        return '# ok now';
      },
      getServerScriptPath: () => '/x.js',
      onUpdated: () => {},
    });
    const p = path.join(inbox, 'spec.docx');
    await writeFile(p, 'binary');
    await svc.addSources('p2', [p]);
    await svc.whenIdle('p2');
    let list = await svc.listSources('p2');
    expect(list.sources[0].status).toBe('failed');
    fail = false;
    await svc.retrySource('p2', list.sources[0].id);
    await svc.whenIdle('p2');
    list = await svc.listSources('p2');
    expect(list.sources[0].status).toBe('ready');
  });

  it('retrySource on an unknown id is a safe no-op', async () => {
    const keepId = await seed('stay.md', 'this file must remain untouched');
    const before = await service.listSources('p1');
    await expect(service.retrySource('p1', 'does-not-exist')).resolves.toBeUndefined();
    await service.whenIdle('p1');
    const after = await service.listSources('p1');
    expect(after).toEqual(before);
    expect(after.sources.map((s) => s.id)).toEqual([keepId]);
  });

  it('removeStore deletes the whole project directory', async () => {
    await seed('a.md', 'content');
    expect(existsSync(path.join(root, 'p1'))).toBe(true);
    await service.removeStore('p1');
    expect(existsSync(path.join(root, 'p1'))).toBe(false);
  });

  describe('getSessionMcpServer', () => {
    it('returns null with no store or no ready sources', async () => {
      expect(await service.getSessionMcpServer('p1')).toBeNull();
      const p = path.join(inbox, 'bad.pdf');
      await writeFile(p, 'x');
      await service.addSources('p1', [p]);
      await service.whenIdle('p1');
      expect(await service.getSessionMcpServer('p1')).toBeNull();
    });

    it('builds a stdio session server with full embed env', async () => {
      await seed('a.md', 'searchable content here');
      const server = await service.getSessionMcpServer('p1');
      expect(server).toMatchObject({ id: 'project-kb-p1', name: 'aionui-project-knowledge' });
      expect(server!.transport).toEqual({
        type: 'stdio',
        command: 'node',
        args: ['/out/main/builtin-mcp-knowledge.js'],
        env: {
          AIONUI_KB_PROJECT_ID: 'p1',
          AIONUI_KB_STORE_DIR: path.join(root, 'p1'),
          AIONUI_KB_EMBED_BASE_URL: 'https://api.x.com/v1',
          AIONUI_KB_EMBED_API_KEY: 'sk-1',
          AIONUI_KB_EMBED_MODEL: 'text-embedding-3-small',
        },
      });
    });

    it('omits embed env when the pinned model is no longer resolvable', async () => {
      await seed('a.md', 'content');
      providers = []; // provider got deleted after indexing
      const server = await service.getSessionMcpServer('p1');
      expect(server).not.toBeNull();
      const env = (server!.transport as { env: Record<string, string> }).env;
      expect(env.AIONUI_KB_EMBED_BASE_URL).toBeUndefined();
      expect(env.AIONUI_KB_STORE_DIR).toBe(path.join(root, 'p1'));
    });
  });
});
