/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, mkdir, realpath, rename, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import { OfficeArtifactError } from './officeCliJson';
import { hashOfficeArtifact } from './officeArtifactPath';

export type OfficeArtifactPendingSnapshot = {
  id: string;
  filePath: string;
  snapshotPath: string;
  preVersion: string;
};

type OfficeArtifactCommittedSnapshot = OfficeArtifactPendingSnapshot & {
  postVersion: string;
};

export type OfficeArtifactSnapshotStoreOptions = {
  maxDepth?: number;
};

export type OfficeArtifactUndoResult = {
  version: string;
  undoDepth: number;
};

const DEFAULT_MAX_DEPTH = 20;

function getMaxDepth(maxDepth: number | undefined): number {
  return Number.isSafeInteger(maxDepth) && maxDepth > 0 ? Math.min(maxDepth, DEFAULT_MAX_DEPTH) : DEFAULT_MAX_DEPTH;
}

function snapshotDirectoryName(filePath: string): string {
  return createHash('sha256').update(filePath).digest('hex');
}

async function restoreAtomically(snapshotPath: string, filePath: string, expectedHash: string): Promise<void> {
  const tempPath = join(dirname(filePath), `.${basename(filePath)}.${randomUUID()}.forge-restore`);

  try {
    await copyFile(snapshotPath, tempPath, constants.COPYFILE_EXCL);
    await rename(tempPath, filePath);
    if ((await hashOfficeArtifact(filePath)) !== expectedHash) throw new OfficeArtifactError('RESTORE_FAILED');
  } catch (error) {
    if (error instanceof OfficeArtifactError) throw error;
    throw new OfficeArtifactError('RESTORE_FAILED');
  } finally {
    await rm(tempPath, { force: true }).catch((): undefined => undefined);
  }
}

export class OfficeArtifactSnapshotStore {
  private readonly maxDepth: number;
  private readonly stacks = new Map<string, OfficeArtifactCommittedSnapshot[]>();
  private readonly pendingSnapshots = new Map<string, OfficeArtifactPendingSnapshot>();
  private readonly canonicalPaths = new Map<string, string>();

  constructor(
    private readonly historyRoot: string,
    options: OfficeArtifactSnapshotStoreOptions = {}
  ) {
    this.maxDepth = getMaxDepth(options.maxDepth);
  }

  async prepare(filePath: string, preVersion: string): Promise<OfficeArtifactPendingSnapshot> {
    let snapshotPath: string | undefined;

    try {
      const canonicalFilePath = await realpath(filePath);
      const snapshotDirectory = join(this.historyRoot, snapshotDirectoryName(canonicalFilePath));
      const id = randomUUID();
      snapshotPath = join(snapshotDirectory, `${id}.bin`);
      await mkdir(snapshotDirectory, { recursive: true });
      await copyFile(canonicalFilePath, snapshotPath, constants.COPYFILE_EXCL);

      if ((await hashOfficeArtifact(snapshotPath)) !== preVersion) {
        throw new OfficeArtifactError('FILE_CHANGED');
      }

      const pending = { id, filePath: canonicalFilePath, snapshotPath, preVersion };
      this.pendingSnapshots.set(id, pending);
      this.canonicalPaths.set(filePath, canonicalFilePath);
      this.canonicalPaths.set(canonicalFilePath, canonicalFilePath);
      return pending;
    } catch (error) {
      if (snapshotPath) await rm(snapshotPath, { force: true }).catch((): undefined => undefined);
      if (error instanceof OfficeArtifactError) throw error;
      throw new OfficeArtifactError('SNAPSHOT_FAILED');
    }
  }

