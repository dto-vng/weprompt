/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IDirOrFile } from '@/common/adapter/ipcBridge';
import { loadProjectFiles, toggleExpandedKey } from '@renderer/pages/project/hooks/useProjectFiles';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      getFilesByDir: {
        invoke: vi.fn(),
      },
    },
  },
}));

const invoke = vi.mocked(ipcBridge.fs.getFilesByDir.invoke);

const fixtureTree: IDirOrFile[] = [
  {
    name: 'src',
    fullPath: '/w/alpha/src',
    relativePath: 'src',
    isDir: true,
    isFile: false,
    children: [
      {
        name: 'index.ts',
        fullPath: '/w/alpha/src/index.ts',
        relativePath: 'src/index.ts',
        isDir: false,
        isFile: true,
      },
    ],
  },
  {
    name: 'README.md',
    fullPath: '/w/alpha/README.md',
    relativePath: 'README.md',
    isDir: false,
    isFile: true,
  },
];

describe('loadProjectFiles', () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it('resolves the recursive tree returned by getFilesByDir', async () => {
    invoke.mockResolvedValue(fixtureTree);

    const result = await loadProjectFiles('/w/alpha');

    expect(invoke).toHaveBeenCalledExactlyOnceWith({ dir: '/w/alpha', root: '/w/alpha' });
    // Normalization rebuilds every node into a new object, so the result is no
    // longer the same reference as the fixture — compare by value instead.
    expect(result).toEqual(fixtureTree);
  });

  it('normalizes a snake_case response into the camelCase IDirOrFile shape', async () => {
    const snakeCaseFixture = [
      { name: 'a.ts', full_path: '/w/a.ts', relative_path: 'a.ts', is_dir: false, is_file: true },
    ];
    invoke.mockResolvedValue(snakeCaseFixture as unknown as IDirOrFile[]);

    const result = await loadProjectFiles('/w/snake');

    expect(result).toEqual([{ name: 'a.ts', fullPath: '/w/a.ts', relativePath: 'a.ts', isDir: false, isFile: true }]);
    expect(result[0].isFile).toBe(true);
    expect(result[0].relativePath).toBe('a.ts');
    expect(result[0].fullPath).toBe('/w/a.ts');
  });

  it('resolves an empty array for a valid, empty workspace folder', async () => {
    invoke.mockResolvedValue([]);

    await expect(loadProjectFiles('/w/empty')).resolves.toEqual([]);
  });

  it('rejects when getFilesByDir rejects (missing/unreadable folder)', async () => {
    invoke.mockRejectedValue(new Error('ENOENT'));

    await expect(loadProjectFiles('/w/missing')).rejects.toThrow('ENOENT');
  });

  it('rejects when the resolved response is not an array', async () => {
    invoke.mockResolvedValue(undefined as unknown as IDirOrFile[]);

    await expect(loadProjectFiles('/w/alpha')).rejects.toThrow('PROJECT_FILES_INVALID_RESPONSE');
  });
});

describe('toggleExpandedKey', () => {
  it('adds the key when it is absent', () => {
    expect(toggleExpandedKey([], 'src')).toEqual(['src']);
    expect(toggleExpandedKey(['docs'], 'src')).toEqual(['docs', 'src']);
  });

  it('removes the key when it is present', () => {
    expect(toggleExpandedKey(['docs', 'src'], 'src')).toEqual(['docs']);
  });

  it('does not mutate the input array', () => {
    const input = ['docs'];

    toggleExpandedKey(input, 'src');

    expect(input).toEqual(['docs']);
  });
});
