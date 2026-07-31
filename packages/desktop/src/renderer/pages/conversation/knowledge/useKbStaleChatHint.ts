/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { BUILTIN_KNOWLEDGE_NAME } from '@/common/knowledge/constants';
import { useCallback, useEffect, useState } from 'react';

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

export type KbStaleChatHintState = {
  visible: boolean;
  /** Hide the notice for this conversation, permanently. */
  dismiss: () => void;
};

/**
 * Trigger for the stale-chat notice.
 *
 * Only conversations that could ever show it — project scoped, and missing the
 * knowledge server from their frozen snapshot — read the source list or
 * subscribe to updates. A chat that can already search costs nothing.
 */
export const useKbStaleChatHint = (input: {
  conversationId?: string;
  projectId?: string;
  sessionMcpServers?: unknown;
}): KbStaleChatHintState => {
  const { conversationId, projectId, sessionMcpServers } = input;

  const lacksKnowledgeServer = Array.isArray(sessionMcpServers) && !includesKnowledgeServer(sessionMcpServers);
  const shouldWatch = Boolean(conversationId && projectId && lacksKnowledgeServer);

  const [hasIndexedSource, setHasIndexedSource] = useState(false);
  // Starts dismissed so the first paint cannot flash a notice we may hide.
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(conversationId ? localStorage.getItem(kbStaleHintDismissKey(conversationId)) === '1' : true);
  }, [conversationId]);

  useEffect(() => {
    if (!shouldWatch || !projectId) {
      setHasIndexedSource(false);
      return;
    }
    let disposed = false;
    const refetch = async () => {
      try {
        const result = await ipcBridge.projectKnowledge.listSources.invoke({ projectId });
        // Mirrors the server-side attach predicate
        // (`projectKnowledgeService.getSessionMcpServer`): a source only makes a
        // new chat better once it is ready AND has passages to search.
        const ready = result.sources.some((source) => source.status === 'ready' && source.chunkCount > 0);
        if (!disposed) setHasIndexedSource(ready);
      } catch (error) {
        console.error('Failed to load knowledge sources for the stale-chat hint:', error);
        if (!disposed) setHasIndexedSource(false);
      }
    };
    void refetch();
    // The event is global across projects, and fires on every manifest write —
    // including ingestion progress ticks.
    const unsubscribe = ipcBridge.projectKnowledge.updated.on((payload) => {
      if (payload.projectId === projectId) void refetch();
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [shouldWatch, projectId]);

  const dismiss = useCallback(() => {
    if (!conversationId) return;
    localStorage.setItem(kbStaleHintDismissKey(conversationId), '1');
    setDismissed(true);
  }, [conversationId]);

  return {
    visible: shouldShowKbStaleHint({ conversationId, projectId, sessionMcpServers, hasIndexedSource, dismissed }),
    dismiss,
  };
};
