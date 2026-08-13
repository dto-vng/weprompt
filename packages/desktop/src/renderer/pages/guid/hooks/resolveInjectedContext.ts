/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { buildInjectedContext, GLOBAL_CONTEXT_LABEL } from '@/common/chat/buildInjectedContext';
import type { ConfigKeyMap } from '@/common/config/configKeys';
import { configService } from '@/common/config/configService';
import type { ForgeProject } from '@/common/types/project/projectTypes';
import { findProjectById } from '@/renderer/pages/conversation/projects/projectStorage';

type ResolveDeps = {
  getUserContext?: () => ConfigKeyMap['user.context'];
  findProject?: (id: string) => ForgeProject | null;
};

/**
 * Compose the global (per-user) + project instruction layers into the
 * model-facing block appended to a new conversation's preset context.
 *
 * Deps are injectable for testing; by default they read the live
 * `configService` cache and project `localStorage`.
 */
export function resolveInjectedContext(projectId?: string, deps: ResolveDeps = {}): string {
  const getUserContext = deps.getUserContext ?? (() => configService.get('user.context'));
  const findProject = deps.findProject ?? ((id: string) => findProjectById(id));

  const userContext = getUserContext();
  const globalText = userContext && userContext.enabled !== false ? (userContext.instructions ?? '') : '';

  const project = projectId ? findProject(projectId) : null;
  const projectText = project?.instructions ?? '';

  return buildInjectedContext([
    { label: GLOBAL_CONTEXT_LABEL, text: globalText },
    { label: project ? `Project: ${project.name}` : 'Project', text: projectText },
  ]);
}
