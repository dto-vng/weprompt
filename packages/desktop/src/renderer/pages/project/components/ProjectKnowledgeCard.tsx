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
import { Delete, FolderOpen, Refresh, ShareTwo, Upload } from '@icon-park/react';
import classNames from 'classnames';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { useProjectKnowledge } from '../hooks/useProjectKnowledge';
import KnowledgeSourcePreview from './KnowledgeSourcePreview';

export type ProjectKnowledgeCardProps = {
  project: ForgeProject;
};

const SUPPORTED_EXTENSIONS = ['md', 'txt', 'docx', 'xlsx', 'pdf'];

/** Where a user adds an embedding model — the fix for a degraded semantic state. */
const MODEL_SETTINGS_ROUTE = '/settings/model';

/** Sources with no `converted.md` behind them have nothing to preview. */
const isPreviewable = (source: IKnowledgeSourceDto): boolean => source.status === 'ready';

/**
 * Indexed by BM25 but never embedded — the state a file lands in when it was
 * added before any embedding model existed.
 */
const isMissingVectors = (source: IKnowledgeSourceDto): boolean =>
  source.status === 'ready' && source.vectorCount < source.chunkCount;

const isSupportedFile = (filePath: string): boolean => {
  const extension = filePath.split('.').pop()?.toLowerCase();
  return !!extension && SUPPORTED_EXTENSIONS.includes(extension);
};

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
 * shows no tag at all; tags are reserved for states needing attention, and a
 * note rides along in the row's hover tooltip instead of claiming a tag.
 */
