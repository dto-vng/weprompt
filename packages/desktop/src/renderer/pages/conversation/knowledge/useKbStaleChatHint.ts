/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { BUILTIN_KNOWLEDGE_NAME } from '@/common/knowledge/constants';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Route of the project-scoped new-chat screen, with the project carried in
 * router state. Same target as the sidebar's "new chat in project" action
 * (`GroupedHistory/index.tsx:283-288`) — reused deliberately so the hint does
 * not introduce a second way to create a project chat.
 */
export const PROJECT_CHAT_ROUTE = '/guid';

/** Dismissal is per conversation: silencing one chat must not silence another. */
export const kbStaleHintDismissKey = (conversationId: string): string => `kb.staleHint.dismissed.${conversationId}`;

/** Separate from the stale key so dismissing one notice never hides the other. */
export const kbChangedHintDismissKey = (conversationId: string): string => `kb.changedHint.dismissed.${conversationId}`;

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

export type KbChangedChatHintTrigger = {
  conversationId?: string;
  projectId?: string;
  sessionMcpServers?: unknown;
  /** A source that was absent when this view mounted has since become ready. */
  knowledgeChangedSinceMount: boolean;
  dismissed: boolean;
};

/**
 * Whether a chat that *does* have the knowledge server is nonetheless blind to
 * files added since it started.
 *
 * Verified on 2026-07-31: a running session's knowledge subprocess serves a
 * snapshot frozen at spawn. Asked in one turn, the same session found a file
 * indexed before it started and returned "No relevant passages found" for an
 * exact-name query on one indexed after — while a fresh chat found it at once.
 *
 * The staleness lasts only until the subprocess respawns, so the trigger is
 * intentionally in-session: `knowledgeChangedSinceMount` is not persisted, and
 * forgetting it on reload errs toward silence rather than nagging about a chat
 * that can search again.
 */
export const shouldShowKbChangedHint = (trigger: KbChangedChatHintTrigger): boolean => {
  const { conversationId, projectId, sessionMcpServers, knowledgeChangedSinceMount, dismissed } = trigger;
  if (!conversationId || !projectId) return false;
  if (dismissed) return false;
  if (!knowledgeChangedSinceMount) return false;
  if (!Array.isArray(sessionMcpServers)) return false;
  // A chat without the server can never search at all — that is the stale case.
  return includesKnowledgeServer(sessionMcpServers);
};

/**
 * `stale` — the chat never had the knowledge server (Case A).
 * `changed` — it has the server, but files were indexed after it started (Case B).
 */
export type KbChatHintVariant = 'stale' | 'changed';

export type KbStaleChatHintState = {
  variant: KbChatHintVariant | null;
  /** Hide the currently shown notice for this conversation, permanently. */
  dismiss: () => void;
};

/** Sources a new chat would be able to search, by id. */
const readySourceIds = (sources: ReadonlyArray<{ id: string; status: string; chunkCount: number }>): Set<string> =>
  new Set(sources.filter((source) => source.status === 'ready' && source.chunkCount > 0).map((source) => source.id));

/**
 * Trigger for both knowledge notices.
 *
 * Every project conversation watches the source list, because either notice can
 * apply: a chat without the server can never search (`stale`), and one with it
 * still cannot see files indexed after its session spawned (`changed`).
 * Non-project chats subscribe to nothing.
 */
export const useKbStaleChatHint = (input: {
  conversationId?: string;
  projectId?: string;
  sessionMcpServers?: unknown;
}): KbStaleChatHintState => {
  const { conversationId, projectId, sessionMcpServers } = input;

  const shouldWatch = Boolean(conversationId && projectId);

  const [hasIndexedSource, setHasIndexedSource] = useState(false);
  const [knowledgeChangedSinceMount, setKnowledgeChangedSinceMount] = useState(false);
  // Starts dismissed so the first paint cannot flash a notice we may hide.
  const [staleDismissed, setStaleDismissed] = useState(true);
  const [changedDismissed, setChangedDismissed] = useState(true);
  /** Sources known when this view mounted; null until the first read lands. */
  const knownReadyIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!conversationId) {
      setStaleDismissed(true);
      setChangedDismissed(true);
      return;
    }
    setStaleDismissed(localStorage.getItem(kbStaleHintDismissKey(conversationId)) === '1');
    setChangedDismissed(localStorage.getItem(kbChangedHintDismissKey(conversationId)) === '1');
  }, [conversationId]);

  useEffect(() => {
    if (!shouldWatch || !projectId) {
      setHasIndexedSource(false);
      return;
    }
    let disposed = false;
    // A fresh mount means a fresh baseline: the notice is about what changed
    // while this view was open, not about history.
    knownReadyIdsRef.current = null;
    setKnowledgeChangedSinceMount(false);
    const refetch = async () => {
      try {
        const result = await ipcBridge.projectKnowledge.listSources.invoke({ projectId });
        if (disposed) return;
        // Mirrors the server-side attach predicate
        // (`projectKnowledgeService.getSessionMcpServer`): a source only makes a
        // new chat better once it is ready AND has passages to search.
        const ready = readySourceIds(result.sources);
        setHasIndexedSource(ready.size > 0);
        const known = knownReadyIdsRef.current;
        if (known === null) {
          knownReadyIdsRef.current = ready;
          return;
        }
        // Only a source that was absent at mount means the running session is
        // behind; progress ticks on an already-known file are not news.
        if ([...ready].some((id) => !known.has(id))) {
          knownReadyIdsRef.current = ready;
          setKnowledgeChangedSinceMount(true);
        }
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

  const stale = shouldShowKbStaleHint({
    conversationId,
    projectId,
    sessionMcpServers,
    hasIndexedSource,
    dismissed: staleDismissed,
  });
  const changed = shouldShowKbChangedHint({
    conversationId,
    projectId,
    sessionMcpServers,
    knowledgeChangedSinceMount,
    dismissed: changedDismissed,
  });
  // The two are mutually exclusive by construction (one needs the server
  // absent, the other present), so the order here is a formality.
  const variant: KbChatHintVariant | null = stale ? 'stale' : changed ? 'changed' : null;

  const dismiss = useCallback(() => {
    if (!conversationId) return;
    if (variant === 'stale') {
      localStorage.setItem(kbStaleHintDismissKey(conversationId), '1');
      setStaleDismissed(true);
      return;
    }
    if (variant === 'changed') {
      localStorage.setItem(kbChangedHintDismissKey(conversationId), '1');
      setChangedDismissed(true);
    }
  }, [conversationId, variant]);

  return { variant, dismiss };
};
