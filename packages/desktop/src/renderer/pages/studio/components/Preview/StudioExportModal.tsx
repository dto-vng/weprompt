/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { StudioLatestRender, StudioRendererProject } from '@/common/types/project/creativeStudioTypes';
import { Button, Checkbox, Modal } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import studioType from '../../StudioTypography.module.css';

export type StudioExportModalProps = {
  visible: boolean;
  project: StudioRendererProject;
  selectedAssetCount: number;
  pending: boolean;
  includeReferences: boolean;
  exportedFolderName: string | null;
  missingSceneIds: string[];
  issueMessageKey: string | null;
  latestRender: StudioLatestRender | null;
  latestRenderReady: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onIncludeReferencesChange: (checked: boolean) => void;
  onOpenProduce?: () => void;
};

export const studioShotNumbers = (project: StudioRendererProject, sceneIds: readonly string[]): string[] =>
  sceneIds.map((sceneId) => {
    const sceneIndex = project.sceneOrder.indexOf(sceneId);
    return sceneIndex < 0 ? sceneId : String(sceneIndex + 1).padStart(2, '0');
  });

export const StudioExportModal: React.FC<StudioExportModalProps> = ({
  visible,
  project,
  selectedAssetCount,
  pending,
  includeReferences,
  exportedFolderName,
  missingSceneIds,
  issueMessageKey,
  latestRender = null,
  latestRenderReady = true,
  onCancel,
  onConfirm,
  onIncludeReferencesChange,
  onOpenProduce,
}) => {
  const { i18n, t } = useTranslation();
  const missingShotNumbers = studioShotNumbers(project, missingSceneIds);
  const renderedAt = latestRender === null ? null : Date.parse(latestRender.renderedAt);
  const projectUpdatedAt = Date.parse(project.updatedAt);
  const staleRender =
    renderedAt !== null &&
    Number.isFinite(renderedAt) &&
    Number.isFinite(projectUpdatedAt) &&
    renderedAt < projectUpdatedAt;

  return (
    <Modal
      visible={visible}
      wrapClassName={studioType.surface}
      title={t(
        exportedFolderName === null
          ? 'conversation.creativeStudio.export.title'
          : missingSceneIds.length > 0
            ? 'conversation.creativeStudio.export.partialTitle'
            : 'conversation.creativeStudio.export.successTitle'
      )}
      closable={!pending}
      maskClosable={!pending}
      escToExit={!pending}
      onCancel={() => {
        if (!pending) onCancel();
      }}
      footer={
        <div className='flex flex-wrap justify-end gap-8px'>
          <Button disabled={pending} onClick={onCancel}>
            {t('conversation.creativeStudio.export.cancel')}
          </Button>
          {exportedFolderName !== null && missingSceneIds.length > 0 && onOpenProduce !== undefined && (
            <Button type='primary' disabled={pending} onClick={onOpenProduce}>
              {t('conversation.creativeStudio.phase.review.openProduce')}
            </Button>
          )}
          {exportedFolderName === null && (
            <Button
              type='primary'
              loading={pending}
              disabled={pending || selectedAssetCount === 0 || !latestRenderReady}
              onClick={onConfirm}
            >
              {t('conversation.creativeStudio.export.confirm')}
            </Button>
          )}
        </div>
      }
    >
      {exportedFolderName === null ? (
        <div className='flex flex-col gap-12px'>
          <p className='m-0'>{t('conversation.creativeStudio.export.body')}</p>
          <dl className='m-0 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-12px gap-y-8px rounded-8px bg-fill-1 p-12px'>
            <dt className='text-12px text-t-tertiary'>cut.mp4</dt>
            <dd className='m-0 text-13px text-t-primary'>
              {!latestRenderReady ? (
                t('conversation.creativeStudio.export.checkingRender')
              ) : latestRender === null ? (
                t('conversation.creativeStudio.export.noRender')
              ) : (
                <>
                  <span>{t('conversation.creativeStudio.export.renderedAt')}</span>{' '}
                  <time dateTime={latestRender.renderedAt}>
                    {new Date(latestRender.renderedAt).toLocaleString(i18n.resolvedLanguage ?? i18n.language, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </time>
                </>
              )}
            </dd>
          </dl>
          {staleRender && (
            <p role='alert' className='m-0 rounded-8px bg-warning-light-1 p-10px text-13px text-warning'>
              {t('conversation.creativeStudio.export.staleRender')}
            </p>
          )}
          {selectedAssetCount === 0 && (
            <p className='m-0 text-13px text-warning'>{t('conversation.creativeStudio.export.noSelectedAssets')}</p>
          )}
          {missingSceneIds.length > 0 && (
            <div
              role='alert'
              className='flex flex-col gap-4px rounded-8px bg-warning-light-1 p-10px text-13px text-warning'
            >
              <p className='m-0'>
                {t('conversation.creativeStudio.export.gapWarning', {
                  count: missingSceneIds.length,
                  shots: missingShotNumbers.join(', '),
                })}
              </p>
              <p className='m-0'>
                {t('conversation.creativeStudio.export.confirmSelectedCount', { count: selectedAssetCount })}
              </p>
            </div>
          )}
          <Checkbox checked={includeReferences} disabled={pending} onChange={onIncludeReferencesChange}>
            {t('conversation.creativeStudio.export.includeReferences')}
          </Checkbox>
          {pending && (
            <p role='status' className='m-0 text-13px text-t-secondary'>
              {t('conversation.creativeStudio.export.choosing')}
            </p>
          )}
          {issueMessageKey !== null && (
            <div role='alert' className='rounded-8px bg-danger-light-1 p-10px text-13px text-danger'>
              <p className='m-0'>{t('conversation.creativeStudio.export.failed')}</p>
              {issueMessageKey !== 'conversation.creativeStudio.export.failed' && (
                <p className='mb-0 mt-4px'>{t(issueMessageKey)}</p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className='flex flex-col gap-12px'>
          <p className='m-0'>
            {missingSceneIds.length > 0
              ? t('conversation.creativeStudio.export.partialBody', { folderName: exportedFolderName })
              : t('conversation.creativeStudio.export.successBody', {
                  folderName: exportedFolderName,
                  count: selectedAssetCount,
                })}
          </p>
          <dl className='m-0 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-12px gap-y-8px rounded-8px bg-fill-1 p-12px'>
            <dt className='text-12px text-t-tertiary'>{t('conversation.creativeStudio.export.folderLabel')}</dt>
            <dd className='m-0 break-all text-13px text-t-primary'>{exportedFolderName}</dd>
          </dl>
          {missingSceneIds.length > 0 && (
            <div className='flex flex-col gap-8px rounded-8px bg-warning-light-1 p-10px text-13px text-warning'>
              <p className='m-0'>{t('conversation.creativeStudio.phase.review.partialHandoff')}</p>
              <ul
                aria-label={t('conversation.creativeStudio.phase.review.missingSlates', {
                  count: missingSceneIds.length,
                })}
                className='m-0 flex list-disc flex-col gap-4px pl-18px'
              >
                {missingSceneIds.map((sceneId) => (
                  <li key={sceneId}>
                    {project.scenes[sceneId]?.title !== undefined && (
                      <span className='mr-6px'>{project.scenes[sceneId]!.title}</span>
                    )}
                    <code>{sceneId}</code>
                  </li>
                ))}
              </ul>
              <p className='m-0'>{t('conversation.creativeStudio.phase.review.excludedFromHandoff')}</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
