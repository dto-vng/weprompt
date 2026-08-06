/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StudioRendererJob } from '@/common/types/project/creativeStudioTypes';
import {
  GenerationJobList,
  type GenerationJobListProps,
} from '@renderer/pages/studio/components/Generation/GenerationJobList';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values
        ? `${key}:${Object.entries(values)
            .map(([name, value]) => `${name}=${String(value)}`)
            .join(',')}`
        : key,
  }),
}));

const job = (overrides: Partial<StudioRendererJob> = {}): StudioRendererJob => ({
  id: 'job-1',
  projectId: 'project-1',
  sceneId: 'scene-1',
  status: 'running',
  provider: {
    choiceId: 'choice-image',
    providerId: 'provider-image',
    model: 'image-model',
  },
  outputAssetIds: [],
  error: null,
  canCancel: false,
  canRetryDownload: false,
  retryOfJobId: null,
  retryReason: null,
  duplicateChargeAcknowledged: false,
  duplicateChargeAcknowledgedAt: null,
  createdAt: '2026-08-04T00:00:00.000Z',
  updatedAt: '2026-08-04T00:00:00.000Z',
  ...overrides,
});

const createProps = (overrides: Partial<GenerationJobListProps> = {}): GenerationJobListProps => ({
  jobs: [],
  sceneTitles: {
    'scene-1': 'Opening shot',
    'scene-2': 'Closing shot',
  },
  disabled: false,
  pendingJobIds: [],
  actionIssue: null,
  onCancelJob: vi.fn(),
  onRetryJob: vi.fn(),
  onRetryDownload: vi.fn(),
  onReviewUnknownSubmission: vi.fn(),
  ...overrides,
});

