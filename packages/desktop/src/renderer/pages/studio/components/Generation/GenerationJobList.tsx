/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { StudioCommandErrorCode, StudioRendererJob } from '@/common/types/project/creativeStudioTypes';
import { Button, Modal, Progress, Spin } from '@arco-design/web-react';
import { Attention, CheckOne, CloseOne, Loading, Time } from '@icon-park/react';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import studioType from '../../StudioTypography.module.css';

type ActionResult = void | Promise<unknown>;

export type GenerationJobActionIssue = {
  jobId: string;
  code: StudioCommandErrorCode;
  messageKey: string;
};

export type GenerationJobListProps = {
  jobs: readonly StudioRendererJob[];
  sceneTitles: Readonly<Record<string, string>>;
  disabled?: boolean;
  pendingJobIds?: readonly string[];
  actionIssue?: GenerationJobActionIssue | null;
  onCancelJob: (jobId: string) => ActionResult;
  onRetryJob: (jobId: string) => ActionResult;
  onRetryDownload: (jobId: string) => ActionResult;
  onReviewUnknownSubmission: (jobId: string) => ActionResult;
};

const ACTIVE_JOB_STATUSES = new Set<StudioRendererJob['status']>([
  'queued_local',
  'submitting',
  'queued_remote',
  'running',
]);

const NONTERMINAL_JOB_STATUSES = new Set<StudioRendererJob['status']>([...ACTIVE_JOB_STATUSES, 'needs_attention']);

const jobStatusKey = (status: StudioRendererJob['status']): string => {
  switch (status) {
    case 'queued_local':
      return 'conversation.creativeStudio.jobs.status.queuedLocal';
    case 'submitting':
      return 'conversation.creativeStudio.jobs.status.submitting';
    case 'queued_remote':
      return 'conversation.creativeStudio.jobs.status.queuedRemote';
    case 'running':
      return 'conversation.creativeStudio.jobs.status.running';
    case 'needs_attention':
      return 'conversation.creativeStudio.jobs.status.needsAttention';
    case 'succeeded':
      return 'conversation.creativeStudio.jobs.status.succeeded';
    case 'failed':
      return 'conversation.creativeStudio.jobs.status.failed';
    case 'cancelled':
      return 'conversation.creativeStudio.jobs.status.cancelled';
  }
};

const statusIcon = (status: StudioRendererJob['status']): React.ReactNode => {
  switch (status) {
    case 'queued_local':
    case 'queued_remote':
      return <Time />;
    case 'submitting':
    case 'running':
      return <Loading />;
    case 'succeeded':
      return <CheckOne />;
    case 'needs_attention':
      return <Attention />;
    case 'failed':
    case 'cancelled':
      return <CloseOne />;
  }
};

const compareJobs = (left: StudioRendererJob, right: StudioRendererJob): number => {
  const leftActive = NONTERMINAL_JOB_STATUSES.has(left.status);
  const rightActive = NONTERMINAL_JOB_STATUSES.has(right.status);
  if (leftActive !== rightActive) return leftActive ? -1 : 1;
  const newestFirst = right.updatedAt.localeCompare(left.updatedAt);
  return newestFirst === 0 ? left.id.localeCompare(right.id) : newestFirst;
};

