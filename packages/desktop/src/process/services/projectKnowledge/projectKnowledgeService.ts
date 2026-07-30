/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Main-process owner of per-project knowledge stores. The visible
// `Knowledge Base/` folder inside the project workspace is the source of
// truth: syncFolder diffs it against the manifest by fileName + content hash
// and drives the ingestion pipeline (convert → chunk → BM25 → embed), which
// reads source bytes from the folder and keeps `converted.md` in the private
// store as conversion cache + text-recovery fallback. All work for one
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
import {
  extractPdfText as defaultExtractPdfText,
  pageSpanLabel,
  renderPagesAsMarkdown,
} from '@/common/knowledge/pdfExtract';
import { ocrPdfPages as defaultOcrPdfPages } from '@/common/knowledge/pdfOcr';
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
import { EXTRACTED_TEXT_DIR_NAME, KNOWLEDGE_FOLDER_NAME } from '@/common/knowledge/constants';
import { pickEmbeddingModel, resolveEmbedConfigForModel } from './embedProviderPicker';
import { MAX_KNOWLEDGE_FILE_BYTES, scanKnowledgeFolder as defaultScanKnowledgeFolder } from './folderScan';
import { resolveOcrModel as defaultResolveOcrModel, type OcrModelResolution } from './ocrProviderPicker';
import { BUILTIN_KNOWLEDGE_NAME } from '../../resources/builtinMcp/constants';

const SUPPORTED_EXTENSIONS = new Set(['md', 'txt', 'docx', 'xlsx', 'pdf']);
const CONVERTED_EXTENSIONS = new Set(['docx', 'xlsx']);
/**
 * Formats whose on-disk original is binary, so the agent cannot read them with
 * file tools. Their extracted text is materialized alongside (see
 * EXTRACTED_TEXT_DIR_NAME); .md/.txt are excluded because the original already
 * IS the readable form.
 */
const EXTRACTED_TEXT_EXTENSIONS = new Set(['pdf', 'docx', 'xlsx']);
const SUPPORTED_EXTENSIONS_HINT = 'Supported: .md, .txt, .docx, .xlsx, .pdf';
const MAX_CHUNKS_PER_SOURCE = 2000;
/**
 * Pages read from one PDF. Ingestion is serialized per project, so an
 * unbounded document would hold the queue and every file behind it. Beyond
 * the cap the source truncates and stays `ready`, matching the
 * MAX_CHUNKS_PER_SOURCE convention.
 */
const MAX_PDF_PAGES = 50;

/**
 * Cap on the indexed text handed to the preview drawer. Large enough for any
 * ordinary document, small enough that a pathological source cannot lock up
 * the renderer's markdown pass.
 */
const MAX_PREVIEW_CHARS = 200_000;

/**
 * A PDF with no text layer is a scan, and the only way to read it is to
 * transcribe its pages with a multimodal model. Both messages below explain
 * what stopped us rather than just reporting failure: a `ready` source with
 * zero passages, or a bare "failed", leaves the user with nothing to act on.
 */
const scannedPdfNoModelError = (reason: string): string =>
  `This PDF is a scan, so its pages have to be transcribed by a model that can read images — but ${reason}. Add one in provider settings, then retry.`;

const SCANNED_PDF_NO_PAGES_ERROR =
  'This PDF is a scan, but none of its pages is a single full-page image, so there was nothing to transcribe. Pages built from several images (exported slides or designed documents) are not supported yet.';

const scannedPdfAllPagesFailedError = (detail: string): string =>
  `This PDF is a scan, but transcribing its pages failed: ${detail}`;

/**
 * Names the ceiling the file actually exceeded. Derived from the scan rather
 * than written as a literal, because the caps now differ by format — a message
 * quoting 15 MB at someone whose PDF was measured against 100 MB is worse than
 * no message.
 */
const oversizeError = (limitBytes?: number): string =>
  `File exceeds the ${Math.round((limitBytes ?? MAX_KNOWLEDGE_FILE_BYTES) / (1024 * 1024))} MB limit.`;

