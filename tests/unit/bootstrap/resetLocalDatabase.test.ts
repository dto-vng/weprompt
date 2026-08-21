import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackendStartupFailureInfo } from '@/common/types/platform/electron';
import {
  archiveBackendDatabaseFiles,
  resetLocalDatabaseAfterUserConfirmation,
} from '@/process/startup/resetLocalDatabase';

function makeDeps(failure: BackendStartupFailureInfo | null) {
  return {
    getFailure: vi.fn(() => failure),
    getDataDir: vi.fn(() => '/data/aionui'),
    now: vi.fn(() => 1_700_000_000_000),
    archiveDatabaseFiles: vi.fn(() => ['/data/aionui/aionui-backend.db.backup.1700000000000']),
    stopBackend: vi.fn().mockResolvedValue(undefined),
    startBackend: vi.fn().mockResolvedValue(25808),
    markReady: vi.fn(),
    reloadMainWindow: vi.fn(),
    logInfo: vi.fn(),
    logWarn: vi.fn(),
  };
}

describe('resetLocalDatabaseAfterUserConfirmation', () => {
  it('rejects when no startup failure is active', async () => {
    const deps = makeDeps(null);

    await expect(resetLocalDatabaseAfterUserConfirmation(deps)).rejects.toThrow(
      'backend_local_data_reset_not_available'
    );

    expect(deps.stopBackend).not.toHaveBeenCalled();
    expect(deps.archiveDatabaseFiles).not.toHaveBeenCalled();
    expect(deps.startBackend).not.toHaveBeenCalled();
    expect(deps.logWarn).toHaveBeenCalledOnce();
  });

  it('rejects recoverable corruption failures (handled by the corruption flow instead)', async () => {
    const deps = makeDeps({
      reason: 'backend_recoverable_database_corruption',
      backendBoundaryCode: 'BOOTSTRAP_DATA_INIT_FAILED',
      backendBoundaryStage: 'database.recoverable_corruption',
    });

    await expect(resetLocalDatabaseAfterUserConfirmation(deps)).rejects.toThrow(
      'backend_local_data_reset_not_available'
    );

    expect(deps.archiveDatabaseFiles).not.toHaveBeenCalled();
    expect(deps.startBackend).not.toHaveBeenCalled();
  });

  it('archives the database, restarts the backend and reloads after a migration failure', async () => {
    const deps = makeDeps({
      reason: 'backend_data_migration_failed',
      backendBoundaryCode: 'BOOTSTRAP_DATA_INIT_FAILED',
      backendBoundaryStage: 'database.migration',
    });

    await resetLocalDatabaseAfterUserConfirmation(deps);

    expect(deps.stopBackend).toHaveBeenCalledOnce();
    expect(deps.archiveDatabaseFiles).toHaveBeenCalledWith('/data/aionui', 1_700_000_000_000);
    expect(deps.startBackend).toHaveBeenCalledOnce();
    // Archiving must happen after the backend is stopped and before it restarts.
    expect(deps.stopBackend.mock.invocationCallOrder[0]).toBeLessThan(
      deps.archiveDatabaseFiles.mock.invocationCallOrder[0]
    );
    expect(deps.archiveDatabaseFiles.mock.invocationCallOrder[0]).toBeLessThan(
      deps.startBackend.mock.invocationCallOrder[0]
    );
    expect(deps.markReady).toHaveBeenCalledWith(25808, 'backendManager.resetLocalDatabase');
    expect(deps.reloadMainWindow).toHaveBeenCalledOnce();
  });

  it('does not mark ready or reload when the restart fails', async () => {
    const deps = makeDeps({
      reason: 'backend_data_migration_failed',
      backendBoundaryCode: 'BOOTSTRAP_DATA_INIT_FAILED',
      backendBoundaryStage: 'database.migration',
    });
    deps.startBackend.mockRejectedValue(new Error('restart failed'));

    await expect(resetLocalDatabaseAfterUserConfirmation(deps)).rejects.toThrow('restart failed');

    expect(deps.archiveDatabaseFiles).toHaveBeenCalledOnce();
    expect(deps.markReady).not.toHaveBeenCalled();
    expect(deps.reloadMainWindow).not.toHaveBeenCalled();
  });
});

describe('archiveBackendDatabaseFiles', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-reset-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('archives the database and its sidecars, keeps the encryption key, skips missing files', () => {
    fs.writeFileSync(path.join(dir, 'aionui-backend.db'), 'db');
    fs.writeFileSync(path.join(dir, 'aionui-backend.db-wal'), 'wal');
    fs.writeFileSync(path.join(dir, 'aionui-backend.db.migrate.lock'), '');
    fs.writeFileSync(path.join(dir, '.aionui-enc-key'), 'key');
    // No -shm / .instance.lock on disk — must be skipped without error.

    const archived = archiveBackendDatabaseFiles(dir, 42);

    expect(archived).toEqual(
      expect.arrayContaining([
        path.join(dir, 'aionui-backend.db.backup.42'),
        path.join(dir, 'aionui-backend.db-wal.backup.42'),
        path.join(dir, 'aionui-backend.db.migrate.lock.backup.42'),
      ])
    );
    expect(archived).toHaveLength(3);

    // Originals moved aside, encryption key untouched, fresh start possible.
    expect(fs.existsSync(path.join(dir, 'aionui-backend.db'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'aionui-backend.db.backup.42'))).toBe(true);
    expect(fs.existsSync(path.join(dir, '.aionui-enc-key'))).toBe(true);
    expect(fs.readFileSync(path.join(dir, '.aionui-enc-key'), 'utf8')).toBe('key');
  });

  it('returns an empty list when there is no database to archive', () => {
    expect(archiveBackendDatabaseFiles(dir, 99)).toEqual([]);
  });
});
