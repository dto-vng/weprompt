/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import { isConversationPinned } from '@/renderer/pages/conversation/GroupedHistory/utils/groupingHelpers';
import { refreshConversationCache } from '@/renderer/pages/conversation/utils/conversationCache';
import { emitter } from '@/renderer/utils/emitter';
import { ROW_FOCUS_RING, activateOnEnterOrSpace } from '@/renderer/utils/ui/rowActivation';
import { Button, Empty, Input, Message, Modal, Tag, Tooltip } from '@arco-design/web-react';
import { DeleteOne, EditOne, MessageOne, Pushpin } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { formatActiveDuration } from './ProjectHeader';
import styles from './ProjectChatList.module.css';

export type ProjectChatListProps = {
  chats: TChatConversation[];
};

const VISIBLE_ROW_COUNT = 5;

/**
 * Project Home chats region (C3): a "Chats" heading with a count badge and,
 * once there are more than `VISIBLE_ROW_COUNT` chats, a "Show all" toggle;
 * below it, a flat list of rows — icon, title, an optional one-line
 * snippet from `desc`, and a relative time — divided by thin row dividers,
 * with no surrounding card frame. Clicking a row opens that conversation;
 * hovering a row swaps the time for pin/rename/delete actions.
 *
 * The sidebar's `ConversationRow` was evaluated first per the design brief,
 * but its `ConversationRowProps` needs 17 fields sourced from four
 * sidebar-only hooks (`useConversations`, `useCronJobsMap`,
 * `useBatchSelection`, `useConversationActions`), plus `ConversationRow`
 * itself pulls in `useAgentLogos`/`usePresetAssistantInfo`/`useLayoutContext`
 * internally — drag state, batch checkboxes, cron-job status, agent-logo
 * resolution, none of which this simple project-scoped list has an
 * equivalent for. Wiring all of that only to reach pin/rename/delete would
 * be a heavy, out-of-scope detour.
 *
 * Instead, the three row actions below call the exact same `ipcBridge`
 * methods `useConversationActions` uses (`conversation.update` for
 * pin/rename, `conversation.remove` for delete) and emit the same
 * `chat.history.refresh` event the sidebar listens for — so this list and
 * the sidebar always land on the same state — just via handlers local to
 * this component instead of importing the full hook.
 */
