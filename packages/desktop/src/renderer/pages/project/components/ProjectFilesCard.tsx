/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { ForgeProject } from '@/common/types/project/projectTypes';
import WorkspaceProjectFilesFlyout from '@renderer/pages/conversation/Workspace/components/WorkspaceProjectFilesFlyout';
import '@renderer/pages/conversation/Workspace/workspace.css';
import { getWorkspaceBasename, updateProject } from '@renderer/pages/conversation/projects/projectStorage';
import { Alert, Button, Card, Spin, Tooltip } from '@arco-design/web-react';
import { FolderOpen } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { useProjectFiles } from '../hooks/useProjectFiles';

export type ProjectFilesCardProps = {
  project: ForgeProject;
};

/**
 * Project Home files card (C5): a read-only browse of the project's
 * workspace folder.
 *
 * Reuses the conversation Workspace panel's tree renderer
 * (`WorkspaceProjectFilesFlyout`) and its file-loading contract
 * (`getFilesByDir`, fully recursive in one call) so the tree, icons, and row
 * behavior match exactly what users already see in a chat's Workspace tab —
 * only the surrounding card chrome (title, reveal action, empty /
 * missing-folder states, read-only footnote) is specific to Project Home.
 */
const ProjectFilesCard: React.FC<ProjectFilesCardProps> = ({ project }) => {
  const { t } = useTranslation();
  const { files, expandedKeys, toggleFolder, loading, error } = useProjectFiles(project.workspace);

  const handleRelink = async (): Promise<void> => {
    const result = await ipcBridge.dialog.showOpen.invoke({
      defaultPath: project.workspace,
      properties: ['openDirectory', 'createDirectory'],
    });
    const selectedFolder = result?.[0];
    if (!selectedFolder) return;
    try {
      updateProject({ id: project.id, workspace: selectedFolder });
    } catch (relinkError) {
      console.error('Failed to relink project workspace:', relinkError);
    }
  };

  return (
    <Card
      data-testid='project-files-card'
      title={t('conversation.projectHome.files')}
      extra={
        <Tooltip content={t('conversation.projectHome.revealInFolder')}>
          <Button
            type='text'
            size='mini'
            aria-label={t('conversation.projectHome.revealInFolder')}
            icon={<FolderOpen theme='outline' size='14' />}
            onClick={() => void ipcBridge.shell.showItemInFolder.invoke(project.workspace)}
          />
        </Tooltip>
      }
    >
      {loading ? (
        <div data-testid='project-files-loading' className='flex items-center justify-center py-24px'>
          <Spin />
        </div>
      ) : error ? (
        <Alert
          type='warning'
          title={t('conversation.projectHome.folderMissingTitle')}
          content={
            <div className='flex flex-col items-start gap-8px'>
              <span className='text-12px text-t-tertiary break-all'>{project.workspace}</span>
              <Button type='primary' size='mini' onClick={() => void handleRelink()}>
                {t('conversation.projectHome.folderMissingRelink')}
              </Button>
              <span className='text-12px text-t-tertiary'>{t('conversation.projectHome.folderMissingBody')}</span>
            </div>
          }
        />
      ) : files.length === 0 ? (
        <div className='py-20px text-center text-13px text-t-secondary'>{t('conversation.projectHome.filesEmpty')}</div>
      ) : (
        <div className='flex flex-col gap-8px'>
          <div className='max-h-280px overflow-y-auto'>
            <WorkspaceProjectFilesFlyout
              t={t}
              workspaceDisplayName={getWorkspaceBasename(project.workspace)}
              files={files}
              expandedKeys={expandedKeys}
              onToggleFolder={toggleFolder}
              onOpenFile={(node) => void ipcBridge.shell.showItemInFolder.invoke(node.fullPath)}
            />
          </div>
          <span className='border-t border-t-4 pt-8px text-center text-11px text-t-tertiary'>
            {t('conversation.projectHome.filesReadonly')}
          </span>
        </div>
      )}
    </Card>
  );
};

export default ProjectFilesCard;
