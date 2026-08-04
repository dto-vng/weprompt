/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash, randomUUID as createRandomUUID } from 'node:crypto';
import { constants, type BigIntStats } from 'node:fs';
import { lstat, mkdir, open, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { PRESENTATION_RUN_LIMITS } from '@/common/config/constants';
import type { PresentationRunRetainedCandidate } from './presentationRunStateMachine';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CANDIDATE_NAME = 'candidate.pptx';
const RETAINED_CANDIDATE_RELATIVE_PATH = `retained/${CANDIDATE_NAME}`;
const COPY_BUFFER_BYTES = 1024 * 1024;

type OpenHandle = Awaited<ReturnType<typeof open>>;
type FileMetadata = BigIntStats;
type PresentationCandidateWrite = (
  target: OpenHandle,
  buffer: Buffer,
  offset: number,
  length: number,
  position: number
) => Promise<number>;

export type PresentationRunEntityKind =
  | 'run'
  | 'grant'
  | 'draft'
  | 'run-tombstone'
  | 'grant-tombstone'
  | 'draft-tombstone';

export type PresentationRunFileDurableBoundary =
  | 'before-candidate-source-open'
  | 'before-candidate-temp-create'
  | 'before-candidate-temp-write'
  | 'after-candidate-temp-write'
  | 'before-candidate-temp-fsync'
  | 'after-candidate-temp-fsync'
  | 'before-candidate-temp-directory-fsync'
  | 'after-candidate-temp-directory-fsync'
  | 'before-candidate-promotion-rename'
  | 'after-candidate-promotion-rename'
  | 'before-candidate-promotion-directory-fsync'
  | 'after-candidate-promotion-directory-fsync'
  | 'before-run-cleanup';

export type PresentationRunFileFailurePoint = {
  boundary: PresentationRunFileDurableBoundary;
  runId: string;
};

/** Fault-injection sentinel that models process death before stack cleanup can run. */
export class PresentationRunSimulatedProcessCrashError extends Error {}

export type PreparedRetainedCandidate = {
  runId: string;
  temporaryRelativePath: string;
  finalRelativePath: 'retained/candidate.pptx';
  sha256: string;
  byteLength: number;
  dev: string;
  ino: string;
};

export type PresentationRetainedCandidateReader = {
  byteLength: number;
  readAt: (position: number, length: number) => Promise<Buffer>;
};

export type PresentationOwnedDirectoryLease = {
  assertCurrent: () => Promise<void>;
  sync: (directory: string) => Promise<void>;
};

export type PresentationPreparedCandidateGuard = {
  assertCurrent: () => Promise<void>;
};

export type PresentationRunFileRoots = {
  runRoot: string;
  grantRoot: string;
  draftRoot: string;
  runTombstoneRoot: string;
  grantTombstoneRoot: string;
  draftTombstoneRoot: string;
  journalRoot: string;
  indexRoot: string;
  quarantineRoot: string;
  stagingRoot: string;
  inspectionRoot: string;
};

type PresentationRunFilesOptions = {
  userDataDir: string;
  tempDir: string;
  randomUUID?: () => string;
  syncDirectory?: PresentationDirectorySync;
  failureInjector?: (point: PresentationRunFileFailurePoint) => void | Promise<void>;
  writeCandidateChunk?: PresentationCandidateWrite;
};

export type PresentationDirectorySync = (directory: string) => Promise<void>;

function hasCode(error: unknown, code: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if ('code' in error && error.code === code) return true;
  return 'cause' in error && hasCode(error.cause, code);
}

function assertUuid(id: string, label: string): void {
  if (!UUID_RE.test(id)) throw new Error(`Invalid presentation ${label} id`);
}

function assertPreparedRetainedCandidate(prepared: PreparedRetainedCandidate): void {
  if (
    !UUID_RE.test(prepared.runId) ||
    prepared.finalRelativePath !== RETAINED_CANDIDATE_RELATIVE_PATH ||
    !new RegExp(`^retained/\\.candidate-${UUID_RE.source.slice(1, -1)}\\.tmp$`, 'i').test(
      prepared.temporaryRelativePath
    ) ||
    !/^[0-9a-f]{64}$/i.test(prepared.sha256) ||
    !Number.isSafeInteger(prepared.byteLength) ||
    prepared.byteLength < 0 ||
    prepared.byteLength > PRESENTATION_RUN_LIMITS.MAX_CANDIDATE_COMPRESSED_BYTES ||
    !/^(0|[1-9][0-9]*)$/.test(prepared.dev) ||
    !/^[1-9][0-9]*$/.test(prepared.ino)
  ) {
    throw new Error('Invalid retained candidate promotion');
  }
}

function noFollowFlag(): number {
  return 'O_NOFOLLOW' in constants ? constants.O_NOFOLLOW : 0;
}

function directoryOnlyFlag(): number {
  return 'O_DIRECTORY' in constants ? constants.O_DIRECTORY : 0;
}

function sameFileIdentity(left: FileMetadata, right: FileMetadata): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function hasExpectedIdentity(metadata: FileMetadata, expected: { dev: string; ino: string }): boolean {
  return metadata.dev.toString() === expected.dev && metadata.ino.toString() === expected.ino;
}

function fileIdentity(metadata: FileMetadata): { dev: string; ino: string } {
  return { dev: metadata.dev.toString(), ino: metadata.ino.toString() };
}

function isOwnedByCurrentUser(metadata: FileMetadata): boolean {
  const currentUid = typeof process.getuid === 'function' ? process.getuid() : undefined;
  return currentUid === undefined || metadata.uid === BigInt(currentUid);
}

function assertOwnedRegularFile(metadata: FileMetadata, message: string): void {
  if (!metadata.isFile() || metadata.nlink !== BigInt(1) || !isOwnedByCurrentUser(metadata)) {
    throw new Error(message);
  }
}

function assertOwnedDirectory(metadata: FileMetadata): void {
  if (!metadata.isDirectory() || !isOwnedByCurrentUser(metadata)) {
    throw new Error('Presentation storage directory must be real and owned by the current user');
  }
}

async function assertPathNamesFile(filePath: string, metadata: FileMetadata, message: string): Promise<void> {
  let named: FileMetadata;
  try {
    named = await lstat(filePath, { bigint: true });
  } catch (error) {
    throw new Error(message, { cause: error });
  }
  if (
    named.isSymbolicLink() ||
    !named.isFile() ||
    named.nlink !== BigInt(1) ||
    !isOwnedByCurrentUser(named) ||
    !sameFileIdentity(named, metadata)
  ) {
    throw new Error(message);
  }
}

async function assertPathNamesDirectory(directory: string, metadata: FileMetadata): Promise<void> {
  let named: FileMetadata;
  try {
    named = await lstat(directory, { bigint: true });
  } catch (error) {
    throw new Error('Presentation storage directory must be real and owned by the current user', { cause: error });
  }
  if (
    named.isSymbolicLink() ||
    !named.isDirectory() ||
    !isOwnedByCurrentUser(named) ||
    !sameFileIdentity(named, metadata)
  ) {
    throw new Error('Presentation storage directory must be real and owned by the current user');
  }
}

async function assertPathAbsent(targetPath: string, message: string): Promise<void> {
  try {
    await lstat(targetPath, { bigint: true });
  } catch (error) {
    if (hasCode(error, 'ENOENT')) return;
    throw new Error(message, { cause: error });
  }
  throw new Error(message);
}

async function openOwnedDirectory(directory: string): Promise<{ handle: OpenHandle; metadata: FileMetadata }> {
  let handle: OpenHandle;
  try {
    handle = await open(directory, constants.O_RDONLY | noFollowFlag() | directoryOnlyFlag());
  } catch (error) {
    throw new Error('Presentation storage directory must be real and owned by the current user', { cause: error });
  }
  try {
    const metadata = await handle.stat({ bigint: true });
    assertOwnedDirectory(metadata);
    await assertPathNamesDirectory(directory, metadata);
    return { handle, metadata };
  } catch (error) {
    await handle.close();
    throw error;
  }
}

async function openOwnedRegularFile(
  filePath: string,
  message: string
): Promise<{ handle: OpenHandle; metadata: FileMetadata }> {
  let handle: OpenHandle;
  try {
    handle = await open(filePath, constants.O_RDONLY | noFollowFlag());
  } catch (error) {
    throw new Error(message, { cause: error });
  }
  try {
    const metadata = await handle.stat({ bigint: true });
    assertOwnedRegularFile(metadata, message);
    await assertPathNamesFile(filePath, metadata, message);
    return { handle, metadata };
  } catch (error) {
    await handle.close();
    throw error;
  }
}

async function hashOpenFile(file: OpenHandle, byteLength: number): Promise<string> {
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(Math.min(COPY_BUFFER_BYTES, Math.max(byteLength, 1)));
  let position = 0;
  while (position < byteLength) {
    const { bytesRead } = await file.read(buffer, 0, Math.min(buffer.length, byteLength - position), position);
    if (bytesRead === 0) throw new Error('Presentation candidate changed while reading');
    hash.update(buffer.subarray(0, bytesRead));
    position += bytesRead;
  }
  return hash.digest('hex');
}

async function verifyCandidatePath(
  filePath: string,
  expected: { sha256: string; byteLength: number },
  messages: { unsafe: string; changed: string },
  expectedIdentity?: { dev: string; ino: string }
): Promise<FileMetadata> {
  const { handle, metadata: before } = await openOwnedRegularFile(filePath, messages.unsafe);
  try {
    if (
      before.size !== BigInt(expected.byteLength) ||
      (expectedIdentity && !hasExpectedIdentity(before, expectedIdentity))
    ) {
      throw new Error(messages.changed);
    }
    const sha256 = await hashOpenFile(handle, expected.byteLength);
    const after = await handle.stat({ bigint: true });
    assertOwnedRegularFile(after, messages.unsafe);
    if (
      !sameFileIdentity(before, after) ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs
    ) {
      throw new Error(messages.changed);
    }
    await assertPathNamesFile(filePath, after, messages.unsafe);
    if (sha256 !== expected.sha256 || (expectedIdentity && !hasExpectedIdentity(after, expectedIdentity))) {
      throw new Error(messages.changed);
    }
    return after;
  } finally {
    await handle.close();
  }
}

type VerifiedCandidateLease = {
  path: string;
  handle: OpenHandle;
  metadata: FileMetadata;
  expected: { sha256: string; byteLength: number };
  expectedIdentity?: { dev: string; ino: string };
  messages: { unsafe: string; changed: string };
};

async function assertVerifiedCandidateLease(lease: VerifiedCandidateLease): Promise<FileMetadata> {
  const before = await lease.handle.stat({ bigint: true });
  assertOwnedRegularFile(before, lease.messages.unsafe);
  if (
    !sameFileIdentity(lease.metadata, before) ||
    before.size !== BigInt(lease.expected.byteLength) ||
    (lease.expectedIdentity && !hasExpectedIdentity(before, lease.expectedIdentity))
  ) {
    throw new Error(lease.messages.changed);
  }
  const sha256 = await hashOpenFile(lease.handle, lease.expected.byteLength);
  const after = await lease.handle.stat({ bigint: true });
  assertOwnedRegularFile(after, lease.messages.unsafe);
  if (
    !sameFileIdentity(before, after) ||
    before.size !== after.size ||
    before.mtimeNs !== after.mtimeNs ||
    before.ctimeNs !== after.ctimeNs ||
    sha256 !== lease.expected.sha256 ||
    (lease.expectedIdentity && !hasExpectedIdentity(after, lease.expectedIdentity))
  ) {
    throw new Error(lease.messages.changed);
  }
  await assertPathNamesFile(lease.path, after, lease.messages.unsafe);
  return after;
}

async function openVerifiedCandidateLease(
  filePath: string,
  expected: { sha256: string; byteLength: number },
  messages: { unsafe: string; changed: string },
  expectedIdentity?: { dev: string; ino: string }
): Promise<VerifiedCandidateLease> {
  const { handle, metadata } = await openOwnedRegularFile(filePath, messages.unsafe);
  const lease = { path: filePath, handle, metadata, expected, expectedIdentity, messages };
  try {
    lease.metadata = await assertVerifiedCandidateLease(lease);
    return lease;
  } catch (error) {
    await handle.close();
    throw error;
  }
}

type OwnedDirectoryLeaseEntry = {
  directory: string;
  handle: OpenHandle;
  metadata: FileMetadata;
};

class OwnedDirectoryLease implements PresentationOwnedDirectoryLease {
  private constructor(
    private readonly entries: OwnedDirectoryLeaseEntry[],
    private readonly syncDirectory: PresentationDirectorySync
  ) {}

  static async acquire(
    directories: readonly string[],
    syncDirectory: PresentationDirectorySync
  ): Promise<OwnedDirectoryLease> {
    const entries: OwnedDirectoryLeaseEntry[] = [];
    try {
      for (const directory of new Set(directories.map((entry) => path.resolve(entry)))) {
        const { handle, metadata } = await openOwnedDirectory(directory);
        entries.push({ directory, handle, metadata });
      }
      const lease = new OwnedDirectoryLease(entries, syncDirectory);
      await lease.assertCurrent();
      return lease;
    } catch (error) {
      await Promise.all(entries.map(({ handle }) => handle.close().catch((): undefined => undefined)));
      throw error;
    }
  }

  async assertCurrent(): Promise<void> {
    for (const entry of this.entries) await this.assertEntry(entry);
  }

  async assertParentsCurrent(removedDirectory: string): Promise<void> {
    const removed = path.resolve(removedDirectory);
    for (const entry of this.entries) {
      if (entry.directory !== removed) await this.assertEntry(entry);
    }
  }

  async sync(directory: string): Promise<void> {
    const resolved = path.resolve(directory);
    const entry = this.entries.find((candidate) => candidate.directory === resolved);
    if (!entry) throw new Error('Presentation directory sync escaped its active lease');
    await this.assertEntry(entry);
    await this.syncDirectory(resolved);
    await this.assertEntry(entry);
  }

  async close(): Promise<void> {
    await Promise.all(this.entries.map(({ handle }) => handle.close()));
  }

  private async assertEntry(entry: OwnedDirectoryLeaseEntry): Promise<void> {
    try {
      const current = await entry.handle.stat({ bigint: true });
      assertOwnedDirectory(current);
      if (!sameFileIdentity(entry.metadata, current)) throw new Error();
      const named = await lstat(entry.directory, { bigint: true });
      if (
        named.isSymbolicLink() ||
        !named.isDirectory() ||
        !isOwnedByCurrentUser(named) ||
        !sameFileIdentity(current, named)
      ) {
        throw new Error();
      }
    } catch (error) {
      throw new Error('Presentation storage directory changed while leased', { cause: error });
    }
  }
}

/** POSIX directory durability adapter. Errors are persistence failures. */
export const syncPosixDirectory: PresentationDirectorySync = async (directory) => {
  const { handle, metadata: before } = await openOwnedDirectory(directory);
  try {
    await handle.sync();
    const after = await handle.stat({ bigint: true });
    assertOwnedDirectory(after);
    if (!sameFileIdentity(before, after)) {
      throw new Error('Presentation storage directory changed while syncing');
    }
    await assertPathNamesDirectory(directory, after);
  } finally {
    await handle.close();
  }
};

/** Resolves and owns all private presentation-run filesystem areas. */
export class PresentationRunFiles {
  readonly roots: PresentationRunFileRoots;
  private readonly userDataDir: string;
  private readonly tempDir: string;
  private readonly randomUUID: () => string;
  private readonly syncDirectory: PresentationDirectorySync;
  private readonly failureInjector?: PresentationRunFilesOptions['failureInjector'];
  private readonly writeCandidateChunk: PresentationCandidateWrite;

  constructor(options: PresentationRunFilesOptions) {
    const userDataDir = path.resolve(options.userDataDir);
    const tempDir = path.resolve(options.tempDir);
    this.userDataDir = userDataDir;
    this.tempDir = tempDir;
    this.randomUUID = options.randomUUID ?? createRandomUUID;
    this.syncDirectory = options.syncDirectory ?? syncPosixDirectory;
    this.failureInjector = options.failureInjector;
    this.writeCandidateChunk =
      options.writeCandidateChunk ??
      (async (target, buffer, offset, length, position): Promise<number> => {
        const { bytesWritten } = await target.write(buffer, offset, length, position);
        return bytesWritten;
      });
    this.roots = {
      runRoot: path.join(userDataDir, 'presentation-runs'),
      grantRoot: path.join(userDataDir, 'presentation-source-grants'),
      draftRoot: path.join(userDataDir, 'presentation-source-drafts'),
      runTombstoneRoot: path.join(userDataDir, 'presentation-run-tombstones'),
      grantTombstoneRoot: path.join(userDataDir, 'presentation-source-grant-tombstones'),
      draftTombstoneRoot: path.join(userDataDir, 'presentation-source-draft-tombstones'),
      journalRoot: path.join(userDataDir, 'presentation-run-journal'),
      indexRoot: path.join(userDataDir, 'presentation-run-indexes'),
      quarantineRoot: path.join(userDataDir, 'presentation-run-quarantine'),
      stagingRoot: path.join(tempDir, 'aionui-presentation-runs'),
      inspectionRoot: path.join(tempDir, 'aionui-presentation-inspection'),
    };
  }

  async initialize(): Promise<void> {
    await Promise.all(Object.values(this.roots).map((directory) => this.ensureOwnedDirectory(directory)));
  }

  async createRunLayout(runId: string): Promise<{
    runDirectory: string;
    retainedDirectory: string;
    stagingDirectory: string;
  }> {
    assertUuid(runId, 'run');
    await this.initialize();
    const runDirectory = this.ownedChild(this.roots.runRoot, runId);
    const retainedDirectory = path.join(runDirectory, 'retained');
    const stagingRunDirectory = this.ownedChild(this.roots.stagingRoot, runId);
    const stagingDirectory = path.join(stagingRunDirectory, 'agent');
    await this.ensureOwnedDirectory(runDirectory);
    await this.ensureOwnedDirectory(retainedDirectory);
    await this.ensureOwnedDirectory(stagingRunDirectory);
    await this.ensureOwnedDirectory(stagingDirectory);
    return { runDirectory, retainedDirectory, stagingDirectory };
  }

  async createGrantLayout(grantId: string): Promise<string> {
    assertUuid(grantId, 'source grant');
    await this.initialize();
    const directory = this.ownedChild(this.roots.grantRoot, grantId);
    await this.ensureOwnedDirectory(directory);
    return directory;
  }

  async createDraftLayout(draftId: string): Promise<string> {
    assertUuid(draftId, 'source draft');
    await this.initialize();
    const directory = this.ownedChild(this.roots.draftRoot, draftId);
    await this.ensureOwnedDirectory(directory);
    return directory;
  }

  async createInspectionLayout(runId: string): Promise<string> {
    assertUuid(runId, 'run');
    await this.initialize();
    const runDirectory = this.ownedChild(this.roots.inspectionRoot, runId);
    await this.ensureOwnedDirectory(runDirectory);
    const inspectionId = this.randomUUID();
    assertUuid(inspectionId, 'inspection');
    const inspectionDirectory = this.ownedChild(runDirectory, inspectionId);
    await this.ensureOwnedDirectory(inspectionDirectory);
    return inspectionDirectory;
  }

  getEntityManifestPath(kind: PresentationRunEntityKind, entityId: string): string {
    const root = this.entityRoot(kind);
    if (kind.endsWith('-tombstone')) {
      assertUuid(entityId, kind.replace('-tombstone', ''));
      return path.join(root, `${entityId}.json`);
    }
    assertUuid(entityId, kind === 'grant' ? 'source grant' : kind === 'draft' ? 'source draft' : 'run');
    return path.join(this.ownedChild(root, entityId), 'manifest.json');
  }

  getJournalPath(): string {
    return path.join(this.roots.journalRoot, 'journal.jsonl');
  }

  getIndexPath(): string {
    return path.join(this.roots.indexRoot, 'index.json');
  }

  async withJournalDirectoryLease<T>(operation: (lease: PresentationOwnedDirectoryLease) => Promise<T>): Promise<T> {
    return this.withDirectoryLease([this.userDataDir, this.roots.journalRoot], operation);
  }

  async withIndexDirectoryLease<T>(operation: (lease: PresentationOwnedDirectoryLease) => Promise<T>): Promise<T> {
    return this.withDirectoryLease([this.userDataDir, this.roots.indexRoot], operation);
  }

  async withEntityParentDirectoryLease<T>(
    kind: PresentationRunEntityKind,
    entityId: string,
    operation: (lease: PresentationOwnedDirectoryLease) => Promise<T>
  ): Promise<T> {
    this.getEntityManifestPath(kind, entityId);
    const root = this.entityRoot(kind);
    const directories = kind.endsWith('-tombstone')
      ? [this.userDataDir, root]
      : [this.userDataDir, root, this.ownedChild(root, entityId)];
    return this.withDirectoryLease(directories, operation);
  }

  async withExistingEntityParentDirectoryLease<T>(
    kind: PresentationRunEntityKind,
    entityId: string,
    operation: (lease: PresentationOwnedDirectoryLease) => Promise<T>
  ): Promise<T | null> {
    this.getEntityManifestPath(kind, entityId);
    const root = this.entityRoot(kind);
    const rootLease = await OwnedDirectoryLease.acquire([this.userDataDir, root], this.syncOwnedDirectory.bind(this));
    let childLease: OwnedDirectoryLease | null = null;
    try {
      if (!kind.endsWith('-tombstone')) {
        const child = this.ownedChild(root, entityId);
        try {
          childLease = await OwnedDirectoryLease.acquire([child], this.syncOwnedDirectory.bind(this));
        } catch (error) {
          await rootLease.assertCurrent();
          if (hasCode(error, 'ENOENT')) return null;
          throw error;
        }
      }
      const combinedLease: PresentationOwnedDirectoryLease = {
        assertCurrent: async (): Promise<void> => {
          await rootLease.assertCurrent();
          await childLease?.assertCurrent();
          await rootLease.assertCurrent();
        },
        sync: async (directory: string): Promise<void> => {
          const resolved = path.resolve(directory);
          if (childLease !== null && resolved === this.ownedChild(root, entityId)) {
            await childLease.sync(resolved);
            return;
          }
          await rootLease.sync(resolved);
        },
      };
      await combinedLease.assertCurrent();
      const result = await operation(combinedLease);
      await combinedLease.assertCurrent();
      return result;
    } finally {
      await childLease?.close();
      await rootLease.close();
    }
  }

  async withPreparedRetainedCandidateLeases<T>(
    preparedCandidates: readonly PreparedRetainedCandidate[],
    operation: (guard: PresentationPreparedCandidateGuard) => Promise<T>
  ): Promise<T> {
    for (const prepared of preparedCandidates) assertPreparedRetainedCandidate(prepared);
    const directories = preparedCandidates.flatMap((prepared) => this.durableRunDirectoryChain(prepared.runId));
    return this.withDirectoryLease(directories, async (directoryLease) => {
      const candidates: VerifiedCandidateLease[] = [];
      try {
        for (const prepared of preparedCandidates) {
          const temporaryPath = path.join(
            this.ownedChild(this.roots.runRoot, prepared.runId),
            prepared.temporaryRelativePath
          );
          candidates.push(
            await openVerifiedCandidateLease(
              temporaryPath,
              prepared,
              {
                unsafe: 'Retained candidate temporary file is unsafe',
                changed: 'Retained candidate temporary file changed',
              },
              prepared
            )
          );
        }
        const guard: PresentationPreparedCandidateGuard = {
          assertCurrent: async (): Promise<void> => {
            await directoryLease.assertCurrent();
            for (const candidate of candidates) await assertVerifiedCandidateLease(candidate);
            await directoryLease.assertCurrent();
          },
        };
        await guard.assertCurrent();
        const result = await operation(guard);
        await guard.assertCurrent();
        return result;
      } finally {
        await Promise.all(candidates.map(({ handle }) => handle.close()));
      }
    });
  }

  getStagingCandidatePath(runId: string): string {
    assertUuid(runId, 'run');
    return path.join(this.roots.stagingRoot, runId, 'agent', CANDIDATE_NAME);
  }

  async getStagingCandidateByteLength(runId: string): Promise<number> {
    const sourcePath = this.getStagingCandidatePath(runId);
    const message = 'Presentation staging candidate must be one bounded regular file';
    return this.withDirectoryLease(this.stagingCandidateDirectoryChain(runId), async (directoryLease) => {
      const { handle: source, metadata } = await openOwnedRegularFile(sourcePath, message);
      try {
        if (metadata.size > BigInt(PRESENTATION_RUN_LIMITS.MAX_CANDIDATE_COMPRESSED_BYTES)) {
          throw new Error(message);
        }
        await assertPathNamesFile(sourcePath, metadata, message);
        await directoryLease.assertCurrent();
        return Number(metadata.size);
      } finally {
        await source.close();
      }
    });
  }

  async prepareRetainedCandidate(runId: string): Promise<PreparedRetainedCandidate> {
    const layout = await this.createRunLayout(runId);
    const sourcePath = this.getStagingCandidatePath(runId);
    const temporaryRelativePath = `retained/.candidate-${this.randomUUID()}.tmp`;
    const temporaryPath = path.join(layout.runDirectory, temporaryRelativePath);
    const sourceMessage = 'Presentation staging candidate must be one bounded regular file';
    const directoryChain = [...this.stagingCandidateDirectoryChain(runId), ...this.durableRunDirectoryChain(runId)];
    return this.withDirectoryLease(directoryChain, async (directoryLease) => {
      let source: OpenHandle | null = null;
      let target: OpenHandle | null = null;
      let targetIdentity: FileMetadata | null = null;
      try {
        await this.inject({ boundary: 'before-candidate-source-open', runId });
        await directoryLease.assertCurrent();
        const openedSource = await openOwnedRegularFile(sourcePath, sourceMessage);
        source = openedSource.handle;
        const before = openedSource.metadata;
        if (before.size > BigInt(PRESENTATION_RUN_LIMITS.MAX_CANDIDATE_COMPRESSED_BYTES)) {
          throw new Error(sourceMessage);
        }
        const byteLength = Number(before.size);
        const beforeHash = await hashOpenFile(source, byteLength);
        await this.inject({ boundary: 'before-candidate-temp-create', runId });
        await directoryLease.assertCurrent();
        target = await open(
          temporaryPath,
          constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | noFollowFlag(),
          PRESENTATION_RUN_LIMITS.OWNED_FILE_MODE
        );
        targetIdentity = await target.stat({ bigint: true });
        assertOwnedRegularFile(targetIdentity, 'Retained candidate temporary file is unsafe');
        await assertPathNamesFile(temporaryPath, targetIdentity, 'Retained candidate temporary file is unsafe');
        const copiedHash = createHash('sha256');
        const buffer = Buffer.allocUnsafe(Math.min(COPY_BUFFER_BYTES, Math.max(byteLength, 1)));
        let position = 0;
        await this.inject({ boundary: 'before-candidate-temp-write', runId });
        await directoryLease.assertCurrent();
        while (position < byteLength) {
          const { bytesRead } = await source.read(buffer, 0, Math.min(buffer.length, byteLength - position), position);
          if (bytesRead === 0) throw new Error('Presentation candidate changed while copying');
          let chunkOffset = 0;
          while (chunkOffset < bytesRead) {
            const remaining = bytesRead - chunkOffset;
            const bytesWritten = await this.writeCandidateChunk(
              target,
              buffer,
              chunkOffset,
              remaining,
              position + chunkOffset
            );
            if (!Number.isSafeInteger(bytesWritten) || bytesWritten <= 0 || bytesWritten > remaining) {
              throw new Error('Presentation retained candidate write was incomplete');
            }
            copiedHash.update(buffer.subarray(chunkOffset, chunkOffset + bytesWritten));
            chunkOffset += bytesWritten;
          }
          position += bytesRead;
        }
        await this.inject({ boundary: 'after-candidate-temp-write', runId });
        await directoryLease.assertCurrent();
        await assertPathNamesFile(temporaryPath, targetIdentity, 'Retained candidate temporary file changed');
        await this.inject({ boundary: 'before-candidate-temp-fsync', runId });
        await directoryLease.assertCurrent();
        await target.sync();
        await this.inject({ boundary: 'after-candidate-temp-fsync', runId });
        await directoryLease.assertCurrent();
        await target.close();
        target = null;
        const afterCopy = await source.stat({ bigint: true });
        const afterHash = await hashOpenFile(source, Number(afterCopy.size));
        const after = await source.stat({ bigint: true });
        const retainedHash = copiedHash.digest('hex');
        if (
          !sameFileIdentity(before, after) ||
          before.size !== after.size ||
          before.mtimeNs !== after.mtimeNs ||
          before.ctimeNs !== after.ctimeNs ||
          !sameFileIdentity(afterCopy, after) ||
          afterCopy.size !== after.size ||
          beforeHash !== retainedHash ||
          beforeHash !== afterHash
        ) {
          throw new Error('Presentation staging candidate changed while retaining');
        }
        await assertPathNamesFile(sourcePath, after, 'Presentation staging candidate changed while retaining');
        await directoryLease.assertCurrent();
        await this.inject({ boundary: 'before-candidate-temp-directory-fsync', runId });
        await directoryLease.assertCurrent();
        await directoryLease.sync(layout.retainedDirectory);
        await this.inject({ boundary: 'after-candidate-temp-directory-fsync', runId });
        await directoryLease.assertCurrent();
        const identity = fileIdentity(targetIdentity);
        const verifiedTemporary = await verifyCandidatePath(
          temporaryPath,
          { sha256: beforeHash, byteLength },
          {
            unsafe: 'Retained candidate temporary file is unsafe',
            changed: 'Retained candidate temporary file changed',
          },
          identity
        );
        if (!sameFileIdentity(targetIdentity, verifiedTemporary)) {
          throw new Error('Retained candidate temporary file changed');
        }
        return {
          runId,
          temporaryRelativePath,
          finalRelativePath: RETAINED_CANDIDATE_RELATIVE_PATH,
          sha256: beforeHash,
          byteLength,
          ...identity,
        };
      } catch (error) {
        if (target !== null) await target.close().catch((): undefined => undefined);
        if (error instanceof PresentationRunSimulatedProcessCrashError) throw error;
        if (targetIdentity !== null) {
          await this.removeLeafWithExpectedIdentity(
            temporaryPath,
            targetIdentity,
            layout.retainedDirectory,
            directoryLease
          ).catch((): undefined => undefined);
        }
        throw error;
      } finally {
        if (source !== null) await source.close();
      }
    });
  }

  async promoteRetainedCandidate(prepared: PreparedRetainedCandidate): Promise<void> {
    assertPreparedRetainedCandidate(prepared);
    const runDirectory = this.ownedChild(this.roots.runRoot, prepared.runId);
    const temporaryPath = path.join(runDirectory, prepared.temporaryRelativePath);
    const finalPath = path.join(runDirectory, prepared.finalRelativePath);
    await this.withDirectoryLease(this.durableRunDirectoryChain(prepared.runId), async (directoryLease) => {
      const candidate = await openVerifiedCandidateLease(
        temporaryPath,
        prepared,
        {
          unsafe: 'Retained candidate temporary file is unsafe',
          changed: 'Retained candidate temporary file changed',
        },
        prepared
      );
      try {
        try {
          await lstat(finalPath, { bigint: true });
          throw new Error('Retained candidate already exists');
        } catch (error) {
          if (!hasCode(error, 'ENOENT')) throw error;
        }
        await directoryLease.assertCurrent();
        await this.inject({ boundary: 'before-candidate-promotion-rename', runId: prepared.runId });
        await directoryLease.assertCurrent();
        await assertVerifiedCandidateLease(candidate);
        await rename(temporaryPath, finalPath);
        candidate.path = finalPath;
        candidate.messages = {
          unsafe: 'Retained candidate promotion found an unsafe final file',
          changed: 'Retained candidate promotion found mismatched bytes',
        };
        await this.inject({ boundary: 'after-candidate-promotion-rename', runId: prepared.runId });
        await directoryLease.assertCurrent();
        await assertVerifiedCandidateLease(candidate);
        await this.inject({ boundary: 'before-candidate-promotion-directory-fsync', runId: prepared.runId });
        await directoryLease.assertCurrent();
        await directoryLease.sync(path.dirname(finalPath));
        await this.inject({ boundary: 'after-candidate-promotion-directory-fsync', runId: prepared.runId });
        await directoryLease.assertCurrent();
        await assertVerifiedCandidateLease(candidate);
      } finally {
        await candidate.handle.close();
      }
    });
  }

  async verifyPreparedRetainedCandidate(prepared: PreparedRetainedCandidate): Promise<void> {
    await this.inspectPreparedRetainedCandidate(prepared);
  }

  private async inspectPreparedRetainedCandidate(prepared: PreparedRetainedCandidate): Promise<FileMetadata> {
    assertPreparedRetainedCandidate(prepared);
    const runDirectory = this.ownedChild(this.roots.runRoot, prepared.runId);
    const temporaryPath = path.join(runDirectory, prepared.temporaryRelativePath);
    return this.withDirectoryLease(this.durableRunDirectoryChain(prepared.runId), async () => {
      return verifyCandidatePath(
        temporaryPath,
        prepared,
        {
          unsafe: 'Retained candidate temporary file is unsafe',
          changed: 'Retained candidate temporary file changed',
        },
        prepared
      );
    });
  }

  async recoverRetainedCandidatePromotion(prepared: PreparedRetainedCandidate): Promise<void> {
    assertPreparedRetainedCandidate(prepared);
    const runDirectory = this.ownedChild(this.roots.runRoot, prepared.runId);
    const temporaryPath = path.join(runDirectory, prepared.temporaryRelativePath);
    const finalPath = path.join(runDirectory, prepared.finalRelativePath);
    const finalExists = await this.withDirectoryLease(
      this.durableRunDirectoryChain(prepared.runId),
      async (directoryLease) => {
        let candidate: VerifiedCandidateLease;
        try {
          candidate = await openVerifiedCandidateLease(
            finalPath,
            prepared,
            {
              unsafe: 'Retained candidate recovery found mismatched bytes',
              changed: 'Retained candidate recovery found mismatched bytes',
            },
            prepared
          );
        } catch (error) {
          if (hasCode(error, 'ENOENT')) return false;
          throw error;
        }
        try {
          try {
            await lstat(temporaryPath, { bigint: true });
            throw new Error('Retained candidate recovery found an unexpected temporary file');
          } catch (error) {
            if (!hasCode(error, 'ENOENT')) throw error;
          }
          await directoryLease.assertCurrent();
          await assertVerifiedCandidateLease(candidate);
          return true;
        } finally {
          await candidate.handle.close();
        }
      }
    );
    if (!finalExists) await this.promoteRetainedCandidate(prepared);
  }

  async removePreparedRetainedCandidate(prepared: PreparedRetainedCandidate): Promise<void> {
    assertPreparedRetainedCandidate(prepared);
    const runDirectory = this.ownedChild(this.roots.runRoot, prepared.runId);
    const temporaryPath = path.join(runDirectory, prepared.temporaryRelativePath);
    await this.withDirectoryLease(this.durableRunDirectoryChain(prepared.runId), async (directoryLease) => {
      let candidate: VerifiedCandidateLease;
      try {
        candidate = await openVerifiedCandidateLease(
          temporaryPath,
          prepared,
          {
            unsafe: 'Retained candidate temporary file is unsafe',
            changed: 'Retained candidate temporary file changed',
          },
          prepared
        );
      } catch (error) {
        if (hasCode(error, 'ENOENT')) {
          await directoryLease.assertCurrent();
          await assertPathAbsent(temporaryPath, 'Presentation cleanup target reappeared');
          await directoryLease.assertCurrent();
          return;
        }
        throw error;
      }
      try {
        await directoryLease.assertCurrent();
        await assertVerifiedCandidateLease(candidate);
        await rm(temporaryPath);
        const after = await candidate.handle.stat({ bigint: true });
        if (!sameFileIdentity(candidate.metadata, after)) throw new Error('Retained candidate temporary file changed');
        await directoryLease.assertCurrent();
        await assertPathAbsent(temporaryPath, 'Presentation cleanup target reappeared');
        await directoryLease.assertCurrent();
        await directoryLease.sync(path.dirname(temporaryPath));
        await directoryLease.assertCurrent();
        await assertPathAbsent(temporaryPath, 'Presentation cleanup target reappeared');
        await directoryLease.assertCurrent();
      } finally {
        await candidate.handle.close();
      }
    });
  }

  async withAuthorizedRetainedCandidate<T>(
    runId: string,
    candidate: PresentationRunRetainedCandidate | null,
    operation: (reader: PresentationRetainedCandidateReader) => Promise<T>
  ): Promise<T | null> {
    assertUuid(runId, 'run');
    if (candidate === null) return null;
    if (candidate.relativePath !== RETAINED_CANDIDATE_RELATIVE_PATH) {
      throw new Error('Authorized retained candidate is unavailable');
    }
    const candidatePath = path.join(this.ownedChild(this.roots.runRoot, runId), candidate.relativePath);
    return this.withDirectoryLease(this.durableRunDirectoryChain(runId), async (directoryLease) => {
      const file = await openVerifiedCandidateLease(candidatePath, candidate, {
        unsafe: 'Authorized retained candidate is unavailable',
        changed: 'Authorized retained candidate does not match its manifest',
      });
      try {
        const reader: PresentationRetainedCandidateReader = Object.freeze({
          byteLength: candidate.byteLength,
          readAt: async (position: number, length: number): Promise<Buffer> => {
            if (
              !Number.isSafeInteger(position) ||
              position < 0 ||
              !Number.isSafeInteger(length) ||
              length < 0 ||
              position > candidate.byteLength ||
              length > candidate.byteLength - position
            ) {
              throw new Error('Authorized retained candidate read is out of bounds');
            }
            const bytes = Buffer.alloc(length);
            let offset = 0;
            while (offset < length) {
              const { bytesRead } = await file.handle.read(bytes, offset, length - offset, position + offset);
              if (bytesRead === 0) throw new Error('Authorized retained candidate changed while reading');
              offset += bytesRead;
            }
            return bytes;
          },
        });
        const result = await operation(reader);
        await directoryLease.assertCurrent();
        await assertVerifiedCandidateLease(file);
        await directoryLease.assertCurrent();
        return result;
      } finally {
        await file.handle.close();
      }
    });
  }

  async removeRun(runId: string): Promise<void> {
    assertUuid(runId, 'run');
    await this.removeOwnedDirectoryTree(
      [this.userDataDir, this.roots.runRoot, this.ownedChild(this.roots.runRoot, runId)],
      this.ownedChild(this.roots.runRoot, runId),
      { boundary: 'before-run-cleanup', runId }
    );
    await this.removeOwnedDirectoryTree(
      [this.tempDir, this.roots.stagingRoot, this.ownedChild(this.roots.stagingRoot, runId)],
      this.ownedChild(this.roots.stagingRoot, runId)
    );
    await this.removeOwnedDirectoryTree(
      [this.tempDir, this.roots.inspectionRoot, this.ownedChild(this.roots.inspectionRoot, runId)],
      this.ownedChild(this.roots.inspectionRoot, runId)
    );
  }

  async removeGrant(grantId: string): Promise<void> {
    assertUuid(grantId, 'source grant');
    const directory = this.ownedChild(this.roots.grantRoot, grantId);
    await this.removeOwnedDirectoryTree([this.userDataDir, this.roots.grantRoot, directory], directory);
  }

  async removeDraft(draftId: string): Promise<void> {
    assertUuid(draftId, 'source draft');
    const directory = this.ownedChild(this.roots.draftRoot, draftId);
    await this.removeOwnedDirectoryTree([this.userDataDir, this.roots.draftRoot, directory], directory);
  }

  async listEntityIds(kind: 'run' | 'grant' | 'draft'): Promise<string[]> {
    await this.initialize();
    const root = this.entityRoot(kind);
    return this.withDirectoryLease([this.userDataDir, root], async () => {
      const entries = await readdir(root, { withFileTypes: true });
      return entries.filter((entry) => entry.isDirectory() && UUID_RE.test(entry.name)).map((entry) => entry.name);
    });
  }

  async listTombstoneIds(kind: 'run' | 'grant' | 'draft'): Promise<string[]> {
    await this.initialize();
    const root = this.entityRoot(`${kind}-tombstone`);
    return this.withDirectoryLease([this.userDataDir, root], async () => {
      const entries = await readdir(root, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json') && UUID_RE.test(entry.name.slice(0, -5)))
        .map((entry) => entry.name.slice(0, -5));
    });
  }

  async removeTombstone(kind: 'run' | 'grant' | 'draft', entityId: string): Promise<void> {
    const entityKind = `${kind}-tombstone` as PresentationRunEntityKind;
    const tombstonePath = this.getEntityManifestPath(entityKind, entityId);
    const root = this.entityRoot(entityKind);
    await this.withDirectoryLease([this.userDataDir, root], async (directoryLease) => {
      let opened: { handle: OpenHandle; metadata: FileMetadata };
      try {
        opened = await openOwnedRegularFile(tombstonePath, 'Presentation tombstone file is unsafe');
      } catch (error) {
        if (hasCode(error, 'ENOENT')) {
          await directoryLease.assertCurrent();
          await assertPathAbsent(tombstonePath, 'Presentation cleanup target reappeared');
          await directoryLease.assertCurrent();
          return;
        }
        throw error;
      }
      await opened.handle.close();
      await this.removeLeafWithExpectedIdentity(tombstonePath, opened.metadata, root, directoryLease);
    });
  }

  async removeUnreferencedCandidateTemps(runId: string, keepRelativePath?: string): Promise<void> {
    assertUuid(runId, 'run');
    const retainedDirectory = path.join(this.ownedChild(this.roots.runRoot, runId), 'retained');
    try {
      const opened = await openOwnedDirectory(retainedDirectory);
      await opened.handle.close();
    } catch (error) {
      if (hasCode(error, 'ENOENT')) return;
      throw error;
    }
    await this.withDirectoryLease(this.durableRunDirectoryChain(runId), async (directoryLease) => {
      const entries = await readdir(retainedDirectory);
      const removable = entries.filter(
        (entry) => /^\.candidate-[0-9a-f-]+\.tmp$/i.test(entry) && `retained/${entry}` !== keepRelativePath
      );
      for (const entry of removable) {
        const temporaryPath = path.join(retainedDirectory, entry);
        const opened = await openOwnedRegularFile(temporaryPath, 'Retained candidate temporary file is unsafe');
        await opened.handle.close();
        await this.removeLeafWithExpectedIdentity(temporaryPath, opened.metadata, retainedDirectory, directoryLease);
      }
    });
  }

  async quarantineEntity(kind: PresentationRunEntityKind, entityId: string): Promise<string> {
    const baseKind = kind.replace('-tombstone', '') as 'run' | 'grant' | 'draft';
    assertUuid(entityId, baseKind === 'grant' ? 'source grant' : baseKind === 'draft' ? 'source draft' : 'run');
    await this.initialize();
    const source = kind.endsWith('-tombstone')
      ? this.getEntityManifestPath(kind, entityId)
      : this.ownedChild(this.entityRoot(kind), entityId);
    const destination = path.join(this.roots.quarantineRoot, `${kind}-${entityId}-${this.randomUUID()}`);
    const sourceRoot = this.entityRoot(kind);
    const sourceIsDirectory = !kind.endsWith('-tombstone');
    const directoryChain = [this.userDataDir, sourceRoot, this.roots.quarantineRoot];
    if (sourceIsDirectory) directoryChain.push(source);
    const directoryLease = await OwnedDirectoryLease.acquire(directoryChain, this.syncOwnedDirectory.bind(this));
    let sourceHandle: OpenHandle | null = null;
    try {
      const opened = sourceIsDirectory
        ? await openOwnedDirectory(source)
        : await openOwnedRegularFile(source, 'Presentation quarantine source is unsafe');
      sourceHandle = opened.handle;
      const assertDestination = async (): Promise<void> => {
        const current = await opened.handle.stat({ bigint: true });
        if (!sameFileIdentity(opened.metadata, current)) {
          throw new Error('Presentation quarantine destination changed');
        }
        try {
          if (sourceIsDirectory) {
            await assertPathNamesDirectory(destination, current);
          } else {
            await assertPathNamesFile(destination, current, 'Presentation quarantine destination changed');
          }
        } catch (error) {
          throw new Error('Presentation quarantine destination changed', { cause: error });
        }
      };
      await directoryLease.assertCurrent();
      await rename(source, destination);
      if (sourceIsDirectory) {
        await directoryLease.assertParentsCurrent(source);
      } else {
        await directoryLease.assertCurrent();
      }
      await assertDestination();
      await directoryLease.sync(sourceRoot);
      await directoryLease.sync(this.roots.quarantineRoot);
      if (sourceIsDirectory) {
        await directoryLease.assertParentsCurrent(source);
      } else {
        await directoryLease.assertCurrent();
      }
      await assertDestination();
      if (sourceIsDirectory) {
        await directoryLease.assertParentsCurrent(source);
      } else {
        await directoryLease.assertCurrent();
      }
    } finally {
      if (sourceHandle !== null) await sourceHandle.close();
      await directoryLease.close();
    }
    return destination;
  }

  async syncOwnedDirectory(directory: string): Promise<void> {
    const { handle, metadata: before } = await openOwnedDirectory(directory);
    try {
      await this.syncDirectory(directory);
      const after = await handle.stat({ bigint: true });
      assertOwnedDirectory(after);
      if (!sameFileIdentity(before, after)) {
        throw new Error('Presentation storage directory changed while syncing');
      }
      await assertPathNamesDirectory(directory, after);
    } finally {
      await handle.close();
    }
  }

  private entityRoot(kind: PresentationRunEntityKind): string {
    if (kind === 'run') return this.roots.runRoot;
    if (kind === 'grant') return this.roots.grantRoot;
    if (kind === 'draft') return this.roots.draftRoot;
    if (kind === 'run-tombstone') return this.roots.runTombstoneRoot;
    if (kind === 'grant-tombstone') return this.roots.grantTombstoneRoot;
    return this.roots.draftTombstoneRoot;
  }

  private ownedChild(root: string, id: string): string {
    const child = path.join(root, id);
    if (path.dirname(child) !== root) throw new Error('Presentation path escaped its owned root');
    return child;
  }

  private durableRunDirectoryChain(runId: string): string[] {
    const runDirectory = this.ownedChild(this.roots.runRoot, runId);
    return [this.userDataDir, this.roots.runRoot, runDirectory, path.join(runDirectory, 'retained')];
  }

  private stagingCandidateDirectoryChain(runId: string): string[] {
    const runDirectory = this.ownedChild(this.roots.stagingRoot, runId);
    return [this.tempDir, this.roots.stagingRoot, runDirectory, path.join(runDirectory, 'agent')];
  }

  private parentDirectoryChain(directory: string): string[] {
    const resolved = path.resolve(directory);
    const base = [this.userDataDir, this.tempDir].find((candidate) => {
      const relative = path.relative(candidate, resolved);
      return (
        relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)
      );
    });
    if (!base) throw new Error('Presentation directory escaped its configured storage roots');
    const parent = path.dirname(resolved);
    const relativeParent = path.relative(base, parent);
    const segments = relativeParent === '' ? [] : relativeParent.split(path.sep);
    const chain = [base];
    for (const segment of segments) chain.push(path.join(chain.at(-1)!, segment));
    return chain;
  }

  private async withDirectoryLease<T>(
    directories: readonly string[],
    operation: (lease: OwnedDirectoryLease) => Promise<T>
  ): Promise<T> {
    if (directories.length === 0) {
      const lease = await OwnedDirectoryLease.acquire([], this.syncOwnedDirectory.bind(this));
      try {
        return await operation(lease);
      } finally {
        await lease.close();
      }
    }
    const lease = await OwnedDirectoryLease.acquire(directories, this.syncOwnedDirectory.bind(this));
    try {
      const result = await operation(lease);
      await lease.assertCurrent();
      return result;
    } finally {
      await lease.close();
    }
  }

  private async removeLeafWithExpectedIdentity(
    filePath: string,
    expected: FileMetadata,
    parentDirectory: string,
    directoryLease: OwnedDirectoryLease
  ): Promise<void> {
    await directoryLease.assertCurrent();
    let opened: { handle: OpenHandle; metadata: FileMetadata };
    try {
      opened = await openOwnedRegularFile(filePath, 'Presentation storage file changed before cleanup');
    } catch (error) {
      if (hasCode(error, 'ENOENT')) {
        await directoryLease.assertCurrent();
        await assertPathAbsent(filePath, 'Presentation cleanup target reappeared');
        await directoryLease.assertCurrent();
        return;
      }
      throw error;
    }
    try {
      if (!sameFileIdentity(expected, opened.metadata)) {
        throw new Error('Presentation storage file changed before cleanup');
      }
      await directoryLease.assertCurrent();
      await assertPathNamesFile(filePath, opened.metadata, 'Presentation storage file changed before cleanup');
      await rm(filePath);
      const after = await opened.handle.stat({ bigint: true });
      if (!sameFileIdentity(opened.metadata, after)) {
        throw new Error('Presentation storage file changed before cleanup');
      }
      await directoryLease.assertCurrent();
      await assertPathAbsent(filePath, 'Presentation cleanup target reappeared');
      await directoryLease.assertCurrent();
      await directoryLease.sync(parentDirectory);
      await directoryLease.assertCurrent();
      await assertPathAbsent(filePath, 'Presentation cleanup target reappeared');
      await directoryLease.assertCurrent();
    } finally {
      await opened.handle.close();
    }
  }

  private async removeOwnedDirectoryTree(
    directoryChain: readonly string[],
    targetDirectory: string,
    failurePoint?: PresentationRunFileFailurePoint
  ): Promise<void> {
    const parentLease = await OwnedDirectoryLease.acquire(
      directoryChain.slice(0, -1),
      this.syncOwnedDirectory.bind(this)
    );
    let targetLease: OwnedDirectoryLease | null = null;
    try {
      try {
        targetLease = await OwnedDirectoryLease.acquire([targetDirectory], this.syncOwnedDirectory.bind(this));
      } catch (error) {
        await parentLease.assertCurrent();
        if (!hasCode(error, 'ENOENT')) throw error;
        await assertPathAbsent(targetDirectory, 'Presentation cleanup target reappeared');
        await parentLease.assertCurrent();
        return;
      }
      if (failurePoint) await this.inject(failurePoint);
      await parentLease.assertCurrent();
      await targetLease.assertCurrent();
      await parentLease.assertCurrent();
      // Node has no openat/unlinkat API. Held no-follow directory handles and immediate
      // pre/post checks fail closed on persistent drift; OS sandboxing is still the boundary
      // for a hostile same-UID actor swapping and restoring names inside this single syscall.
      await rm(targetDirectory, { recursive: true });
      await parentLease.assertCurrent();
      await assertPathAbsent(targetDirectory, 'Presentation cleanup target reappeared');
      await parentLease.assertCurrent();
      await parentLease.sync(path.dirname(targetDirectory));
      await parentLease.assertCurrent();
      await assertPathAbsent(targetDirectory, 'Presentation cleanup target reappeared');
      await parentLease.assertCurrent();
    } finally {
      await targetLease?.close();
      await parentLease.close();
    }
  }

  private async ensureOwnedDirectory(directory: string): Promise<void> {
    const parentDirectory = path.dirname(directory);
    const parentLease = await OwnedDirectoryLease.acquire(
      this.parentDirectoryChain(directory),
      this.syncOwnedDirectory.bind(this)
    );
    let created = false;
    try {
      await parentLease.assertCurrent();
      try {
        await mkdir(directory, { mode: PRESENTATION_RUN_LIMITS.OWNED_DIRECTORY_MODE });
        created = true;
      } catch (error) {
        if (!hasCode(error, 'EEXIST')) throw error;
      }
      await parentLease.assertCurrent();
      const { handle, metadata: before } = await openOwnedDirectory(directory);
      try {
        if ((before.mode & BigInt(0o777)) !== BigInt(PRESENTATION_RUN_LIMITS.OWNED_DIRECTORY_MODE)) {
          await handle.chmod(PRESENTATION_RUN_LIMITS.OWNED_DIRECTORY_MODE);
          await handle.sync();
        }
        const after = await handle.stat({ bigint: true });
        assertOwnedDirectory(after);
        if (
          !sameFileIdentity(before, after) ||
          (after.mode & BigInt(0o777)) !== BigInt(PRESENTATION_RUN_LIMITS.OWNED_DIRECTORY_MODE)
        ) {
          throw new Error('Presentation storage directory must be real and owned by the current user');
        }
        await assertPathNamesDirectory(directory, after);
        await parentLease.assertCurrent();
      } finally {
        await handle.close();
      }
      if (created) await parentLease.sync(parentDirectory);
    } finally {
      await parentLease.close();
    }
  }

  private async inject(point: PresentationRunFileFailurePoint): Promise<void> {
    await this.failureInjector?.(point);
  }
}