export type ProjectKnowledgeServiceDeps = {
  storeRootDir: string;
  listProviders: () => Promise<IProvider[]>;
  /** Convert a .docx/.xlsx buffer to markdown (DocumentConverter in prod). */
  convertToMarkdown: (buffer: ArrayBuffer, extension: 'docx' | 'xlsx') => Promise<string>;
  embedTextsImpl?: typeof defaultEmbedTexts;
  /** Injectable so tests can drive PDF ingestion without a real parser. */
  extractPdfTextImpl?: typeof defaultExtractPdfText;
  /** Injectable so tests can drive scanned-PDF ingestion without a real model. */
  ocrPdfPagesImpl?: typeof defaultOcrPdfPages;
  resolveOcrModelImpl?: typeof defaultResolveOcrModel;
  scanFolderImpl?: typeof defaultScanKnowledgeFolder;
  /**
   * Move a user file to the OS Trash (Electron's `shell.trashItem` in prod).
   * Deleting knowledge deletes a file the user owns, so it must be reversible
   * — `fs.rm` is never acceptable for anything inside the workspace.
   */
  trashItem?: (filePath: string) => Promise<void>;
  getServerScriptPath: () => string;
  onUpdated: (projectId: string) => void;
};

export type ProjectKnowledgeService = {
  listSources: (projectId: string) => Promise<IProjectKnowledgeListResult>;
  addSources: (projectId: string, filePaths: string[], workspace: string) => Promise<void>;
  /** Move the file to the Trash, then drop its index rows. */
  removeSource: (projectId: string, sourceId: string, workspace: string) => Promise<void>;
  retrySource: (projectId: string, sourceId: string, workspace: string) => Promise<void>;
  /** Diff `Knowledge Base/` against the manifest and ingest what changed. */
  syncFolder: (projectId: string, workspace: string) => Promise<void>;
  /** The indexed text of one source, for the in-app preview. */
  getSourceText: (projectId: string, sourceId: string) => Promise<{ text: string; truncated: boolean }>;
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
  ocr: source.ocr ?? null,
});