const ProjectChatList: React.FC<ProjectChatListProps> = ({ chats }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);

  const visibleChats = useMemo(() => (showAll ? chats : chats.slice(0, VISIBLE_ROW_COUNT)), [chats, showAll]);
  // Gated on the chat count alone: with `!showAll` in here the control unmounted
  // the moment it was used, so expanding was a one-way latch out of which only a
  // page remount escaped.
  const canToggleChats = chats.length > VISIBLE_ROW_COUNT;

  const handleTogglePin = useCallback(
    async (conversation: TChatConversation) => {
      const pinned = isConversationPinned(conversation);
      try {
        const success = await ipcBridge.conversation.update.invoke({
          id: conversation.id,
          updates: {
            extra: {
              pinned: !pinned,
              pinned_at: pinned ? undefined : Date.now(),
            } as Partial<TChatConversation['extra']>,
          } as Partial<TChatConversation>,
          merge_extra: true,
        });
        if (success) {
          emitter.emit('chat.history.refresh');
        } else {
          Message.error(t('conversation.history.pinFailed'));
        }
      } catch (error) {
        console.error('Failed to toggle pin conversation:', error);
        Message.error(t('conversation.history.pinFailed'));
      }
    },
    [t]
  );

  const handleRenameStart = useCallback(
    (conversation: TChatConversation) => {
      let nextName = conversation.name;
      Modal.confirm({
        title: t('conversation.projectHome.rename'),
        content: (
          <Input
            autoFocus
            defaultValue={conversation.name}
            onChange={(value) => {
              nextName = value;
            }}
          />
        ),
        okText: t('conversation.projectHome.save'),
        cancelText: t('conversation.projectHome.cancel'),
        onOk: async () => {
          const trimmedName = nextName.trim();
          if (!trimmedName) return;
          try {
            const success = await ipcBridge.conversation.update.invoke({
              id: conversation.id,
              updates: { name: trimmedName },
            });
            if (success) {
              await refreshConversationCache(conversation.id);
              emitter.emit('chat.history.refresh');
              Message.success(t('conversation.history.renameSuccess'));
            } else {
              Message.error(t('conversation.history.renameFailed'));
            }
          } catch (error) {
            console.error('Failed to rename conversation:', error);
            Message.error(t('conversation.history.renameFailed'));
          }
        },
        alignCenter: true,
        getPopupContainer: () => document.body,
      });
    },
    [t]
  );

  const handleDeleteClick = useCallback(
    (conversation_id: string) => {
      Modal.confirm({
        title: t('conversation.history.deleteTitle'),
        content: t('conversation.history.deleteConfirm'),
        okText: t('conversation.history.confirmDelete'),
        cancelText: t('conversation.history.cancelDelete'),
        // Deleting a chat removes user data, so the confirm is red like every
        // other delete; orange is for consequential-but-not-destructive actions.
        okButtonProps: { status: 'danger' },
        onOk: async () => {
          try {
            const success = await ipcBridge.conversation.remove.invoke({ id: conversation_id });
            if (success) {
              emitter.emit('chat.history.refresh');
              Message.success(t('conversation.history.deleteSuccess'));
            } else {
              Message.error(t('conversation.history.deleteFailed'));
            }
          } catch (error) {
            console.error('Failed to remove conversation:', error);
            Message.error(t('conversation.history.deleteFailed'));
          }
        },
        style: { borderRadius: '12px' },
        alignCenter: true,
        getPopupContainer: () => document.body,
      });
    },
    [t]
  );

  return (
    <div data-testid='project-chat-list' className='flex flex-col gap-10px min-w-0'>
      <div className='flex items-center gap-8px'>
        <h2 className='m-0 text-15px font-700 text-t-primary'>{t('conversation.projectHome.chats')}</h2>
        <Tag
          size='small'
          bordered={false}
          className='!m-0 !border-none !rounded-6px !bg-fill-2 !px-7px !py-2px !text-11px font-mono !text-t-tertiary'
        >
          {chats.length}
        </Tag>
        {canToggleChats && (
          <Button
            type='text'
            size='mini'
            className='ml-auto !text-t-secondary hover:!text-t-primary'
            aria-expanded={showAll}
            onClick={() => setShowAll((previous) => !previous)}
          >
            {t(showAll ? 'conversation.projectHome.showLess' : 'conversation.projectHome.showAll')}
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
        <div>
          {visibleChats.map((conversation) => {
            const snippet = conversation.desc?.trim();
            const pinned = isConversationPinned(conversation);
            const openRow = (): void => {
              navigate(`/conversation/${conversation.id}`);
            };
            return (
              // A clickable div with button semantics rather than a real <button>:
              // Arco's `.arco-btn` display rule breaks the group-hover children,
              // which is the reason `rowActivation` exists. Same compromise as
              // `ConversationRow` and `SiderItem`.
              <div
                key={conversation.id}
                data-testid={`project-chat-row-${conversation.id}`}
                className={classNames(
                  'group flex min-w-0 items-center gap-13px px-15px py-13px cursor-pointer transition-colors',
                  ROW_FOCUS_RING,
                  styles.row
                )}
                role='button'
                tabIndex={0}
                aria-label={conversation.name}
                onClick={openRow}
                onKeyDown={activateOnEnterOrSpace(openRow)}
              >
                <MessageOne theme='outline' size='20' className='shrink-0 text-t-secondary' />
                <div className='min-w-0 flex-1'>
                  <div className='truncate text-14px font-700 text-t-primary'>{conversation.name}</div>
                  {snippet && <div className='mt-2px truncate text-13px text-t-secondary'>{snippet}</div>}
                </div>
                <span className='shrink-0 text-12px text-t-tertiary group-hover:hidden group-focus-within:hidden'>
                  {formatActiveDuration(conversation.modified_at, Date.now())}
                </span>
                {/* The reveal works from the keyboard only because the row above
                    is now focusable: focusing it satisfies `:focus-within`, which
                    flips this cluster into flow and puts the three buttons in the
                    tab order. The keydown guard is the twin of the click guard —
                    without it, Enter on a focused action would fire the action AND
                    bubble to the row, navigating away from the result. */}
                <span
                  data-testid={`project-chat-actions-${conversation.id}`}
                  className='hidden shrink-0 items-center gap-4px group-hover:flex group-focus-within:flex'
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <Tooltip
                    content={t(pinned ? 'conversation.history.unpin' : 'conversation.history.pin')}
                    position='top'
                  >
                    <Button
                      aria-label={t(pinned ? 'conversation.history.unpin' : 'conversation.history.pin')}
                      data-testid={`project-chat-pin-${conversation.id}`}
                      type='text'
                      size='mini'
                      className='!h-28px !w-28px !rounded-7px !p-0 !text-t-secondary hover:!bg-active hover:!text-t-primary'
                      icon={<Pushpin theme='outline' size='14' className='block leading-none' />}
                      onClick={() => void handleTogglePin(conversation)}
                    />
                  </Tooltip>
                  <Tooltip content={t('conversation.history.rename')} position='top'>
                    <Button
                      aria-label={t('conversation.history.rename')}
                      data-testid={`project-chat-rename-${conversation.id}`}
                      type='text'
                      size='mini'
                      className='!h-28px !w-28px !rounded-7px !p-0 !text-t-secondary hover:!bg-active hover:!text-t-primary'
                      icon={<EditOne theme='outline' size='14' className='block leading-none' />}
                      onClick={() => handleRenameStart(conversation)}
                    />
                  </Tooltip>
                  <Tooltip content={t('conversation.history.deleteTitle')} position='top'>
                    <Button
                      aria-label={t('conversation.history.deleteTitle')}
                      data-testid={`project-chat-delete-${conversation.id}`}
                      type='text'
                      size='mini'
                      className='!h-28px !w-28px !rounded-7px !p-0 !text-t-secondary hover:!bg-danger-1 hover:!text-danger-6'
                      icon={<DeleteOne theme='outline' size='14' className='block leading-none' />}
                      onClick={() => handleDeleteClick(conversation.id)}
                    />
                  </Tooltip>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ProjectChatList;