describe('GenerationJobList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an explicit empty activity state', () => {
    render(<GenerationJobList {...createProps()} />);

    expect(screen.getByText('conversation.creativeStudio.phase.produce.activityEmpty')).toBeVisible();
  });

  it('sorts active work first, then newest work, with a stable ID tiebreaker', () => {
    render(
      <GenerationJobList
        {...createProps({
          jobs: [
            job({ id: 'job-complete', status: 'succeeded', updatedAt: '2026-08-04T05:00:00.000Z' }),
            job({ id: 'job-b', status: 'queued_remote', updatedAt: '2026-08-04T02:00:00.000Z' }),
            job({ id: 'job-a', status: 'queued_local', updatedAt: '2026-08-04T02:00:00.000Z' }),
            job({ id: 'job-running', status: 'running', updatedAt: '2026-08-04T03:00:00.000Z' }),
            job({
              id: 'job-failed',
              status: 'failed',
              updatedAt: '2026-08-04T04:00:00.000Z',
              error: {
                code: 'auth',
                messageKey: 'conversation.creativeStudio.jobs.errors.auth',
              },
            }),
          ],
        })}
      />
    );

    expect(screen.getAllByRole('listitem').map((item) => item.getAttribute('aria-label'))).toEqual([
      'job-running',
      'job-a',
      'job-b',
      'job-complete',
      'job-failed',
    ]);
  });

  it('lists jobs from every project scene with their scene titles', () => {
    render(
      <GenerationJobList
        {...createProps({
          jobs: [
            job({ id: 'job-opening', sceneId: 'scene-1' }),
            job({ id: 'job-closing', sceneId: 'scene-2', status: 'succeeded' }),
          ],
        })}
      />
    );

    expect(screen.getByText('Opening shot')).toBeVisible();
    expect(screen.getByText('Closing shot')).toBeVisible();
  });

  it('announces determinate and indeterminate progress', () => {
    render(
      <GenerationJobList
        {...createProps({
          jobs: [
            job({ id: 'job-submitting', status: 'submitting', progress: undefined }),
            job({ id: 'job-running', status: 'running', progress: 42 }),
            job({ id: 'job-queued', status: 'queued_remote', progress: undefined }),
          ],
        })}
      />
    );

    expect(
      within(screen.getByRole('listitem', { name: 'job-submitting' })).getByRole('progressbar', {
        name: 'conversation.creativeStudio.jobs.status.submitting',
      })
    ).toBeInTheDocument();
    expect(screen.getByText('conversation.creativeStudio.jobs.progress:percent=42')).toBeVisible();
    expect(
      within(screen.getByRole('listitem', { name: 'job-queued' })).queryByRole('progressbar')
    ).not.toBeInTheDocument();
  });

  it('does not let an active job for another scene block recovery', () => {
    const props = createProps({
      jobs: [
        job({
          id: 'job-failed-scene-1',
          sceneId: 'scene-1',
          status: 'failed',
          error: {
            code: 'provider_unavailable',
            messageKey: 'conversation.creativeStudio.jobs.errors.providerUnavailable',
          },
        }),
        job({ id: 'job-running-scene-2', sceneId: 'scene-2', status: 'running' }),
      ],
    });
    render(<GenerationJobList {...props} />);

    expect(
      within(screen.getByRole('listitem', { name: 'job-failed-scene-1' })).getByRole('button', {
        name: 'conversation.creativeStudio.jobs.retry',
      })
    ).toBeEnabled();
  });

  it('blocks recovery while the same scene has another active job', () => {
    render(
      <GenerationJobList
        {...createProps({
          jobs: [
            job({
              id: 'job-failed-scene-1',
              sceneId: 'scene-1',
              status: 'failed',
              error: {
                code: 'provider_unavailable',
                messageKey: 'conversation.creativeStudio.jobs.errors.providerUnavailable',
              },
            }),
            job({ id: 'job-running-scene-1', sceneId: 'scene-1', status: 'running' }),
          ],
        })}
      />
    );

    expect(
      within(screen.getByRole('listitem', { name: 'job-failed-scene-1' })).queryByRole('button', {
        name: 'conversation.creativeStudio.jobs.retry',
      })
    ).not.toBeInTheDocument();
  });

  it('makes only the terminal retry child recoverable', () => {
    const props = createProps({
      jobs: [
        job({
          id: 'job-parent',
          status: 'failed',
          error: {
            code: 'auth',
            messageKey: 'conversation.creativeStudio.jobs.errors.auth',
          },
        }),
        job({
          id: 'job-child',
          status: 'failed',
          retryOfJobId: 'job-parent',
          retryReason: 'provider_failure',
          error: {
            code: 'provider_unavailable',
            messageKey: 'conversation.creativeStudio.jobs.errors.providerUnavailable',
          },
        }),
      ],
    });
    render(<GenerationJobList {...props} />);

    expect(
      within(screen.getByRole('listitem', { name: 'job-parent' })).queryByRole('button', {
        name: 'conversation.creativeStudio.jobs.retry',
      })
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('listitem', { name: 'job-child' })).getByRole('button', {
        name: 'conversation.creativeStudio.jobs.retry',
      })
    ).toBeEnabled();
  });

  it('holds ordinary provider retry until the charge confirmation is accepted', () => {
    const props = createProps({
      jobs: [
        job({
          id: 'job-provider-failure',
          status: 'failed',
          error: {
            code: 'provider_unavailable',
            messageKey: 'conversation.creativeStudio.jobs.errors.providerUnavailable',
          },
        }),
      ],
    });
    render(<GenerationJobList {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'conversation.creativeStudio.jobs.retry' }));

    expect(props.onRetryJob).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveTextContent('conversation.creativeStudio.jobs.retryConfirmationBody');
  });

  it('retries the confirmed ordinary provider failure exactly once with the right job id', () => {
    const onRetryJob = vi.fn().mockResolvedValue(true);
    const props = createProps({
      jobs: [
        job({
          id: 'job-provider-failure',
          status: 'failed',
          error: {
            code: 'provider_unavailable',
            messageKey: 'conversation.creativeStudio.jobs.errors.providerUnavailable',
          },
        }),
      ],
      onRetryJob,
    });
    render(<GenerationJobList {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'conversation.creativeStudio.jobs.retry' }));
    fireEvent.click(screen.getByRole('button', { name: 'conversation.creativeStudio.jobs.retryConfirmationConfirm' }));

    expect(onRetryJob).toHaveBeenCalledExactlyOnceWith('job-provider-failure');
  });

  it('leaves the ordinary provider failure untouched when retry is cancelled', async () => {
    const props = createProps({
      jobs: [
        job({
          id: 'job-provider-failure',
          status: 'failed',
          error: {
            code: 'provider_unavailable',
            messageKey: 'conversation.creativeStudio.jobs.errors.providerUnavailable',
          },
        }),
      ],
    });
    render(<GenerationJobList {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'conversation.creativeStudio.jobs.retry' }));
    fireEvent.click(screen.getByRole('button', { name: 'conversation.creativeStudio.review.cancel' }));

    expect(props.onRetryJob).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('renders Cancel only when main supplies canCancel', () => {
    const props = createProps({
      jobs: [job({ id: 'job-not-cancellable', canCancel: false }), job({ id: 'job-cancellable', canCancel: true })],
    });
    render(<GenerationJobList {...props} />);

    expect(
      within(screen.getByRole('listitem', { name: 'job-not-cancellable' })).queryByRole('button', {
        name: 'conversation.creativeStudio.jobs.cancel',
      })
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(screen.getByRole('listitem', { name: 'job-cancellable' })).getByRole('button', {
        name: 'conversation.creativeStudio.jobs.cancel',
      })
    );
    expect(props.onCancelJob).toHaveBeenCalledExactlyOnceWith('job-cancellable');
  });

  it('shows download recovery only when main authorizes it', () => {
    const props = createProps({
      jobs: [
        job({
          id: 'job-download-disabled',
          status: 'failed',
          canRetryDownload: false,
          error: {
            code: 'download_failed',
            messageKey: 'conversation.creativeStudio.jobs.errors.downloadFailed',
          },
        }),
        job({
          id: 'job-download-enabled',
          status: 'failed',
          canRetryDownload: true,
          error: {
            code: 'download_failed',
            messageKey: 'conversation.creativeStudio.jobs.errors.downloadFailed',
          },
        }),
      ],
    });
    render(<GenerationJobList {...props} />);

    expect(
      within(screen.getByRole('listitem', { name: 'job-download-disabled' })).queryByRole('button', {
        name: 'conversation.creativeStudio.jobs.retryDownload',
      })
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(screen.getByRole('listitem', { name: 'job-download-enabled' })).getByRole('button', {
        name: 'conversation.creativeStudio.jobs.retryDownload',
      })
    );
    expect(props.onRetryDownload).toHaveBeenCalledExactlyOnceWith('job-download-enabled');
  });

  it('routes an unknown submission through acknowledgement instead of direct retry', () => {
    const props = createProps({
      jobs: [
        job({
          id: 'job-unknown',
          status: 'needs_attention',
          error: {
            code: 'submission_unknown',
            messageKey: 'conversation.creativeStudio.jobs.errors.submissionUnknown',
          },
        }),
      ],
    });
    render(<GenerationJobList {...props} />);

    fireEvent.click(
      within(screen.getByRole('listitem', { name: 'job-unknown' })).getByRole('button', {
        name: 'conversation.creativeStudio.jobs.retry',
      })
    );

    expect(props.onReviewUnknownSubmission).toHaveBeenCalledExactlyOnceWith('job-unknown');
    expect(props.onRetryJob).not.toHaveBeenCalled();
  });

  it('disables recoveries that can create provider work while editing is blocked', () => {
    const props = createProps({
      disabled: true,
      jobs: [
        job({
          id: 'job-retry',
          status: 'failed',
          error: {
            code: 'auth',
            messageKey: 'conversation.creativeStudio.jobs.errors.auth',
          },
        }),
        job({
          id: 'job-unknown',
          sceneId: 'scene-2',
          status: 'needs_attention',
          error: {
            code: 'submission_unknown',
            messageKey: 'conversation.creativeStudio.jobs.errors.submissionUnknown',
          },
        }),
      ],
    });
    render(<GenerationJobList {...props} />);

    const retry = within(screen.getByRole('listitem', { name: 'job-retry' })).getByRole('button', {
      name: 'conversation.creativeStudio.jobs.retry',
    });
    const acknowledge = within(screen.getByRole('listitem', { name: 'job-unknown' })).getByRole('button', {
      name: 'conversation.creativeStudio.jobs.retry',
    });
    expect(retry).toBeDisabled();
    expect(acknowledge).toBeDisabled();
    fireEvent.click(retry);
    fireEvent.click(acknowledge);
    expect(props.onRetryJob).not.toHaveBeenCalled();
    expect(props.onReviewUnknownSubmission).not.toHaveBeenCalled();
  });

  it('keeps poll-deadline recovery unavailable', () => {
    render(
      <GenerationJobList
        {...createProps({
          jobs: [
            job({
              id: 'job-poll-deadline',
              status: 'needs_attention',
              error: {
                code: 'poll_deadline',
                messageKey: 'conversation.creativeStudio.jobs.errors.pollDeadline',
              },
            }),
          ],
        })}
      />
    );

    expect(
      within(screen.getByRole('listitem', { name: 'job-poll-deadline' })).queryByRole('button', {
        name: 'conversation.creativeStudio.jobs.retry',
      })
    ).not.toBeInTheDocument();
  });

  it('shows typed action failures without exposing raw provider detail', () => {
    render(
      <GenerationJobList
        {...createProps({
          jobs: [
            job({
              id: 'job-cancel',
              canCancel: true,
              status: 'failed',
              error: {
                code: 'auth',
                messageKey: 'conversation.creativeStudio.jobs.errors.auth',
                rawMessage: 'secret provider response',
              } as StudioRendererJob['error'],
            }),
          ],
          actionIssue: {
            jobId: 'job-cancel',
            code: 'cancellation_refused',
            messageKey: 'conversation.creativeStudio.errors.cancellationRefused',
          },
        })}
      />
    );

    expect(screen.getByText('conversation.creativeStudio.errors.cancellationRefused')).toBeVisible();
    expect(screen.queryByText('secret provider response')).not.toBeInTheDocument();
    expect(screen.queryByText(/provider task/i)).not.toBeInTheDocument();
  });
});
