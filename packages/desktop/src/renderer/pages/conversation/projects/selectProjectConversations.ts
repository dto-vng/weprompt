/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import type { ForgeProject } from '@/common/types/project/projectTypes';

import { resolveConversationProject } from './projectConversation';

/**
 * Conversations that belong to the given project — matched by `extra.project_id`
 * or, failing that, by workspace path — newest first.
 */
export const selectProjectConversations = (
  conversations: TChatConversation[],
  project: ForgeProject
): TChatConversation[] =>
  conversations
    .filter((conversation) => resolveConversationProject(conversation, [project])?.id === project.id)
    .toSorted((a, b) => b.modified_at - a.modified_at);
