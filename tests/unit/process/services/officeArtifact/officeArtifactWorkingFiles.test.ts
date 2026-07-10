/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { OfficeArtifactWorkingFiles } from '@/process/services/office-artifact/officeArtifactWorkingFiles';

const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

describe('OfficeArtifactWorkingFiles', () => {
  it.each(['report.docx', 'forecast.xlsx'])('preserves the Office extension for staged %s edits', async (fileName) => {
    const workspace = await mkdtemp(join(tmpdir(), 'aionui-office-artifact-working-'));
    temporaryPaths.push(workspace);
    const filePath = join(workspace, fileName);
    await writeFile(filePath, 'original');
    const workingFiles = new OfficeArtifactWorkingFiles();

    const stagedPath = await workingFiles.create(filePath);

    expect(extname(stagedPath)).toBe(extname(filePath));
    await expect(readFile(stagedPath, 'utf8')).resolves.toBe('original');
  });

  it('atomically installs a staged artifact and tolerates final cleanup', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'aionui-office-artifact-working-'));
    temporaryPaths.push(workspace);
    const filePath = join(workspace, 'report.docx');
    await writeFile(filePath, 'original');
    const workingFiles = new OfficeArtifactWorkingFiles();
    const stagedPath = await workingFiles.create(filePath);
    await writeFile(stagedPath, 'edited');

    await workingFiles.install(stagedPath, filePath);
    await workingFiles.remove(stagedPath);

    await expect(readFile(filePath, 'utf8')).resolves.toBe('edited');
    await expect(stat(stagedPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
