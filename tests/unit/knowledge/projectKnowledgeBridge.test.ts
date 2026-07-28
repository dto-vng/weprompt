/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nativeBridgePayloadSchemas } from '@/common/adapter/native/payloadSchemas';

const mocks = vi.hoisted(() => ({
  wordToMarkdown: vi.fn(async () => '# word'),
  excelToMarkdown: vi.fn(async () => '# excel'),
  httpRequest: vi.fn(async () => []),
  updatedEmit: vi.fn(),
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
