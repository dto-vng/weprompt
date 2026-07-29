/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IKnowledgeSourceDto } from '@/common/types/project/knowledgeTypes';
import type { ForgeProject } from '@/common/types/project/projectTypes';
import { Alert, Button, Card, Popconfirm, Spin, Tag, Tooltip } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { useProjectKnowledge } from '../hooks/useProjectKnowledge';

export type ProjectKnowledgeCardProps = {
  project: ForgeProject;
};

const SUPPORTED_EXTENSIONS = ['md', 'txt', 'docx', 'xlsx', 'pdf'];

/**
 * Project Home knowledge card: lists the project's knowledge sources
 * (documents ingested for retrieval-augmented context in every project
 * chat), lets the user add / remove / retry sources, and surfaces the
 * project's overall passage-count and semantic-search summary.
 *
 * Mirrors `ProjectFilesCard`'s structure: loading -> error -> empty ->
 * content branching, Card chrome, and data-testid conventions. Status
 * affordances always branch on `source.status`, never on `source.error`
 * being present — a `ready` source may still carry a non-fatal `error`
 * (e.g. a truncation note), see `IKnowledgeSourceDto.error`.
 */
const ProjectKnowledgeCard: React.FC<ProjectKnowledgeCardProps> = ({ project }) => {
  const { t } = useTranslation();
  const { sources, summary, loading, error, addSources, removeSource, retrySource } = useProjectKnowledge(project.id);

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

  // A long PDF or a large embed pass can occupy the project's ingestion queue
  // for a while, so show where it has got to rather than an unmoving tag.
  const progressLabel = (source: IKnowledgeSourceDto): string => {
    const progress = source.progress;
    if (!progress) return t('conversation.projectHome.knowledgeStatusIndexing');
    const key =
      progress.stage === 'reading'
        ? 'conversation.projectHome.knowledgeProgressReading'
        : 'conversation.projectHome.knowledgeProgressEmbedding';
    return t(key, { done: progress.done, total: progress.total });
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
        if (source.progress) {
          return <Tag size='small'>{progressLabel(source)}</Tag>;
        }
        const readyTag = (
          <Tag size='small' color='green'>
            {t('conversation.projectHome.knowledgePassages', { count: source.chunkCount })}
          </Tag>
        );
        // A ready source can still carry a non-fatal note (e.g. truncation) —
        // surface it via tooltip rather than treating it as a failure.
        const taggedReady = source.error ? <Tooltip content={source.error}>{readyTag}</Tooltip> : readyTag;
        // A source indexed while no embedding model was configured is searchable
        // (BM25) but has no vectors. Offer Retry so the user can embed it after
        // configuring a model — otherwise remove-and-re-add is the only route.
        if (source.vectorCount < source.chunkCount) {
          return (
            <span className='flex flex-shrink-0 items-center gap-4px'>
              {taggedReady}
              <Button type='text' size='mini' onClick={() => void retrySource(source.id)}>
                {t('conversation.projectHome.knowledgeRetry')}
              </Button>
            </span>
          );
        }
        return taggedReady;
      }
      case 'failed':
        return (
          <span className='flex flex-shrink-0 items-center gap-4px'>
            <Tooltip content={source.error}>
              <Tag size='small' color='red'>
                {t('conversation.projectHome.knowledgeStatusFailed')}
              </Tag>
            </Tooltip>
            <Button type='text' size='mini' onClick={() => void retrySource(source.id)}>
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

  return (
    <Card
      data-testid='project-knowledge-card'
      title={t('conversation.projectHome.knowledge')}
      extra={
        <Button type='text' size='mini' onClick={() => void handleAdd()}>
          {t('conversation.projectHome.knowledgeAdd')}
        </Button>
      }
    >
      {loading ? (
        <div data-testid='project-knowledge-loading' className='flex items-center justify-center py-24px'>
          <Spin />
        </div>
      ) : error ? (
        <Alert type='warning' content={t('conversation.projectHome.knowledgeError')} />
      ) : sources.length === 0 ? (
        <div className='py-20px text-center text-13px text-t-secondary'>
          {t('conversation.projectHome.knowledgeEmpty')}
        </div>
      ) : (
        <div className='flex flex-col gap-8px'>
          <div className='flex max-h-280px flex-col gap-8px overflow-y-auto'>
            {sources.map((source) => (
              <div key={source.id} data-testid={`knowledge-source-${source.id}`} className='flex items-center gap-8px'>
                <span className='min-w-0 flex-1 truncate text-13px text-t-primary' title={source.fileName}>
                  {source.fileName}
                </span>
                {renderStatus(source)}
                <Popconfirm
                  title={t('conversation.projectHome.knowledgeRemoveConfirm')}
                  onOk={() => void removeSource(source.id)}
                >
                  <Button type='text' size='mini' status='danger' className='flex-shrink-0'>
                    {t('conversation.projectHome.knowledgeRemove')}
                  </Button>
                </Popconfirm>
              </div>
            ))}
          </div>
          {summary && (
            <span className='border-t border-t-light pt-8px text-center text-11px text-t-tertiary'>
              {`${t('conversation.projectHome.knowledgeSummary', { files: summary.fileCount, passages: summary.passageCount })} · ${
                summary.semantic === 'on'
                  ? t('conversation.projectHome.knowledgeSemanticOn')
                  : t('conversation.projectHome.knowledgeSemanticOff')
              }`}
            </span>
          )}
        </div>
      )}
    </Card>
  );
};

export default ProjectKnowledgeCard;
