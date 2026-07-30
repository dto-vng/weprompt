/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { KNOWLEDGE_FOLDER_NAME } from '@/common/knowledge/constants';
import type { IKnowledgeSourceDto } from '@/common/types/project/knowledgeTypes';
import type { ForgeProject } from '@/common/types/project/projectTypes';
import { updateProject } from '@renderer/pages/conversation/projects/projectStorage';
import { Alert, Button, Card, Popconfirm, Spin, Tag, Tooltip } from '@arco-design/web-react';
import { Delete, ShareTwo } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { useProjectKnowledge } from '../hooks/useProjectKnowledge';
import KnowledgeSourcePreview from './KnowledgeSourcePreview';

export type ProjectKnowledgeCardProps = {
  project: ForgeProject;
};

const SUPPORTED_EXTENSIONS = ['md', 'txt', 'docx', 'xlsx', 'pdf'];

/** Sources with no `converted.md` behind them have nothing to preview. */
const isPreviewable = (source: IKnowledgeSourceDto): boolean => source.status === 'ready';

type PreviewState = {
  fileName: string | null;
  text: string;
  truncated: boolean;
  loading: boolean;
  failed: boolean;
};

const EMPTY_PREVIEW: PreviewState = { fileName: null, text: '', truncated: false, loading: false, failed: false };

/**
 * Project Home knowledge card: the project's `Knowledge Base/` folder,
 * rendered as a list of the documents every project chat can search.
 *
 * The folder is the source of truth, so this card is a view of a real folder
 * rather than of a hidden store: rows open the indexed text, "Open original"
 * opens the actual file, and deleting moves that file to the Trash.
 *
 * Status affordances branch on `source.status`, never on `source.error` being
 * present — a `ready` source may still carry a non-fatal note (e.g. a
 * truncation warning), see `IKnowledgeSourceDto.error`. A healthy ready row
 * shows no tag at all; tags are reserved for states needing attention.
 */
