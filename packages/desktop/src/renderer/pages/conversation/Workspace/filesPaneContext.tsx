/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext } from 'react';

/**
 * Lets the Workspace render its file tree into a pane that `ChatLayout` owns.
 *
 * Why a context and a portal rather than a second tree: the tree's state, event wiring and
 * file operations all live in one `Workspace` instance (`useWorkspaceTree`,
 * `useWorkspaceFileOps`, and the modals those need). Mounting a second `Workspace` for the
 * pane would duplicate all of it and let the two copies disagree about expansion and
 * selection. `filesPanel` itself is presentational — it takes files and expanded keys as
 * props — so rendering it in both the Project flyout and the pane keeps exactly one source
 * of truth.
 *
 * `container` is null whenever the pane is not showing the Files tab; the Workspace then
 * renders nothing extra.
 */
type WorkspaceFilesPaneValue = {
  container: HTMLElement | null;
};

const WorkspaceFilesPaneContext = createContext<WorkspaceFilesPaneValue>({ container: null });

export const WorkspaceFilesPaneProvider: React.FC<{
  container: HTMLElement | null;
  children: React.ReactNode;
}> = ({ container, children }) => {
  const value = React.useMemo(() => ({ container }), [container]);
  return <WorkspaceFilesPaneContext.Provider value={value}>{children}</WorkspaceFilesPaneContext.Provider>;
};

export const useWorkspaceFilesPane = (): WorkspaceFilesPaneValue => useContext(WorkspaceFilesPaneContext);