  async commit(pending: OfficeArtifactPendingSnapshot, postVersion: string): Promise<number> {
    const storedPending = this.pendingSnapshots.get(pending.id);
    if (!storedPending || storedPending.snapshotPath !== pending.snapshotPath) {
      throw new OfficeArtifactError('UNSUPPORTED_CONTENT');
    }

    const stack = this.stacks.get(storedPending.filePath) ?? [];
    const entry = { ...storedPending, postVersion };
    stack.push(entry);
    this.stacks.set(storedPending.filePath, stack);

    try {
      await this.prune(stack);
    } catch (error) {
      stack.pop();
      if (stack.length === 0) this.stacks.delete(storedPending.filePath);
      if (error instanceof OfficeArtifactError) throw error;
      throw new OfficeArtifactError('SNAPSHOT_FAILED');
    }

    this.pendingSnapshots.delete(storedPending.id);
    return stack.length;
  }

  async rollbackPending(pending: OfficeArtifactPendingSnapshot): Promise<void> {
    const storedPending = this.pendingSnapshots.get(pending.id);
    if (!storedPending || storedPending.snapshotPath !== pending.snapshotPath) {
      throw new OfficeArtifactError('UNSUPPORTED_CONTENT');
    }

    await restoreAtomically(storedPending.snapshotPath, storedPending.filePath, storedPending.preVersion);
    await this.removeSnapshot(storedPending.snapshotPath);
    this.pendingSnapshots.delete(storedPending.id);
  }

  async undo(filePath: string, expectedVersion: string): Promise<OfficeArtifactUndoResult> {
    const canonicalFilePath = await this.resolveKnownPath(filePath);
    const stack = canonicalFilePath ? this.stacks.get(canonicalFilePath) : undefined;
    const entry = stack?.at(-1);

    if (!canonicalFilePath || !stack || !entry) throw new OfficeArtifactError('UNSUPPORTED_CONTENT');
    if (
      expectedVersion !== entry.postVersion ||
      !(await this.matchesCurrentVersion(canonicalFilePath, entry.postVersion))
    ) {
      throw new OfficeArtifactError('FILE_CHANGED');
    }

    await restoreAtomically(entry.snapshotPath, canonicalFilePath, entry.preVersion);
    stack.pop();
    if (stack.length === 0) this.stacks.delete(canonicalFilePath);
    await this.removeSnapshot(entry.snapshotPath);

    return { version: entry.preVersion, undoDepth: stack.length };
  }

  getUndoDepth(filePath: string): number {
    const canonicalFilePath = this.canonicalPaths.get(filePath) ?? filePath;
    return this.stacks.get(canonicalFilePath)?.length ?? 0;
  }

  async dispose(): Promise<void> {
    const snapshotPaths = new Set<string>();
    for (const pending of this.pendingSnapshots.values()) snapshotPaths.add(pending.snapshotPath);
    for (const stack of this.stacks.values()) {
      for (const entry of stack) snapshotPaths.add(entry.snapshotPath);
    }

    try {
      await Promise.all([...snapshotPaths].map((snapshotPath) => rm(snapshotPath, { force: true })));
    } catch {
      throw new OfficeArtifactError('SNAPSHOT_FAILED');
    }

    this.pendingSnapshots.clear();
    this.stacks.clear();
    this.canonicalPaths.clear();
  }

  private async prune(stack: OfficeArtifactCommittedSnapshot[]): Promise<void> {
    const discarded = stack.slice(0, Math.max(0, stack.length - this.maxDepth));
    try {
      await Promise.all(discarded.map(({ snapshotPath }) => rm(snapshotPath)));
    } catch {
      throw new OfficeArtifactError('SNAPSHOT_FAILED');
    }
    stack.splice(0, discarded.length);
  }

  private async removeSnapshot(snapshotPath: string): Promise<void> {
    try {
      await rm(snapshotPath);
    } catch {
      throw new OfficeArtifactError('SNAPSHOT_FAILED');
    }
  }

  private async resolveKnownPath(filePath: string): Promise<string | undefined> {
    try {
      const canonicalFilePath = await realpath(filePath);
      this.canonicalPaths.set(filePath, canonicalFilePath);
      return canonicalFilePath;
    } catch {
      return this.canonicalPaths.get(filePath);
    }
  }

  private async matchesCurrentVersion(filePath: string, expectedVersion: string): Promise<boolean> {
    try {
      return (await hashOfficeArtifact(filePath)) === expectedVersion;
    } catch {
      return false;
    }
  }
}
