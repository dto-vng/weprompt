/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  DocxSelectionSnapshot,
  ExcelSelectionSnapshot,
  OfficeArtifactApplyRequest,
} from '@/common/types/office/artifactEditor';
import {
  OfficeArtifactService,
  type OfficeArtifactServiceDependencies,
  type OfficeArtifactSnapshotStoreApi,
} from '@/process/services/office-artifact/OfficeArtifactService';
import { OfficeArtifactError } from '@/process/services/office-artifact/officeCliJson';
import type { ResolvedOfficeArtifact } from '@/process/services/office-artifact/officeArtifactPath';
import type { OfficeArtifactPendingSnapshot } from '@/process/services/office-artifact/officeArtifactSnapshots';
import type { OfficeCliRunner } from '@/process/services/office-artifact/officeCliRunner';

const WORKSPACE = '/workspace';
const XLSX_FILE = '/workspace/forecast.xlsx';
const DOCX_FILE = '/workspace/report.docx';
const VERSION_A = 'a'.repeat(64);
const VERSION_B = 'b'.repeat(64);
const VERSION_C = 'c'.repeat(64);

const excelSelection: ExcelSelectionSnapshot = {
  kind: 'excel',
  paths: ['/Forecast/B4'],
  cells: [{ path: '/Forecast/B4', displayText: '84' }],
};

const wordSelection: DocxSelectionSnapshot = {
  kind: 'word',
  path: '/body/p[@paraId=00100000]',
  paragraphText: 'Quarterly revenue grew',
  selectedText: 'revenue',
  start: 10,
  end: 17,
};

const applyRequest: OfficeArtifactApplyRequest = {
  workspace: WORKSPACE,
  filePath: XLSX_FILE,
  expectedVersion: VERSION_A,
  selection: excelSelection,
  edit: { kind: 'setCell', input: '=A1*3' },
};

const pending: OfficeArtifactPendingSnapshot = {
  id: 'snapshot-1',
  filePath: XLSX_FILE,
  snapshotPath: '/history/snapshot-1.bin',
  preVersion: VERSION_A,
};

function cellEnvelope(formula = 'A1*2'): unknown {
  return {
    matches: 1,
    results: [
      {
        path: '/Forecast/B4',
        type: 'cell',
        text: '84',
        preview: 'B4',
        childCount: 0,
        format: { formula },
        children: [],
      },
    ],
  };
}

function paragraphEnvelope(): unknown {
  return {
    matches: 1,
    results: [
      {
        path: wordSelection.path,
        type: 'paragraph',
        text: wordSelection.paragraphText,
        format: {},
        children: [
          { type: 'run', text: 'Quarterly ', format: {}, children: [] },
          { type: 'run', text: 'revenue', format: {}, children: [] },
          { type: 'run', text: ' grew', format: {}, children: [] },
        ],
      },
    ],
  };
}

const runner = {
  get: vi.fn<OfficeCliRunner['get']>(),
  replaceText: vi.fn<OfficeCliRunner['replaceText']>(),
  formatRange: vi.fn<OfficeCliRunner['formatRange']>(),
  setCell: vi.fn<OfficeCliRunner['setCell']>(),
  validate: vi.fn<OfficeCliRunner['validate']>(),
} satisfies OfficeCliRunner;

const snapshots = {
  prepare: vi.fn<OfficeArtifactSnapshotStoreApi['prepare']>(),
  commit: vi.fn<OfficeArtifactSnapshotStoreApi['commit']>(),
  rollbackPending: vi.fn<OfficeArtifactSnapshotStoreApi['rollbackPending']>(),
  undo: vi.fn<OfficeArtifactSnapshotStoreApi['undo']>(),
  getUndoDepth: vi.fn<OfficeArtifactSnapshotStoreApi['getUndoDepth']>(),
} satisfies OfficeArtifactSnapshotStoreApi;

const resolveArtifact = vi.fn<OfficeArtifactServiceDependencies['resolveArtifact']>();
const hashArtifact = vi.fn<OfficeArtifactServiceDependencies['hashArtifact']>();

