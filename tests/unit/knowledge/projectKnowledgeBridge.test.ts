/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

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
