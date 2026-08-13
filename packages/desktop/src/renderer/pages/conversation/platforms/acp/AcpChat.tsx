/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IConversationMcpStatus, ISessionMcpServer, TChatConversation } from '@/common/config/storage';
import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';
import KbStaleChatHint from '@/renderer/pages/conversation/knowledge/KbStaleChatHint';
import { CHAT_SURFACE_CONTAINER_CLASS } from '@/renderer/pages/conversation/utils/chatSurfaceWidth';
import { useTeamPermission } from '@/renderer/pages/team/hooks/TeamPermissionContext';
import type { TeamSendBoxRuntime } from '@/renderer/pages/team/components/teamSendRuntime';
import FlexFullContainer from '@renderer/components/layout/FlexFullContainer';
import MessageList from '@renderer/pages/conversation/Messages/MessageList';
import { ConversationArtifactProvider } from '@renderer/pages/conversation/Messages/artifacts';
import {
  MessageListLoadingProvider,
  MessageListProvider,
  MessagePaginationProvider,
  useMessageLstCache,
} from '@renderer/pages/conversation/Messages/hooks';
import { usePendingConfirmationsRecovery } from '@renderer/pages/conversation/Messages/usePendingConfirmationsRecovery';
import HOC from '@renderer/utils/ui/HOC';
import React from 'react';
import AcpE2EStreamInjector from './AcpE2EStreamInjector';
import AcpSendBox from './AcpSendBox';
import { useAcpMessage } from './useAcpMessage';

const AcpChat: React.FC<{
  conversation_id: string;
  conversation?: TChatConversation;
  workspace?: string;
  backend: string;
  session_mode?: string;
  agent_name?: string;
  modelSelector?: React.ReactNode;
  cron_job_id?: string;
  hideSendBox?: boolean;
  emptySlot?: React.ReactNode;
  loadedSkills?: string[];
  loadedMcpServers?: string[];
  loadedMcpStatuses?: IConversationMcpStatus[];
  teamSendMessage?: (payload: { input: string; files: string[] }) => Promise<void>;
  teamRuntime?: TeamSendBoxRuntime;
  assistantId?: string;
  project_id?: string;
  /** Frozen-at-create MCP snapshot; validated by the hint, not trusted here. */
  session_mcp_servers?: ISessionMcpServer[];
}> = ({
  conversation_id,
  conversation,
  workspace,
  backend,
  session_mode,
  agent_name,
  modelSelector,
  cron_job_id,
  hideSendBox,
  emptySlot,
  loadedSkills,
  loadedMcpServers,
  loadedMcpStatuses,
  teamSendMessage,
  teamRuntime,
  assistantId,
  project_id,
  session_mcp_servers,
}) => {
  useMessageLstCache(conversation_id);
  usePendingConfirmationsRecovery(conversation_id);
  const teamPermission = useTeamPermission();
  const messageState = useAcpMessage(conversation_id, {
    skipWarmup: Boolean(teamPermission),
    prepareRuntime: teamPermission?.warmupSession,
  });

  return (
    <ConversationProvider
      value={{
        conversation_id: conversation_id,
        conversation,
        workspace,
        type: 'acp',
        cron_job_id,
        hideSendBox,
        loadedSkills,
        loadedMcpServers,
        loadedMcpStatuses,
        assistantId,
      }}
    >
      <ConversationArtifactProvider conversation_id={conversation_id}>
        <div className={`${CHAT_SURFACE_CONTAINER_CLASS} flex-1 flex flex-col px-20px min-h-0`}>
          <FlexFullContainer>
            <MessageList className='flex-1' emptySlot={emptySlot} />
          </FlexFullContainer>
          <AcpE2EStreamInjector conversationId={conversation_id} />
          {!hideSendBox && (
            <>
              <KbStaleChatHint
                conversationId={conversation_id}
                projectId={project_id}
                workspace={workspace}
                sessionMcpServers={session_mcp_servers}
              />
              <AcpSendBox
                conversation_id={conversation_id}
                backend={backend}
                session_mode={session_mode}
                agent_name={agent_name}
                modelSelector={modelSelector}
                workspacePath={workspace}
                messageState={messageState}
                teamSendMessage={teamSendMessage}
                teamRuntime={teamRuntime}
              ></AcpSendBox>
            </>
          )}
        </div>
      </ConversationArtifactProvider>
    </ConversationProvider>
  );
};

export default HOC.Wrapper(MessageListProvider, MessageListLoadingProvider, MessagePaginationProvider)(AcpChat);
