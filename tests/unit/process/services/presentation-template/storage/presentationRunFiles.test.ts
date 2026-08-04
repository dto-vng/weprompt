/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { access, link, lstat, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PresentationRunFiles,
  syncPosixDirectory,
} from '@/process/services/presentation-template/run/storage/presentationRunFiles';

const RUN_ID = '434393ce-dd45-44fe-a51c-262b2b181cc5';
const GRANT_ID = '745b7d43-a0aa-4bb7-b0cc-283f2db4873d';
const DRAFT_ID = 'ab82a45e-f426-41d0-bdda-4e151a78a399';
const TEMP_ID = 'd1d50dfe-3650-48f3-b98f-d7f5b2148996';

const exists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

describe('PresentationRunFiles', () => {
  let fixtureRoot: string;
  let userDataDir: string;
  let systemTempDir: string;
  let files: PresentationRunFiles;

  beforeEach(async () => {
    fixtureRoot = await mkdtemp(path.join(tmpdir(), 'presentation-run-files-'));
    userDataDir = path.join(fixtureRoot, 'user-data');
    systemTempDir = path.join(fixtureRoot, 'system-temp');
    await Promise.all([mkdir(userDataDir), mkdir(systemTempDir)]);
    files = new PresentationRunFiles({ userDataDir, tempDir: systemTempDir, randomUUID: () => TEMP_ID });
  });

  afterEach(async () => {
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  it('separates durable grants, run state, retained bytes, staging, and inspection under owned roots', async () => {
    const run = await files.createRunLayout(RUN_ID);
    const grant = await files.createGrantLayout(GRANT_ID);
    const draft = await files.createDraftLayout(DRAFT_ID);
    const inspection = await files.createInspectionLayout(RUN_ID);

    expect(run).toEqual({
      runDirectory: path.join(userDataDir, 'presentation-runs', RUN_ID),
      retainedDirectory: path.join(userDataDir, 'presentation-runs', RUN_ID, 'retained'),
      stagingDirectory: path.join(systemTempDir, 'aionui-presentation-runs', RUN_ID, 'agent'),
    });
    expect(grant).toBe(path.join(userDataDir, 'presentation-source-grants', GRANT_ID));
    expect(draft).toBe(path.join(userDataDir, 'presentation-source-drafts', DRAFT_ID));
    expect(inspection).toBe(path.join(systemTempDir, 'aionui-presentation-inspection', RUN_ID, TEMP_ID));

    for (const directory of [run.runDirectory, run.retainedDirectory, run.stagingDirectory, grant, draft, inspection]) {
      expect((await lstat(directory)).mode & 0o777).toBe(0o700);
    }
  });

  it('copies the exact stable staging candidate into a private retained file', async () => {
    const layout = await files.createRunLayout(RUN_ID);
    const stagingCandidate = path.join(layout.stagingDirectory, 'candidate.pptx');
    await writeFile(stagingCandidate, 'stable candidate');

    const prepared = await files.prepareRetainedCandidate(RUN_ID);
    expect(prepared).toMatchObject({
      runId: RUN_ID,
      temporaryRelativePath: `retained/.candidate-${TEMP_ID}.tmp`,
      finalRelativePath: 'retained/candidate.pptx',
      sha256: 'ac080a4e1897afc20d8a16d6567a4c6c56a341443228b8ca72c63565dc7b0050',
      byteLength: 16,
    });
    expect(prepared.dev).toMatch(/^[0-9]+$/);
    expect(prepared.ino).toMatch(/^[1-9][0-9]*$/);

    const retainedPath = path.join(layout.retainedDirectory, 'candidate.pptx');
    await expect(files.promoteRetainedCandidate(prepared)).resolves.toBeUndefined();
    expect(await readFile(retainedPath, 'utf8')).toBe('stable candidate');
    expect((await lstat(retainedPath)).mode & 0o777).toBe(0o600);
    expect(await readFile(stagingCandidate, 'utf8')).toBe('stable candidate');
    await expect(files.recoverRetainedCandidatePromotion(prepared)).resolves.toBeUndefined();
    await expect(
      files.withAuthorizedRetainedCandidate(
        RUN_ID,
        {
          relativePath: prepared.finalRelativePath,
          sha256: prepared.sha256,
          byteLength: prepared.byteLength,
        },
        async (candidate) => (await candidate.readAt(0, candidate.byteLength)).toString('utf8')
      )
    ).resolves.toBe('stable candidate');
  });

  it('finishes every short candidate write before authorizing the retained temp', async () => {
    const writeCandidateChunk = vi.fn(
      async (target: FileHandle, buffer: Buffer, offset: number, length: number, position: number): Promise<number> => {
        const { bytesWritten } = await target.write(buffer, offset, Math.max(1, length - 1), position);
        return bytesWritten;
      }
    );
    const shortWriteFiles = new PresentationRunFiles({
      userDataDir,
      tempDir: systemTempDir,
      randomUUID: () => TEMP_ID,
      writeCandidateChunk,
    });
    const layout = await shortWriteFiles.createRunLayout(RUN_ID);
    await writeFile(path.join(layout.stagingDirectory, 'candidate.pptx'), 'stable candidate');

    const prepared = await shortWriteFiles.prepareRetainedCandidate(RUN_ID);
    const retainedPath = path.join(layout.retainedDirectory, 'candidate.pptx');
    await shortWriteFiles.promoteRetainedCandidate(prepared);

    expect(writeCandidateChunk).toHaveBeenCalledTimes(2);
    expect(await readFile(retainedPath, 'utf8')).toBe('stable candidate');
  });

  it('rehashes the closed retained temp immediately before authorizing it', async () => {
    const temporaryPath = path.join(userDataDir, 'presentation-runs', RUN_ID, `retained/.candidate-${TEMP_ID}.tmp`);
    const tamperingFiles = new PresentationRunFiles({
      userDataDir,
      tempDir: systemTempDir,
      randomUUID: () => TEMP_ID,
      failureInjector: async ({ boundary }) => {
        if (boundary === 'after-candidate-temp-directory-fsync') {
          await writeFile(temporaryPath, 'mutated candidat');
        }
      },
    });
    const layout = await tamperingFiles.createRunLayout(RUN_ID);
    await writeFile(path.join(layout.stagingDirectory, 'candidate.pptx'), 'stable candidate');

    await expect(tamperingFiles.prepareRetainedCandidate(RUN_ID)).rejects.toThrow(
      'Retained candidate temporary file changed'
    );
    await expect(exists(temporaryPath)).resolves.toBe(false);
  });

  it('rejects staging path replacement while copying from the open source inode', async () => {
    const outsider = path.join(fixtureRoot, 'replacement.pptx');
    const stagingCandidate = path.join(systemTempDir, 'aionui-presentation-runs', RUN_ID, 'agent', 'candidate.pptx');
    await writeFile(outsider, 'replacement bytes');
    const swappingFiles = new PresentationRunFiles({
      userDataDir,
      tempDir: systemTempDir,
      randomUUID: () => TEMP_ID,
      failureInjector: async ({ boundary }) => {
        if (boundary === 'after-candidate-temp-write') {
          await rm(stagingCandidate);
          await symlink(outsider, stagingCandidate);
        }
      },
    });
    const layout = await swappingFiles.createRunLayout(RUN_ID);
    await writeFile(path.join(layout.stagingDirectory, 'candidate.pptx'), 'stable candidate');

    await expect(swappingFiles.prepareRetainedCandidate(RUN_ID)).rejects.toThrow(
      'Presentation staging candidate changed while retaining'
    );
    await expect(readFile(outsider, 'utf8')).resolves.toBe('replacement bytes');
  });

  it('rejects a staging ancestor replacement before opening the source candidate', async () => {
    const stagingRoot = path.join(systemTempDir, 'aionui-presentation-runs');
    const displacedStagingRoot = path.join(systemTempDir, 'displaced-presentation-runs');
    const replacementCandidate = path.join(stagingRoot, RUN_ID, 'agent', 'candidate.pptx');
    const swappingFiles = new PresentationRunFiles({
      userDataDir,
      tempDir: systemTempDir,
      randomUUID: () => TEMP_ID,
      failureInjector: async ({ boundary }) => {
        if (boundary !== 'before-candidate-source-open') return;
        await rename(stagingRoot, displacedStagingRoot);
        await mkdir(path.dirname(replacementCandidate), { recursive: true });
        await writeFile(replacementCandidate, 'stable candidate');
      },
    });
    const layout = await swappingFiles.createRunLayout(RUN_ID);
    await writeFile(path.join(layout.stagingDirectory, 'candidate.pptx'), 'stable candidate');

    await expect(swappingFiles.prepareRetainedCandidate(RUN_ID)).rejects.toThrow(
      'Presentation storage directory changed while leased'
    );
    await expect(readFile(replacementCandidate, 'utf8')).resolves.toBe('stable candidate');
  });

  it('rejects a durable run ancestor replacement before creating the retained temp', async () => {
    const runDirectory = path.join(userDataDir, 'presentation-runs', RUN_ID);
    const displacedRunDirectory = path.join(userDataDir, 'presentation-runs', `${RUN_ID}-displaced`);
    const replacementRetainedDirectory = path.join(runDirectory, 'retained');
    const sentinel = path.join(replacementRetainedDirectory, 'do-not-touch');
    const swappingFiles = new PresentationRunFiles({
      userDataDir,
      tempDir: systemTempDir,
      randomUUID: () => TEMP_ID,
      failureInjector: async ({ boundary }) => {
        if (boundary !== 'before-candidate-temp-create') return;
        await rename(runDirectory, displacedRunDirectory);
        await mkdir(replacementRetainedDirectory, { recursive: true });
        await writeFile(sentinel, 'replacement tree');
      },
    });
    const layout = await swappingFiles.createRunLayout(RUN_ID);
    await writeFile(path.join(layout.stagingDirectory, 'candidate.pptx'), 'stable candidate');

    await expect(swappingFiles.prepareRetainedCandidate(RUN_ID)).rejects.toThrow(
      'Presentation storage directory changed while leased'
    );
    await expect(readFile(sentinel, 'utf8')).resolves.toBe('replacement tree');
  });

  it.each(['symlink', 'hardlink', 'same-byte inode'] as const)(
    'rejects a %s replacement at the promotion rename boundary',
    async (replacement) => {
      const outsider = path.join(fixtureRoot, `${replacement}.pptx`);
      const temporaryPath = path.join(userDataDir, 'presentation-runs', RUN_ID, `retained/.candidate-${TEMP_ID}.tmp`);
      await writeFile(outsider, 'stable candidate');
      const swappingFiles = new PresentationRunFiles({
        userDataDir,
        tempDir: systemTempDir,
        randomUUID: () => TEMP_ID,
        failureInjector: async ({ boundary }) => {
          if (boundary !== 'before-candidate-promotion-rename') return;
          await rm(temporaryPath);
          if (replacement === 'symlink') {
            await symlink(outsider, temporaryPath);
          } else if (replacement === 'hardlink') {
            await link(outsider, temporaryPath);
          } else {
            await writeFile(temporaryPath, 'stable candidate', { mode: 0o600 });
          }
        },
      });
      const layout = await swappingFiles.createRunLayout(RUN_ID);
      await writeFile(path.join(layout.stagingDirectory, 'candidate.pptx'), 'stable candidate');
      const prepared = await swappingFiles.prepareRetainedCandidate(RUN_ID);

      await expect(swappingFiles.promoteRetainedCandidate(prepared)).rejects.toThrow();
      await expect(readFile(outsider, 'utf8')).resolves.toBe('stable candidate');
    }
  );

  it('does not rename through a replaced durable ancestor during promotion', async () => {
    const runRoot = path.join(userDataDir, 'presentation-runs');
    const displacedRunRoot = path.join(userDataDir, 'displaced-presentation-runs');
    const replacementRetainedDirectory = path.join(runRoot, RUN_ID, 'retained');
    const replacementTemporaryPath = path.join(replacementRetainedDirectory, `.candidate-${TEMP_ID}.tmp`);
    const replacementFinalPath = path.join(replacementRetainedDirectory, 'candidate.pptx');
    let replaceDuringPromotion = false;
    const swappingFiles = new PresentationRunFiles({
      userDataDir,
      tempDir: systemTempDir,
      randomUUID: () => TEMP_ID,
      failureInjector: async ({ boundary }) => {
        if (!replaceDuringPromotion || boundary !== 'before-candidate-promotion-rename') return;
        replaceDuringPromotion = false;
        await rename(runRoot, displacedRunRoot);
        await mkdir(replacementRetainedDirectory, { recursive: true });
        await writeFile(replacementTemporaryPath, 'stable candidate', { mode: 0o600 });
      },
    });
    const layout = await swappingFiles.createRunLayout(RUN_ID);
    await writeFile(path.join(layout.stagingDirectory, 'candidate.pptx'), 'stable candidate');
    const prepared = await swappingFiles.prepareRetainedCandidate(RUN_ID);
    replaceDuringPromotion = true;

    await expect(swappingFiles.promoteRetainedCandidate(prepared)).rejects.toThrow(
      'Presentation storage directory changed while leased'
    );
    await expect(readFile(replacementTemporaryPath, 'utf8')).resolves.toBe('stable candidate');
    await expect(exists(replacementFinalPath)).resolves.toBe(false);
  });

  it('rejects a fresh same-byte final inode during recovery', async () => {
    const retainedDirectory = path.join(userDataDir, 'presentation-runs', RUN_ID, 'retained');
    const finalPath = path.join(retainedDirectory, 'candidate.pptx');
    const displacedFinalPath = `${finalPath}.displaced`;
    const swappingFiles = new PresentationRunFiles({ userDataDir, tempDir: systemTempDir, randomUUID: () => TEMP_ID });
    const layout = await swappingFiles.createRunLayout(RUN_ID);
    await writeFile(path.join(layout.stagingDirectory, 'candidate.pptx'), 'stable candidate');
    const prepared = await swappingFiles.prepareRetainedCandidate(RUN_ID);
    await swappingFiles.promoteRetainedCandidate(prepared);
    await rename(finalPath, displacedFinalPath);
    await writeFile(finalPath, 'stable candidate', { mode: 0o600 });

    await expect(swappingFiles.recoverRetainedCandidatePromotion(prepared)).rejects.toThrow(
      'Retained candidate recovery found mismatched bytes'
    );
    await expect(readFile(displacedFinalPath, 'utf8')).resolves.toBe('stable candidate');
  });

  it('rejects a fresh same-byte temp inode during recovery', async () => {
    const layout = await files.createRunLayout(RUN_ID);
    const stagingCandidate = path.join(layout.stagingDirectory, 'candidate.pptx');
    await writeFile(stagingCandidate, 'stable candidate');
    const prepared = await files.prepareRetainedCandidate(RUN_ID);
    const temporaryPath = path.join(layout.runDirectory, prepared.temporaryRelativePath);
    const displacedTemporaryPath = `${temporaryPath}.displaced`;
    await rename(temporaryPath, displacedTemporaryPath);
    await writeFile(temporaryPath, 'stable candidate', { mode: 0o600 });

    await expect(files.recoverRetainedCandidatePromotion(prepared)).rejects.toThrow(
      'Retained candidate temporary file changed'
    );
    await expect(readFile(temporaryPath, 'utf8')).resolves.toBe('stable candidate');
    await expect(readFile(displacedTemporaryPath, 'utf8')).resolves.toBe('stable candidate');
  });

  it('does not report prepared-temp cleanup success when parent sync recreates the path', async () => {
    let recreateDuringSync = false;
    let temporaryPath = '';
    let retainedDirectory = '';
    const durableFiles = new PresentationRunFiles({
      userDataDir,
      tempDir: systemTempDir,
      randomUUID: () => TEMP_ID,
      syncDirectory: async (directory) => {
        if (!recreateDuringSync || directory !== retainedDirectory) return;
        recreateDuringSync = false;
        await writeFile(temporaryPath, 'replacement temp', { mode: 0o600 });
      },
    });
    const layout = await durableFiles.createRunLayout(RUN_ID);
    retainedDirectory = layout.retainedDirectory;
    await writeFile(path.join(layout.stagingDirectory, 'candidate.pptx'), 'stable candidate');
    const prepared = await durableFiles.prepareRetainedCandidate(RUN_ID);
    temporaryPath = path.join(layout.runDirectory, prepared.temporaryRelativePath);
    recreateDuringSync = true;

    await expect(durableFiles.removePreparedRetainedCandidate(prepared)).rejects.toThrow(
      'Presentation cleanup target reappeared'
    );
    await expect(readFile(temporaryPath, 'utf8')).resolves.toBe('replacement temp');
  });

  it('does not treat a v1 delivery marker or staging candidate as v2 recovery authority', async () => {
    const layout = await files.createRunLayout(RUN_ID);
    await Promise.all([
      writeFile(path.join(layout.stagingDirectory, '.aionui-delivery-ready'), 'ready\n'),
      writeFile(path.join(layout.stagingDirectory, 'candidate.pptx'), 'candidate'),
    ]);

    const consume = vi.fn(async (): Promise<string> => 'unexpected');
    await expect(files.withAuthorizedRetainedCandidate(RUN_ID, null, consume)).resolves.toBeNull();
    expect(consume).not.toHaveBeenCalled();
  });

  it('deletes only UUID-owned children and never accepts a caller path', async () => {
    const outsider = path.join(userDataDir, 'keep-me');
    await mkdir(outsider);
    await files.createRunLayout(RUN_ID);

    await expect(files.removeRun('../keep-me')).rejects.toThrow('Invalid presentation run id');
    await expect(exists(outsider)).resolves.toBe(true);
    await files.removeRun(RUN_ID);
    await expect(exists(path.join(userDataDir, 'presentation-runs', RUN_ID))).resolves.toBe(false);
    await expect(exists(outsider)).resolves.toBe(true);
  });

  it('does not recursively delete through a replaced cleanup ancestor', async () => {
    const runRoot = path.join(userDataDir, 'presentation-runs');
    const displacedRunRoot = path.join(userDataDir, 'displaced-presentation-runs');
    const replacementRunDirectory = path.join(runRoot, RUN_ID);
    const sentinel = path.join(replacementRunDirectory, 'do-not-delete');
    const swappingFiles = new PresentationRunFiles({
      userDataDir,
      tempDir: systemTempDir,
      failureInjector: async ({ boundary }) => {
        if (boundary !== 'before-run-cleanup') return;
        await rename(runRoot, displacedRunRoot);
        await mkdir(replacementRunDirectory, { recursive: true });
        await writeFile(sentinel, 'replacement tree');
      },
    });
    await swappingFiles.createRunLayout(RUN_ID);

    await expect(swappingFiles.removeRun(RUN_ID)).rejects.toThrow(
      'Presentation storage directory changed while leased'
    );
    await expect(readFile(sentinel, 'utf8')).resolves.toBe('replacement tree');
    await expect(exists(path.join(displacedRunRoot, RUN_ID))).resolves.toBe(true);
  });

  it('does not report recursive cleanup success when parent sync recreates the target tree', async () => {
    const runRoot = path.join(userDataDir, 'presentation-runs');
    const runDirectory = path.join(runRoot, RUN_ID);
    const sentinel = path.join(runDirectory, 'replacement-survives');
    let recreateDuringSync = false;
    const durableFiles = new PresentationRunFiles({
      userDataDir,
      tempDir: systemTempDir,
      syncDirectory: async (directory) => {
        if (!recreateDuringSync || directory !== runRoot) return;
        recreateDuringSync = false;
        await mkdir(runDirectory, { recursive: true });
        await writeFile(sentinel, 'replacement tree');
      },
    });
    await durableFiles.createRunLayout(RUN_ID);
    recreateDuringSync = true;

    await expect(durableFiles.removeRun(RUN_ID)).rejects.toThrow('Presentation cleanup target reappeared');
    await expect(readFile(sentinel, 'utf8')).resolves.toBe('replacement tree');
  });

  it('does not report leaf cleanup success when parent sync recreates the tombstone', async () => {
    let recreateDuringSync = false;
    let tombstonePath = '';
    const durableFiles = new PresentationRunFiles({
      userDataDir,
      tempDir: systemTempDir,
      syncDirectory: async (directory) => {
        if (!recreateDuringSync || directory !== durableFiles.roots.runTombstoneRoot) return;
        recreateDuringSync = false;
        await writeFile(tombstonePath, 'replacement tombstone', { mode: 0o600 });
      },
    });
    await durableFiles.initialize();
    tombstonePath = durableFiles.getEntityManifestPath('run-tombstone', RUN_ID);
    await writeFile(tombstonePath, 'original tombstone', { mode: 0o600 });
    recreateDuringSync = true;

    await expect(durableFiles.removeTombstone('run', RUN_ID)).rejects.toThrow('Presentation cleanup target reappeared');
    await expect(readFile(tombstonePath, 'utf8')).resolves.toBe('replacement tombstone');
  });

  it('rejects retained candidates that are missing or inconsistent with canonical metadata', async () => {
    const layout = await files.createRunLayout(RUN_ID);
    const candidate = {
      relativePath: 'retained/candidate.pptx',
      sha256: 'a'.repeat(64),
      byteLength: 1,
    };

    await expect(files.withAuthorizedRetainedCandidate(RUN_ID, candidate, async () => undefined)).rejects.toThrow(
      'Authorized retained candidate is unavailable'
    );
    await writeFile(path.join(layout.retainedDirectory, 'candidate.pptx'), 'different');
    await expect(files.withAuthorizedRetainedCandidate(RUN_ID, candidate, async () => undefined)).rejects.toThrow(
      'Authorized retained candidate does not match its manifest'
    );
  });

  it.each(['symlink', 'hardlink'] as const)('rejects an authorized retained candidate that is a %s', async (kind) => {
    const layout = await files.createRunLayout(RUN_ID);
    const outsider = path.join(fixtureRoot, `${kind}-candidate.pptx`);
    const candidatePath = path.join(layout.retainedDirectory, 'candidate.pptx');
    await writeFile(outsider, 'stable candidate');
    if (kind === 'symlink') {
      await symlink(outsider, candidatePath);
    } else {
      await link(outsider, candidatePath);
    }

    await expect(
      files.withAuthorizedRetainedCandidate(
        RUN_ID,
        {
          relativePath: 'retained/candidate.pptx',
          sha256: 'ac080a4e1897afc20d8a16d6567a4c6c56a341443228b8ca72c63565dc7b0050',
          byteLength: 16,
        },
        async () => undefined
      )
    ).rejects.toThrow('Authorized retained candidate is unavailable');
    await expect(readFile(outsider, 'utf8')).resolves.toBe('stable candidate');
  });

  it('withholds an authorized callback result when the app storage ancestor is replaced', async () => {
    const layout = await files.createRunLayout(RUN_ID);
    const candidatePath = path.join(layout.retainedDirectory, 'candidate.pptx');
    const displacedUserDataDir = path.join(fixtureRoot, 'displaced-user-data');
    await writeFile(candidatePath, 'stable candidate', { mode: 0o600 });

    await expect(
      files.withAuthorizedRetainedCandidate(
        RUN_ID,
        {
          relativePath: 'retained/candidate.pptx',
          sha256: 'ac080a4e1897afc20d8a16d6567a4c6c56a341443228b8ca72c63565dc7b0050',
          byteLength: 16,
        },
        async (candidate) => {
          expect((await candidate.readAt(0, candidate.byteLength)).toString('utf8')).toBe('stable candidate');
          await rename(userDataDir, displacedUserDataDir);
          await mkdir(path.dirname(candidatePath), { recursive: true });
          await writeFile(candidatePath, 'stable candidate', { mode: 0o600 });
          return 'must not escape';
        }
      )
    ).rejects.toThrow('Presentation storage directory changed while leased');
  });

  it('does not follow a symlink when syncing a durable directory entry', async () => {
    const realDirectory = path.join(fixtureRoot, 'real-directory');
    const redirectedDirectory = path.join(fixtureRoot, 'redirected-directory');
    await mkdir(realDirectory);
    await symlink(realDirectory, redirectedDirectory);

    await expect(syncPosixDirectory(redirectedDirectory)).rejects.toThrow();
  });

  it('does not return a quarantine path replaced during destination-root sync', async () => {
    const quarantineRoot = path.join(userDataDir, 'presentation-run-quarantine');
    const destination = path.join(quarantineRoot, `run-${RUN_ID}-${TEMP_ID}`);
    const displacedDestination = `${destination}.displaced`;
    const sentinel = path.join(destination, 'replacement-survives');
    let replaceDuringSync = false;
    const durableFiles = new PresentationRunFiles({
      userDataDir,
      tempDir: systemTempDir,
      randomUUID: () => TEMP_ID,
      syncDirectory: async (directory) => {
        if (!replaceDuringSync || directory !== quarantineRoot) return;
        replaceDuringSync = false;
        await rename(destination, displacedDestination);
        await mkdir(destination);
        await writeFile(sentinel, 'replacement quarantine tree');
      },
    });
    await durableFiles.createRunLayout(RUN_ID);
    replaceDuringSync = true;

    await expect(durableFiles.quarantineEntity('run', RUN_ID)).rejects.toThrow(
      'Presentation quarantine destination changed'
    );
    await expect(readFile(sentinel, 'utf8')).resolves.toBe('replacement quarantine tree');
    await expect(exists(displacedDestination)).resolves.toBe(true);
  });

  it('syncs parents after UUID directory creation, quarantine, and deletion', async () => {
    const syncDirectory = vi.fn<(directory: string) => Promise<void>>().mockResolvedValue(undefined);
    const durableFiles = new PresentationRunFiles({
      userDataDir,
      tempDir: systemTempDir,
      randomUUID: () => TEMP_ID,
      syncDirectory,
    });

    const run = await durableFiles.createRunLayout(RUN_ID);
    const grant = await durableFiles.createGrantLayout(GRANT_ID);
    await durableFiles.quarantineEntity('run', RUN_ID);
    await durableFiles.removeGrant(GRANT_ID);

    expect(syncDirectory).toHaveBeenCalledWith(durableFiles.roots.runRoot);
    expect(syncDirectory).toHaveBeenCalledWith(run.runDirectory);
    expect(syncDirectory).toHaveBeenCalledWith(durableFiles.roots.quarantineRoot);
    expect(syncDirectory).toHaveBeenCalledWith(durableFiles.roots.grantRoot);
    await expect(exists(grant)).resolves.toBe(false);
  });

  it('fails closed when a directory-entry sync cannot be proven durable', async () => {
    const durableFiles = new PresentationRunFiles({
      userDataDir,
      tempDir: systemTempDir,
      syncDirectory: async () => {
        throw new Error('directory sync failed');
      },
    });

    await expect(durableFiles.createRunLayout(RUN_ID)).rejects.toThrow('directory sync failed');
  });

  it('syncs the retained parent after preparing the candidate temp entry', async () => {
    const syncDirectory = vi.fn<(directory: string) => Promise<void>>().mockResolvedValue(undefined);
    const durableFiles = new PresentationRunFiles({
      userDataDir,
      tempDir: systemTempDir,
      randomUUID: () => TEMP_ID,
      syncDirectory,
    });
    const layout = await durableFiles.createRunLayout(RUN_ID);
    await writeFile(path.join(layout.stagingDirectory, 'candidate.pptx'), 'stable candidate');
    syncDirectory.mockClear();

    await durableFiles.prepareRetainedCandidate(RUN_ID);

    expect(syncDirectory).toHaveBeenCalledWith(layout.retainedDirectory);
  });

  it('rejects malformed promotion metadata before resolving any candidate path', async () => {
    await expect(
      files.recoverRetainedCandidatePromotion({
        runId: '../outside',
        temporaryRelativePath: '../../candidate.tmp',
        finalRelativePath: '../../outside.pptx' as 'retained/candidate.pptx',
        sha256: 'not-a-sha',
        byteLength: -1,
        dev: '1',
        ino: '1',
      })
    ).rejects.toThrow('Invalid retained candidate promotion');
  });
});
