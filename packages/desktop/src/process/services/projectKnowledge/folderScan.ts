/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Reads the top level of a project's `Knowledge Base/` folder and classifies
// every entry, hashing supported files. Pure with respect to the manifest —
// the sync diff lives in projectKnowledgeService. A failed read is a distinct
// result, NEVER an empty listing: callers must treat `{ ok: false }` as
// "unknown", not "no files" (the missing-folder deletion guard depends on it).

import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const SUPPORTED_KNOWLEDGE_EXTENSIONS = new Set(['md', 'txt', 'docx', 'xlsx', 'pdf']);
export const MAX_KNOWLEDGE_FILE_BYTES = 15 * 1024 * 1024;

export type KnowledgeScanEntry = {
  fileName: string;
  byteSize: number;
  /** `sha256:<hex>`, or `oversize:<byteSize>` for files beyond the cap (never read). */
  contentHash: string;
  kind: 'supported' | 'oversize';
};

export type KnowledgeFolderScan =
  | { ok: true; entries: KnowledgeScanEntry[]; unsupported: string[] }
  | { ok: false; reason: 'missing' | 'unreadable' };

/** Dotfiles (.DS_Store & friends) and `~$…` Office lock files. */
const isIgnoredName = (name: string): boolean => name.startsWith('.') || name.startsWith('~$');

export const scanKnowledgeFolder = async (folderPath: string): Promise<KnowledgeFolderScan> => {
  let dirents: Dirent[];
  let resolvedFolder: string;
  try {
    dirents = await fs.readdir(folderPath, { withFileTypes: true });
    // realpath, not path.resolve: the folder itself may sit behind a symlink
    // (macOS /var → /private/var), and the containment check below compares
    // against the realpath of each link target.
    resolvedFolder = await fs.realpath(folderPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return { ok: false, reason: code === 'ENOENT' ? 'missing' : 'unreadable' };
  }
  const entries: KnowledgeScanEntry[] = [];
  const unsupported: string[] = [];
  for (const dirent of dirents) {
    const name = dirent.name;
    if (isIgnoredName(name)) continue;
    if (dirent.isDirectory()) continue; // v1: top-level files only, subfolders ignored
    const fullPath = path.join(folderPath, name);
    if (dirent.isSymbolicLink()) {
      // Containment: a link pointing outside the folder (e.g. ~/.ssh/…) must
      // never be indexed into prompts. Also skip links whose target is gone
      // or is not a regular file.
      let real: string;
      try {
        real = await fs.realpath(fullPath);
      } catch {
        continue;
      }
      if (!real.startsWith(resolvedFolder + path.sep)) continue;
      try {
        if (!(await fs.stat(fullPath)).isFile()) continue;
      } catch {
        continue;
      }
    } else if (!dirent.isFile()) {
      continue;
    }
    const extension = path.extname(name).slice(1).toLowerCase();
    if (!SUPPORTED_KNOWLEDGE_EXTENSIONS.has(extension)) {
      unsupported.push(name);
      continue;
    }
    let byteSize: number;
    try {
      byteSize = (await fs.stat(fullPath)).size;
    } catch {
      continue; // vanished mid-scan — the next sync sees the settled state
    }
    if (byteSize > MAX_KNOWLEDGE_FILE_BYTES) {
      entries.push({ fileName: name, byteSize, contentHash: `oversize:${byteSize}`, kind: 'oversize' });
      continue;
    }
    let buffer: Buffer;
    try {
      buffer = await fs.readFile(fullPath);
    } catch {
      continue;
    }
    entries.push({
      fileName: name,
      byteSize: buffer.byteLength,
      contentHash: `sha256:${createHash('sha256').update(buffer).digest('hex')}`,
      kind: 'supported',
    });
  }
  return { ok: true, entries, unsupported };
};
