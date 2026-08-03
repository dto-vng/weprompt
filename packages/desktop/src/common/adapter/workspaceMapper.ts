/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IDirOrFile, IWorkspaceFlatFile } from './ipcBridge';

type RawFsEntry = { name: string; type: string };
export type RawWorkspaceFlatFile = { name: string; full_path: string; relative_path: string };

/**
 * Wire shape of aioncore's `DirOrFileResponse` (the `/api/fs/dir` response).
 * Unlike `BrowseEntry`, this DTO is NOT `#[serde(rename_all = "camelCase")]`, so
 * it serializes with literal snake_case field names. `children` is omitted for
 * leaf nodes (serde `skip_serializing_if = "Option::is_none"`).
 */
export type RawDirOrFile = {
  name: string;
  full_path: string;
  relative_path: string;
  is_dir: boolean;
  is_file: boolean;
  children?: RawDirOrFile[];
};

// ── Path helpers ───────────────────────────────────────────────────────

function normalizeSlashes(p: string): string {
  return p.replace(/\\/g, '/');
}

function stripTrailingSlash(p: string): string {
  return p.replace(/\/+$/, '');
}

// ── Frontend → Backend ─────────────────────────────────────────────────

export function absoluteToRelativePath(absolutePath: string, workspace: string): string {
  if (!absolutePath || !workspace) return absolutePath || '.';
  const abs = stripTrailingSlash(normalizeSlashes(absolutePath));
  const ws = stripTrailingSlash(normalizeSlashes(workspace));
  if (abs === ws) return '.';
  if (abs.startsWith(ws + '/')) {
    return abs.slice(ws.length + 1) || '.';
  }
  return absolutePath;
}

// ── Backend → Frontend ─────────────────────────────────────────────────

export function fromBackendFsEntry(item: RawFsEntry, workspace: string, parentRelPath: string): IDirOrFile {
  const ws = stripTrailingSlash(workspace);
  const name = item.name || '';
  const isDir = item.type === 'directory';
  const relativePath = parentRelPath ? `${parentRelPath}/${name}` : name;
  return {
    name,
    fullPath: `${ws}/${relativePath}`,
    relativePath,
    isDir,
    isFile: !isDir,
  };
}

export function fromBackendWorkspaceList(raw: RawFsEntry[], workspace: string, relPath: string): IDirOrFile[] {
  const ws = stripTrailingSlash(workspace);
  const base = relPath === '.' ? '' : relPath;
  const children = raw.map((item) => fromBackendFsEntry(item, ws, base));

  if (relPath === '.' || !relPath) {
    const rootName = ws.split('/').pop() || '';
    return [
      {
        name: rootName,
        fullPath: ws,
        relativePath: '',
        isDir: true,
        isFile: false,
        children,
      },
    ];
  }

  const dirName = relPath.split('/').pop() || '';
  return [
    {
      name: dirName,
      fullPath: `${ws}/${relPath}`,
      relativePath: relPath,
      isDir: true,
      isFile: false,
      children,
    },
  ];
}

export function fromBackendWorkspaceFlatFiles(raw: RawWorkspaceFlatFile[]): IWorkspaceFlatFile[] {
  return raw.map((item) => ({
    name: item.name,
    fullPath: item.full_path,
    relativePath: item.relative_path,
  }));
}

/**
 * Maps one `/api/fs/dir` node (`DirOrFileResponse`) from the backend's
 * snake_case wire format into the camelCase `IDirOrFile` contract the renderer
 * consumes, recursing into `children`. Sibling of `fromBackendWorkspaceFlatFiles`
 * — without it, `.fullPath`/`.relativePath`/`.isDir`/`.isFile` read `undefined`
 * against a real backend. `children` stays absent for leaves (the backend omits
 * it), matching the optional field on `IDirOrFile`.
 */
export function fromBackendDirOrFile(item: RawDirOrFile): IDirOrFile {
  const mapped: IDirOrFile = {
    name: item.name,
    fullPath: item.full_path,
    relativePath: item.relative_path,
    isDir: item.is_dir,
    isFile: item.is_file,
  };
  if (Array.isArray(item.children)) {
    mapped.children = item.children.map(fromBackendDirOrFile);
  }
  return mapped;
}

export function fromBackendDirOrFiles(raw: RawDirOrFile[]): IDirOrFile[] {
  return raw.map(fromBackendDirOrFile);
}
