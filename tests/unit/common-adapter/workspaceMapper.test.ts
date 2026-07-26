/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  fromBackendDirOrFile,
  fromBackendDirOrFiles,
  fromBackendWorkspaceFlatFiles,
  type RawDirOrFile,
  type RawWorkspaceFlatFile,
} from '@/common/adapter/workspaceMapper';

describe('workspaceMapper', () => {
  it('maps workspace flat files from backend snake_case to frontend camelCase', () => {
    const raw: RawWorkspaceFlatFile[] = [
      {
        name: 'main.ts',
        full_path: '/workspace/src/main.ts',
        relative_path: 'src/main.ts',
      },
    ];

    expect(fromBackendWorkspaceFlatFiles(raw)).toEqual([
      {
        name: 'main.ts',
        fullPath: '/workspace/src/main.ts',
        relativePath: 'src/main.ts',
      },
    ]);
  });

  it('does not leak snake_case path fields', () => {
    const [file] = fromBackendWorkspaceFlatFiles([
      {
        name: 'README.md',
        full_path: '/workspace/README.md',
        relative_path: 'README.md',
      },
    ]);

    expect(file).toBeDefined();
    expect((file as Record<string, unknown>).full_path).toBeUndefined();
    expect((file as Record<string, unknown>).relative_path).toBeUndefined();
    expect(file?.fullPath).toBe('/workspace/README.md');
    expect(file?.relativePath).toBe('README.md');
  });
});

describe('fromBackendDirOrFile', () => {
  // Mirrors the wire shape of AionCore's `DirOrFileResponse` (v0.1.43): snake_case
  // keys, directories first, `children` omitted for leaves. See
  // crates/aionui-api-types/src/file.rs and the /api/fs/dir e2e test.
  const backendTree: RawDirOrFile[] = [
    {
      name: 'src',
      full_path: '/workspace/src',
      relative_path: 'src',
      is_dir: true,
      is_file: false,
      children: [
        {
          name: 'main.ts',
          full_path: '/workspace/src/main.ts',
          relative_path: 'src/main.ts',
          is_dir: false,
          is_file: true,
        },
      ],
    },
    {
      name: 'README.md',
      full_path: '/workspace/README.md',
      relative_path: 'README.md',
      is_dir: false,
      is_file: true,
    },
  ];

  it('maps the directory tree from backend snake_case to frontend camelCase, recursing into children', () => {
    expect(fromBackendDirOrFiles(backendTree)).toEqual([
      {
        name: 'src',
        fullPath: '/workspace/src',
        relativePath: 'src',
        isDir: true,
        isFile: false,
        children: [
          {
            name: 'main.ts',
            fullPath: '/workspace/src/main.ts',
            relativePath: 'src/main.ts',
            isDir: false,
            isFile: true,
          },
        ],
      },
      {
        name: 'README.md',
        fullPath: '/workspace/README.md',
        relativePath: 'README.md',
        isDir: false,
        isFile: true,
      },
    ]);
  });

  it('does not leak snake_case fields, including in nested children', () => {
    const [dir] = fromBackendDirOrFiles(backendTree);
    const dirRecord = dir as unknown as Record<string, unknown>;
    expect(dirRecord.full_path).toBeUndefined();
    expect(dirRecord.relative_path).toBeUndefined();
    expect(dirRecord.is_dir).toBeUndefined();
    expect(dirRecord.is_file).toBeUndefined();
    expect(dir?.isDir).toBe(true);

    const child = dir?.children?.[0];
    const childRecord = child as unknown as Record<string, unknown>;
    expect(childRecord.full_path).toBeUndefined();
    expect(childRecord.is_file).toBeUndefined();
    expect(child?.isFile).toBe(true);
    expect(child?.fullPath).toBe('/workspace/src/main.ts');
  });

  it('omits children for leaf nodes (backend skips the field when empty)', () => {
    const leaf = fromBackendDirOrFile({
      name: 'README.md',
      full_path: '/workspace/README.md',
      relative_path: 'README.md',
      is_dir: false,
      is_file: true,
    });
    expect('children' in leaf).toBe(false);
  });
});
