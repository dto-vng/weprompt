/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { chmod, lstat, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ArtifactScratchAllocation, ArtifactScratchResult } from '@/common/types/office/presentationTemplate';

const MANIFEST_FILE = 'manifest.json';
const DELIVERY_READY_FILE = '.aionui-delivery-ready';
const RUN_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * How long a run directory may linger before the startup sweep reclaims it. Runs
 * that fail or are interrupted are retained on disk for debugging (and the
 * external office tool may leave intermediates such as `.ps1` scripts inside);
 * without a sweep those directories accumulate. A day keeps recent runs available
 * for inspection while stopping unbounded temp growth.
 */
const ORPHAN_TTL_MS = 24 * 60 * 60 * 1000;

type ArtifactScratchManifest = {
  version: 1;
  runId: string;
  conversationId: string;
  templateId: string;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'failed' | 'interrupted';
};

type ArtifactScratchServiceOptions = {
  rootDir: string;
};

/** Owns exact system-temp directories used by one Office artifact run. */
export class ArtifactScratchService {
  private readonly rootDir: string;

  constructor(options: ArtifactScratchServiceOptions) {
    this.rootDir = path.resolve(options.rootDir);
  }

  async allocate(input: { conversationId: string; templateId: string }): Promise<ArtifactScratchAllocation> {
    await this.ensureRoot();
    const runId = randomUUID();
    const directory = this.resolveRunDirectory(runId);
    await mkdir(directory, { mode: 0o700 });
    const now = new Date().toISOString();
    await this.writeManifest(directory, {
      version: 1,
      runId,
      conversationId: input.conversationId,
      templateId: input.templateId,
      createdAt: now,
      updatedAt: now,
      status: 'active',
    });
    return {
      runId,
      directory,
      readyMarker: path.join(directory, DELIVERY_READY_FILE),
    };
  }

  async complete(runId: string): Promise<ArtifactScratchResult> {
    await this.ensureRoot();
    const directory = this.resolveRunDirectory(runId);
    await this.readOwnedManifest(directory, runId);
    if (!(await this.isRegularReadyMarker(path.join(directory, DELIVERY_READY_FILE)))) {
      return { status: 'retained', directory, reason: 'delivery_not_ready' };
    }
    await rm(directory, { recursive: true });
    return { status: 'cleaned' };
  }

  async retain(runId: string, reason: 'failed' | 'interrupted'): Promise<ArtifactScratchResult> {
    await this.ensureRoot();
    const directory = this.resolveRunDirectory(runId);
    const manifest = await this.readOwnedManifest(directory, runId);
    await this.writeManifest(directory, {
      ...manifest,
      status: reason,
      updatedAt: new Date().toISOString(),
    });
    return { status: 'retained', directory, reason };
  }

  async discard(runId: string): Promise<ArtifactScratchResult> {
    await this.ensureRoot();
    const directory = this.resolveRunDirectory(runId);
    await this.readOwnedManifest(directory, runId);
    await rm(directory, { recursive: true });
    return { status: 'cleaned' };
  }

  /**
   * Remove run directories older than `maxAgeMs` (default {@link ORPHAN_TTL_MS}),
   * including any intermediate files the external office tool left behind. Runs
   * younger than the cutoff are kept (a concurrent run may still be using them, and
   * failed/interrupted runs are retained briefly for debugging). Best-effort: a
   * removal that fails is simply retried on the next sweep. Intended to run once at
   * startup, when no run of this process is active.
   */
  async sweepOrphans(options?: { maxAgeMs?: number; nowMs?: number }): Promise<{ removed: string[] }> {
    const maxAgeMs = options?.maxAgeMs ?? ORPHAN_TTL_MS;
    const nowMs = options?.nowMs ?? Date.now();
    const removed: string[] = [];
    let entries: Dirent<string>[];
    try {
      await this.ensureRoot();
      entries = await readdir(this.rootDir, { withFileTypes: true });
    } catch {
      return { removed };
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || !RUN_ID_RE.test(entry.name)) continue;
      const directory = path.join(this.rootDir, entry.name);
      const ageMs = await this.resolveRunAgeMs(directory, nowMs);
      if (ageMs !== null && ageMs < maxAgeMs) continue;
      try {
        await rm(directory, { recursive: true, force: true });
        removed.push(entry.name);
      } catch {
        // Best-effort: a locked/removed dir is retried on the next startup sweep.
      }
    }
    return { removed };
  }

  /** Age of a run in ms from its manifest timestamp, falling back to dir mtime; null if unknown. */
  private async resolveRunAgeMs(directory: string, nowMs: number): Promise<number | null> {
    try {
      const manifest = JSON.parse(
        await readFile(path.join(directory, MANIFEST_FILE), 'utf8')
      ) as Partial<ArtifactScratchManifest>;
      const stamp = Date.parse(manifest.updatedAt ?? manifest.createdAt ?? '');
      if (Number.isFinite(stamp)) return Math.max(0, nowMs - stamp);
    } catch {
      // Missing/corrupt manifest → fall back to the directory mtime below.
    }
    try {
      const stat = await lstat(directory);
      return Math.max(0, nowMs - stat.mtimeMs);
    } catch {
      return null;
    }
  }

  private resolveRunDirectory(runId: string): string {
    if (!RUN_ID_RE.test(runId)) {
      throw new Error('Invalid artifact scratch run id');
    }
    return path.join(this.rootDir, runId);
  }

  private async ensureRoot(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true, mode: 0o700 });
    const root = await lstat(this.rootDir);
    const currentUid = typeof process.getuid === 'function' ? process.getuid() : undefined;
    if (root.isSymbolicLink() || !root.isDirectory() || (currentUid !== undefined && root.uid !== currentUid)) {
      throw new Error('Artifact scratch root must be a real directory owned by the current user');
    }
    await chmod(this.rootDir, 0o700);
  }

  private async readOwnedManifest(directory: string, runId: string): Promise<ArtifactScratchManifest> {
    const value = JSON.parse(
      await readFile(path.join(directory, MANIFEST_FILE), 'utf8')
    ) as Partial<ArtifactScratchManifest>;
    if (value.version !== 1 || value.runId !== runId) {
      throw new Error('Artifact scratch manifest does not match the requested run');
    }
    return value as ArtifactScratchManifest;
  }

  private async writeManifest(directory: string, manifest: ArtifactScratchManifest): Promise<void> {
    const manifestPath = path.join(directory, MANIFEST_FILE);
    const stagingPath = path.join(directory, `.manifest-${randomUUID()}.tmp`);
    await writeFile(stagingPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    await rename(stagingPath, manifestPath);
  }

  private async isRegularReadyMarker(markerPath: string): Promise<boolean> {
    try {
      const marker = await lstat(markerPath);
      return marker.isFile() && !marker.isSymbolicLink();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }
}
