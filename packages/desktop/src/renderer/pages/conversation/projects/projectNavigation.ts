/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/** Hash-router path for a project's Home page. */
export const buildProjectHomePath = (projectId: string): string => `/project/${encodeURIComponent(projectId)}`;

export type ProjectClickTarget = { kind: 'home'; path: string } | { kind: 'chat'; workspace: string };

/**
 * Where clicking a sidebar project group should go: a saved project (has an id)
 * opens its Home page; a legacy workspace group falls back to a scoped new chat.
 */
export const resolveProjectClickTarget = (group: { project_id?: string; workspace: string }): ProjectClickTarget =>
  group.project_id
    ? { kind: 'home', path: buildProjectHomePath(group.project_id) }
    : { kind: 'chat', workspace: group.workspace };
