/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ISessionMcpServer } from '@/common/config/storage';
import { getChatSurfaceWidthClass } from '@/renderer/pages/conversation/utils/chatSurfaceWidth';
import { useTeamPermission } from '@/renderer/pages/team/hooks/TeamPermissionContext';
import { Alert, Button } from '@arco-design/web-react';
import { IconClose } from '@arco-design/web-react/icon';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { PROJECT_CHAT_ROUTE, useKbStaleChatHint } from './useKbStaleChatHint';

/**
 * Explains, right where the confusion happens, why this chat cannot see the
 * project's knowledge base: its MCP server set was frozen at creation, before
 * any file was indexed, so it will never receive the search tool. Renders
 * nothing unless that is provably the situation.
 */
const KbStaleChatHint: React.FC<{
  conversationId?: string;
  projectId?: string;
  workspace?: string;
  sessionMcpServers?: ISessionMcpServer[];
}> = ({ conversationId, projectId, workspace, sessionMcpServers }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const teamPermission = useTeamPermission();
  const { show, dismiss } = useKbStaleChatHint({ conversationId, projectId, sessionMcpServers });

  if (!show) return null;

  return (
    <div className={`${getChatSurfaceWidthClass(Boolean(teamPermission))} mb-8px`}>
      <Alert
        type='info'
        data-testid='kb-stale-chat-hint'
        // Arco hardcodes role='alert', whose implicit aria-live is 'assertive'
        // — it interrupts a screen reader mid-sentence for what is a passive
        // notice appearing beside the composer. An explicit aria-live wins over
        // the role's implicit value, matching ThoughtDisplay's politeness.
        // (AlertProps does not declare `role`, so the role itself stays.)
        aria-live='polite'
        closable
        // Arco's close button ships with no accessible name: it renders only an
        // icon, and that icon is aria-hidden, so the button is announced as a
        // bare "button" (WCAG 2.1 AA 4.1.2). closeElement replaces the button's
        // contents, so a visually-hidden label names it.
        closeElement={
          <>
            <IconClose />
            <span className='sr-only'>{t('common.close')}</span>
          </>
        }
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
