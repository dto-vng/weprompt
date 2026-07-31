/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { ForgeProject } from '@/common/types/project/projectTypes';
import { buildDetachedProjectExtra } from '@/renderer/pages/conversation/projects/projectConversation';
import {
  findProjectByWorkspace,
  removeProject,
  updateProject,
} from '@/renderer/pages/conversation/projects/projectStorage';
import { emitter } from '@/renderer/utils/emitter';
import { Button, Dropdown, Input, Menu, Message, Modal, Tooltip } from '@arco-design/web-react';
import { Delete, FolderOpen, MoreOne } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { useProjectChats } from '../hooks/useProjectChats';

export type ProjectHeaderProps = {
  project: ForgeProject;
};

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

/**
 * Compact, locale-neutral duration token ("5m" / "3h" / "2d" / "1w"). No
 * existing relative-time formatter covers this granularity (the timeline
 * helpers in GroupedHistory only bucket into Today/Yesterday/Recent7Days/
 * Earlier), so this is a minimal inline helper. It deliberately never bakes
 * in a word like "ago" or "active" — callers that wrap it in a phrase (e.g.
 * the `metaActive` i18n slot here: "{{time}}活跃", "{{time}}にアクティブ")
 * place the word around `{{time}}` differently per language, so `time` must
 * stay a bare, language-neutral token. Exported for reuse by `ProjectChatList`
 * (C3), which shows the same bare token per row instead of introducing a
 * second formatter or a new "ago"-style i18n key.
 */
export const formatActiveDuration = (timestamp: number, now: number): string => {
  const diff = Math.max(0, now - timestamp);
  if (diff < HOUR_MS) return `${Math.max(1, Math.floor(diff / MINUTE_MS))}m`;
  if (diff < DAY_MS) return `${Math.floor(diff / HOUR_MS)}h`;
  if (diff < WEEK_MS) return `${Math.floor(diff / DAY_MS)}d`;
  return `${Math.floor(diff / WEEK_MS)}w`;
};

/**
 * Project Home header: project name, a `path · N chats · active <time>`
 * subline, and a `⋯` overflow menu (Rename / Relink / Reveal / Remove).
 * Menu actions mirror the sidebar's project menu handlers
 * (`GroupedHistory/index.tsx`), adapted to a plain `Modal.confirm` for Remove
 * instead of the sidebar's custom `AionModal`.
 */
