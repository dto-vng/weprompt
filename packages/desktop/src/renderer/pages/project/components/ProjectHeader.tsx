/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { ForgeProject } from '@/common/types/project/projectTypes';
import { buildDetachedProjectExtra } from '@/renderer/pages/conversation/projects/projectConversation';
import { removeProject, updateProject } from '@/renderer/pages/conversation/projects/projectStorage';
import { emitter } from '@/renderer/utils/emitter';
import { Button, Dropdown, Input, Menu, Modal } from '@arco-design/web-react';
import { Delete, FolderOpen, MoreOne } from '@icon-park/react';
import React, { useCallback, useMemo } from 'react';
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
 * Compact, locale-neutral duration token ("5m" / "3h" / "2d" / "1w") for the
 * `metaActive` i18n slot. No existing relative-time formatter covers this
 * granularity (the timeline helpers in GroupedHistory only bucket into
 * Today/Yesterday/Recent7Days/Earlier), so this is a minimal inline helper.
 * It deliberately never bakes in a word like "ago" — `metaActive`'s
 * translations place the word around `{{time}}` differently per language
 * (e.g. zh-CN: "{{time}}活跃", ja-JP: "{{time}}にアクティブ"), so `time` must
 * stay a bare, language-neutral token.
 */
const formatActiveDuration = (timestamp: number, now: number): string => {
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

  const activeTime = useMemo(
    () => formatActiveDuration(project.last_opened_at ?? project.updated_at, Date.now()),
    [project.last_opened_at, project.updated_at]
  );

  const handleRename = useCallback(() => {
    let nextName = project.name;
    Modal.confirm({
      title: t('conversation.projectHome.rename'),
      content: (
        <Input
          autoFocus
          defaultValue={project.name}
          onChange={(value) => {
            nextName = value;
          }}
        />
      ),
      okText: t('conversation.projectHome.save'),
      cancelText: t('conversation.projectHome.cancel'),
      onOk: () => {
        const trimmedName = nextName.trim();
        if (!trimmedName) return;
        updateProject({ id: project.id, name: trimmedName });
      },
      alignCenter: true,
      getPopupContainer: () => document.body,
    });
  }, [project.id, project.name, t]);

  const handleRelink = useCallback(async () => {
    const result = await ipcBridge.dialog.showOpen.invoke({
      defaultPath: project.workspace,
      properties: ['openDirectory', 'createDirectory'],
    });
    const selectedFolder = result?.[0];
    if (!selectedFolder) return;
    try {
      updateProject({ id: project.id, workspace: selectedFolder });
    } catch (error) {
      console.error('Failed to relink project:', error);
    }
  }, [project.id, project.workspace]);

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
          await Promise.all(
            chats.map((conversationItem) =>
              ipcBridge.conversation.update.invoke({
                id: conversationItem.id,
                updates: { extra: buildDetachedProjectExtra(conversationItem) },
                merge_extra: false,
              })
            )
          );
          removeProject(project.id);
          emitter.emit('chat.history.refresh');
          void navigate('/guid');
        } catch (error) {
          console.error('Failed to remove project:', error);
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
    <div className='px-34px pt-26px pb-20px border-b border-b-light flex items-start gap-14px'>
      <div className='flex-1 min-w-0'>
        <h1 className='m-0 text-22px font-700 leading-tight text-t-primary truncate'>{project.name}</h1>
        <div className='mt-6px flex flex-wrap items-center gap-8px text-13px text-t-secondary'>
          <span className='flex min-w-0 max-w-full items-center gap-4px'>
            <FolderOpen theme='outline' size='13' className='shrink-0' />
            <span className='truncate'>{project.workspace}</span>
          </span>
          <span className='h-3px w-3px shrink-0 rd-full bg-3' />
          <span className='shrink-0'>{t('conversation.projectHome.metaChats', { count: chats.length })}</span>
          <span className='h-3px w-3px shrink-0 rd-full bg-3' />
          <span className='shrink-0'>{t('conversation.projectHome.metaActive', { time: activeTime })}</span>
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
  );
};

export default ProjectHeader;
