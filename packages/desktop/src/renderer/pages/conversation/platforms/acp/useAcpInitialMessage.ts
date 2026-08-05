/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chat/chatLib';
import { PRESENTATION_RUN_DIRECTIVE_PREFIX } from '@/common/config/constants';
import type { TConversationRuntimeSummary } from '@/common/config/storage';
import type {
  GetPresentationSourceOwnerResult,
  PresentationGrantOwner,
  PresentationSourceRef,
} from '@/common/types/office/presentationRun';
import type {
  PresentationSubmissionProgress,
  PresentationSubmissionSnapshot,
} from '@/common/types/platform/presentationSubmission';
import { parseError, uuid } from '@/common/utils';
import { resolveManagedPresentationInitialSend } from '@/renderer/components/chat/TemplateGallery/usePresentationTemplates';
import { emitter } from '@/renderer/utils/emitter';
import { buildDisplayMessage } from '@/renderer/utils/file/messageFiles';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getConversationRuntimeWorkspaceErrorMessage } from '../../utils/conversationCreateError';
import type { ConversationRuntimeSendFailure } from '../../runtime/conversationRuntimeViewStore';
import { classifyConversationBusyError } from '../conversationBusyError';
import { buildSendFailureError } from './buildSendFailureError';

type UseAcpInitialMessageParams = {
  conversation_id: string;
  backend: string;
  workspacePath?: string;
  setAiProcessing: (value: boolean) => void;
  resetState: () => void;
  markSendStarted?: () => void;
  markSendAccepted?: (turn_id: string, runtime: TConversationRuntimeSummary, msg_id?: string) => void;
  markSendFailed?: (failure: ConversationRuntimeSendFailure) => void;
  checkAndUpdateTitle: (conversation_id: string, input: string) => void;
  addOrUpdateMessage: (message: TMessage, prepend?: boolean) => void;
  managedPresentationEnabled?: boolean;
  hydratePresentationSources?: () => Promise<GetPresentationSourceOwnerResult>;
  enqueueManagedPresentation?: (
    snapshot: PresentationSubmissionSnapshot,
    sourceOwner: PresentationGrantOwner | null,
    expectedOwnerRevision: number | null
  ) => Promise<PresentationSubmissionProgress>;
};

const toPresentationSourceRefs = (grants: readonly { grantId: string; byteLength: number; sha256: string }[]) =>
  grants.map<PresentationSourceRef>((grant) => ({
    grantId: grant.grantId,
    expectedByteLength: grant.byteLength,
    expectedSha256: grant.sha256,
  }));

/**
 * Side-effect-only hook that checks sessionStorage for an initial message
 * and sends it when the ACP conversation first mounts.
 */