export const createProjectKnowledgeService = (deps: ProjectKnowledgeServiceDeps): ProjectKnowledgeService => {
  const embedTexts = deps.embedTextsImpl ?? defaultEmbedTexts;
  const extractPdfText = deps.extractPdfTextImpl ?? defaultExtractPdfText;
  const ocrPdfPages = deps.ocrPdfPagesImpl ?? defaultOcrPdfPages;
  const resolveOcrModel = deps.resolveOcrModelImpl ?? defaultResolveOcrModel;
  const scanFolder = deps.scanFolderImpl ?? defaultScanKnowledgeFolder;
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

  const knowledgeDirOf = (workspace: string): string => path.join(workspace, KNOWLEDGE_FOLDER_NAME);

  /**
   * Where a binary source's extracted text is materialized so the agent's file
   * tools can reach it. `null` for formats whose original is already readable
   * (.md/.txt) — copying those would only duplicate a file the agent can open
   * directly. The original extension stays in the name so `a.pdf` and `a.docx`
   * cannot collide on a single `a.md`.
   */
  const extractedTextPathOf = (workspace: string, fileName: string): string | null => {
    const extension = path.extname(fileName).slice(1).toLowerCase();
    if (!EXTRACTED_TEXT_EXTENSIONS.has(extension)) return null;
    return path.join(knowledgeDirOf(workspace), EXTRACTED_TEXT_DIR_NAME, `${path.basename(fileName)}.md`);
  };

  /**
   * Best-effort: the extracted text is a convenience for the agent, never the
   * index itself. A failure here (missing folder, a file where the directory
   * should be, permissions) must not fail an otherwise good ingestion.
   */
  const writeExtractedText = async (workspace: string, fileName: string, markdown: string): Promise<void> => {
    const target = extractedTextPathOf(workspace, fileName);
    if (!target) return;
    try {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, markdown, 'utf8');
    } catch (error) {
      console.warn(
        `[projectKnowledge] could not materialize extracted text for ${fileName}:`,
        error instanceof Error ? error.message : error
      );
    }
  };

  const removeExtractedText = async (workspace: string, fileName: string): Promise<void> => {
    const target = extractedTextPathOf(workspace, fileName);
    if (!target) return;
    await fs.rm(target, { force: true }).catch((): undefined => undefined);
  };

  /**
   * Restore a `.text/` entry that is missing while its source is still `ready`
   * — the folder was restored after going missing, the user deleted `.text/`,
   * or the source predates this feature. Sourced from the store's
   * `converted.md`, which is the same text ingestion chunked, so this costs a
   * file copy rather than a re-extraction.
   */
  const repairExtractedText = async (
    projectId: string,
    workspace: string,
    source: KnowledgeManifestSource
  ): Promise<void> => {
    const target = extractedTextPathOf(workspace, source.fileName);
    if (!target) return;
    if (
      await fs.access(target).then(
        (): boolean => true,
        (): boolean => false
      )
    )
      return;
    const converted = path.join(storePaths(storeDirOf(projectId)).sourceDir(source.id), 'converted.md');
    const markdown = await fs.readFile(converted, 'utf8').catch((): null => null);
    if (markdown === null) return; // nothing to restore from; next re-ingest rebuilds it
    await writeExtractedText(workspace, source.fileName, markdown);
  };

  /**
   * Ids key chunk ownership (`chunkId = ${id}#${i}`), so they only need to be
   * unique and filesystem-safe. Hashing name + content keeps two same-content
   * files under different names from colliding; pre-folder rows keep their
   * original hash-derived ids untouched (sync identity is fileName, not id).
   */
  const deriveSourceId = (fileName: string, contentHash: string): string =>
    createHash('sha256').update(`${fileName}\n${contentHash}`).digest('hex').slice(0, 12);

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
      folderMissing: manifest.folderMissing === true,
    };
  };

  /**
   * Drop a source's chunks/vectors/files; caller persists the manifest.
   * `workspace` is optional only because a few call sites legitimately have no
   * folder in hand; when given, the source's materialized extracted text is
   * reaped too, so `.text/` never outlives the index rows it mirrors.
   */
  const removeSourceRows = async (
    projectId: string,
    manifest: KnowledgeManifest,
    sourceId: string,
    workspace?: string
  ): Promise<void> => {
    const storeDir = storeDirOf(projectId);
    const removed = manifest.sources.find((s) => s.id === sourceId);
    if (workspace && removed) await removeExtractedText(workspace, removed.fileName);
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

  /**
   * One-time, per project: export legacy private-store snapshots
   * (`sources/<id>/original.<ext>`, written before the folder existed) into
   * the visible folder, then delete the snapshot — but only after re-reading
   * the exported file and confirming its hash. A failed export keeps the
   * snapshot so the next sync can retry; nothing is ever deleted on a guess.
   *
   * Straight exports keep the manifest hash, so the diff that follows sees no
   * change and there is no re-index churn. Returns the names it exported so
   * the diff can protect rows whose export failed.
   */
  const migrateStoreSnapshots = async (
    projectId: string,
    manifest: KnowledgeManifest,
    workspace: string
  ): Promise<Set<string>> => {
    const storeDir = storeDirOf(projectId);
    const pendingExports: Array<{ source: KnowledgeManifestSource; snapshotPath: string; extension: string }> = [];
    for (const source of manifest.sources) {
      if (!source.contentHash.startsWith('sha256:')) continue;
      const extension = path.extname(source.fileName).slice(1).toLowerCase();
      const snapshotPath = path.join(storePaths(storeDir).sourceDir(source.id), `original.${extension}`);
      const exists = await fs.access(snapshotPath).then(
        (): boolean => true,
        (): boolean => false
      );
      if (exists) pendingExports.push({ source, snapshotPath, extension });
    }
    const unexported = new Set<string>();
    if (pendingExports.length === 0) return unexported;
    const workspaceExists = await fs.stat(workspace).then(
      (stat): boolean => stat.isDirectory(),
      (): boolean => false
    );
    // No workspace means no place to migrate to; the scan below reports
    // folderMissing and the snapshots stay exactly where they are.
    if (!workspaceExists) return new Set(pendingExports.map((p) => p.source.fileName));
    const knowledgeDir = knowledgeDirOf(workspace);
    try {
      await fs.mkdir(knowledgeDir, { recursive: true });
    } catch {
      return new Set(pendingExports.map((p) => p.source.fileName));
    }
    for (const { source, snapshotPath, extension } of pendingExports) {
      try {
        const buffer = await fs.readFile(snapshotPath);
        const hash = `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
        const targetPath = path.join(knowledgeDir, path.basename(source.fileName));
        const existingHash = await fs.readFile(targetPath).then(
          (existing): string | null => `sha256:${createHash('sha256').update(existing).digest('hex')}`,
          (): string | null => null
        );
        if (existingHash === hash) {
          await fs.rm(snapshotPath, { force: true });
          continue;
        }
        // Name taken by different content: export alongside under a suffixed
        // name rather than overwrite. Both end up indexed — losing either
        // silently would be worse than a duplicate the user can delete.
        const exportPath =
          existingHash === null
            ? targetPath
            : path.join(
                knowledgeDir,
                `${path.basename(source.fileName, path.extname(source.fileName))} (from knowledge base).${extension}`
              );
        await fs.writeFile(exportPath, buffer);
        const verify = await fs.readFile(exportPath);
        if (`sha256:${createHash('sha256').update(verify).digest('hex')}` !== hash) {
          unexported.add(source.fileName);
          continue; // keep the snapshot — the export is not trustworthy
        }
        await fs.rm(snapshotPath, { force: true });
      } catch (error) {
        unexported.add(source.fileName);
        console.warn(
          `[projectKnowledge] snapshot export failed for ${source.fileName}:`,
          error instanceof Error ? error.message : error
        );
      }
    }
    return unexported;
  };

  /**
   * Diff the visible `Knowledge Base/` folder against the manifest and
   * register the outcome: new/changed files become `indexing` rows for
   * processPending to ingest; files gone from a READABLE folder lose their
   * index rows.
   *
   * THE GUARD: a missing or unreadable folder performs ZERO deletions. A
   * transient unmount, a Downloads cleanup, or a renamed workspace must
   * surface as `folderMissing` — never as "all files were deleted". Every
   * row-removal below is only reachable after a successful folder read.
   *
   * `retryNames` marks files the user explicitly re-picked via Add files: a
   * failed row whose content is unchanged is retried only then, so automatic
   * syncs never hammer a persistently failing source (e.g. re-reading a
   * scanned 50-page PDF on every Project Home mount).
   */
  const registerFromFolder = async (
    projectId: string,
    workspace: string,
    retryNames?: Set<string>,
    unreadableNames?: string[]
  ): Promise<void> => {
    const manifest = await loadManifest(projectId);
    // Legacy stores first: their snapshots become folder files, so the scan
    // below sees them and the diff treats them as already-indexed.
    const unexported = await migrateStoreSnapshots(projectId, manifest, workspace);
    const scan = await scanFolder(knowledgeDirOf(workspace));
    if (!scan.ok) {
      const missing = manifest.sources.length > 0; // a project with no sources has nothing to lose
      if ((manifest.folderMissing === true) !== missing) {
        if (missing) manifest.folderMissing = true;
        else delete manifest.folderMissing;
        await saveManifest(projectId, manifest);
      }
      return;
    }
    let dirty = false;
    if (manifest.folderMissing) {
      delete manifest.folderMissing;
      dirty = true;
    }
    const seen = new Set<string>();
    for (const entry of scan.entries) {
      seen.add(entry.fileName);
      const existing = manifest.sources.find((s) => s.fileName === entry.fileName);
      if (existing && existing.contentHash === entry.contentHash) {
        if (existing.status === 'failed' && entry.kind === 'supported' && retryNames?.has(entry.fileName)) {
          existing.status = 'indexing';
          existing.error = null;
          dirty = true;
        } else if (existing.status === 'ready') {
          // Unchanged content is otherwise a no-op, so a `.text/` entry lost
          // with the folder (or predating this feature) would never come back.
          // Repair it from converted.md without re-ingesting the source.
          await repairExtractedText(projectId, workspace, existing);
        }
        continue;
      }
      if (existing) {
        await removeSourceRows(projectId, manifest, existing.id, workspace);
        dirty = true;
      }
      const base: KnowledgeManifestSource = {
        id: deriveSourceId(entry.fileName, entry.contentHash),
        fileName: entry.fileName,
        contentHash: entry.contentHash,
        byteSize: entry.byteSize,
        status: 'indexing',
        chunkCount: 0,
        vectorCount: 0,
        addedAt: Date.now(),
        error: null,
      };
      manifest.sources.push(
        entry.kind === 'oversize' ? { ...base, status: 'failed', error: oversizeError(entry.limitBytes) } : base
      );
      dirty = true;
    }
    for (const name of scan.unsupported) {
      seen.add(name);
      if (manifest.sources.some((s) => s.fileName === name)) continue;
      manifest.sources.push({
        id: deriveSourceId(name, 'unsupported'),
        fileName: name,
        contentHash: '',
        byteSize: 0,
        status: 'unsupported',
        chunkCount: 0,
        vectorCount: 0,
        addedAt: Date.now(),
        error: `Unsupported file type. ${SUPPORTED_EXTENSIONS_HINT}`,
      });
      dirty = true;
    }
    // Picks whose copy into the folder failed. Skipped when the folder still
    // holds a good copy under that name — a failed pick must not invalidate it.
    for (const name of unreadableNames ?? []) {
      if (seen.has(name)) continue;
      seen.add(name);
      const existing = manifest.sources.find((s) => s.fileName === name);
      if (existing) {
        existing.status = 'failed';
        existing.error = 'Could not read the file.';
        dirty = true;
        continue;
      }
      manifest.sources.push({
        id: deriveSourceId(name, 'unreadable'),
        fileName: name,
        contentHash: '',
        byteSize: 0,
        status: 'failed',
        chunkCount: 0,
        vectorCount: 0,
        addedAt: Date.now(),
        error: 'Could not read the file.',
      });
      dirty = true;
    }
    // Deletions — reachable ONLY because the folder read above succeeded.
    // A source whose snapshot could not be exported yet is not "missing from
    // the folder", it is mid-migration: keep it and retry on the next sync.
    // Collected up front because removeSourceRows rewrites manifest.sources.
    const vanished = manifest.sources.filter(
      (source) => !seen.has(source.fileName) && !unexported.has(source.fileName)
    );
    for (const source of vanished) {
      await removeSourceRows(projectId, manifest, source.id, workspace);
      dirty = true;
    }
    if (dirty) await saveManifest(projectId, manifest);
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
  const processPending = async (projectId: string, workspace: string): Promise<void> => {
    const storeDir = storeDirOf(projectId);
    const knowledgeDir = knowledgeDirOf(workspace);
    let manifest = await loadManifest(projectId);
    const pending = manifest.sources.filter((s) => s.status === 'indexing');
    /**
     * Resolved lazily and at most once per run, then reused for every scan in
     * this batch. Not persisted: probing per page would waste calls, but pinning
     * the choice on the manifest would outlive the entitlement behind it — the
     * catalogue on this provider advertises far more than a key may call.
     */
    let ocrModel: OcrModelResolution | null = null;
    const getOcrModel = async (): Promise<OcrModelResolution> => {
      ocrModel ??= await resolveOcrModel(await deps.listProviders());
      return ocrModel;
    };
    for (const source of pending) {
      let buffer: Buffer;
      try {
        buffer = await fs.readFile(path.join(knowledgeDir, path.basename(source.fileName)));
      } catch {
        const folderReadable = await fs.stat(knowledgeDir).then(
          (stat): boolean => stat.isDirectory(),
          (): boolean => false
        );
        if (!folderReadable) {
          // Folder-level failure — same rule as the sync guard: treat it as
          // transient, leave every remaining row `indexing` (the next
          // successful sync resumes them), and surface folderMissing instead
          // of failing sources one by one.
          manifest.folderMissing = true;
          await saveManifest(projectId, manifest);
          return;
        }
        source.status = 'failed';
        source.error = 'Could not read the file.';
        delete source.progress;
        await saveManifest(projectId, manifest);
        continue;
      }
      try {
        // The file may have changed between the registering scan and this
        // read; index what actually exists and record its hash so the next
        // sync no-ops instead of re-ingesting.
        const contentHash = `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
        if (contentHash !== source.contentHash) {
          source.contentHash = contentHash;
          source.byteSize = buffer.byteLength;
        }
        const extension = path.extname(source.fileName).slice(1).toLowerCase();
        // Non-fatal notes accumulated while converting; a source can hit more
        // than one cap (e.g. a long PDF that is also chunk-capped).
        const notes: string[] = [];
        let markdown: string;
        // Provenance from a previous pass must not outlive it: a retry that now
        // finds a text layer, or a source re-ingested after being replaced,
        // would otherwise keep claiming it was transcribed.
        delete source.ocr;
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
          if (extraction.hasTextLayer) {
            if (extraction.truncated) notes.push(`Truncated to ${MAX_PDF_PAGES} pages.`);
            markdown = renderPagesAsMarkdown(extraction.pages);
          } else {
            // A scan. Transcribing it is the expensive path by a wide margin —
            // one model call per page, on the user's own quota — so it runs only
            // after the free local read has come up empty.
            const resolved = await getOcrModel();
            if (resolved.status === 'unavailable') throw new Error(scannedPdfNoModelError(resolved.reason));
            const transcription = await ocrPdfPages(buffer, resolved.config, {
              maxPages: MAX_PDF_PAGES,
              onProgress: (done, total) =>
                reportProgress(projectId, manifest, source, { stage: 'transcribing', done, total }).catch(
                  (): undefined => undefined
                ),
            });
            if (transcription.transcribedCount === 0) {
              // Nothing was transcribed, and WHY decides what the user should
              // do: an unreachable model is worth retrying, a deck exported to
              // PDF is not.
              throw new Error(
                transcription.lastError
                  ? scannedPdfAllPagesFailedError(transcription.lastError)
                  : SCANNED_PDF_NO_PAGES_ERROR
              );
            }
            if (transcription.truncated) notes.push(`Truncated to ${MAX_PDF_PAGES} pages.`);
            if (transcription.skippedPages.length > 0) {
              // Partial success stays a success, and says so: a 20-page contract
              // with 2 unreadable pages is far more useful indexed than refused.
              notes.push(
                `Transcribed from a scan; skipped ${transcription.skippedPages.length} page(s): ${transcription.skippedPages.join(', ')}.`
              );
            }
            source.ocr = { model: resolved.config.model, skippedPages: transcription.skippedPages };
            markdown = renderPagesAsMarkdown(transcription.pages);
          }
        } else if (CONVERTED_EXTENSIONS.has(extension)) {
          markdown = await deps.convertToMarkdown(
            buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
            extension as 'docx' | 'xlsx'
          );
        } else {
          markdown = buffer.toString('utf8');
        }
        // converted.md is the conversion cache AND the text-recovery fallback
        // if the folder is ever lost; it is the only per-source store file now.
        const sourceDir = storePaths(storeDir).sourceDir(source.id);
        await fs.mkdir(sourceDir, { recursive: true });
        await fs.writeFile(path.join(sourceDir, 'converted.md'), markdown, 'utf8');
        let raw = chunkMarkdown(markdown);
        if (extension === 'pdf') {
          // Relabel from the page markers in each chunk. The chunker labels a
          // chunk with the deepest heading it absorbed — the LAST page marker —
          // so a chunk covering pages 1-3 cited "Page 3". Falls back to the
          // chunker's path for chunks that carry no marker of their own.
          raw = raw.map((chunk) => ({ ...chunk, headingPath: pageSpanLabel(chunk.text) ?? chunk.headingPath }));
        }
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
        // Only now that the source is genuinely ready: a failed extraction must
        // not leave readable-looking text behind for the agent to quote.
        await writeExtractedText(workspace, source.fileName, markdown);
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
    // The embed pass persists its own progress; the trailing write only needs
    // to settle sources ingested above. Skipping it keeps a no-op sync from
    // rewriting the manifest and re-notifying the card on every mount.
    if (pending.length > 0) await saveManifest(projectId, manifest);
  };

  /**
   * Copy explicitly picked files INTO `Knowledge Base/` (creating it if
   * needed) and index from there — one consistent source of truth. Awaits
   * registration (rows become visible) but not ingestion.
   */
  const addSources = async (projectId: string, filePaths: string[], workspace: string): Promise<void> => {
    if (!workspace) throw new Error('workspace is required');
    const registered = enqueue(projectId, async () => {
      const knowledgeDir = knowledgeDirOf(workspace);
      await fs.mkdir(knowledgeDir, { recursive: true });
      const retryNames = new Set<string>();
      const unreadable: string[] = [];
      for (const filePath of filePaths) {
        const fileName = path.basename(filePath);
        retryNames.add(fileName);
        const destination = path.join(knowledgeDir, fileName);
        // A file picked from inside the folder itself needs no copy.
        if (path.resolve(filePath) === path.resolve(destination)) continue;
        try {
          await fs.copyFile(filePath, destination);
        } catch {
          unreadable.push(fileName);
        }
      }
      await registerFromFolder(projectId, workspace, retryNames, unreadable);
    });
    void enqueue(projectId, () => processPending(projectId, workspace));
    await registered;
  };

  const syncFolder = async (projectId: string, workspace: string): Promise<void> => {
    if (!workspace) throw new Error('workspace is required');
    const registered = enqueue(projectId, () => registerFromFolder(projectId, workspace));
    void enqueue(projectId, () => processPending(projectId, workspace));
    await registered;
  };

  const removeSource = async (projectId: string, sourceId: string, workspace: string): Promise<void> =>
    enqueue(projectId, async () => {
      if (!workspace) throw new Error('workspace is required');
      const manifest = await loadManifest(projectId);
      const source = manifest.sources.find((s) => s.id === sourceId);
      if (!source) return;
      const filePath = path.join(knowledgeDirOf(workspace), path.basename(source.fileName));
      const exists = await fs.access(filePath).then(
        (): boolean => true,
        (): boolean => false
      );
      // Trash BEFORE dropping the rows. If trashing fails the row must
      // survive: a file still sitting in the folder with no index row would be
      // re-indexed by the very next sync, quietly undoing the user's delete.
      if (exists) {
        if (!deps.trashItem) throw new Error('trashItem dependency is not configured');
        await deps.trashItem(filePath);
      }
      await removeSourceRows(projectId, manifest, sourceId, workspace);
      await saveManifest(projectId, manifest);
    });

  /**
   * The text the index actually holds for a source — `converted.md`, which is
   * exactly what was chunked. Deliberately NOT the original file: showing the
   * extraction is what makes the preview useful for debugging retrieval, and
   * it keeps working while the folder is missing.
   */
  const getSourceText = async (projectId: string, sourceId: string): Promise<{ text: string; truncated: boolean }> => {
    const manifest = await loadManifest(projectId);
    if (!manifest.sources.some((s) => s.id === sourceId)) throw new Error('Source not found.');
    const converted = path.join(storePaths(storeDirOf(projectId)).sourceDir(sourceId), 'converted.md');
    const text = await fs.readFile(converted, 'utf8');
    return text.length > MAX_PREVIEW_CHARS
      ? { text: text.slice(0, MAX_PREVIEW_CHARS), truncated: true }
      : { text, truncated: false };
  };

  /**
   * Retry one failed source. Dual purpose, both parts load-bearing: the guard
   * flips only `sourceId` back to `indexing` when it's `failed`, but the
   * trailing `processPending` call is unconditional and re-scans EVERY
   * `indexing` row in the project — that's also what rescues a row left
   * stuck in `indexing` after a crash mid-ingest, since there is no other
   * recovery path for that case.
   */
  const retrySource = async (projectId: string, sourceId: string, workspace: string): Promise<void> =>
    enqueue(projectId, async () => {
      if (!workspace) throw new Error('workspace is required');
      const manifest = await loadManifest(projectId);
      const source = manifest.sources.find((s) => s.id === sourceId);
      if (!source) return;
      if (source.status === 'failed' && source.contentHash) {
        source.status = 'indexing';
        source.error = null;
        await saveManifest(projectId, manifest);
      }
      await processPending(projectId, workspace);
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

  return {
    listSources,
    addSources,
    removeSource,
    retrySource,
    syncFolder,
    getSourceText,
    removeStore,
    getSessionMcpServer,
    whenIdle,
  };
};
