/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';

const MAX_PRINCIPAL_LENGTH = 256;
/** Conversation ids are short ids, bounded exactly like the transport `identifierSchema`. */
const MAX_CONVERSATION_LENGTH = 256;
const MAX_RUNTIME_LENGTH = 64;
const MAX_WORKSPACE_LENGTH = 4096;

export type PresentationScopeFailureCode = 'RUN_NOT_FOUND' | 'RUN_FORBIDDEN' | 'SCOPE_UNAVAILABLE';

export type PresentationScopeResolution =
  | {
      ok: true;
      conversationId: string;
      principalId: string;
      scope: 'individual' | 'team';
      runtime: string;
      workspace: string | null;
    }
  | { ok: false; code: PresentationScopeFailureCode };

export type PresentationScopeResolverOptions = {
  getConversation: (input: { conversationId: string }) => Promise<unknown>;
  listTeams: (input: { userId: string }) => Promise<unknown>;
  classifyLookupError: (error: unknown) => Exclude<PresentationScopeFailureCode, 'SCOPE_UNAVAILABLE'> | null;
  /** Backend user the team enumeration is filtered by, server-side. Not re-checked per record. */
  teamUserId: string;
};

type ConversationRecord = {
  runtime: string;
  workspace: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoundedIdentifier(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum && !value.includes('\0');
}

function parseConversation(value: unknown, conversationId: string): ConversationRecord | null {
  if (
    !isRecord(value) ||
    value.id !== conversationId ||
    !isBoundedIdentifier(value.type, MAX_RUNTIME_LENGTH) ||
    !isRecord(value.extra)
  ) {
    return null;
  }
  const workspace = value.extra.workspace;
  return {
    runtime: value.type,
    workspace:
      typeof workspace === 'string' &&
      workspace.length > 0 &&
      workspace.length <= MAX_WORKSPACE_LENGTH &&
      !workspace.includes('\0') &&
      path.isAbsolute(workspace) &&
      path.resolve(workspace) === workspace
        ? workspace
        : null,
  };
}

/**
 * Ownership of the enumeration is the server's: the request is filtered by `?user_id=`, so this
 * function only classifies membership within an already-scoped list. It deliberately does NOT
 * re-check `team.user_id` — that field is not on the wire (a live `/api/teams` team carries only
 * assistants, created_at, id, leader_assistant_id, name, updated_at, workspace), so the check was
 * always `undefined !== teamUserId` and failed every real payload closed. `TTeam` declaring
 * `user_id` as required is aspirational, which is why `teamMapper` defaults it to `''`. Do not
 * restore the comparison.
 */
function resolveTeamScope(value: unknown, conversationId: string): 'individual' | 'team' | null {
  if (!Array.isArray(value)) return null;
  const seenConversationIds = new Set<string>();
  let membershipCount = 0;
  for (const team of value) {
    if (!isRecord(team)) return null;
    const hasAssistants = Object.hasOwn(team, 'assistants');
    const hasAgents = Object.hasOwn(team, 'agents');
    if (hasAssistants === hasAgents) return null;
    const assistants = hasAssistants ? team.assistants : team.agents;
    if (!Array.isArray(assistants)) return null;
    for (const assistant of assistants) {
      if (!isRecord(assistant) || typeof assistant.conversation_id !== 'string') return null;
      const normalizedConversationId = assistant.conversation_id.toLowerCase();
      if (
        !isBoundedIdentifier(normalizedConversationId, MAX_CONVERSATION_LENGTH) ||
        seenConversationIds.has(normalizedConversationId)
      ) {
        return null;
      }
      seenConversationIds.add(normalizedConversationId);
      if (normalizedConversationId === conversationId) membershipCount += 1;
    }
  }
  if (membershipCount > 1) return null;
  return membershipCount === 1 ? 'team' : 'individual';
}

/** Resolves runtime and team membership only from main-process authoritative backend DTOs. */
export class PresentationScopeResolver {
  private readonly options: PresentationScopeResolverOptions;

  constructor(options: PresentationScopeResolverOptions) {
    this.options = options;
  }

  /**
   * Fails closed whenever conversation ownership or complete team enumeration cannot be proven.
   *
   * The id check below bounds length and rejects NUL without constraining shape, and that is
   * deliberate: real conversation ids are short ids, and a uuid guard here rejected every one of
   * them. Do not tighten it back. Ownership is proven by the authoritative record whose `id` must
   * equal the request, not by the id's shape, and no filesystem path is derived from this value.
   */
  async resolve(input: { conversationId: string; principalId: string }): Promise<PresentationScopeResolution> {
    const conversationId = input.conversationId.toLowerCase();
    if (
      !isBoundedIdentifier(conversationId, MAX_CONVERSATION_LENGTH) ||
      !isBoundedIdentifier(input.principalId, MAX_PRINCIPAL_LENGTH) ||
      !isBoundedIdentifier(this.options.teamUserId, MAX_PRINCIPAL_LENGTH)
    ) {
      return { ok: false, code: 'SCOPE_UNAVAILABLE' };
    }

    let rawConversation: unknown;
    try {
      rawConversation = await this.options.getConversation({ conversationId });
    } catch (error) {
      try {
        const code = this.options.classifyLookupError(error);
        return { ok: false, code: code ?? 'SCOPE_UNAVAILABLE' };
      } catch {
        return { ok: false, code: 'SCOPE_UNAVAILABLE' };
      }
    }
    const conversation = parseConversation(rawConversation, conversationId);
    if (conversation === null) return { ok: false, code: 'SCOPE_UNAVAILABLE' };

    let rawTeams: unknown;
    try {
      rawTeams = await this.options.listTeams({ userId: this.options.teamUserId });
    } catch {
      return { ok: false, code: 'SCOPE_UNAVAILABLE' };
    }
    const scope = resolveTeamScope(rawTeams, conversationId);
    if (scope === null) return { ok: false, code: 'SCOPE_UNAVAILABLE' };

    return {
      ok: true,
      conversationId,
      principalId: input.principalId,
      scope,
      runtime: conversation.runtime,
      workspace: conversation.workspace,
    };
  }
}
