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
import { createReadStream, type Dirent } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

export const SUPPORTED_KNOWLEDGE_EXTENSIONS = new Set(['md', 'txt', 'docx', 'xlsx', 'pdf']);

/**
 * Default ceiling. These formats are read and chunked IN FULL, so the file size
 * is a direct proxy for the work and the index growth they cause.
 */
export const MAX_KNOWLEDGE_FILE_BYTES = 15 * 1024 * 1024;

/**
 * PDFs get a much higher ceiling, because for them file size is a poor proxy
 * for cost: `MAX_PDF_PAGES` already bounds the work at 50 pages however long
 * the document is, and a scan runs 180-200 KB per page, so the default cap
 * rejected documents whose first 50 pages would have indexed fine. The
 * motivating case is a real 262-page, 51 MB scanned statement — the very
 * document that prompted PDF support — which the 15 MB cap refused outright.
 *
 * What this cap still protects is peak memory rather than throughput: the bytes
 * are held once by the caller and copied once more by pdfjs (which mutates the
 * buffer it is given), plus one decoded page raster of ~24 MB, so a file at this
 * ceiling costs roughly 225 MB transient in the main process. Hashing does NOT
 * add to that any more — it streams (see below).
 */
export const MAX_PDF_FILE_BYTES = 100 * 1024 * 1024;

/** The ceiling that applies to one file, by extension. */
export const maxBytesForFile = (fileName: string): number =>
  path.extname(fileName).slice(1).toLowerCase() === 'pdf' ? MAX_PDF_FILE_BYTES : MAX_KNOWLEDGE_FILE_BYTES;

export type KnowledgeScanEntry = {
  fileName: string;
  byteSize: number;
  /** `sha256:<hex>`, or `oversize:<byteSize>` for files beyond the cap (never read). */
  contentHash: string;
  kind: 'supported' | 'oversize';
  /**
   * Set only on `oversize`: the ceiling this file actually exceeded, so the
   * message shown to the user names the real number rather than a literal that
   * drifts once the caps differ by format.
   */
  limitBytes?: number;
};

export type KnowledgeFolderScan =
  | { ok: true; entries: KnowledgeScanEntry[]; unsupported: string[] }
  | { ok: false; reason: 'missing' | 'unreadable' };

/** Dotfiles (.DS_Store & friends) and `~$…` Office lock files. */
const isIgnoredName = (name: string): boolean => name.startsWith('.') || name.startsWith('~$');

/**
 * Hash a file without holding it in memory.
 *
 * Streamed rather than `readFile`d because this runs on EVERY sync — Project
 * Home mount, the card's Refresh, each watcher event, and every project-chat
 * creation — purely to diff against the manifest. Buffering a 100 MB PDF on
 * each of those would be a real memory spike for a hash we throw away, and the
 * PDF ceiling is what made that worth fixing.
 */
const hashFile = async (filePath: string): Promise<string> => {
  const hash = createHash('sha256');
  await pipeline(createReadStream(filePath), hash);
  return `sha256:${hash.digest('hex')}`;
};

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
    const limitBytes = maxBytesForFile(name);
    if (byteSize > limitBytes) {
      entries.push({ fileName: name, byteSize, contentHash: `oversize:${byteSize}`, kind: 'oversize', limitBytes });
      continue;
    }
    let contentHash: string;
    try {
      contentHash = await hashFile(fullPath);
    } catch {
      continue;
    }
    entries.push({ fileName: name, byteSize, contentHash, kind: 'supported' });
  }
  return { ok: true, entries, unsupported };
};
