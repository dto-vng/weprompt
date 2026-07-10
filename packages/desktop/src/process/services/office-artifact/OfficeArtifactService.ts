/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  OfficeArtifactApplyRequest,
  OfficeArtifactFailure,
  OfficeArtifactGetStateRequest,
  OfficeArtifactInspectRequest,
  OfficeArtifactInspectResult,
  OfficeArtifactInspection,
  OfficeArtifactMutationResult,
  OfficeArtifactSelection,
  OfficeArtifactStateResult,
  OfficeArtifactUndoRequest,
} from '@/common/types/office/artifactEditor';

import { inspectDocxSelection, mutateDocxSelection } from './docxArtifactStrategy';
import type { hashOfficeArtifact, resolveOfficeArtifactPath, ResolvedOfficeArtifact } from './officeArtifactPath';
import type { OfficeArtifactSnapshotStore } from './officeArtifactSnapshots';
import { OfficeArtifactError } from './officeCliJson';
import type { OfficeCliRunner } from './officeCliRunner';
import { inspectXlsxSelection, mutateXlsxSelection } from './xlsxArtifactStrategy';

export type OfficeArtifactSnapshotStoreApi = Pick<
  OfficeArtifactSnapshotStore,
  'prepare' | 'commit' | 'rollbackPending' | 'discardPending' | 'undo' | 'getUndoDepth'
>;

export type OfficeArtifactServiceDependencies = {
  runner: OfficeCliRunner;
  snapshots: OfficeArtifactSnapshotStoreApi;
  resolveArtifact: typeof resolveOfficeArtifactPath;
  hashArtifact: typeof hashOfficeArtifact;
};

function toOfficeArtifactFailure(error: unknown): OfficeArtifactFailure {
  return {
    ok: false,
    code: error instanceof OfficeArtifactError ? error.code : 'OFFICECLI_FAILED',
  };
}

function createMutationGate(): { promise: Promise<void>; release: () => void } {
  let releaseGate: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    releaseGate = resolve;
  });
  return { promise, release: () => releaseGate?.() };
}

export class OfficeArtifactService {
  private readonly runner: OfficeCliRunner;
  private readonly snapshots: OfficeArtifactSnapshotStoreApi;
  private readonly resolveArtifact: typeof resolveOfficeArtifactPath;
  private readonly hashArtifact: typeof hashOfficeArtifact;
  private readonly mutationTails = new Map<string, Promise<void>>();

  constructor(dependencies: OfficeArtifactServiceDependencies) {
    this.runner = dependencies.runner;
    this.snapshots = dependencies.snapshots;
    this.resolveArtifact = dependencies.resolveArtifact;
    this.hashArtifact = dependencies.hashArtifact;
  }

  async getState(request: OfficeArtifactGetStateRequest): Promise<OfficeArtifactStateResult> {
    try {
      const artifact = await this.resolveArtifact(request.workspace, request.filePath);
      const version = await this.hashArtifact(artifact.filePath);
      return {
        ok: true,
        version,
        undoDepth: this.snapshots.getUndoDepth(artifact.filePath),
      };
    } catch (error) {
      return toOfficeArtifactFailure(error);
    }
  }

  async inspect(request: OfficeArtifactInspectRequest): Promise<OfficeArtifactInspectResult> {
    try {
      const artifact = await this.resolveArtifact(request.workspace, request.filePath);
      const version = await this.hashArtifact(artifact.filePath);
      if (version !== request.expectedVersion) throw new OfficeArtifactError('FILE_CHANGED');

      return {
        ok: true,
        version,
        inspection: await this.inspectResolved(artifact, request.selection),
      };
    } catch (error) {
      return toOfficeArtifactFailure(error);
    }
  }

  async apply(request: OfficeArtifactApplyRequest): Promise<OfficeArtifactMutationResult> {
    try {
      const artifact = await this.resolveArtifact(request.workspace, request.filePath);
      return await this.withMutationLock(artifact.filePath, () => this.applyResolved(request, artifact));
    } catch (error) {
      return toOfficeArtifactFailure(error);
    }
  }