function artifact(kind: ResolvedOfficeArtifact['kind'], filePath: string): ResolvedOfficeArtifact {
  return { workspace: WORKSPACE, filePath, kind };
}

function createService(): OfficeArtifactService {
  return new OfficeArtifactService({ runner, snapshots, resolveArtifact, hashArtifact });
}

beforeEach(() => {
  vi.resetAllMocks();
  resolveArtifact.mockResolvedValue(artifact('excel', XLSX_FILE));
  hashArtifact.mockResolvedValue(VERSION_A);
  runner.get.mockResolvedValue(cellEnvelope());
  runner.setCell.mockResolvedValue({});
  runner.replaceText.mockResolvedValue({ matched: 1 });
  runner.validate.mockResolvedValue({});
  snapshots.prepare.mockResolvedValue(pending);
  snapshots.commit.mockResolvedValue(1);
  snapshots.rollbackPending.mockResolvedValue();
  snapshots.undo.mockResolvedValue({ version: VERSION_A, undoDepth: 0 });
  snapshots.getUndoDepth.mockReturnValue(0);
});

describe('OfficeArtifactService state and inspection', () => {
  it('returns the current version and session undo depth', async () => {
    snapshots.getUndoDepth.mockReturnValue(2);

    await expect(createService().getState({ workspace: WORKSPACE, filePath: XLSX_FILE })).resolves.toEqual({
      ok: true,
      version: VERSION_A,
      undoDepth: 2,
    });
    expect(snapshots.getUndoDepth).toHaveBeenCalledWith(XLSX_FILE);
  });

  it('rejects an inspection when the file version changed', async () => {
    const result = await createService().inspect({
      workspace: WORKSPACE,
      filePath: XLSX_FILE,
      expectedVersion: VERSION_B,
      selection: excelSelection,
    });

    expect(result).toEqual({ ok: false, code: 'FILE_CHANGED' });
    expect(runner.get).not.toHaveBeenCalled();
  });

  it('dispatches XLSX inspection by the resolved file kind', async () => {
    await expect(
      createService().inspect({
        workspace: WORKSPACE,
        filePath: XLSX_FILE,
        expectedVersion: VERSION_A,
        selection: excelSelection,
      })
    ).resolves.toMatchObject({ ok: true, version: VERSION_A, inspection: { kind: 'excel', canEdit: true } });
  });

  it('dispatches DOCX inspection by the resolved file kind', async () => {
    resolveArtifact.mockResolvedValue(artifact('word', DOCX_FILE));
    runner.get.mockResolvedValue(paragraphEnvelope());

    await expect(
      createService().inspect({
        workspace: WORKSPACE,
        filePath: DOCX_FILE,
        expectedVersion: VERSION_A,
        selection: wordSelection,
      })
    ).resolves.toMatchObject({ ok: true, version: VERSION_A, inspection: { kind: 'word', canReplace: true } });
  });

  it('maps unknown dependency errors to OFFICECLI_FAILED', async () => {
    resolveArtifact.mockRejectedValue(new Error('unexpected'));

    await expect(createService().getState({ workspace: WORKSPACE, filePath: XLSX_FILE })).resolves.toEqual({
      ok: false,
      code: 'OFFICECLI_FAILED',
    });
  });
});