/** Project-wide generation activity with renderer-safe, main-authorized recovery actions. */
export const GenerationJobList: React.FC<GenerationJobListProps> = ({
  jobs,
  sceneTitles,
  disabled = false,
  pendingJobIds = [],
  actionIssue = null,
  onCancelJob,
  onRetryJob,
  onRetryDownload,
  onReviewUnknownSubmission,
}) => {
  const { t } = useTranslation();
  const [retryConfirmationJobId, setRetryConfirmationJobId] = useState<string | null>(null);
  const sortedJobs = useMemo(() => jobs.toSorted(compareJobs), [jobs]);
  const pendingIds = useMemo(() => new Set(pendingJobIds), [pendingJobIds]);
  const retryParentIds = useMemo(
    () => new Set(jobs.flatMap((candidate) => (candidate.retryOfJobId === null ? [] : [candidate.retryOfJobId]))),
    [jobs]
  );
  const runningCount = jobs.filter((candidate) => ACTIVE_JOB_STATUSES.has(candidate.status)).length;
  const visibleIssue = actionIssue !== null && jobs.some((candidate) => candidate.id === actionIssue.jobId);
  const retryConfirmationPending = retryConfirmationJobId !== null && pendingIds.has(retryConfirmationJobId);

  return (
    <section
      aria-label={t('conversation.creativeStudio.phase.produce.activityTitle')}
      className='flex min-w-0 flex-col gap-10px rounded-8px border border-border-2 bg-fill-1 p-12px'
    >
      <div className='flex flex-wrap items-center justify-between gap-8px'>
        <h3 className={`${studioType.cardTitle} m-0`}>
          {t('conversation.creativeStudio.phase.produce.activityTitle')}
        </h3>
        {runningCount > 0 && (
          <span role='status' className={studioType.meta}>
            {t('conversation.creativeStudio.phase.produce.jobsRunning', { count: runningCount })}
          </span>
        )}
      </div>

      {visibleIssue && actionIssue !== null && (
        <div role='alert' className='rounded-8px border border-danger-3 bg-danger-light-1 p-10px text-danger'>
          <span>{t(actionIssue.messageKey)}</span>
          <code className='ml-8px text-11px'>{actionIssue.code}</code>
        </div>
      )}

      {sortedJobs.length === 0 ? (
        <p className={`${studioType.body} m-0`}>{t('conversation.creativeStudio.phase.produce.activityEmpty')}</p>
      ) : (
        <ul className='m-0 flex list-none flex-col gap-8px p-0'>
          {sortedJobs.map((candidate) => {
            const pending = pendingIds.has(candidate.id);
            const hasRetryChild = retryParentIds.has(candidate.id);
            const hasOtherActiveSceneJob = jobs.some(
              (other) =>
                other.id !== candidate.id &&
                other.sceneId === candidate.sceneId &&
                NONTERMINAL_JOB_STATUSES.has(other.status)
            );
            const recoveryBlocked = hasRetryChild || hasOtherActiveSceneJob;
            const submissionUnknown =
              candidate.status === 'needs_attention' &&
              candidate.error?.code === 'submission_unknown' &&
              !recoveryBlocked;
            const downloadFailed =
              candidate.status === 'failed' &&
              candidate.error?.code === 'download_failed' &&
              candidate.canRetryDownload &&
              !recoveryBlocked;
            const canRetry =
              (candidate.status === 'failed' || candidate.status === 'needs_attention') &&
              candidate.error?.code !== 'submission_unknown' &&
              candidate.error?.code !== 'download_failed' &&
              candidate.error?.code !== 'poll_deadline' &&
              !recoveryBlocked;

            return (
              <li
                key={candidate.id}
                aria-label={candidate.id}
                className='rounded-8px border border-border-2 bg-base p-10px'
              >
                <div role='status' aria-live='polite' className='flex flex-wrap items-center gap-8px'>
                  <span aria-hidden='true' className='flex text-t-secondary'>
                    {statusIcon(candidate.status)}
                  </span>
                  <span className={studioType.cardTitle}>{t(jobStatusKey(candidate.status))}</span>
                  <span className={studioType.body}>{sceneTitles[candidate.sceneId] ?? candidate.sceneId}</span>
                  <span className={`${studioType.meta} break-all`}>
                    {candidate.provider.providerId} · {candidate.provider.model}
                  </span>
                </div>

                {(candidate.status === 'submitting' || candidate.status === 'running') &&
                  typeof candidate.progress !== 'number' && (
                    <div
                      role='progressbar'
                      aria-label={t(jobStatusKey(candidate.status))}
                      className='mt-8px flex items-center'
                    >
                      <Spin size={12} />
                    </div>
                  )}

                {typeof candidate.progress === 'number' && (
                  <div className='mt-8px'>
                    <Progress percent={candidate.progress} size='small' showText={false} />
                    <span className={studioType.meta}>
                      {t('conversation.creativeStudio.jobs.progress', { percent: candidate.progress })}
                    </span>
                  </div>
                )}

                {candidate.error !== null && (
                  <div role='alert' className='mt-8px text-12px text-danger'>
                    <span>{t(candidate.error.messageKey)}</span>
                    <code className='ml-8px text-11px'>{candidate.error.code}</code>
                  </div>
                )}

                {(candidate.canCancel || canRetry || downloadFailed || submissionUnknown) && (
                  <div className='mt-8px flex flex-wrap gap-8px'>
                    {candidate.canCancel && (
                      <Button size='mini' disabled={pending} onClick={() => void onCancelJob(candidate.id)}>
                        {t('conversation.creativeStudio.jobs.cancel')}
                      </Button>
                    )}
                    {canRetry && (
                      <Button
                        size='mini'
                        disabled={disabled || pending}
                        onClick={() => setRetryConfirmationJobId(candidate.id)}
                      >
                        {t('conversation.creativeStudio.jobs.retry')}
                      </Button>
                    )}
                    {downloadFailed && (
                      <Button size='mini' disabled={pending} onClick={() => void onRetryDownload(candidate.id)}>
                        {t('conversation.creativeStudio.jobs.retryDownload')}
                      </Button>
                    )}
                    {submissionUnknown && (
                      <Button
                        size='mini'
                        disabled={disabled || pending}
                        onClick={() => void onReviewUnknownSubmission(candidate.id)}
                      >
                        {t('conversation.creativeStudio.jobs.retry')}
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Modal
        visible={retryConfirmationJobId !== null}
        title={t('conversation.creativeStudio.jobs.retryConfirmationTitle')}
        closable={!retryConfirmationPending}
        maskClosable={!retryConfirmationPending}
        escToExit={!retryConfirmationPending}
        onCancel={() => {
          if (!retryConfirmationPending) setRetryConfirmationJobId(null);
        }}
        footer={
          <div className='flex flex-wrap justify-end gap-8px'>
            <Button disabled={retryConfirmationPending} onClick={() => setRetryConfirmationJobId(null)}>
              {t('conversation.creativeStudio.review.cancel')}
            </Button>
            <Button
              type='primary'
              disabled={disabled}
              loading={retryConfirmationPending}
              onClick={() => {
                const jobId = retryConfirmationJobId;
                if (jobId === null || disabled || retryConfirmationPending) return;
                void Promise.resolve(onRetryJob(jobId)).then((retried) => {
                  if (retried !== false) {
                    setRetryConfirmationJobId((currentJobId) => (currentJobId === jobId ? null : currentJobId));
                  }
                });
              }}
            >
              {t('conversation.creativeStudio.jobs.retryConfirmationConfirm')}
            </Button>
          </div>
        }
      >
        <p>{t('conversation.creativeStudio.jobs.retryConfirmationBody')}</p>
        {actionIssue?.jobId === retryConfirmationJobId && (
          <div role='alert' className='rounded-8px border border-danger-3 bg-danger-light-1 p-10px text-danger'>
            <span>{t(actionIssue.messageKey)}</span>
            <code className='ml-8px text-11px'>{actionIssue.code}</code>
          </div>
        )}
      </Modal>
    </section>
  );
};
