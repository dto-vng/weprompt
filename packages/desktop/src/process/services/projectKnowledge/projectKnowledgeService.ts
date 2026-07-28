/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Main-process owner of per-project knowledge stores: registration + ingestion
// pipeline (snapshot → convert → chunk → BM25 → embed), listing, removal,
// retry, and the per-conversation session-MCP descriptor. All work for one
// project is serialized on a promise-chain queue.

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ISessionMcpServer, IProvider } from '@/common/config/storage';
import type { IKnowledgeSourceDto, IProjectKnowledgeListResult } from '@/common/types/project/knowledgeTypes';
import { chunkMarkdown } from '@/common/knowledge/chunker';
import { buildBm25Index } from '@/common/knowledge/bm25';
import { EMBED_BATCH_SIZE, embedTexts as defaultEmbedTexts, type EmbedConfig } from '@/common/knowledge/embedCore';
import { KB_ENV } from '@/common/knowledge/envKeys';
import { extractPdfText as defaultExtractPdfText, renderPagesAsMarkdown } from '@/common/knowledge/pdfExtract';
import {
  createEmptyManifest,
  readChunks,
  readManifest,
  readVectors,
  storePaths,
  writeBm25,
  writeChunks,
  writeManifest,
  writeVectors,
} from '@/common/knowledge/store';
import type {
  KnowledgeChunk,
  KnowledgeIngestProgress,
  KnowledgeManifest,
  KnowledgeManifestSource,
} from '@/common/knowledge/types';
import { pickEmbeddingModel, resolveEmbedConfigForModel } from './embedProviderPicker';
import { BUILTIN_KNOWLEDGE_NAME } from '../../resources/builtinMcp/constants';

const SUPPORTED_EXTENSIONS = new Set(['md', 'txt', 'docx', 'xlsx', 'pdf']);
const CONVERTED_EXTENSIONS = new Set(['docx', 'xlsx']);
const SUPPORTED_EXTENSIONS_HINT = 'Supported: .md, .txt, .docx, .xlsx, .pdf';
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_CHUNKS_PER_SOURCE = 2000;
/**
 * Pages read from one PDF. Ingestion is serialized per project, so an
 * unbounded document would hold the queue and every file behind it. Beyond
 * the cap the source truncates and stays `ready`, matching the
 * MAX_CHUNKS_PER_SOURCE convention.
 */
const MAX_PDF_PAGES = 50;

/**
 * A PDF whose text layer is empty is a scan, which needs OCR we do not have.
 * Fail it explicitly: silently indexing zero passages would leave the user
 * with a `ready` source that never matches anything.
 */
const SCANNED_PDF_ERROR =
  'This PDF has no text layer, so it looks like a scan. Reading scanned PDFs (OCR) is not supported yet.';

export type ProjectKnowledgeServiceDeps = {
  storeRootDir: string;
  listProviders: () => Promise<IProvider[]>;
  /** Convert a .docx/.xlsx buffer to markdown (DocumentConverter in prod). */
  convertToMarkdown: (buffer: ArrayBuffer, extension: 'docx' | 'xlsx') => Promise<string>;
  embedTextsImpl?: typeof defaultEmbedTexts;
  /** Injectable so tests can drive PDF ingestion without a real parser. */
  extractPdfTextImpl?: typeof defaultExtractPdfText;
  getServerScriptPath: () => string;
  onUpdated: (projectId: string) => void;
};

export type ProjectKnowledgeService = {
  listSources: (projectId: string) => Promise<IProjectKnowledgeListResult>;
  addSources: (projectId: string, filePaths: string[]) => Promise<void>;
  removeSource: (projectId: string, sourceId: string) => Promise<void>;
  retrySource: (projectId: string, sourceId: string) => Promise<void>;
  removeStore: (projectId: string) => Promise<void>;
  getSessionMcpServer: (projectId: string) => Promise<ISessionMcpServer | null>;
  /** Resolves when all queued work for the project has finished (tests). */
  whenIdle: (projectId: string) => Promise<void>;
};

/**
 * Recompute each source's vector count from the chunk table, and while a
 * source is still partly unembedded expose that as embedding progress. Only
 * sources that own chunks take part; the rest are untouched by this pass.
 */