const ProjectKnowledgeCard: React.FC<ProjectKnowledgeCardProps> = ({ project }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
  const [dragging, setDragging] = React.useState(false);

  const knowledgeFolderPath = `${project.workspace}/${KNOWLEDGE_FOLDER_NAME}`;
  const filePathOf = (fileName: string): string => `${knowledgeFolderPath}/${fileName}`;

  const pendingEmbedSources = sources.filter(isMissingVectors);
  // An embed pass already under way owns the queue; a second wave of retries
  // would only stack up behind it.
  const busy = sources.some((source) => source.status === 'indexing' || !!source.progress);

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

  /**
   * Backfill vectors for every source BM25 left behind. The service queue
   * serializes these and one embed pass sweeps all missing vectors, so the
   * later calls cheaply no-op — this is a convenience over clicking Retry
   * down the list, not a different operation.
   */
  const handleEmbedAll = async (): Promise<void> => {
    for (const source of pendingEmbedSources) {
      try {
        // eslint-disable-next-line no-await-in-loop -- one queued pass at a time; parallel calls would only stack refetches
        await retrySource(source.id);
      } catch (embedError) {
        console.error('Failed to queue embedding for source:', source.id, embedError);
      }
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

  // Electron 37 dropped `File.path`; the preload exposes `getPathForFile` so a
  // dropped file still resolves to a real path the main process can copy.
  const pathsFromDrop = (dataTransfer: DataTransfer | null): string[] => {
    if (!dataTransfer?.files?.length) return [];
    const paths: string[] = [];
    for (let index = 0; index < dataTransfer.files.length; index++) {
      const file = dataTransfer.files[index];
      // A dropped directory carries no type and no usable path here; the
      // folder watcher is the route for those, so skip them quietly.
      const entry = dataTransfer.items?.[index]?.webkitGetAsEntry?.();
      if (entry?.isDirectory) continue;
      let filePath: string | undefined;
      try {
        filePath = window.electronAPI?.getPathForFile?.(file);
      } catch (pathError) {
        console.warn('Failed to resolve dropped file path:', pathError);
      }
      if (filePath && isSupportedFile(filePath)) paths.push(filePath);
    }
    return paths;
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>): Promise<void> => {
    event.preventDefault();
    setDragging(false);
    if (folderMissing) return;
    const paths = pathsFromDrop(event.dataTransfer);
    if (paths.length === 0) return;
    try {
      await addSources(paths);
    } catch (dropError) {
      console.error('Failed to add dropped knowledge sources:', dropError);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>): void => {
    if (folderMissing) return;
    // Claiming the dragover is what makes the card a drop target at all.
    event.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>): void => {
    // dragleave also fires when the pointer crosses into a child element, so
    // only a pointer that has genuinely left the card clears the highlight.
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    setDragging(false);
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
        if (isMissingVectors(source)) {
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
        // Healthy and fully embedded: say nothing. Quiet means good — any
        // non-fatal note travels in the row tooltip instead.
        return null;
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

  /**
   * One hover explains the row: the full name (which the list truncates),
   * what the assistant does with an indexed file, and any non-fatal note the
   * ingestion left behind.
   */
  const renderRowTooltip = (source: IKnowledgeSourceDto): React.ReactNode => (
    <span className='flex flex-col gap-2px'>
      <span>{source.fileName}</span>
      {source.status === 'ready' && <span>{t('conversation.projectHome.knowledgePassagesTooltip')}</span>}
      {source.status === 'ready' && source.error && <span>{source.error}</span>}
    </span>
  );

  const renderRow = (source: IKnowledgeSourceDto): React.ReactNode => (
    <div
      key={source.id}
      data-testid={`knowledge-source-${source.id}`}
      className='group flex items-center gap-8px rounded-4px px-4px py-2px hover:bg-fill-secondary'
    >
      {/* The Arco tooltip replaces the native `title`: two tooltips on one
          element fight, and this one carries more than the file name. */}
      <Tooltip content={renderRowTooltip(source)} position='top'>
        <span className='min-w-0 flex-1 truncate text-13px text-t-primary' onClick={() => void handlePreview(source)}>
          {source.fileName}
        </span>
      </Tooltip>
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
      // Arco's own card border wins on specificity, so the drag accent has to
      // be forced over it. The fill stays neutral: the brand override only
      // regenerates part of the primary scale, so `bg-primary-1` is still
      // Arco blue and would clash with the orange border.
      className={classNames(dragging && '!border-dashed !border-primary-5 !bg-fill-1')}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={(event) => void handleDrop(event)}
      extra={
        <span className='flex items-center gap-4px'>
          {!folderMissing && (
            <Tooltip content={t('conversation.projectHome.revealInFolder')}>
              <Button
                type='text'
                size='mini'
                data-testid='knowledge-reveal-folder'
                aria-label={t('conversation.projectHome.revealInFolder')}
                icon={<FolderOpen theme='outline' size='14' />}
                onClick={() => void ipcBridge.shell.showItemInFolder.invoke(knowledgeFolderPath)}
              />
            </Tooltip>
          )}
          <Tooltip content={t('conversation.projectHome.knowledgeRefresh')}>
            <Button
              type='text'
              size='mini'
              aria-label={t('conversation.projectHome.knowledgeRefresh')}
              icon={<Refresh theme='outline' size='14' />}
              onClick={() => void syncNow()}
            />
          </Tooltip>
          <Tooltip content={t('conversation.projectHome.knowledgeAdd')}>
            <Button
              type='text'
              size='mini'
              aria-label={t('conversation.projectHome.knowledgeAdd')}
              icon={<Upload theme='outline' size='14' />}
              onClick={() => void handleAdd()}
            />
          </Tooltip>
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
                  <span className='text-12px text-t-tertiary break-all'>{knowledgeFolderPath}</span>
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
          {(pendingEmbedSources.length > 0 || (summary?.semantic === 'off' && sources.length > 0)) && (
            <div className='flex flex-col items-center gap-2px border-t border-t-light pt-8px text-center text-11px text-t-tertiary'>
              {summary?.semantic === 'off' && sources.length > 0 && (
                <span data-testid='knowledge-degraded-note'>
                  {t('conversation.projectHome.knowledgeSemanticOff')}{' '}
                  <Button
                    type='text'
                    size='mini'
                    data-testid='knowledge-semantic-off-action'
                    onClick={() => navigate(MODEL_SETTINGS_ROUTE)}
                  >
                    {t('conversation.projectHome.knowledgeSemanticOffAction')}
                  </Button>
                </span>
              )}
              {pendingEmbedSources.length > 0 && (
                <Button
                  type='text'
                  size='mini'
                  disabled={busy}
                  data-testid='knowledge-embed-all'
                  onClick={() => void handleEmbedAll()}
                >
                  {t('conversation.projectHome.knowledgeEmbedAll')}
                </Button>
              )}
            </div>
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
