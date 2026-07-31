/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { BUILTIN_KNOWLEDGE_NAME } from '@/common/knowledge/constants';

/**
 * Route of the project-scoped new-chat screen, with the project carried in
 * router state. Same target as the sidebar's "new chat in project" action
 * (`GroupedHistory/index.tsx:283-288`) — reused deliberately so the hint does
 * not introduce a second way to create a project chat.
 */
export const PROJECT_CHAT_ROUTE = '/guid';

/** Dismissal is per conversation: silencing one chat must not silence another. */
export const kbStaleHintDismissKey = (conversationId: string): string => `kb.staleHint.dismissed.${conversationId}`;

export type KbStaleChatHintTrigger = {
  conversationId?: string;
  /** `extra.project_id`; absent on non-project conversations. */
  projectId?: string;
  /**
   * `extra.session_mcp_servers` — the MCP set frozen when the conversation was
   * created. Typed `unknown` on purpose: aioncore owns this blob, so it is
   * validated here rather than trusted.
   */
  sessionMcpServers?: unknown;
  /** The project has a source a new chat would actually be able to search. */
  hasIndexedSource: boolean;
  dismissed: boolean;
};

const includesKnowledgeServer = (servers: readonly unknown[]): boolean =>
  servers.some((server) => (server as { name?: unknown } | null | undefined)?.name === BUILTIN_KNOWLEDGE_NAME);

/**
 * Whether this conversation is provably unable to search its project's
 * knowledge base *and* saying so is actionable.
 *
 * Fails closed. Every uncertain input — no ids, a snapshot that is not an
 * array, sources still loading or unreadable — returns false, because a
 * wrongly shown notice contradicts a working chat and destroys trust in the
 * message, while a wrongly hidden one merely leaves today's behaviour.
 */
export const shouldShowKbStaleHint = (trigger: KbStaleChatHintTrigger): boolean => {
  const { conversationId, projectId, sessionMcpServers, hasIndexedSource, dismissed } = trigger;
  if (!conversationId || !projectId) return false;
  if (dismissed) return false;
  // Nothing to offer yet: a new chat would be no better than this one.
  if (!hasIndexedSource) return false;
  if (!Array.isArray(sessionMcpServers)) return false;
  return !includesKnowledgeServer(sessionMcpServers);
};
