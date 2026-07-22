/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IDirOrFile } from '@/common/adapter/ipcBridge';
import { useEffect, useState } from 'react';

export type UseProjectFilesResult = {
  files: IDirOrFile[];
  expandedKeys: string[];
  toggleFolder: (node: IDirOrFile) => void;
  loading: boolean;
  error: boolean;
};

/**
 * Fetch `workspace`'s file tree. `getFilesByDir` returns the whole tree
 * recursively in a single call — each directory's `children` is already
 * populated — so there is no lazy per-folder fetch to layer on top.
 *
 * Exported standalone (rather than inlined in an effect) so the fetch /
 * validate behavior is unit-testable without rendering the hook. Throws on
 * a malformed (non-array) response so the caller treats it the same as a
 * rejected request (missing/unreadable folder) rather than as a valid empty
 * tree.
 */
export const loadProjectFiles = async (workspace: string): Promise<IDirOrFile[]> => {
  const result = await ipcBridge.fs.getFilesByDir.invoke({ dir: workspace, root: workspace });
  if (!Array.isArray(result)) {
    throw new Error('PROJECT_FILES_INVALID_RESPONSE');
  }
  return result;
};

/**
 * Pure add/remove of `key` in `expandedKeys`. Exported standalone so the
 * toggle behavior is unit-testable without rendering the hook.
 */
export const toggleExpandedKey = (expandedKeys: string[], key: string): string[] =>
  expandedKeys.includes(key) ? expandedKeys.filter((existing) => existing !== key) : [...expandedKeys, key];

/**
 * Project Home files card (C5) data hook: loads `workspace`'s file tree and
 * tracks which folders are expanded.
 *
 * `getFilesByDir` is fully recursive in one call, so `toggleFolder` never
 * triggers another fetch — it only flips local expand/collapse state, keyed
 * by `relativePath` (the same key `WorkspaceProjectFilesFlyout` reads).
 *
 * A missing or unreadable workspace folder rejects the request; that is
 * surfaced as `error` (the folder-missing UI) rather than as an empty tree,
 * so callers must check `error` before treating `files` as authoritative.
 */
export const useProjectFiles = (workspace: string): UseProjectFilesResult => {
  const [files, setFiles] = useState<IDirOrFile[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setExpandedKeys([]);

    loadProjectFiles(workspace)
      .then((result) => {
        if (cancelled) return;
        setFiles(result);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setFiles([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [workspace]);

  const toggleFolder = (node: IDirOrFile): void => {
    setExpandedKeys((current) => toggleExpandedKey(current, node.relativePath));
  };

  return { files, expandedKeys, toggleFolder, loading, error };
};
