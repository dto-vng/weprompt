/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// On-disk store for one project's knowledge base. This layout is the frozen
// "path B" seam (see the design spec): a future AionCore-native engine reads
// the same directory. Node-side only (main process + the knowledge MCP
// subprocess) — never import from renderer runtime code.

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Bm25Index, KnowledgeChunk, KnowledgeManifest } from './types';

// Join a caller-supplied segment onto a directory, refusing anything that does
// not land strictly inside it. Mirrors storeDirOf in projectKnowledgeService:
// ids reaching this layer are already constrained by the native IPC schema, but
// main-process callers need not come through it, and the directory this builds
// gets removed recursively when a source is dropped.
const resolveChild = (parentDir: string, segment: string, label: string): string => {
  const resolvedParent = path.resolve(parentDir);
  const target = path.resolve(resolvedParent, segment);
  if (!target.startsWith(resolvedParent + path.sep)) {
    throw new Error(`Invalid ${label}: ${segment}`);
  }
  return target;
};

// Every path below is a literal segment joined onto storeDir except sourceDir,
// which is the one helper taking caller-supplied input — so it is the one that
// needs the guard. storeDir itself is the caller's to validate (storeDirOf).
export const storePaths = (storeDir: string) => ({
  sourcesDir: path.join(storeDir, 'sources'),
  sourceDir: (sourceId: string) => resolveChild(path.join(storeDir, 'sources'), sourceId, 'source id'),
  indexDir: path.join(storeDir, 'index'),
  chunksFile: path.join(storeDir, 'index', 'chunks.json'),
  bm25File: path.join(storeDir, 'index', 'bm25.json'),
  vectorsFile: path.join(storeDir, 'index', 'vectors.bin'),
  vectorsMetaFile: path.join(storeDir, 'index', 'vectors.meta.json'),
  manifestFile: path.join(storeDir, 'manifest.json'),
});

export const createEmptyManifest = (projectId: string): KnowledgeManifest => ({
  schemaVersion: 1,
  projectId,
  embedding: null,
  sources: [],
});

const readJson = async <T>(file: string): Promise<T | null> => {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return null;
  }
};

// Write to a temp sibling then rename, so a crash mid-write never leaves a
// truncated JSON file behind.
const writeFileAtomic = async (file: string, data: string | Uint8Array): Promise<void> => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, file);
};

export const readManifest = (storeDir: string): Promise<KnowledgeManifest | null> =>
  readJson<KnowledgeManifest>(storePaths(storeDir).manifestFile);

export const writeManifest = (storeDir: string, manifest: KnowledgeManifest): Promise<void> =>
  writeFileAtomic(storePaths(storeDir).manifestFile, JSON.stringify(manifest, null, 2));

export const readChunks = async (storeDir: string): Promise<KnowledgeChunk[]> =>
  (await readJson<KnowledgeChunk[]>(storePaths(storeDir).chunksFile)) ?? [];

export const writeChunks = (storeDir: string, chunks: KnowledgeChunk[]): Promise<void> =>
  writeFileAtomic(storePaths(storeDir).chunksFile, JSON.stringify(chunks));

export const readBm25 = (storeDir: string): Promise<Bm25Index | null> =>
  readJson<Bm25Index>(storePaths(storeDir).bm25File);

export const writeBm25 = (storeDir: string, index: Bm25Index): Promise<void> =>
  writeFileAtomic(storePaths(storeDir).bm25File, JSON.stringify(index));

export type KnowledgeVectors = { dim: number; rows: Map<string, Float32Array> };

export const readVectors = async (storeDir: string): Promise<KnowledgeVectors | null> => {
  const paths = storePaths(storeDir);
  const meta = await readJson<{ dim: number; rowChunkIds: string[]; checksum: string }>(paths.vectorsMetaFile);
  if (!meta || meta.dim <= 0) return null;
  let raw: Buffer;
  try {
    raw = await fs.readFile(paths.vectorsFile);
  } catch {
    return null;
  }
  const expected = meta.rowChunkIds.length * meta.dim * 4;
  if (raw.byteLength !== expected) return null; // corrupt — caller treats as no vectors
  if (!meta.checksum || createHash('sha256').update(raw).digest('hex') !== meta.checksum) return null; // torn pair — bin/meta from different writes
  const rows = new Map<string, Float32Array>();
  meta.rowChunkIds.forEach((chunkId, i) => {
    const offset = raw.byteOffset + i * meta.dim * 4;
    rows.set(chunkId, new Float32Array(raw.buffer.slice(offset, offset + meta.dim * 4)));
  });
  return { dim: meta.dim, rows };
};

export const writeVectors = async (
  storeDir: string,
  dim: number,
  rows: Array<[string, Float32Array]>
): Promise<void> => {
  const paths = storePaths(storeDir);
  const buf = Buffer.alloc(rows.length * dim * 4);
  rows.forEach(([id, vec], i) => {
    if (vec.length !== dim) {
      throw new Error(`Vector for ${id} has length ${vec.length}, expected ${dim}`);
    }
    Buffer.from(vec.buffer, vec.byteOffset, dim * 4).copy(buf, i * dim * 4);
  });
  const checksum = createHash('sha256').update(buf).digest('hex');
  await writeFileAtomic(paths.vectorsFile, buf);
  await writeFileAtomic(paths.vectorsMetaFile, JSON.stringify({ dim, rowChunkIds: rows.map(([id]) => id), checksum }));
};
