/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import type { ForgeProject } from '@/common/types/project/projectTypes';
import { useMemo } from 'react';

import { useConversationHistoryContext } from '@renderer/hooks/context/ConversationHistoryContext';
import { selectProjectConversations } from '@renderer/pages/conversation/projects/selectProjectConversations';

/** The given project's conversations, newest first (empty when project is null). */
export const useProjectChats = (project: ForgeProject | null): TChatConversation[] => {
  const { conversations } = useConversationHistoryContext();
  return useMemo(() => (project ? selectProjectConversations(conversations, project) : []), [conversations, project]);
};
