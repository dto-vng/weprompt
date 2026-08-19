/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import useSWR, { mutate } from 'swr';
import { Button, Tag } from '@arco-design/web-react';
import { AddOne, CheckOne } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import type {
  PresentationTemplateCandidateDescription,
  PresentationTemplateCandidateFailureCode,
} from '@/common/types/office/presentationTemplate';
import { useTemplateLabels } from './usePresentationTemplates';

const FAILURE_KEYS: Record<PresentationTemplateCandidateFailureCode, string> = {
  INVALID_REQUEST: 'messages.templateReview.failure.INVALID_REQUEST',
  RUN_NOT_FOUND: 'messages.templateReview.failure.RUN_NOT_FOUND',
  RUN_FORBIDDEN: 'messages.templateReview.failure.RUN_FORBIDDEN',
  SCOPE_UNAVAILABLE: 'messages.templateReview.failure.SCOPE_UNAVAILABLE',
  TEAM_SCOPE_UNSUPPORTED: 'messages.templateReview.failure.TEAM_SCOPE_UNSUPPORTED',
  CANDIDATE_OUTSIDE_WORKSPACE: 'messages.templateReview.failure.CANDIDATE_OUTSIDE_WORKSPACE',
  CANDIDATE_UNSUPPORTED: 'messages.templateReview.failure.CANDIDATE_UNSUPPORTED',
  CANDIDATE_TOO_LARGE: 'messages.templateReview.failure.CANDIDATE_TOO_LARGE',
  CANDIDATE_CHANGED: 'messages.templateReview.failure.CANDIDATE_CHANGED',
  CONFIRMATION_NOT_MINTED: 'messages.templateReview.failure.CONFIRMATION_NOT_MINTED',
  INSTALL_FAILED: 'messages.templateReview.failure.INSTALL_FAILED',
};

type ReviewState =
  | { status: 'loading' }
  | { status: 'ready'; candidate: PresentationTemplateCandidateDescription }
  | { status: 'installing'; candidate: PresentationTemplateCandidateDescription }
  | { status: 'installed'; candidate: PresentationTemplateCandidateDescription }
  | { status: 'failed'; code?: PresentationTemplateCandidateFailureCode };