export const useAcpInitialMessage = ({
  conversation_id,
  backend,
  workspacePath,
  setAiProcessing,
  resetState,
  markSendStarted,
  markSendAccepted,
  markSendFailed,
  checkAndUpdateTitle,
  addOrUpdateMessage,
  managedPresentationEnabled = false,
  hydratePresentationSources,
  enqueueManagedPresentation,
}: UseAcpInitialMessageParams): void => {
  const { t } = useTranslation();
  const managedAttemptedRecordRef = useRef<string | null>(null);

  useEffect(() => {
    const storageKey = `acp_initial_message_${conversation_id}`;
    const storedMessage = sessionStorage.getItem(storageKey);

    if (!storedMessage) return;

    if (managedPresentationEnabled) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(storedMessage) as unknown;
      } catch {
        return;
      }
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const candidate = parsed as Record<string, unknown>;
        const input = candidate.input;
        const files = candidate.files;
        if (typeof input === 'string' && input.startsWith(PRESENTATION_RUN_DIRECTIVE_PREFIX)) {
          if (!Array.isArray(files) || !files.every((file) => typeof file === 'string')) return;
          const managed = resolveManagedPresentationInitialSend(input, files, 'acp');
          if (
            managed === null ||
            hydratePresentationSources === undefined ||
            enqueueManagedPresentation === undefined
          ) {
            return;
          }
          const queueItemId = typeof candidate.queueItemId === 'string' ? candidate.queueItemId : crypto.randomUUID();
          const clientRequestId =
            typeof candidate.clientRequestId === 'string' ? candidate.clientRequestId : crypto.randomUUID();
          const stableRecord = JSON.stringify({ ...candidate, queueItemId, clientRequestId });
          if (stableRecord !== storedMessage) sessionStorage.setItem(storageKey, stableRecord);
          if (managedAttemptedRecordRef.current === stableRecord) return;
          managedAttemptedRecordRef.current = stableRecord;

          const queueManagedInitialMessage = async (): Promise<void> => {
            try {
              const sourceState = await hydratePresentationSources();
              if (!sourceState.ok) return;
              const sources = toPresentationSourceRefs(sourceState.grants);
              const snapshot: PresentationSubmissionSnapshot = Object.freeze({
                queueItemId,
                clientRequestId,
                input: managed.input,
                selectedTemplateId: managed.selectedTemplateId,
                sources: Object.freeze(sources.map((source) => Object.freeze(source))),
                capturedAt: new Date().toISOString(),
              });
              await enqueueManagedPresentation(
                snapshot,
                sources.length > 0 ? sourceState.owner : null,
                sources.length > 0 ? sourceState.ownerRevision : null
              );
              sessionStorage.removeItem(storageKey);
            } catch (error) {
              console.error('[useAcpInitialMessage] Managed initial handoff remains pending:', error);
            }
          };

          void queueManagedInitialMessage();
          return;
        }
      }
    }

    // Clear immediately to prevent duplicate sends (e.g., if component remounts while sendMessage is pending)
    sessionStorage.removeItem(storageKey);

    const sendInitialMessage = async () => {
      try {
        const initialMessage = JSON.parse(storedMessage);
        const input = typeof initialMessage.input === 'string' ? initialMessage.input : '';
        const files = Array.isArray(initialMessage.files) ? initialMessage.files : [];
        const displayMessage = buildDisplayMessage(input, files, workspacePath || '');

        markSendStarted?.();
        setAiProcessing(true);

        void checkAndUpdateTitle(conversation_id, input);
        const result = await ipcBridge.acpConversation.sendMessage.invoke({
          input: displayMessage,
          conversation_id: conversation_id,
          files,
        });
        markSendAccepted?.(result.turn_id, result.runtime, result.msg_id);

        // Initial message sent successfully
        emitter.emit('chat.history.refresh');
      } catch (error) {
        const errorMessageText =
          getConversationRuntimeWorkspaceErrorMessage(error, t) || parseError(error) || t('common.unknownError');
        const busyError = classifyConversationBusyError(error);
        if (busyError) {
          markSendFailed?.({
            kind: 'busy_conflict',
            reason: errorMessageText,
            busyKind: busyError.kind,
            status: busyError.status,
            code: busyError.code,
          });
          console.info('[useAcpInitialMessage] Initial send hit conversation busy state:', {
            conversation_id,
            busyKind: busyError.kind,
            status: busyError.status,
            code: busyError.code,
          });
          return;
        }

        markSendFailed?.({ kind: 'ordinary', reason: errorMessageText });
        console.error('[useAcpInitialMessage] Error sending initial message:', error);
        console.error('[useAcpInitialMessage] Error details:', {
          name: (error as Error)?.name,
          message: errorMessageText,
          conversation_id,
        });

        const errorMessage: TMessage = {
          id: uuid(),
          msg_id: uuid(),
          conversation_id: conversation_id,
          type: 'tips',
          position: 'center',
          content: {
            content: errorMessageText,
            type: 'error',
            error: buildSendFailureError(error, errorMessageText),
          },
          created_at: Date.now() + 2,
        };
        addOrUpdateMessage(errorMessage, true);
        resetState();
        setAiProcessing(false); // Keep the prop-setter in sync with the hook reset
      }
    };

    sendInitialMessage().catch((error) => {
      console.error('Failed to send initial message:', error);
    });
  }, [
    addOrUpdateMessage,
    backend,
    checkAndUpdateTitle,
    conversation_id,
    markSendAccepted,
    markSendFailed,
    markSendStarted,
    managedPresentationEnabled,
    hydratePresentationSources,
    enqueueManagedPresentation,
    resetState,
    setAiProcessing,
    t,
    workspacePath,
  ]);
};