describe('OfficeArtifactService apply', () => {
  it('validates and commits an XLSX mutation transaction', async () => {
    hashArtifact.mockResolvedValueOnce(VERSION_A).mockResolvedValueOnce(VERSION_B);

    await expect(createService().apply(applyRequest)).resolves.toEqual({
      ok: true,
      version: VERSION_B,
      snapshotId: pending.id,
      undoDepth: 1,
    });
    expect(runner.get).toHaveBeenCalledTimes(2);
    expect(runner.validate).toHaveBeenCalledWith(XLSX_FILE);
    expect(snapshots.commit).toHaveBeenCalledWith(pending, VERSION_B);
  });

  it('dispatches a DOCX mutation transaction', async () => {
    resolveArtifact.mockResolvedValue(artifact('word', DOCX_FILE));
    runner.get.mockResolvedValue(paragraphEnvelope());
    hashArtifact.mockResolvedValueOnce(VERSION_A).mockResolvedValueOnce(VERSION_B);
    snapshots.prepare.mockResolvedValue({ ...pending, filePath: DOCX_FILE });
    const request: OfficeArtifactApplyRequest = {
      workspace: WORKSPACE,
      filePath: DOCX_FILE,
      expectedVersion: VERSION_A,
      selection: wordSelection,
      edit: { kind: 'replaceText', value: 'sales' },
    };

    await expect(createService().apply(request)).resolves.toMatchObject({ ok: true, version: VERSION_B });
    expect(runner.replaceText).toHaveBeenCalledWith(DOCX_FILE, wordSelection.path, 'revenue', 'sales');
  });

  it('rejects a stale version before preparing a snapshot', async () => {
    const result = await createService().apply({ ...applyRequest, expectedVersion: VERSION_B });

    expect(result).toEqual({ ok: false, code: 'FILE_CHANGED' });
    expect(snapshots.prepare).not.toHaveBeenCalled();
  });

  it('rolls back on mutation failure and does not commit the snapshot', async () => {
    runner.setCell.mockRejectedValue(new OfficeArtifactError('OFFICECLI_FAILED'));

    const result = await createService().apply(applyRequest);

    expect(result).toEqual({ ok: false, code: 'OFFICECLI_FAILED' });
    expect(snapshots.rollbackPending).toHaveBeenCalledWith(pending);
    expect(snapshots.commit).not.toHaveBeenCalled();
  });

  it('rolls back when validation fails after mutation', async () => {
    runner.validate.mockRejectedValue(new OfficeArtifactError('OFFICECLI_FAILED'));

    await expect(createService().apply(applyRequest)).resolves.toEqual({
      ok: false,
      code: 'OFFICECLI_FAILED',
    });
    expect(snapshots.rollbackPending).toHaveBeenCalledWith(pending);
  });

  it('rejects and rolls back a mutation that does not change the binary hash', async () => {
    hashArtifact.mockResolvedValueOnce(VERSION_A).mockResolvedValueOnce(VERSION_A);

    await expect(createService().apply(applyRequest)).resolves.toEqual({
      ok: false,
      code: 'OFFICECLI_FAILED',
    });
    expect(snapshots.rollbackPending).toHaveBeenCalledWith(pending);
    expect(snapshots.commit).not.toHaveBeenCalled();
  });

  it('reports rollback failure when recovery cannot restore the snapshot', async () => {
    runner.setCell.mockRejectedValue(new OfficeArtifactError('OFFICECLI_FAILED'));
    snapshots.rollbackPending.mockRejectedValue(new OfficeArtifactError('RESTORE_FAILED'));

    await expect(createService().apply(applyRequest)).resolves.toEqual({
      ok: false,
      code: 'RESTORE_FAILED',
    });
  });
});

describe('OfficeArtifactService undo', () => {
  it('rejects undo after an external file change', async () => {
    const result = await createService().undo({
      workspace: WORKSPACE,
      filePath: XLSX_FILE,
      expectedVersion: VERSION_B,
    });

    expect(result).toEqual({ ok: false, code: 'FILE_CHANGED' });
    expect(snapshots.undo).not.toHaveBeenCalled();
  });

  it('delegates repeated undo with the current version each time', async () => {
    hashArtifact.mockResolvedValueOnce(VERSION_C).mockResolvedValueOnce(VERSION_B);
    snapshots.undo
      .mockResolvedValueOnce({ version: VERSION_B, undoDepth: 1 })
      .mockResolvedValueOnce({ version: VERSION_A, undoDepth: 0 });
    const service = createService();

    await expect(
      service.undo({ workspace: WORKSPACE, filePath: XLSX_FILE, expectedVersion: VERSION_C })
    ).resolves.toMatchObject({ ok: true, version: VERSION_B, undoDepth: 1 });
    await expect(
      service.undo({ workspace: WORKSPACE, filePath: XLSX_FILE, expectedVersion: VERSION_B })
    ).resolves.toMatchObject({ ok: true, version: VERSION_A, undoDepth: 0 });
  });
});
