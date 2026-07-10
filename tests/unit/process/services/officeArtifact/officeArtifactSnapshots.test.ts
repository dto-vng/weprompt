/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { chmod, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { hashOfficeArtifact } from '@/process/services/office-artifact/officeArtifactPath';
import { OfficeArtifactSnapshotStore } from '@/process/services/office-artifact/officeArtifactSnapshots';

const temporaryPaths: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'aionui-office-artifact-snapshots-'));
  temporaryPaths.push(directory);
  return directory;
}

async function createArtifact(): Promise<{ filePath: string; historyRoot: string }> {
  const workspace = await createTemporaryDirectory();
  const filePath = join(workspace, 'report.docx');
  await writeFile(filePath, 'A');

  return { filePath, historyRoot: join(workspace, 'history') };
}

async function commitSuccessiveVersions(
  store: OfficeArtifactSnapshotStore,
  filePath: string,
  index: number,
  lastIndex: number
): Promise<void> {
  if (index > lastIndex) return;
  const pending = await store.prepare(filePath, await hashOfficeArtifact(filePath));
  await writeFile(filePath, String(index));
  await store.commit(pending, await hashOfficeArtifact(filePath));
  await commitSuccessiveVersions(store, filePath, index + 1, lastIndex);
}

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

describe('OfficeArtifactSnapshotStore', () => {
  it('supports repeated exact undo', async () => {
    const { filePath, historyRoot } = await createArtifact();
    const store = new OfficeArtifactSnapshotStore(historyRoot, { maxDepth: 20 });
    const versionA = await hashOfficeArtifact(filePath);
    const first = await store.prepare(filePath, versionA);
    await writeFile(filePath, 'B');
    const versionB = await hashOfficeArtifact(filePath);
    await store.commit(first, versionB);
    const second = await store.prepare(filePath, versionB);
    await writeFile(filePath, 'C');
    const versionC = await hashOfficeArtifact(filePath);
    await store.commit(second, versionC);

    await expect(store.undo(filePath, versionC)).resolves.toMatchObject({ version: versionB, undoDepth: 1 });
    await expect(store.undo(filePath, versionB)).resolves.toMatchObject({ version: versionA, undoDepth: 0 });
    await expect(readFile(filePath, 'utf8')).resolves.toBe('A');
  });

  it('rejects undo after an external file change', async () => {
    const { filePath, historyRoot } = await createArtifact();
    const store = new OfficeArtifactSnapshotStore(historyRoot, { maxDepth: 20 });
    const versionA = await hashOfficeArtifact(filePath);
    const pending = await store.prepare(filePath, versionA);
    await writeFile(filePath, 'B');
    const versionB = await hashOfficeArtifact(filePath);
    await store.commit(pending, versionB);
    await writeFile(filePath, 'external');

    await expect(store.undo(filePath, versionB)).rejects.toMatchObject({ code: 'FILE_CHANGED' });
    await expect(readFile(filePath, 'utf8')).resolves.toBe('external');
    expect(store.getUndoDepth(filePath)).toBe(1);
    await expect(stat(pending.snapshotPath)).resolves.toBeDefined();
  });

  it('caps configured retention at 20 and removes discarded pending snapshots', async () => {
    const { filePath, historyRoot } = await createArtifact();
    const store = new OfficeArtifactSnapshotStore(historyRoot, { maxDepth: 21 });

    await commitSuccessiveVersions(store, filePath, 1, 21);

    const discarded = await store.prepare(filePath, await hashOfficeArtifact(filePath));
    await writeFile(filePath, 'mutated after prepare');
    await store.rollbackPending(discarded);

    const snapshotFiles = (await readdir(historyRoot, { recursive: true })).filter((path) => path.endsWith('.bin'));
    expect(store.getUndoDepth(filePath)).toBe(20);
    expect(snapshotFiles).toHaveLength(20);
    await expect(readFile(filePath, 'utf8')).resolves.toBe('21');
    await expect(stat(discarded.snapshotPath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(snapshotFiles).not.toContain(basename(discarded.snapshotPath));
  });

  it('keeps history consistent when snapshot cleanup fails after undo', async () => {
    const { filePath, historyRoot } = await createArtifact();
    const store = new OfficeArtifactSnapshotStore(historyRoot);
    const versionA = await hashOfficeArtifact(filePath);
    const pending = await store.prepare(filePath, versionA);
    await writeFile(filePath, 'B');
    const versionB = await hashOfficeArtifact(filePath);
    await store.commit(pending, versionB);

    const snapshotDirectory = dirname(pending.snapshotPath);
    await chmod(snapshotDirectory, 0o500);
    try {
      await expect(store.undo(filePath, versionB)).rejects.toMatchObject({ code: 'SNAPSHOT_FAILED' });
    } finally {
      await chmod(snapshotDirectory, 0o700);
    }

    await expect(readFile(filePath, 'utf8')).resolves.toBe('A');
    expect(store.getUndoDepth(filePath)).toBe(0);
  });

  it('discards a pending snapshot without overwriting a later file change', async () => {
    const { filePath, historyRoot } = await createArtifact();
    const store = new OfficeArtifactSnapshotStore(historyRoot);
    const pending = await store.prepare(filePath, await hashOfficeArtifact(filePath));
    await writeFile(filePath, 'external');

    await store.discardPending(pending);

    await expect(readFile(filePath, 'utf8')).resolves.toBe('external');
    await expect(stat(pending.snapshotPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps a failed undo snapshot for retry', async () => {
    const { filePath, historyRoot } = await createArtifact();
    const store = new OfficeArtifactSnapshotStore(historyRoot, { maxDepth: 20 });
    const versionA = await hashOfficeArtifact(filePath);
    const pending = await store.prepare(filePath, versionA);
    await writeFile(filePath, 'B');
    const versionB = await hashOfficeArtifact(filePath);
    await store.commit(pending, versionB);

    await chmod(join(filePath, '..'), 0o500);
    try {
      await expect(store.undo(filePath, versionB)).rejects.toMatchObject({ code: 'RESTORE_FAILED' });
    } finally {
      await chmod(join(filePath, '..'), 0o700);
    }

    expect(store.getUndoDepth(filePath)).toBe(1);
    await expect(stat(pending.snapshotPath)).resolves.toBeDefined();
    await expect(store.undo(filePath, versionB)).resolves.toMatchObject({ version: versionA, undoDepth: 0 });
  });

  it('disposes pending and committed snapshot files', async () => {
    const { filePath, historyRoot } = await createArtifact();
    const store = new OfficeArtifactSnapshotStore(historyRoot, { maxDepth: 20 });
    const versionA = await hashOfficeArtifact(filePath);
    const committed = await store.prepare(filePath, versionA);
    await writeFile(filePath, 'B');
    await store.commit(committed, await hashOfficeArtifact(filePath));
    const pending = await store.prepare(filePath, await hashOfficeArtifact(filePath));

    await store.dispose();

    await expect(stat(committed.snapshotPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(stat(pending.snapshotPath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(store.getUndoDepth(filePath)).toBe(0);
  });
});
