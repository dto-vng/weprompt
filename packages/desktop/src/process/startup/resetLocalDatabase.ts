import fs from 'node:fs';
import path from 'node:path';
import type { BackendStartupFailureInfo } from '@/common/types/platform/electron';

// The backend database files live directly under the data directory. aioncore
// keeps the SQLCipher database in `aionui-backend.db` (with the usual WAL/SHM
// sidecars) plus advisory lock files; the encryption key sits next to them in
// `.aionui-enc-key`. We archive the database and its sidecars but deliberately
// keep the key so the freshly created database re-uses it.
const BACKEND_DATABASE_FILE = 'aionui-backend.db';
const ARCHIVED_DATABASE_FILES = [
  BACKEND_DATABASE_FILE,
  `${BACKEND_DATABASE_FILE}-wal`,
  `${BACKEND_DATABASE_FILE}-shm`,
  `${BACKEND_DATABASE_FILE}.migrate.lock`,
  `${BACKEND_DATABASE_FILE}.instance.lock`,
];

/**
 * Archive the backend database (and its sidecars/locks) by renaming each file to
 * `<name>.backup.<nowMs>`, mirroring aioncore's own corruption recovery. The
 * encryption key is left in place so the rebuilt database re-uses it. Missing
 * files are skipped. Returns the list of archive paths that were created.
 */
export function archiveBackendDatabaseFiles(dataDir: string, nowMs: number): string[] {
  const archived: string[] = [];
  for (const name of ARCHIVED_DATABASE_FILES) {
    const source = path.join(dataDir, name);
    if (!fs.existsSync(source)) continue;
    const destination = `${source}.backup.${nowMs}`;
    fs.renameSync(source, destination);
    archived.push(destination);
  }
  return archived;
}

export type ResetLocalDatabaseDeps = {
  getFailure: () => BackendStartupFailureInfo | null;
  getDataDir: () => string;
  now: () => number;
  archiveDatabaseFiles: (dataDir: string, nowMs: number) => string[];
  stopBackend: () => Promise<void>;
  startBackend: () => Promise<number>;
  markReady: (port: number, source: string) => void;
  reloadMainWindow: () => void;
  logInfo: (message: string) => void;
  logWarn: (message: string) => void;
};

/**
 * Reset the local backend database after the user confirms it from the
 * "Local data migration failed" dialog. A migration version mismatch (a database
 * written by a newer AionCore than this build) is intentionally NOT recoverable
 * through aioncore's own `--recover-corrupted-database` flag, so we archive the
 * database from the desktop side and restart the backend, which recreates a fresh
 * one. Only runs for the migration-failure state; the old data is archived, not
 * deleted, so it can be recovered manually.
 */
export async function resetLocalDatabaseAfterUserConfirmation(deps: ResetLocalDatabaseDeps): Promise<void> {
  const failure = deps.getFailure();
  if (failure?.reason !== 'backend_data_migration_failed') {
    deps.logWarn('[AionUi] Ignoring local data reset request outside migration failure state.');
    throw new Error('backend_local_data_reset_not_available');
  }

  deps.logInfo('[AionUi] User confirmed local data reset after migration failure.');
  await deps.stopBackend();
  const archived = deps.archiveDatabaseFiles(deps.getDataDir(), deps.now());
  deps.logInfo(`[AionUi] Archived ${archived.length} backend database file(s) before reset.`);
  const port = await deps.startBackend();
  deps.markReady(port, 'backendManager.resetLocalDatabase');
  deps.reloadMainWindow();
}
