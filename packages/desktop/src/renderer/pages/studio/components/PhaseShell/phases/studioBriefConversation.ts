/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { ICreateConversationParams } from '@/common/adapter/ipcBridge';
import type { IConversationMcpStatus, IMcpServer, ISessionMcpServer, TChatConversation } from '@/common/config/storage';

type StudioBriefConversationExtra = Omit<
  ICreateConversationParams['extra'],
  'selected_mcp_server_ids' | 'selected_session_mcp_servers' | 'studio_project_id'
>;

export type CreateStudioBriefConversationInput = Omit<ICreateConversationParams, 'extra'> & {
  studioProjectId: string;
  mcpServerAllowlist: readonly string[];
  availableMcpServers: readonly IMcpServer[];
  extra?: StudioBriefConversationExtra;
};

export type StudioBriefConversationDependencies = {
  createConversation: (input: ICreateConversationParams) => Promise<TChatConversation>;
};

const defaultDependencies: StudioBriefConversationDependencies = {
  createConversation: (input) => ipcBridge.conversation.create.invoke(input),
};

const hasExactMembers = (actual: readonly string[] | undefined, expected: readonly string[]): boolean => {
  if (!Array.isArray(actual) || actual.length !== expected.length) return false;
  const expectedSet = new Set(expected);
  return expectedSet.size === expected.length && actual.every((item) => expectedSet.has(item));
};

type PersistedMcpSnapshot = {
  mcp_server_ids?: string[];
  mcp_servers?: string[];
  mcp_statuses?: IConversationMcpStatus[];
  session_mcp_servers?: ISessionMcpServer[];
};

export const createStudioBriefConversation = async (
  input: CreateStudioBriefConversationInput,
  dependencies: StudioBriefConversationDependencies = defaultDependencies
): Promise<TChatConversation> => {
  const { studioProjectId, mcpServerAllowlist, availableMcpServers, extra, assistant, ...conversation } = input;
  const availableById = new Map(availableMcpServers.map((server) => [server.id, server]));
  const seen = new Set<string>();
  const curatedServers: IMcpServer[] = [];

  for (const id of mcpServerAllowlist) {
    if (seen.has(id)) continue;
    const server = availableById.get(id);
    if (!server) {
      throw new Error(`Curated MCP server is unavailable: ${id}`);
    }
    seen.add(id);
    curatedServers.push(server);
  }

  const curatedServerIds = curatedServers.map((server) => server.id);
  const selectedMcpServerIds = curatedServers.filter((server) => server.builtin !== true).map((server) => server.id);
  const selectedSessionMcpServers = curatedServers
    .filter((server) => server.builtin === true)
    .map((server) => ({ id: server.id, name: server.name, transport: server.transport }));

  const createdConversation = await dependencies.createConversation({
    ...conversation,
    ...(assistant
      ? {
          assistant: {
            ...assistant,
            conversation_overrides: {
              ...assistant.conversation_overrides,
              mcp_ids: curatedServerIds,
            },
          },
        }
      : {}),
    extra: {
      ...extra,
      studio_project_id: studioProjectId,
      selected_mcp_server_ids: selectedMcpServerIds,
      selected_session_mcp_servers: selectedSessionMcpServers,
    },
  });

  const persisted = createdConversation.extra as typeof createdConversation.extra & PersistedMcpSnapshot;
  const snapshotMatches =
    hasExactMembers(persisted.mcp_server_ids, selectedMcpServerIds) &&
    hasExactMembers(
      persisted.mcp_servers,
      curatedServers.map((server) => server.name)
    ) &&
    hasExactMembers(
      persisted.mcp_statuses?.map((status) => status.id),
      curatedServerIds
    ) &&
    hasExactMembers(
      persisted.session_mcp_servers?.map((server) => server.id),
      selectedSessionMcpServers.map((server) => server.id)
    );
  if (!snapshotMatches) {
    throw new Error('Curated MCP snapshot drifted after creation');
  }

  return createdConversation;
};
