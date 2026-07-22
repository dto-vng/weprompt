/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import { Button, Empty, List, Tag } from '@arco-design/web-react';
import { MessageOne } from '@icon-park/react';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { formatActiveDuration } from './ProjectHeader';

export type ProjectChatListProps = {
  chats: TChatConversation[];
};

const VISIBLE_ROW_COUNT = 5;

/**
 * Project Home chats region (C3): a "Chats" heading with a count badge and,
 * once there are more than `VISIBLE_ROW_COUNT` chats, a "Show all" toggle;
 * below it, one row per conversation — icon avatar, title, an optional
 * one-line snippet from `desc`, and a relative time. Clicking a row opens
 * that conversation.
 *
 * v1 rows are **open-on-click only** — no pin/rename/delete. The sidebar's
 * `ConversationRow` was evaluated first per the task brief, but its
 * `ConversationRowProps` needs 17 fields sourced from four sidebar-only
 * hooks (`useConversations`, `useCronJobsMap`, `useBatchSelection`,
 * `useConversationActions`), plus `ConversationRow` itself pulls in
 * `useAgentLogos`/`usePresetAssistantInfo`/`useLayoutContext` internally —
 * drag state, batch checkboxes, cron-job status, agent-logo resolution, none
 * of which this simple project-scoped list has an equivalent for (confirmed
 * by how many modules `ConversationRow.dom.test.tsx` itself has to mock just
 * to render the row standalone). Wiring all of that only to reach pin/
 * rename/delete would be a heavy, out-of-scope detour, and stubbing the
 * unused hooks with no-op handlers would render a menu whose actions silently
 * do nothing — the "half-wired action set" this task explicitly avoids.
 * Pin/rename/delete for this list is therefore a noted follow-up.
 */
const ProjectChatList: React.FC<ProjectChatListProps> = ({ chats }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);

  const visibleChats = useMemo(() => (showAll ? chats : chats.slice(0, VISIBLE_ROW_COUNT)), [chats, showAll]);
  const hasHiddenChats = !showAll && chats.length > VISIBLE_ROW_COUNT;

  return (
    <div data-testid='project-chat-list' className='flex flex-col gap-10px min-w-0'>
      <div className='flex items-center gap-8px'>
        <h2 className='m-0 text-15px font-700 text-t-primary'>{t('conversation.projectHome.chats')}</h2>
        <Tag size='small' bordered={false} color='gray'>
          {chats.length}
        </Tag>
        {hasHiddenChats && (
          <Button
            type='text'
            size='mini'
            className='ml-auto !text-t-secondary hover:!text-t-primary'
            onClick={() => setShowAll(true)}
          >
            {t('conversation.projectHome.showAll')}
          </Button>
        )}
      </div>

      {chats.length === 0 ? (
        <Empty
          description={
            <div className='flex flex-col gap-4px'>
              <span className='text-t-primary font-500'>{t('conversation.projectHome.emptyChatsTitle')}</span>
              <span className='text-13px text-t-secondary'>{t('conversation.projectHome.emptyChatsBody')}</span>
            </div>
          }
        />
      ) : (
        <List
          bordered={false}
          split={false}
          dataSource={visibleChats}
          render={(conversation) => {
            const snippet = conversation.desc?.trim();
            return (
              <List.Item
                key={conversation.id}
                className='!px-8px !py-8px rd-8px cursor-pointer transition-colors hover:bg-fill-2'
                onClick={() => navigate(`/conversation/${conversation.id}`)}
                extra={
                  <span className='shrink-0 text-12px text-t-tertiary'>
                    {formatActiveDuration(conversation.modified_at, Date.now())}
                  </span>
                }
              >
                <List.Item.Meta
                  avatar={
                    <span className='flex size-32px shrink-0 items-center justify-center rd-8px bg-fill-2'>
                      <MessageOne theme='outline' size='16' className='text-t-secondary' />
                    </span>
                  }
                  title={<span className='block truncate text-14px font-500 text-t-primary'>{conversation.name}</span>}
                  description={
                    snippet ? <span className='block truncate text-13px text-t-secondary'>{snippet}</span> : undefined
                  }
                />
              </List.Item>
            );
          }}
        />
      )}
    </div>
  );
};

export default ProjectChatList;
