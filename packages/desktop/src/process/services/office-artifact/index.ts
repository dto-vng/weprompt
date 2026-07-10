/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { OfficeArtifactService } from './OfficeArtifactService';
import { hashOfficeArtifact, resolveOfficeArtifactPath } from './officeArtifactPath';
import { OfficeArtifactSnapshotStore } from './officeArtifactSnapshots';
import { createOfficeCliRunner } from './officeCliRunner';

const historyRoot = join(tmpdir(), 'aionui-office-artifact-history', `${process.pid}-${randomUUID()}`);

export const officeArtifactService = new OfficeArtifactService({
  runner: createOfficeCliRunner(),
  snapshots: new OfficeArtifactSnapshotStore(historyRoot),
  resolveArtifact: resolveOfficeArtifactPath,
  hashArtifact: hashOfficeArtifact,
});

export * from './OfficeArtifactService';
export * from './docxArtifactStrategy';
export * from './officeArtifactPath';
export * from './officeArtifactSnapshots';
export * from './officeCliJson';
export * from './officeCliRunner';
export * from './xlsxArtifactStrategy';