const ProjectKnowledgeCard: React.FC<ProjectKnowledgeCardProps> = ({ project }) => {
  const { t } = useTranslation();
  const {
    sources,
    summary,
    loading,
    error,
    folderMissing,
    addSources,
    removeSource,
    retrySource,
    syncNow,
    getSourceText,
  } = useProjectKnowledge(project);
  const [preview, setPreview] = React.useState<PreviewState>(EMPTY_PREVIEW);

  const filePathOf = (fileName: string): string => `${project.workspace}/${KNOWLEDGE_FOLDER_NAME}/${fileName}`;

  const handleAdd = async (): Promise<void> => {
    try {
      const filePaths = await ipcBridge.dialog.showOpen.invoke({
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: t('conversation.projectHome.knowledge'), extensions: SUPPORTED_EXTENSIONS }],
      });
      if (!filePaths || filePaths.length === 0) return;
      await addSources(filePaths);
    } catch (addError) {
      console.error('Failed to add project knowledge sources:', addError);
    }
  };

  const handleRelink = async (): Promise<void> => {
    try {
      const result = await ipcBridge.dialog.showOpen.invoke({
        defaultPath: project.workspace,
        properties: ['openDirectory', 'createDirectory'],
      });
      const selectedFolder = result?.[0];
      if (!selectedFolder) return;
      updateProject({ id: project.id, workspace: selectedFolder });
      await syncNow();
    } catch (relinkError) {
      console.error('Failed to relink project workspace:', relinkError);
    }
  };

  const handlePreview = async (source: IKnowledgeSourceDto): Promise<void> => {
    if (!isPreviewable(source)) return;
    setPreview({ fileName: source.fileName, text: '', truncated: false, loading: true, failed: false });
    try {
      const { text, truncated } = await getSourceText(source.id);
      setPreview({ fileName: source.fileName, text, truncated, loading: false, failed: false });
    } catch (previewError) {
      console.error('Failed to load indexed text:', previewError);
      setPreview({ fileName: source.fileName, text: '', truncated: false, loading: false, failed: true });
    }
  };

  // A long PDF or a large embed pass can occupy the project's ingestion queue
  // for a while, so show where it has got to rather than an unmoving tag.
  const PROGRESS_KEY_BY_STAGE = {
    reading: 'conversation.projectHome.knowledgeProgressReading',
    transcribing: 'conversation.projectHome.knowledgeProgressTranscribing',
    embedding: 'conversation.projectHome.knowledgeProgressEmbedding',
  } as const;

  const progressLabel = (source: IKnowledgeSourceDto): string => {
    const progress = source.progress;
    if (!progress) return t('conversation.projectHome.knowledgeStatusIndexing');
    return t(PROGRESS_KEY_BY_STAGE[progress.stage], { done: progress.done, total: progress.total });
  };

  /**
   * Marker for a source whose text was transcribed from a scan by a model
   * rather than read from the file. Shown for its own sake: transcription can be
   * wrong in ways reading cannot, so a user who doubts an answer needs to be
   * able to see where the text came from — and which pages produced nothing.
   */
  const renderOcrTag = (source: IKnowledgeSourceDto): React.ReactNode => {
    if (!source.ocr) return null;
    const { model, skippedPages } = source.ocr;
    return (
      <Tooltip
        content={t('conversation.projectHome.knowledgeOcrDetail', {
          model,
          pages:
            skippedPages.length > 0
              ? skippedPages.join(', ')
              : t('conversation.projectHome.knowledgeOcrNoSkippedPages'),
        })}
      >
        <Tag size='small' data-testid={`knowledge-ocr-${source.id}`}>
          {t('conversation.projectHome.knowledgeOcrTag')}
        </Tag>
      </Tooltip>
    );
  };

  const renderStatus = (source: IKnowledgeSourceDto): React.ReactNode => {
    switch (source.status) {
      case 'indexing':
        return <Tag size='small'>{progressLabel(source)}</Tag>;
      case 'ready': {
        // The embed pass runs on sources that are ALREADY ready — BM25 makes
        // them searchable before any vector exists. So embedding progress can
        // only ever appear here, never under `indexing`. Showing it also
        // suppresses the Retry button below, which would otherwise invite the
        // user to restart an embed that is still running.
        if (source.progress) return <Tag size='small'>{progressLabel(source)}</Tag>;
        // A source indexed while no embedding model was configured is
        // searchable (BM25) but has no vectors. Offer Retry so it can be
        // embedded once a model exists — otherwise delete-and-re-add is the
        // only route.
        if (source.vectorCount < source.chunkCount) {
          return (
            <Button
              type='text'
              size='mini'
              className='flex-shrink-0'
              onClick={(event) => {
                event.stopPropagation();
                void retrySource(source.id);
              }}
            >
              {t('conversation.projectHome.knowledgeRetry')}
            </Button>
          );
        }
        // Healthy and fully embedded: say nothing. Quiet means good.
        return source.error ? (
          <Tooltip content={source.error}>
            <Tag size='small'>{t('conversation.projectHome.knowledgeStatusNote')}</Tag>
          </Tooltip>
        ) : null;
      }
      case 'failed':
        return (
          <span className='flex flex-shrink-0 items-center gap-4px'>
            <Tooltip content={source.error}>
              <Tag size='small' color='red'>
                {t('conversation.projectHome.knowledgeStatusFailed')}
              </Tag>
            </Tooltip>
            <Button
              type='text'
              size='mini'
              onClick={(event) => {
                event.stopPropagation();
                void retrySource(source.id);
              }}
            >
              {t('conversation.projectHome.knowledgeRetry')}
            </Button>
          </span>
        );
      case 'unsupported':
        return (
          <Tooltip content={t('conversation.projectHome.knowledgeSupportedTypes')}>
            <Tag size='small'>{t('conversation.projectHome.knowledgeStatusUnsupported')}</Tag>
          </Tooltip>
        );
      default:
        return null;
    }
  };

  const renderRow = (source: IKnowledgeSourceDto): React.ReactNode => (
    <div
      key={source.id}
      data-testid={`knowledge-source-${source.id}`}
      className='group flex items-center gap-8px rounded-4px px-4px py-2px hover:bg-fill-secondary'
    >
      <span
        className='min-w-0 flex-1 truncate text-13px text-t-primary'
        title={source.fileName}
        onClick={() => void handlePreview(source)}
      >
        {source.fileName}
      </span>
      {renderOcrTag(source)}
      {renderStatus(source)}
      {/* Icon actions stay hidden until hover so a settled list reads as
          content, not as a control panel; focus-within keeps them reachable
          by keyboard. */}
      <span className='flex flex-shrink-0 items-center gap-2px opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100'>
        <Tooltip content={t('conversation.projectHome.knowledgeOpenOriginal')}>
          <Button
            type='text'
            size='mini'
            data-testid={`knowledge-open-${source.id}`}
            aria-label={t('conversation.projectHome.knowledgeOpenOriginal')}
            icon={<ShareTwo theme='outline' size='14' />}
            onClick={() => void ipcBridge.shell.openFile.invoke(filePathOf(source.fileName))}
          />
        </Tooltip>
        <Popconfirm
          title={t('conversation.projectHome.knowledgeDeleteConfirm', { fileName: source.fileName })}
          okText={t('conversation.projectHome.knowledgeDeleteFile')}
          onOk={() => void removeSource(source.id)}
        >
          <Button
            type='text'
            size='mini'
            status='danger'
            data-testid={`knowledge-delete-${source.id}`}
            aria-label={t('conversation.projectHome.knowledgeDeleteFile')}
            icon={<Delete theme='outline' size='14' />}
          />
        </Popconfirm>
      </span>
    </div>
  );

  return (
    <Card
      data-testid='project-knowledge-card'
      title={t('conversation.projectHome.knowledge')}
      extra={
        <span className='flex items-center gap-4px'>
          <Button type='text' size='mini' onClick={() => void syncNow()}>
            {t('conversation.projectHome.knowledgeRefresh')}
          </Button>
          <Button type='text' size='mini' onClick={() => void handleAdd()}>
            {t('conversation.projectHome.knowledgeAdd')}
          </Button>
        </span>
      }
    >
      {loading ? (
        <div data-testid='project-knowledge-loading' className='flex items-center justify-center py-24px'>
          <Spin />
        </div>
      ) : error ? (
        <Alert type='warning' content={t('conversation.projectHome.knowledgeError')} />
      ) : (
        <div className='flex flex-col gap-8px'>
          {/* A missing folder never deletes anything — the index below is
              intact and searchable, which is why this is a warning rather
              than an empty state. */}
          {folderMissing && (
            <Alert
              type='warning'
              data-testid='knowledge-folder-missing'
              title={t('conversation.projectHome.knowledgeFolderMissingTitle')}
              content={
                <div className='flex flex-col items-start gap-8px'>
                  <span className='text-12px text-t-tertiary break-all'>{filePathOf('')}</span>
                  <span className='text-12px text-t-tertiary'>
                    {t('conversation.projectHome.knowledgeFolderMissingBody')}
                  </span>
                  <Button type='primary' size='mini' onClick={() => void handleRelink()}>
                    {t('conversation.projectHome.folderMissingRelink')}
                  </Button>
                </div>
              }
            />
          )}
          {sources.length === 0 ? (
            <div className='flex flex-col gap-4px py-20px text-center'>
              <span className='text-13px text-t-secondary'>{t('conversation.projectHome.knowledgeEmpty')}</span>
              <span className='text-12px text-t-tertiary'>{t('conversation.projectHome.knowledgeFolderHint')}</span>
            </div>
          ) : (
            <div className='flex max-h-280px flex-col gap-4px overflow-y-auto'>{sources.map(renderRow)}</div>
          )}
          {summary && summary.semantic === 'off' && sources.length > 0 && (
            <span
              data-testid='knowledge-degraded-note'
              className='border-t border-t-light pt-8px text-center text-11px text-t-tertiary'
            >
              {t('conversation.projectHome.knowledgeSemanticOff')}
            </span>
          )}
        </div>
      )}
      <KnowledgeSourcePreview
        fileName={preview.fileName}
        text={preview.text}
        truncated={preview.truncated}
        loading={preview.loading}
        failed={preview.failed}
        onClose={() => setPreview(EMPTY_PREVIEW)}
        onOpenOriginal={() => {
          if (preview.fileName) void ipcBridge.shell.openFile.invoke(filePathOf(preview.fileName));
        }}
      />
    </Card>
  );
};

export default ProjectKnowledgeCard;