const ProjectHeader: React.FC<ProjectHeaderProps> = ({ project }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const chats = useProjectChats(project);

  // `Date.now()` used to be read inside a `useMemo` keyed only on the two
  // timestamps, so the token froze for the page's lifetime: a Project Home left
  // open all afternoon still read "1m", and disagreed with the exact timestamp
  // now shown beside it on hover. A minute is the token's own finest
  // granularity, so re-reading the clock that often is enough to keep it true.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const ticker = window.setInterval(() => setNow(Date.now()), MINUTE_MS);
    return () => window.clearInterval(ticker);
  }, []);

  const activeSince = project.last_opened_at ?? project.updated_at;
  const activeTime = formatActiveDuration(activeSince, now);

  /**
   * Rename is a controlled `<Modal>` rather than `Modal.confirm` because the
   * confirm form could not be fixed: its `<Input>` was uncontrolled and the draft
   * lived in a closure `let`, so nothing re-rendered and `okButtonProps.disabled`
   * could never reflect an empty name. Worse, Arco closes a confirm as soon as
   * `onOk` resolves, and an empty name resolved through the early `return`, so the
   * dialog dismissed itself and discarded the rename without a word.
   * Matches the sidebar and team rename dialogs.
   */
  const [renameVisible, setRenameVisible] = useState(false);
  const [renameName, setRenameName] = useState('');

  const handleRename = useCallback(() => {
    setRenameName(project.name);
    setRenameVisible(true);
  }, [project.name]);

  const handleRenameConfirm = useCallback(() => {
    const trimmedName = renameName.trim();
    // Unreachable while the OK button is disabled and Enter is guarded, but kept
    // so neither affordance is the only thing standing between a blank name and
    // storage.
    if (!trimmedName) return;
    try {
      // A vanished project row comes back as `null`, and a workspace clash
      // throws; neither said anything before, so a rename that never persisted
      // looked exactly like one that did.
      if (!updateProject({ id: project.id, name: trimmedName })) {
        Message.error(t('conversation.history.renameFailed'));
        return;
      }
      Message.success(t('conversation.history.renameSuccess'));
      setRenameVisible(false);
    } catch (renameError) {
      console.error('Failed to rename project:', renameError);
      Message.error(t('conversation.history.renameFailed'));
    }
  }, [project.id, renameName, t]);

  const handleRelink = useCallback(async () => {
    const result = await ipcBridge.dialog.showOpen.invoke({
      defaultPath: project.workspace,
      properties: ['openDirectory', 'createDirectory'],
    });
    const selectedFolder = result?.[0];
    if (!selectedFolder) return;
    try {
      if (!updateProject({ id: project.id, workspace: selectedFolder })) {
        Message.error(t('conversation.history.createProjectFailed'));
      }
    } catch (error) {
      console.error('Failed to relink project:', error);
      // The one failure a user can act on: another project already owns that
      // folder. Naming the owner is the difference between a dead end and
      // knowing which project to look at.
      const owner =
        error instanceof Error && error.message === 'PROJECT_WORKSPACE_DUPLICATE'
          ? findProjectByWorkspace(selectedFolder)
          : null;
      Message.error(
        owner
          ? t('conversation.history.projectDuplicateFolder', { name: owner.name })
          : t('conversation.history.createProjectFailed')
      );
    }
  }, [project.id, project.workspace, t]);

  const handleReveal = useCallback(() => {
    void ipcBridge.shell.showItemInFolder.invoke(project.workspace);
  }, [project.workspace]);

  const handleRemove = useCallback(() => {
    Modal.confirm({
      title: t('conversation.projectHome.remove'),
      content: (
        <span>
          {project.name} · {t('conversation.projectHome.metaChats', { count: chats.length })}
        </span>
      ),
      okText: t('conversation.projectHome.remove'),
      cancelText: t('conversation.projectHome.cancel'),
      okButtonProps: { status: 'danger' },
      onOk: async () => {
        try {
          const detachResults = await Promise.all(
            chats.map((conversationItem) =>
              ipcBridge.conversation.update.invoke({
                id: conversationItem.id,
                updates: { extra: buildDetachedProjectExtra(conversationItem) },
                merge_extra: false,
              })
            )
          );
          // Both results were discarded before: a chat that failed to detach or
          // a project row that was already gone still navigated away as if the
          // removal had gone through. The sidebar's equivalent checks both
          // (`useConversationActions.ts`), so this now matches it.
          const detachedAll = detachResults.every(Boolean);
          const removedProject = removeProject(project.id);
          // Best-effort cleanup: the project row is already gone, so a failed
          // knowledge-store delete must never block or reverse the deletion
          // the user just confirmed. An orphaned store directory is harmless
          // leftover data, unlike leaving the user unable to finish deleting.
          if (removedProject) {
            void ipcBridge.projectKnowledge.removeStore.invoke({ projectId: project.id }).catch(() => {});
          }
          emitter.emit('chat.history.refresh');
          if (!detachedAll || !removedProject) {
            Message.error(t('conversation.history.removeProjectFailed'));
            return;
          }
          Message.success(t('conversation.history.removeProjectSuccess'));
          // Only leave the page once the project really is gone — otherwise the
          // user lands on the home screen with the project still in the sidebar.
          void navigate('/guid');
        } catch (error) {
          console.error('Failed to remove project:', error);
          Message.error(t('conversation.history.removeProjectFailed'));
        }
      },
      alignCenter: true,
      getPopupContainer: () => document.body,
    });
  }, [project.id, project.name, chats, navigate, t]);

  const menu = (
    <Menu>
      <Menu.Item key='rename' onClick={handleRename}>
        {t('conversation.projectHome.rename')}
      </Menu.Item>
      <Menu.Item key='relink' onClick={() => void handleRelink()}>
        {t('conversation.projectHome.relink')}
      </Menu.Item>
      <Menu.Item key='reveal' onClick={handleReveal}>
        {t('conversation.projectHome.reveal')}
      </Menu.Item>
      <Menu.Item key='remove' onClick={handleRemove} className='!text-danger-6'>
        <span className='flex items-center gap-8px'>
          <Delete theme='outline' size='14' />
          {t('conversation.projectHome.remove')}
        </span>
      </Menu.Item>
    </Menu>
  );

  return (
    <>
      <div className='px-34px pt-26px pb-20px border-b border-b-4 flex items-start gap-14px'>
        <div className='flex-1 min-w-0'>
          <h1 className='m-0 text-22px font-700 leading-tight text-t-primary truncate'>{project.name}</h1>
          <div className='mt-6px flex flex-wrap items-center gap-8px text-13px text-t-secondary'>
            <span className='flex min-w-0 max-w-full items-center gap-4px'>
              <FolderOpen theme='outline' size='13' className='shrink-0' />
              {/* Both meta items hide information the user cannot otherwise reach:
                  a path long enough to be truncated, and a duration token with no
                  way to see the moment it counts from. Arco's Tooltip, never a
                  native `title` beside it — two tooltips on one element fight. */}
              <Tooltip content={project.workspace}>
                <span className='truncate'>{project.workspace}</span>
              </Tooltip>
            </span>
            <span className='h-3px w-3px shrink-0 rd-full bg-3' />
            <span className='shrink-0'>{t('conversation.projectHome.metaChats', { count: chats.length })}</span>
            <span className='h-3px w-3px shrink-0 rd-full bg-3' />
            <Tooltip content={new Date(activeSince).toLocaleString()}>
              <span className='shrink-0'>{t('conversation.projectHome.metaActive', { time: activeTime })}</span>
            </Tooltip>
          </div>
        </div>
        <Dropdown droplist={menu} trigger='click' position='br' getPopupContainer={() => document.body}>
          <Button
            aria-label={t('common.more')}
            type='secondary'
            className='!h-36px !w-36px !rounded-9px !p-0'
            icon={<MoreOne theme='outline' size='18' className='block leading-none' />}
          />
        </Dropdown>
      </div>
      <Modal
        title={t('conversation.projectHome.rename')}
        visible={renameVisible}
        onOk={handleRenameConfirm}
        onCancel={() => setRenameVisible(false)}
        okText={t('conversation.projectHome.save')}
        cancelText={t('conversation.projectHome.cancel')}
        okButtonProps={{ disabled: !renameName.trim() }}
        style={{ borderRadius: '12px' }}
        alignCenter
        getPopupContainer={() => document.body}
      >
        <Input
          autoFocus
          value={renameName}
          onChange={setRenameName}
          onPressEnter={handleRenameConfirm}
          placeholder={t('conversation.history.projectNamePlaceholder')}
          allowClear
        />
      </Modal>
    </>
  );
};

export default ProjectHeader;
