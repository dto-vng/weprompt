/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { ISessionMcpServer } from '@/common/config/storage';
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
   * created. Typed so a rename of `ISessionMcpServer.name` breaks the build
   * here, but still validated at runtime because aioncore owns the blob and
   * older rows may predate the field.
   */
  sessionMcpServers?: ISessionMcpServer[];
  /** The project has a source a new chat would actually be able to search. */
  hasIndexedSource: boolean;
  dismissed: boolean;
};

const includesKnowledgeServer = (servers: readonly ISessionMcpServer[]): boolean =>
  servers.some((server) => (server as { name?: unknown } | null | undefined)?.name === BUILTIN_KNOWLEDGE_NAME);

/**
 * Whether this conversation is provably unable to search its project's
 * knowledge base *and* saying so is actionable.
 *
 * The condition is permanent and checkable from persisted state: a
 * conversation's MCP set is written once, at creation, so a chat created
 * before the project had any indexed source will never receive the knowledge
 * server no matter what is added later.
 *
 * Deliberately says nothing about chats that *do* have the server. Whether
 * such a chat can see a newly indexed file depends on when its subprocess last
 * loaded the store (lazily, on its first search — see
 * `process/resources/builtinMcp/knowledgeServer.ts:101`) and on whether it has
 * since respawned. Neither is observable from the renderer, so there is no
 * honest notice to show.
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
  show: boolean;
  /** Hide the notice for this conversation, permanently. */
  dismiss: () => void;
};

/** Whether the project holds anything a new chat would actually be able to search. */
const hasReadySource = (sources: ReadonlyArray<{ status: string; chunkCount: number }>): boolean =>
  sources.some((source) => source.status === 'ready' && source.chunkCount > 0);

/**
 * Trigger for the stale-chat notice. Only project conversations watch the
 * source list; non-project chats subscribe to nothing.
 */
export const useKbStaleChatHint = (input: {
  conversationId?: string;
  projectId?: string;
  sessionMcpServers?: ISessionMcpServer[];
}): KbStaleChatHintState => {
  const { conversationId, projectId, sessionMcpServers } = input;

  const shouldWatch = Boolean(conversationId && projectId);

  const [hasIndexedSource, setHasIndexedSource] = useState(false);
  // Starts dismissed so the first paint cannot flash a notice we may hide.
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!conversationId) {
      setDismissed(true);
      return;
    }
    setDismissed(localStorage.getItem(kbStaleHintDismissKey(conversationId)) === '1');
  }, [conversationId]);

  useEffect(() => {
    // Reset before every run, not just on the guard branch: when projectId
    // changes between two truthy values, keeping the previous project's `true`
    // would show the notice against the wrong project's data while the new
    // fetch is in flight — the one direction this feature must never fail in.
    setHasIndexedSource(false);
    if (!shouldWatch || !projectId) return;
    let disposed = false;
    // `updated` fires on every manifest write, including per-page ingestion
    // progress ticks, so overlapping fetches are routine. Only the newest
    // response may write state, or a slow early one can land last and win.
    let latest = 0;
    let loggedError = false;
    const refetch = async () => {
      const generation = ++latest;
      try {
        const result = await ipcBridge.projectKnowledge.listSources.invoke({ projectId });
        if (disposed || generation !== latest) return;
        // Mirrors the server-side attach predicate
        // (`projectKnowledgeService.getSessionMcpServer`): a source only makes a
        // new chat better once it is ready AND has passages to search.
        setHasIndexedSource(hasReadySource(result.sources));
      } catch (error) {
        if (disposed || generation !== latest) return;
        // Once per mount: a persistently failing IPC would otherwise spam the
        // console once per progress tick during a large ingestion.
        if (!loggedError) {
          loggedError = true;
          console.error('Failed to load knowledge sources for the stale-chat hint:', error);
        }
        setHasIndexedSource(false);
      }
    };
    void refetch();
    const unsubscribe = ipcBridge.projectKnowledge.updated.on((payload) => {
      if (payload.projectId === projectId) void refetch();
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [shouldWatch, projectId]);

  const show = shouldShowKbStaleHint({
    conversationId,
    projectId,
    sessionMcpServers,
    hasIndexedSource,
    dismissed,
  });

  const dismiss = useCallback(() => {
    if (!conversationId) return;
    localStorage.setItem(kbStaleHintDismissKey(conversationId), '1');
    setDismissed(true);
  }, [conversationId]);

  return { show, dismiss };
};
