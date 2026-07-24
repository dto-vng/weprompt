/**
 * @vitest-environment node
 *
 * Guards the wiring of the `fs.*` ipcBridge bindings against the backend's
 * snake_case DTOs. `/api/fs/dir` (aioncore `DirOrFileResponse`, v0.1.43) puts
 * `full_path` / `relative_path` / `is_dir` / `is_file` on the wire, so the
 * binding MUST attach a snake_case→camelCase mapper — exactly like its sibling
 * `listWorkspaceFiles` does. This test fails if the mapper is ever dropped.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const httpBridgeMocks = vi.hoisted(() => {
  const responses = new Map<string, unknown>();
  const provider =
    (_method: string) =>
    <Data, Params = undefined>(
      path: string | ((params: Params) => string),
      _mapBody?: (params: Params) => unknown
    ) => ({
      provider: vi.fn(),
      invoke: vi.fn(async (params?: Params) => {
        const resolvedPath = typeof path === 'function' ? path(params as Params) : path;
        return responses.get(resolvedPath) as Data;
      }),
    });
  const emitter = () => ({ on: vi.fn(() => vi.fn()), emit: vi.fn() });

  return {
    responses,
    httpGet: provider('GET'),
    httpPost: provider('POST'),
    httpPut: provider('PUT'),
    httpPatch: provider('PATCH'),
    httpDelete: provider('DELETE'),
    httpRequest: vi.fn(),
    stubProvider: vi.fn((_name: string, defaultValue: unknown) => ({
      provider: vi.fn(),
      invoke: vi.fn(async () => defaultValue),
    })),
    // Real wiring: apply the map to the inner invoke's result, so a binding that
    // forgets to wrap with withResponseMap is caught by these tests.
    withResponseMap: vi.fn(
      (
        inner: { provider: unknown; invoke: (params?: unknown) => Promise<unknown> },
        map: (raw: unknown) => unknown
      ) => ({
        provider: inner.provider,
        invoke: vi.fn(async (params?: unknown) => map(await inner.invoke(params))),
      })
    ),
    wsEmitter: vi.fn(emitter),
    wsMappedEmitter: vi.fn(emitter),
    stubEmitter: vi.fn(emitter),
  };
});

vi.mock('@/common/adapter/httpBridge', () => httpBridgeMocks);

vi.mock('@office-ai/platform', () => ({
  bridge: {
    buildProvider: vi.fn(() => ({ provider: vi.fn(), invoke: vi.fn() })),
    buildEmitter: vi.fn(() => ({ on: vi.fn(() => vi.fn()), emit: vi.fn() })),
  },
}));

describe('ipcBridge fs adapter', () => {
  beforeEach(() => {
    httpBridgeMocks.responses.clear();
  });

  it('maps getFilesByDir snake_case wire data into the camelCase IDirOrFile contract', async () => {
    // Exactly the wire shape aioncore returns from POST /api/fs/dir: a flat
    // array of the direct children of `dir`, each recursively populated, with
    // snake_case keys and `children` omitted for leaves.
    httpBridgeMocks.responses.set('/api/fs/dir', [
      {
        name: 'src',
        full_path: '/ws/src',
        relative_path: 'src',
        is_dir: true,
        is_file: false,
        children: [
          {
            name: 'main.ts',
            full_path: '/ws/src/main.ts',
            relative_path: 'src/main.ts',
            is_dir: false,
            is_file: true,
          },
        ],
      },
      {
        name: 'README.md',
        full_path: '/ws/README.md',
        relative_path: 'README.md',
        is_dir: false,
        is_file: true,
      },
    ]);

    const { fs } = await import('@/common/adapter/ipcBridge');
    const result = await fs.getFilesByDir.invoke({ dir: '/ws', root: '/ws' });

    expect(result).toEqual([
      {
        name: 'src',
        fullPath: '/ws/src',
        relativePath: 'src',
        isDir: true,
        isFile: false,
        children: [
          {
            name: 'main.ts',
            fullPath: '/ws/src/main.ts',
            relativePath: 'src/main.ts',
            isDir: false,
            isFile: true,
          },
        ],
      },
      {
        name: 'README.md',
        fullPath: '/ws/README.md',
        relativePath: 'README.md',
        isDir: false,
        isFile: true,
      },
    ]);

    // The camelCase fields consumers read must be defined, not undefined.
    const topFile = result[1];
    expect(topFile.isFile).toBe(true);
    expect(topFile.fullPath).toBe('/ws/README.md');
    expect((topFile as unknown as Record<string, unknown>).is_file).toBeUndefined();
  });
});
