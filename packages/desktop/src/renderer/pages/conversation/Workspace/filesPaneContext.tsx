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
 * A container is null whenever the pane has not mounted that tab's slot; the Workspace then
 * renders nothing extra for it.
 */
export type WorkspacePaneView = 'files' | 'changes' | 'preview';

type WorkspaceFilesPaneValue = {
  /**
   * Which tab the pane is showing. The Workspace needs this, not just a container: the
   * changes panel is only *built* while changes are on screen, and that gate used to read
   * flyout state alone — so a pane tab could never have shown it. The gate now also honours
   * this, which additionally makes the changes refresh effect fire for the pane.
   */
  activeView: WorkspacePaneView | null;
  containers: Partial<Record<WorkspacePaneView, HTMLElement | null>>;
};

const WorkspaceFilesPaneContext = createContext<WorkspaceFilesPaneValue>({
  activeView: null,
  containers: {},
});

export const WorkspaceFilesPaneProvider: React.FC<{
  activeView: WorkspacePaneView | null;
  containers: Partial<Record<WorkspacePaneView, HTMLElement | null>>;
  children: React.ReactNode;
}> = ({ activeView, containers, children }) => {
  const value = React.useMemo(() => ({ activeView, containers }), [activeView, containers]);
  return <WorkspaceFilesPaneContext.Provider value={value}>{children}</WorkspaceFilesPaneContext.Provider>;
};

export const useWorkspaceFilesPane = (): WorkspaceFilesPaneValue => useContext(WorkspaceFilesPaneContext);
