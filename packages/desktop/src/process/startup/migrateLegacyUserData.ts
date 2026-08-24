/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * One-time recovery of user data stranded by an app-identity generation change.
 *
 * Packaged builds pin the data root to `<appData>/Forge` (see `appIdentity.ts`).
 * Earlier build generations used the app name to drive the data root, producing
 * `<appData>/WePrompt` (interim WePrompt-named build) and, on Windows,
 * `<appData>/AionUi` (original name). A user upgrading from one of those onto a
 * Forge-pinned build reads the empty `Forge` root, stranding their whole data
 * tree — the backend DB (conversations + model config), config, and the renderer
 * `Local Storage` where the project registry (`forge.projects.v1`) lives.
 *
 * This module copies the newest stranded tree forward exactly once, and only
 * when the current root has no user data yet, so it can never overwrite a live
 * install. It copies (does not move) so the legacy folder stays as a fallback.
 */
import * as fs from 'fs';
import * as path from 'path';

/** Legacy userData directory names from build generations before the Forge pin. */
export const LEGACY_USER_DATA_DIR_NAMES = ['WePrompt', 'AionUi'] as const;

/**
 * A root "has user data" when it holds the backend DB or the renderer web
 * storage (the project registry). Presence of either marks a real install.
 */
const USER_DATA_MARKERS = [path.join('aionui', 'aionui-backend.db'), 'Local Storage'] as const;

/**
 * Items copied forward. Cache/GPU/network scratch dirs are intentionally
 * excluded — they are large, may hold locked files, and regenerate on launch.
 */
const MIGRATED_ITEMS = [
  'aionui', // backend DB (+ its .aionui-enc-key), conversations, skills
  'config', // providers-migration flags, assistants, aionui-config.txt
  'Local Storage', // renderer localStorage: forge.projects.v1 registry
  'Session Storage',
  'sso-config.json',
  'sso-token-cache.bin',
  '.updaterId',
] as const;

const SENTINEL_FILENAME = '.legacy-userdata-migrated';

export type DirProbe = {
  name: string;
  path: string;
  exists: boolean;
  hasUserData: boolean;
  /** mtime of the backend DB in ms, or 0 when absent — used to pick the freshest. */
  backendDbMtimeMs: number;
};

/**
 * Pure decision: choose the best legacy source to copy into `dest`, or null.
 * Never returns a source when the destination already holds user data.
 */
export function chooseLegacyUserDataSource(dest: DirProbe, candidates: DirProbe[]): DirProbe | null {
  if (!dest.exists || dest.hasUserData) {
    return null;
  }
  const usable = candidates.filter(
    (candidate) => candidate.exists && candidate.hasUserData && candidate.path !== dest.path
  );
  if (usable.length === 0) {
    return null;
  }
  return usable.toSorted((a, b) => b.backendDbMtimeMs - a.backendDbMtimeMs)[0];
}

type FsLike = Pick<typeof fs, 'existsSync' | 'statSync' | 'cpSync' | 'writeFileSync'>;

function probeDir(name: string, dirPath: string, fsImpl: FsLike): DirProbe {
  let exists = false;
  try {
    exists = fsImpl.existsSync(dirPath) && fsImpl.statSync(dirPath).isDirectory();
  } catch {
    exists = false;
  }
  let hasUserData = false;
  let backendDbMtimeMs = 0;
  if (exists) {
    for (const marker of USER_DATA_MARKERS) {
      if (fsImpl.existsSync(path.join(dirPath, marker))) {
        hasUserData = true;
      }
    }
    const dbPath = path.join(dirPath, 'aionui', 'aionui-backend.db');
    try {
      if (fsImpl.existsSync(dbPath)) {
        backendDbMtimeMs = fsImpl.statSync(dbPath).mtimeMs;
      }
    } catch {
      backendDbMtimeMs = 0;
    }
  }
  return { name, path: dirPath, exists, hasUserData, backendDbMtimeMs };
}

export type LegacyMigrationResult = {
  migrated: boolean;
  from?: string;
  copied: string[];
  reason?: 'already-ran' | 'destination-has-data' | 'no-legacy-source';
};

/**
 * Run the one-time migration. `nowMs` is injected so the caller owns the clock.
 */
export function migrateLegacyUserData(
  args: { appDataPath: string; userDataPath: string; nowMs: number },
  fsImpl: FsLike = fs
): LegacyMigrationResult {
  const sentinelPath = path.join(args.userDataPath, SENTINEL_FILENAME);
  if (fsImpl.existsSync(sentinelPath)) {
    return { migrated: false, copied: [], reason: 'already-ran' };
  }

  const dest = probeDir(path.basename(args.userDataPath), args.userDataPath, fsImpl);
  const candidates = LEGACY_USER_DATA_DIR_NAMES.map((name) =>
    probeDir(name, path.join(args.appDataPath, name), fsImpl)
  );
  const source = chooseLegacyUserDataSource(dest, candidates);

  if (!source) {
    // A destination that already has data is an established install — record the
    // sentinel so we never probe again. When the destination is empty but no
    // legacy source exists it is a fresh install; also record it so a legacy
    // folder created LATER can never clobber data this install goes on to write.
    fsImpl.writeFileSync(sentinelPath, JSON.stringify({ migrated: false, at: args.nowMs }));
    return { migrated: false, copied: [], reason: dest.hasUserData ? 'destination-has-data' : 'no-legacy-source' };
  }

  const copied: string[] = [];
  for (const item of MIGRATED_ITEMS) {
    const from = path.join(source.path, item);
    if (!fsImpl.existsSync(from)) {
      continue;
    }
    // force:false + errorOnExist:false → never overwrite anything already in the
    // (otherwise empty) destination; belt-and-suspenders against races.
    fsImpl.cpSync(from, path.join(args.userDataPath, item), { recursive: true, force: false, errorOnExist: false });
    copied.push(item);
  }
  fsImpl.writeFileSync(sentinelPath, JSON.stringify({ migrated: true, from: source.path, copied, at: args.nowMs }));
  return { migrated: true, from: source.path, copied };
}
