/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Debounced recursive fs.watch over each project's `Knowledge Base/` folder.
// Events carry no data downstream: they only schedule a folder sync, so the
// sync's own scan/diff/missing-folder semantics remain the single source of
// truth. Verified on macOS — a 30-file paste produces ~34 raw events, hence
// the coalescing; aionui's own watch endpoints are unfit here (non-recursive
// per-file, or hardcoded to Office-file creation).
//
// Registration is renderer-driven: the project registry lives in renderer
// localStorage, so main cannot enumerate projects at boot.

import { watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { KNOWLEDGE_FOLDER_NAME } from '@/common/knowledge/constants';

export type KnowledgeFolderWatcherDeps = {
  onSync: (projectId: string, workspace: string) => void;
  watchImpl?: typeof watch;
  debounceMs?: number;
};

export type KnowledgeFolderWatcher = {
  watch: (projectId: string, workspace: string) => void;
  unwatch: (projectId: string) => void;
  dispose: () => void;
};

type WatchEntry = { workspace: string; watcher: FSWatcher | null; timer: ReturnType<typeof setTimeout> | null };

const DEFAULT_DEBOUNCE_MS = 1000;

export const createKnowledgeFolderWatcher = (deps: KnowledgeFolderWatcherDeps): KnowledgeFolderWatcher => {
  const watchImpl = deps.watchImpl ?? watch;
  const debounceMs = deps.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const entries = new Map<string, WatchEntry>();

  const close = (entry: WatchEntry): void => {
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = null;
    try {
      entry.watcher?.close();
    } catch {
      // Already dead (folder removed under us) — nothing to release.
    }
    entry.watcher = null;
  };

  const schedule = (projectId: string, entry: WatchEntry): void => {
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      entry.timer = null;
      deps.onSync(projectId, entry.workspace);
    }, debounceMs);
  };

  const watchProject = (projectId: string, workspace: string): void => {
    const existing = entries.get(projectId);
    // A live watcher on the same workspace needs no work. An entry whose
    // watcher is null is degraded (the folder did not exist, or the watcher
    // errored), so fall through and try again — this call is the retry.
    if (existing && existing.workspace === workspace && existing.watcher) return;
    if (existing) close(existing);
    const entry: WatchEntry = { workspace, watcher: null, timer: null };
    entries.set(projectId, entry);
    try {
      const watcher = watchImpl(
        path.join(workspace, KNOWLEDGE_FOLDER_NAME),
        { recursive: true, persistent: false },
        () => schedule(projectId, entry)
      );
      // Never let a watcher error reach the main process as an unhandled
      // 'error' event: degrade to the sync points instead of crashing.
      watcher.on('error', () => close(entry));
      entry.watcher = watcher;
    } catch {
      // Folder not there yet (a project whose knowledge folder has never been
      // created). Sync points still cover it, and the bridge re-registers
      // after every successful sync, which is when this starts working.
    }
  };

  return {
    watch: watchProject,
    unwatch: (projectId) => {
      const entry = entries.get(projectId);
      if (!entry) return;
      close(entry);
      entries.delete(projectId);
    },
    dispose: () => {
      for (const entry of entries.values()) close(entry);
      entries.clear();
    },
  };
};
