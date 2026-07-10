/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, rename, rm } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';

import { OfficeArtifactError } from './officeCliJson';

export type OfficeArtifactWorkingFilesApi = Pick<OfficeArtifactWorkingFiles, 'create' | 'install' | 'remove'>;

export class OfficeArtifactWorkingFiles {
  async create(filePath: string): Promise<string> {
    const extension = extname(filePath);
    const fileName = basename(filePath, extension);
    const stagedPath = join(dirname(filePath), `.${fileName}.${randomUUID()}.forge-edit${extension}`);

    try {
      await copyFile(filePath, stagedPath, constants.COPYFILE_EXCL);
      return stagedPath;
    } catch {
      await rm(stagedPath, { force: true }).catch((): undefined => undefined);
      throw new OfficeArtifactError('SNAPSHOT_FAILED');
    }
  }

  async install(stagedPath: string, filePath: string): Promise<void> {
    try {
      await rename(stagedPath, filePath);
    } catch {
      throw new OfficeArtifactError('OFFICECLI_FAILED');
    }
  }

  async remove(stagedPath: string): Promise<void> {
    await rm(stagedPath, { force: true }).catch((): undefined => undefined);
  }
}