const syncEmbedCounts = (manifest: KnowledgeManifest, chunks: KnowledgeChunk[]): void => {
  for (const source of manifest.sources) {
    const own = chunks.filter((c) => c.sourceId === source.id);
    if (own.length === 0) continue;
    const embedded = own.filter((c) => c.hasVector).length;
    source.vectorCount = embedded;
    if (embedded < own.length) source.progress = { stage: 'embedding', done: embedded, total: own.length };
    else delete source.progress;
  }
};

/** Drop every in-flight marker. Returns true when anything was actually cleared. */
const clearIngestProgress = (manifest: KnowledgeManifest): boolean => {
  let cleared = false;
  for (const source of manifest.sources) {
    if (source.progress) {
      delete source.progress;
      cleared = true;
    }
  }
  return cleared;
};

const toDto = (source: KnowledgeManifestSource): IKnowledgeSourceDto => ({
  id: source.id,
  fileName: source.fileName,
  byteSize: source.byteSize,
  status: source.status,
  chunkCount: source.chunkCount,
  vectorCount: source.vectorCount,
  addedAt: source.addedAt,
  error: source.error,
  progress: source.progress ?? null,
});

export const createProjectKnowledgeService = (deps: ProjectKnowledgeServiceDeps): ProjectKnowledgeService => {
  const embedTexts = deps.embedTextsImpl ?? defaultEmbedTexts;
  const extractPdfText = deps.extractPdfTextImpl ?? defaultExtractPdfText;
  const queues = new Map<string, Promise<void>>();

  const storeDirOf = (projectId: string): string => {
    const resolvedRoot = path.resolve(deps.storeRootDir);
    const target = path.resolve(resolvedRoot, projectId);
    // Guard against a projectId containing traversal segments: every store path
    // must stay strictly inside the configured root.
    if (!target.startsWith(resolvedRoot + path.sep)) {
      throw new Error(`Invalid project id: ${projectId}`);
    }
    return target;
  };

  /** Serialize work per project; returns the enqueued job's promise. */
  const enqueue = <T>(projectId: string, job: () => Promise<T>): Promise<T> => {
    const prev = queues.get(projectId) ?? Promise.resolve();
    const run = prev.then(job, job);
    queues.set(
      projectId,
      run.then(
        (): undefined => undefined,
        (): undefined => undefined
      )
    );
    return run;
  };

  const loadManifest = async (projectId: string): Promise<KnowledgeManifest> =>
    (await readManifest(storeDirOf(projectId))) ?? createEmptyManifest(projectId);

  const saveManifest = async (projectId: string, manifest: KnowledgeManifest): Promise<void> => {
    await writeManifest(storeDirOf(projectId), manifest);
    deps.onUpdated(projectId);
  };

  /**
   * Publish a source's position within the stage it is in. Writing the
   * manifest is what makes it visible: `saveManifest` emits `onUpdated`, and
   * the card refetches on that push. Reporting failures are swallowed by
   * callers — losing a progress tick must never abort the ingestion itself.
   */
  const reportProgress = async (
    projectId: string,
    manifest: KnowledgeManifest,
    source: KnowledgeManifestSource,
    progress: KnowledgeIngestProgress
  ): Promise<void> => {
    source.progress = progress;
    await saveManifest(projectId, manifest);
  };

  const listSources = async (projectId: string): Promise<IProjectKnowledgeListResult> => {
    const manifest = await loadManifest(projectId);
    const sources = manifest.sources.map(toDto);
    return {
      sources,
      summary: {
        fileCount: sources.length,
        passageCount: sources.reduce((sum, s) => sum + s.chunkCount, 0),
        semantic: manifest.embedding && sources.some((s) => s.vectorCount > 0) ? 'on' : 'off',
      },
    };
  };

  /** Drop a source's chunks/vectors/files; caller persists the manifest. */
  const removeSourceRows = async (projectId: string, manifest: KnowledgeManifest, sourceId: string): Promise<void> => {
    const storeDir = storeDirOf(projectId);
    const remaining = (await readChunks(storeDir)).filter((c) => c.sourceId !== sourceId);
    await writeChunks(storeDir, remaining);
    await writeBm25(storeDir, buildBm25Index(remaining));
    const vectors = await readVectors(storeDir);
    if (vectors) {
      // Membership in `remaining` (surviving chunk ids) is the only thing that
      // determines whether a vector row is kept — NOT the chunk's own
      // hasVector flag. That flag can lag reality (e.g. writeVectors below
      // succeeds but a later writeChunks fails inside embedMissingVectors's
      // best-effort try/catch, leaving chunks.json stale). Trusting it here
      // would silently delete valid vectors belonging to an untouched source.
      const rows = [...vectors.rows.entries()].filter(([chunkId]) => remaining.some((c) => c.chunkId === chunkId));
      await writeVectors(storeDir, vectors.dim, rows);
    }
    await fs.rm(storePaths(storeDir).sourceDir(sourceId), { recursive: true, force: true });
    manifest.sources = manifest.sources.filter((s) => s.id !== sourceId);
  };

  /** Register new sources (visible immediately as indexing/unsupported/failed). */
  const registerSources = async (projectId: string, filePaths: string[]): Promise<void> => {
    const storeDir = storeDirOf(projectId);
    const manifest = await loadManifest(projectId);
    for (const filePath of filePaths) {
      const fileName = path.basename(filePath);
      const extension = path.extname(fileName).slice(1).toLowerCase();
      const addedAt = Date.now();
      const baseSource: KnowledgeManifestSource = {
        id: '',
        fileName,
        contentHash: '',
        byteSize: 0,
        status: 'indexing',
        chunkCount: 0,
        vectorCount: 0,
        addedAt,
        error: null,
      };
      if (!SUPPORTED_EXTENSIONS.has(extension)) {
        manifest.sources.push({
          ...baseSource,
          id: `unsupported-${addedAt}-${manifest.sources.length}`,
          status: 'unsupported',
          error: `Unsupported file type. ${SUPPORTED_EXTENSIONS_HINT}`,
        });
        continue;
      }
      let buffer: Buffer;
      try {
        buffer = await fs.readFile(filePath);
      } catch {
        manifest.sources.push({
          ...baseSource,
          id: `failed-${addedAt}-${manifest.sources.length}`,
          status: 'failed',
          error: 'Could not read the file.',
        });
        continue;
      }
      if (buffer.byteLength > MAX_FILE_BYTES) {
        manifest.sources.push({
          ...baseSource,
          id: `failed-${addedAt}-${manifest.sources.length}`,
          byteSize: buffer.byteLength,
          status: 'failed',
          error: 'File exceeds the 15 MB limit.',
        });
        continue;
      }
      const contentHash = `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
      const existingSameHash = manifest.sources.find((s) => s.contentHash === contentHash);
      if (existingSameHash) {
        if (existingSameHash.status !== 'failed') continue; // unchanged re-add — no-op
        // A previous ingestion of this exact content failed. The source id is derived
        // from the content hash, so pushing a new row would duplicate the id — reuse
        // the existing row and queue another attempt instead. Re-write the snapshot in
        // case it was lost, then let processPending pick it up.
        const retryDir = storePaths(storeDir).sourceDir(existingSameHash.id);
        await fs.mkdir(retryDir, { recursive: true });
        await fs.writeFile(path.join(retryDir, `original.${extension}`), buffer);
        existingSameHash.status = 'indexing';
        existingSameHash.error = null;
        continue;
      }
      const sourceId = contentHash.slice(7, 19);
      const previous = manifest.sources.find(
        (s) => s.fileName === fileName && s.contentHash && s.contentHash !== contentHash
      );
      if (previous) await removeSourceRows(projectId, manifest, previous.id);
      const sourceDir = storePaths(storeDir).sourceDir(sourceId);
      await fs.mkdir(sourceDir, { recursive: true });
      await fs.writeFile(path.join(sourceDir, `original.${extension}`), buffer);
      manifest.sources.push({ ...baseSource, id: sourceId, contentHash, byteSize: buffer.byteLength });
    }
    await saveManifest(projectId, manifest);
  };

  const embedMissingVectors = async (projectId: string, manifest: KnowledgeManifest): Promise<KnowledgeManifest> => {
    const storeDir = storeDirOf(projectId);
    const chunks = await readChunks(storeDir);
    const missing = chunks.filter((c) => !c.hasVector);
    if (missing.length === 0) return manifest;
    try {
      const providers = await deps.listProviders();
      let model = manifest.embedding?.model ?? null;
      if (!model) model = pickEmbeddingModel(providers)?.model ?? null;
      if (!model) {
        // Expected whenever the user has no embedding-capable model configured.
        // Logged because it is otherwise indistinguishable from a failed embed:
        // both leave the source ready with vectorCount 0.
        console.info(
          `[projectKnowledge] no embedding-capable model among ${providers.length} provider(s); indexing ${missing.length} chunk(s) BM25-only`
        );
        return manifest;
      }
      const config = resolveEmbedConfigForModel(providers, model);
      if (!config) {
        console.info(
          `[projectKnowledge] embedding model "${model}" is no longer resolvable to a configured provider; staying BM25-only`
        );
        return manifest;
      }
      // Read the existing rows once; the loop below appends to this array and
      // rewrites the file after every batch, so a failure part-way through
      // keeps everything embedded so far and Retry resumes from there.
      let rows: Array<[string, Float32Array]> | null = null;
      for (let start = 0; start < missing.length; start += EMBED_BATCH_SIZE) {
        const batch = missing.slice(start, start + EMBED_BATCH_SIZE);
        const vectors = await embedTexts(
          batch.map((c) => c.text),
          config
        );
        const dim = vectors[0]?.length ?? 0;
        if (dim === 0) break;
        // Captured into a local const (rather than repeatedly re-reading
        // manifest.embedding) so the non-null value survives the awaits below.
        // Not assigned onto manifest.embedding until writeVectors below actually
        // succeeds — otherwise a throw from writeVectors (e.g. a provider
        // returning inconsistent per-row dimensions) would pin a model on the
        // manifest despite zero vectors ever having been persisted.
        const embedding = manifest.embedding ?? { model, dim };
        if (rows === null) {
          const existing = await readVectors(storeDir);
          rows = existing && existing.dim === embedding.dim ? [...existing.rows.entries()] : [];
        }
        batch.forEach((chunk, i) => {
          rows!.push([chunk.chunkId, Float32Array.from(vectors[i])]);
          chunk.hasVector = true;
        });
        await writeVectors(storeDir, embedding.dim, rows);
        manifest.embedding = embedding;
        await writeChunks(storeDir, chunks);
        syncEmbedCounts(manifest, chunks);
        await saveManifest(projectId, manifest);
      }
    } catch (error) {
      // Embedding is best-effort: sources stay ready with vectorCount < chunkCount.
      // Log it — a silent failure here is indistinguishable from "no embedding
      // model configured", which made a real ingest problem hard to diagnose.
      console.warn(
        `[projectKnowledge] embedding pass failed for project ${projectId}; sources stay searchable BM25-only:`,
        error instanceof Error ? error.message : error
      );
    } finally {
      // Whether the pass completed, gave up, or threw, nothing is in flight
      // any more — a source left showing "Embedding 64/200" would never move.
      if (clearIngestProgress(manifest)) await saveManifest(projectId, manifest);
    }
    return manifest;
  };

  /** Index all sources currently in `indexing` state, then run the embed pass. */
  const processPending = async (projectId: string): Promise<void> => {
    const storeDir = storeDirOf(projectId);
    let manifest = await loadManifest(projectId);
    const pending = manifest.sources.filter((s) => s.status === 'indexing');
    for (const source of pending) {
      try {
        const extension = path.extname(source.fileName).slice(1).toLowerCase();
        const originalPath = path.join(storePaths(storeDir).sourceDir(source.id), `original.${extension}`);
        const buffer = await fs.readFile(originalPath);
        // Non-fatal notes accumulated while converting; a source can hit more
        // than one cap (e.g. a long PDF that is also chunk-capped).
        const notes: string[] = [];
        let markdown: string;
        if (extension === 'pdf') {
          // PDFs get their own branch rather than joining CONVERTED_EXTENSIONS:
          // convertToMarkdown's (buffer, 'docx' | 'xlsx') shape has nowhere to
          // carry a page cap or report per-page progress.
          const extraction = await extractPdfText(buffer, {
            maxPages: MAX_PDF_PAGES,
            onProgress: (done, total) =>
              reportProgress(projectId, manifest, source, { stage: 'reading', done, total }).catch(
                (): undefined => undefined
              ),
          });
          if (!extraction.hasTextLayer) throw new Error(SCANNED_PDF_ERROR);
          if (extraction.truncated) notes.push(`Truncated to ${MAX_PDF_PAGES} pages.`);
          markdown = renderPagesAsMarkdown(extraction.pages);
        } else if (CONVERTED_EXTENSIONS.has(extension)) {
          markdown = await deps.convertToMarkdown(
            buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
            extension as 'docx' | 'xlsx'
          );
        } else {
          markdown = buffer.toString('utf8');
        }
        await fs.writeFile(path.join(storePaths(storeDir).sourceDir(source.id), 'converted.md'), markdown, 'utf8');
        let raw = chunkMarkdown(markdown);
        if (raw.length > MAX_CHUNKS_PER_SOURCE) {
          raw = raw.slice(0, MAX_CHUNKS_PER_SOURCE);
          notes.push(`Truncated to ${MAX_CHUNKS_PER_SOURCE} passages.`);
        }
        const newChunks: KnowledgeChunk[] = raw.map((c, i) => ({
          chunkId: `${source.id}#${i}`,
          sourceId: source.id,
          chunkIndex: i,
          text: c.text,
          headingPath: c.headingPath,
          hasVector: false,
        }));
        const others = (await readChunks(storeDir)).filter((c) => c.sourceId !== source.id);
        const all = [...others, ...newChunks];
        await writeChunks(storeDir, all);
        await writeBm25(storeDir, buildBm25Index(all));
        source.status = 'ready';
        source.chunkCount = newChunks.length;
        source.error = notes.length > 0 ? notes.join(' ') : null;
      } catch (error) {
        source.status = 'failed';
        source.error = error instanceof Error ? error.message : 'Indexing failed.';
      }
      // The source has settled either way — drop any half-finished reading tick
      // so the card stops showing a stale "Reading page 12/50".
      delete source.progress;
      await saveManifest(projectId, manifest);
    }
    manifest = await embedMissingVectors(projectId, manifest);
    await saveManifest(projectId, manifest);
  };

  const addSources = async (projectId: string, filePaths: string[]): Promise<void> => {
    const registered = enqueue(projectId, () => registerSources(projectId, filePaths));
    void enqueue(projectId, () => processPending(projectId));
    await registered;
  };

  const removeSource = async (projectId: string, sourceId: string): Promise<void> =>
    enqueue(projectId, async () => {
      const manifest = await loadManifest(projectId);
      if (!manifest.sources.some((s) => s.id === sourceId)) return;
      await removeSourceRows(projectId, manifest, sourceId);
      await saveManifest(projectId, manifest);
    });

  /**
   * Retry one failed source. Dual purpose, both parts load-bearing: the guard
   * flips only `sourceId` back to `indexing` when it's `failed`, but the
   * trailing `processPending` call is unconditional and re-scans EVERY
   * `indexing` row in the project — that's also what rescues a row left
   * stuck in `indexing` after a crash mid-ingest, since there is no other
   * recovery path for that case.
   */
  const retrySource = async (projectId: string, sourceId: string): Promise<void> =>
    enqueue(projectId, async () => {
      const manifest = await loadManifest(projectId);
      const source = manifest.sources.find((s) => s.id === sourceId);
      if (!source) return;
      if (source.status === 'failed' && source.contentHash) {
        source.status = 'indexing';
        source.error = null;
        await saveManifest(projectId, manifest);
      }
      await processPending(projectId);
    });

  const removeStore = async (projectId: string): Promise<void> =>
    enqueue(projectId, async () => {
      await fs.rm(storeDirOf(projectId), { recursive: true, force: true });
      deps.onUpdated(projectId);
    });

  const getSessionMcpServer = async (projectId: string): Promise<ISessionMcpServer | null> => {
    const manifest = await readManifest(storeDirOf(projectId));
    if (!manifest) return null;
    if (!manifest.sources.some((s) => s.status === 'ready' && s.chunkCount > 0)) return null;
    const env: Record<string, string> = {
      [KB_ENV.projectId]: projectId,
      [KB_ENV.storeDir]: storeDirOf(projectId),
    };
    if (manifest.embedding) {
      const embedding = manifest.embedding;
      const config = await deps
        .listProviders()
        .then((providers) => resolveEmbedConfigForModel(providers, embedding.model))
        .catch((): EmbedConfig | null => null);
      if (config) {
        env[KB_ENV.embedBaseUrl] = config.baseUrl;
        env[KB_ENV.embedApiKey] = config.apiKey;
        env[KB_ENV.embedModel] = config.model;
      }
    }
    return {
      id: `project-kb-${projectId}`,
      name: BUILTIN_KNOWLEDGE_NAME,
      transport: { type: 'stdio', command: 'node', args: [deps.getServerScriptPath()], env },
    };
  };

  const whenIdle = (projectId: string): Promise<void> => queues.get(projectId) ?? Promise.resolve();

  return { listSources, addSources, removeSource, retrySource, removeStore, getSessionMcpServer, whenIdle };
};
