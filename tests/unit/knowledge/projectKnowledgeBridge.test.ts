/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NATIVE_BRIDGE_PROVIDER_KEYS } from '@/common/adapter/native/constants';
import { nativeBridgePayloadSchemas } from '@/common/adapter/native/payloadSchemas';

const mocks = vi.hoisted(() => ({
  wordToMarkdown: vi.fn(async () => '# word'),
  excelToMarkdown: vi.fn(async () => '# excel'),
  httpRequest: vi.fn(async () => []),
  updatedEmit: vi.fn(),
  trashItem: vi.fn(async () => {}),
}));

vi.mock('electron', () => ({
  shell: { trashItem: mocks.trashItem },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    projectKnowledge: {
      updated: { emit: mocks.updatedEmit },
    },
  },
}));

vi.mock('@/common/chat/document/DocumentConverter', () => ({
  documentConverter: {
    wordToMarkdown: mocks.wordToMarkdown,
    excelToMarkdown: mocks.excelToMarkdown,
  },
}));

vi.mock('@process/utils/initStorage', () => ({
  getProjectKbRootDir: () => '/tmp/kb-root',
  getBuiltinMcpScriptPath: (name: string) => `/out/main/${name}.js`,
}));

vi.mock('@/common/adapter/httpBridge', () => ({
  httpRequest: mocks.httpRequest,
}));

import { buildProjectKnowledgeDeps } from '@process/bridge/projectKnowledgeBridge';

describe('buildProjectKnowledgeDeps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes .docx buffers to wordToMarkdown and not excelToMarkdown', async () => {
    const deps = buildProjectKnowledgeDeps();
    const buffer = new ArrayBuffer(4);

    await expect(deps.convertToMarkdown(buffer, 'docx')).resolves.toBe('# word');

    expect(mocks.wordToMarkdown).toHaveBeenCalledWith(buffer);
    expect(mocks.excelToMarkdown).not.toHaveBeenCalled();
  });

  it('routes .xlsx buffers to excelToMarkdown and not wordToMarkdown', async () => {
    const deps = buildProjectKnowledgeDeps();
    const buffer = new ArrayBuffer(4);

    await expect(deps.convertToMarkdown(buffer, 'xlsx')).resolves.toBe('# excel');

    expect(mocks.excelToMarkdown).toHaveBeenCalledWith(buffer);
    expect(mocks.wordToMarkdown).not.toHaveBeenCalled();
  });

  it('wires storeRootDir and getServerScriptPath from initStorage', () => {
    const deps = buildProjectKnowledgeDeps();

    expect(deps.storeRootDir).toBe('/tmp/kb-root');
    expect(deps.getServerScriptPath()).toMatch(/builtin-mcp-knowledge\.js$/);
  });

  it('emits projectKnowledge.updated with the project id', () => {
    const deps = buildProjectKnowledgeDeps();

    deps.onUpdated('p1');

    expect(mocks.updatedEmit).toHaveBeenCalledWith({ projectId: 'p1' });
  });

  it('delegates listProviders to the shared httpRequest helper', async () => {
    const deps = buildProjectKnowledgeDeps();

    await deps.listProviders();

    expect(mocks.httpRequest).toHaveBeenCalledWith('GET', '/api/providers');
  });

  // Knowledge files belong to the user. Deleting one must be reversible, so
  // the dep has to reach Electron's Trash API — never fs.rm.
  it('routes trashItem to the OS Trash via electron shell', async () => {
    const deps = buildProjectKnowledgeDeps();

    await deps.trashItem!('/ws/alpha/Knowledge Base/doomed.md');

    expect(mocks.trashItem).toHaveBeenCalledWith('/ws/alpha/Knowledge Base/doomed.md');
  });
});

// Every project-knowledge channel must appear in BOTH the provider-key list
// and the payload schemas: a channel missing from either is dead at runtime
// with "operation is not allowed", and no unit test of the handler catches it.
describe('project-knowledge native bridge registration', () => {
  const channels = [
    'project-knowledge.list-sources',
    'project-knowledge.add-sources',
    'project-knowledge.remove-source',
    'project-knowledge.retry-source',
    'project-knowledge.sync-folder',
    'project-knowledge.watch-folder',
    'project-knowledge.unwatch-folder',
    'project-knowledge.get-source-text',
    'project-knowledge.remove-store',
    'project-knowledge.get-session-mcp-server',
  ] as const;

  it.each(channels)('%s is an allowed native provider key', (channel) => {
    expect(NATIVE_BRIDGE_PROVIDER_KEYS).toContain(channel);
  });

  it.each(channels)('%s has a payload schema', (channel) => {
    expect(nativeBridgePayloadSchemas[channel]).toBeDefined();
  });

  it('accepts a workspace path on the folder channels', () => {
    const payload = { projectId: 'p1', workspace: '/Users/me/Projects/alpha' };
    expect(nativeBridgePayloadSchemas['project-knowledge.sync-folder'].safeParse(payload).success).toBe(true);
    expect(nativeBridgePayloadSchemas['project-knowledge.watch-folder'].safeParse(payload).success).toBe(true);
  });

  it('rejects unknown keys on a folder payload', () => {
    const result = nativeBridgePayloadSchemas['project-knowledge.sync-folder'].safeParse({
      projectId: 'p1',
      workspace: '/ws',
      extra: 'nope',
    });
    expect(result.success).toBe(false);
  });
});

// projectId/sourceId are interpolated into filesystem paths in the main
// process (see projectKnowledgeService.ts's storeDirOf), so the native IPC
// schema must reject anything that could traverse or escape the store root.
describe('project-knowledge native schema hardening', () => {
  const removeStoreSchema = nativeBridgePayloadSchemas['project-knowledge.remove-store'];

  it('rejects a projectId containing path-traversal segments', () => {
    expect(removeStoreSchema.safeParse({ projectId: '../../etc' }).success).toBe(false);
  });

  it('accepts a real UUID-shaped projectId', () => {
    expect(removeStoreSchema.safeParse({ projectId: '3fa85f64-5717-4562-b3fc-2c963f66afa6' }).success).toBe(true);
  });

  it('rejects a projectId containing a path separator', () => {
    expect(removeStoreSchema.safeParse({ projectId: 'a/b' }).success).toBe(false);
  });
});