export const TemplateReviewCard: React.FC<{ conversationId: string; filePath: string }> = ({
  conversationId,
  filePath,
}) => {
  const { t } = useTranslation();
  const [state, setState] = useState<ReviewState>({ status: 'loading' });
  const requestEpochRef = useRef(0);
  const confirmInFlightRef = useRef(false);

  useEffect(() => {
    const epoch = requestEpochRef.current + 1;
    requestEpochRef.current = epoch;
    confirmInFlightRef.current = false;
    setState({ status: 'loading' });

    void ipcBridge.presentationTemplates.describeSpec
      .invoke({ conversation_id: conversationId, file_path: filePath })
      .then((result) => {
        if (requestEpochRef.current !== epoch) return;
        if (result.ok) setState({ status: 'ready', candidate: result.candidate });
        else if ('code' in result) setState({ status: 'failed', code: result.code });
      })
      .catch(() => {
        if (requestEpochRef.current === epoch) setState({ status: 'failed' });
      });

    return () => {
      if (requestEpochRef.current === epoch) requestEpochRef.current += 1;
    };
  }, [conversationId, filePath]);

  const confirm = async () => {
    if (state.status !== 'ready' || confirmInFlightRef.current) return;
    confirmInFlightRef.current = true;
    const epoch = requestEpochRef.current;
    const describedCandidate = state.candidate;
    setState({ status: 'installing', candidate: describedCandidate });
    try {
      const result = await ipcBridge.presentationTemplates.importSpecBound.invoke({
        conversation_id: conversationId,
        file_path: filePath,
        expected_sha256: describedCandidate.sha256,
      });
      if (requestEpochRef.current !== epoch) return;
      if (result.ok) {
        setState({ status: 'installed', candidate: describedCandidate });
        void mutate('presentation-templates').catch((): void => undefined);
      } else if ('code' in result) {
        setState({ status: 'failed', code: result.code });
      }
    } catch {
      if (requestEpochRef.current === epoch) setState({ status: 'failed' });
    } finally {
      if (requestEpochRef.current === epoch) confirmInFlightRef.current = false;
    }
  };

  if (state.status === 'loading') {
    return (
      <div
        data-testid='template-review-card'
        className='w-full max-w-420px p-12px rd-8px b b-solid b-border-2 bg-fill-1 mb-8px text-13px text-t-secondary'
      >
        {t('messages.templateReview.reviewing')}
      </div>
    );
  }

  if (state.status === 'failed') {
    return (
      <div
        data-testid='template-review-card'
        className='w-full max-w-420px p-12px rd-8px b b-solid b-border-2 bg-fill-1 mb-8px text-13px text-danger-6'
      >
        {state.code ? t(FAILURE_KEYS[state.code]) : t('messages.templateReview.requestFailed')}
      </div>
    );
  }

  const { candidate } = state;
  return (
    <div
      data-testid='template-review-card'
      className='w-full max-w-420px p-12px rd-8px b b-solid b-border-2 bg-fill-1 mb-8px'
    >
      <div className='flex gap-12px items-start'>
        <img
          src={candidate.preview_data_url}
          alt={candidate.name}
          className='w-128px h-80px object-cover rd-6px shrink-0 b b-solid b-border-2'
        />
        <div className='flex flex-col gap-6px min-w-0 flex-1'>
          <span className='font-medium text-t-primary break-words'>{candidate.name}</span>
          <span className='text-12px text-t-secondary'>{t('messages.templateReview.disclosure')}</span>
          {state.status === 'installed' ? (
            <div className='flex items-center gap-4px text-13px text-success-6'>
              <CheckOne theme='outline' size='16' />
              <span>{t('messages.templateReview.installed')}</span>
            </div>
          ) : (
            <Button
              type='primary'
              size='small'
              // C-10: `flex items-center gap-8px` is load-bearing, not decoration. Arco's
              // button computes display:block with text-align:center, so an `icon` prop sits
              // flush against the label and `gap` alone does nothing. Same mechanism proved
              // on the sider footer (C-08), where the identical markup rendered the glyph
              // touching the text.
              className='w-fit flex items-center gap-8px'
              loading={state.status === 'installing'}
              disabled={state.status === 'installing'}
              onClick={() => void confirm()}
              icon={<AddOne theme='outline' size='16' />}
            >
              {state.status === 'installing'
                ? t('messages.templateReview.installing')
                : t('messages.templateReview.confirm')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

/** kebab-case template id → display name for templates no longer installed. */
const idToName = (id: string): string =>
  id
    .split('-')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');

/**
 * Thumbnail card rendered on a templated user message in place of the raw
 * directive text. Resolves the preview from the shared template list; when the
 * template was removed since sending, degrades to an id-derived name card.
 */
const TemplateMessageCard: React.FC<{ templateId: string }> = ({ templateId }) => {
  const { data: templates } = useSWR('presentation-templates', () => ipcBridge.presentationTemplates.list.invoke());
  const template = templates?.find((item) => item.manifest.id === templateId);
  const labelsOf = useTemplateLabels();

  return (
    <div
      data-testid='template-message-card'
      className='inline-flex items-center gap-8px p-4px pr-10px rd-8px b b-solid b-1 bg-fill-1 mb-6px max-w-280px'
    >
      {template ? (
        <>
          <img src={template.previewDataUrl} alt='' className='w-84px h-52px object-cover rd-6px shrink-0' />
          <div className='flex flex-col gap-2px min-w-0'>
            <span className='text-12px font-medium truncate'>{labelsOf(template).name}</span>
            <Tag size='small' className='w-fit'>
              {template.manifest.format.toUpperCase()}
            </Tag>
          </div>
        </>
      ) : (
        <span className='text-12px font-medium truncate'>{idToName(templateId)}</span>
      )}
    </div>
  );
};

export default TemplateMessageCard;