  private async applyResolved(
    request: OfficeArtifactApplyRequest,
    artifact: ResolvedOfficeArtifact
  ): Promise<OfficeArtifactMutationResult> {
    let pending: Awaited<ReturnType<OfficeArtifactSnapshotStoreApi['prepare']>> | undefined;

    try {
      const currentVersion = await this.hashArtifact(artifact.filePath);
      if (currentVersion !== request.expectedVersion) throw new OfficeArtifactError('FILE_CHANGED');

      const inspection = await this.inspectResolved(artifact, request.selection);
      pending = await this.snapshots.prepare(artifact.filePath, currentVersion);
      await this.mutateResolved(artifact, inspection, request.edit);
      await this.runner.validate(artifact.filePath);

      const version = await this.hashArtifact(artifact.filePath);
      if (version === currentVersion) throw new OfficeArtifactError('OFFICECLI_FAILED');

      const undoDepth = await this.snapshots.commit(pending, version);
      return { ok: true, version, snapshotId: pending.id, undoDepth };
    } catch (error) {
      if (pending) {
        try {
          if (error instanceof OfficeArtifactError && ['FILE_CHANGED', 'STALE_SELECTION'].includes(error.code)) {
            await this.snapshots.discardPending(pending);
          } else {
            await this.snapshots.rollbackPending(pending);
          }
        } catch (rollbackError) {
          return toOfficeArtifactFailure(rollbackError);
        }
      }
      return toOfficeArtifactFailure(error);
    }
  }

  async undo(request: OfficeArtifactUndoRequest): Promise<OfficeArtifactMutationResult> {
    try {
      const artifact = await this.resolveArtifact(request.workspace, request.filePath);
      return await this.withMutationLock(artifact.filePath, async () => {
        const currentVersion = await this.hashArtifact(artifact.filePath);
        if (currentVersion !== request.expectedVersion) throw new OfficeArtifactError('FILE_CHANGED');

        const result = await this.snapshots.undo(artifact.filePath, currentVersion);
        return {
          ok: true,
          version: result.version,
          snapshotId: request.expectedVersion,
          undoDepth: result.undoDepth,
        };
      });
    } catch (error) {
      return toOfficeArtifactFailure(error);
    }
  }

  private inspectResolved(
    artifact: ResolvedOfficeArtifact,
    selection: OfficeArtifactSelection
  ): Promise<OfficeArtifactInspection> {
    if (artifact.kind === 'word') {
      if (selection.kind !== 'word') throw new OfficeArtifactError('UNSUPPORTED_CONTENT');
      return inspectDocxSelection(this.runner, artifact.filePath, selection);
    }

    if (selection.kind !== 'excel') throw new OfficeArtifactError('UNSUPPORTED_CONTENT');
    return inspectXlsxSelection(this.runner, artifact.filePath, selection);
  }

  private mutateResolved(
    artifact: ResolvedOfficeArtifact,
    inspection: OfficeArtifactInspection,
    edit: OfficeArtifactApplyRequest['edit']
  ): Promise<void> {
    return artifact.kind === 'word'
      ? mutateDocxSelection(this.runner, artifact.filePath, inspection, edit)
      : mutateXlsxSelection(this.runner, artifact.filePath, inspection, edit);
  }

  private async withMutationLock<T>(filePath: string, action: () => Promise<T>): Promise<T> {
    const previous = this.mutationTails.get(filePath) ?? Promise.resolve();
    const gate = createMutationGate();
    const tail = previous.catch((): void => {}).then(() => gate.promise);
    this.mutationTails.set(filePath, tail);

    await previous.catch((): void => {});
    try {
      return await action();
    } finally {
      gate.release();
      if (this.mutationTails.get(filePath) === tail) this.mutationTails.delete(filePath);
    }
  }
}
