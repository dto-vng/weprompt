/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getChatSurfaceWidthClass } from '@/renderer/pages/conversation/utils/chatSurfaceWidth';
import { useTeamPermission } from '@/renderer/pages/team/hooks/TeamPermissionContext';
import { Alert, Button } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { PROJECT_CHAT_ROUTE, useKbStaleChatHint } from './useKbStaleChatHint';

/**
 * Explains, right where the confusion happens, why this chat cannot see the
 * project's knowledge base: its MCP server set was frozen at creation, before
 * any file was indexed. Offers the only actual fix — a new chat, which picks
 * up the current set. Renders nothing unless that is provably the situation.
 */
const KbStaleChatHint: React.FC<{
  conversationId?: string;
  projectId?: string;
  workspace?: string;
  sessionMcpServers?: unknown;
}> = ({ conversationId, projectId, workspace, sessionMcpServers }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const teamPermission = useTeamPermission();
  const { visible, dismiss } = useKbStaleChatHint({ conversationId, projectId, sessionMcpServers });

  if (!visible) return null;

  return (
    <div className={`${getChatSurfaceWidthClass(Boolean(teamPermission))} mb-8px`}>
      <Alert
        type='info'
        data-testid='kb-stale-chat-hint'
        closable
        onClose={dismiss}
        className='!rounded-8px'
        content={
          <div className='flex items-center justify-between gap-8px flex-wrap'>
            <span className='text-13px text-t-secondary'>{t('conversation.staleKnowledgeHint.body')}</span>
            <Button
              type='text'
              size='mini'
              onClick={() => void navigate(PROJECT_CHAT_ROUTE, { state: { workspace, projectId } })}
            >
              {t('conversation.staleKnowledgeHint.action')}
            </Button>
          </div>
        }
      />
    </div>
  );
};

export default KbStaleChatHint;
