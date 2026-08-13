/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import {
  isIdpBuiltinServer,
  isImageGenBuiltinServer,
  isVisionBuiltinServer,
  mergeCommodityMcpServerIds,
} from '@/common/config/builtinCapabilities';
import type { IMcpServer, ISessionMcpServer, TProviderWithModel } from '@/common/config/storage';
import type {
  BindPresentationDraftResult,
  GetPresentationSourceOwnerResult,
  PresentationGrantOwner,
  PresentationRunFailure,
  PresentationRunPublicDto,
  PresentationSourceRef,
  StartPresentationRunResult,
} from '@/common/types/office/presentationRun';
import type { PresentationCommandQueueItem } from '@/common/types/platform/presentationCommandQueue';
import { toSessionMcpServer } from '@/renderer/hooks/mcp/catalog';
import {
  createPresentationCommandQueueController,
  type PresentationCommandQueueController,
} from '@/renderer/pages/conversation/platforms/useConversationCommandQueue';
import { emitter } from '@/renderer/utils/emitter';
import { updateWorkspaceTime } from '@/renderer/utils/workspace/workspaceHistory';
import { Message } from '@arco-design/web-react';
import { useCallback, useRef, useState } from 'react';
import { type TFunction } from 'i18next';
import type { NavigateFunction } from 'react-router-dom';
import { mutate as swrMutate } from 'swr';
import { getConversationCreateErrorMessage } from '@/renderer/pages/conversation/utils/conversationCreateError';
import { findProjectById } from '@/renderer/pages/conversation/projects/projectStorage';
import type { AcpModelInfo } from '../types';
import { resolveInjectedContext } from './resolveInjectedContext';

const GUID_PRESENTATION_PENDING_STORAGE_KEY = 'guid_presentation_submission_v2';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/i;

type GuidManagedPresentationAttempt = {
  version: 2;
  conversationId: string;
  queueItemId: string;
  clientRequestId: string;
  draftClientRequestId: string;
  input: string;
  selectedTemplateId: string;
  sources: PresentationSourceRef[];
  runtime: 'aionrs' | 'acp';
  capturedAt: string;
};

export type GuidManagedPresentationRecovery = Pick<
  GuidManagedPresentationAttempt,
  'conversationId' | 'draftClientRequestId' | 'input' | 'selectedTemplateId' | 'sources' | 'runtime'
>;

export type GuidManagedPresentationDeps = {
  selectedTemplateId: string;
  draftClientRequestId: string;
  sourceRefs: readonly PresentationSourceRef[];
  conversationId?: string;
  prepareSourceOwner: (
    recoveryConversationId?: string
  ) => Promise<GetPresentationSourceOwnerResult | PresentationRunFailure>;
  bindDraft: (conversationId: string) => Promise<BindPresentationDraftResult | null>;
  onHandoffAccepted?: () => void;
};

const copySourceRefs = (sources: readonly PresentationSourceRef[]): PresentationSourceRef[] =>
  sources.map((source) => ({
    grantId: source.grantId,
    expectedByteLength: source.expectedByteLength,
    expectedSha256: source.expectedSha256,
  }));

const sameSourceRefs = (left: readonly PresentationSourceRef[], right: readonly PresentationSourceRef[]): boolean =>
  left.length === right.length &&
  left.every(
    (source, index) =>
      source.grantId === right[index]?.grantId &&
      source.expectedByteLength === right[index]?.expectedByteLength &&
      source.expectedSha256 === right[index]?.expectedSha256
  );

const sourceRefsFromOwner = (
  result: Extract<GetPresentationSourceOwnerResult, { ok: true }>
): PresentationSourceRef[] =>
  result.grants.map((grant) => ({
    grantId: grant.grantId,
    expectedByteLength: grant.byteLength,
    expectedSha256: grant.sha256,
  }));

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value).toSorted();
  const expected = keys.toSorted();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

const decodePendingSourceRef = (value: unknown): PresentationSourceRef | null => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (!hasExactKeys(candidate, ['grantId', 'expectedByteLength', 'expectedSha256'])) return null;
  if (
    typeof candidate.grantId !== 'string' ||
    !UUID_RE.test(candidate.grantId) ||
    typeof candidate.expectedByteLength !== 'number' ||
    !Number.isSafeInteger(candidate.expectedByteLength) ||
    candidate.expectedByteLength < 0 ||
    typeof candidate.expectedSha256 !== 'string' ||
    !SHA256_RE.test(candidate.expectedSha256)
  ) {
    return null;
  }
  return {
    grantId: candidate.grantId,
    expectedByteLength: candidate.expectedByteLength,
    expectedSha256: candidate.expectedSha256,
  };
};

const decodeGuidManagedAttempt = (raw: string): GuidManagedPresentationAttempt | null => {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    !hasExactKeys(candidate, [
      'version',
      'conversationId',
      'queueItemId',
      'clientRequestId',
      'draftClientRequestId',
      'input',
      'selectedTemplateId',
      'sources',
      'runtime',
      'capturedAt',
    ]) ||
    candidate.version !== 2 ||
    typeof candidate.conversationId !== 'string' ||
    !UUID_RE.test(candidate.conversationId) ||
    typeof candidate.queueItemId !== 'string' ||
    !UUID_RE.test(candidate.queueItemId) ||
    typeof candidate.clientRequestId !== 'string' ||
    !UUID_RE.test(candidate.clientRequestId) ||
    typeof candidate.draftClientRequestId !== 'string' ||
    !UUID_RE.test(candidate.draftClientRequestId) ||
    typeof candidate.input !== 'string' ||
    typeof candidate.selectedTemplateId !== 'string' ||
    candidate.selectedTemplateId.length === 0 ||
    (candidate.runtime !== 'aionrs' && candidate.runtime !== 'acp') ||
    typeof candidate.capturedAt !== 'string' ||
    !Number.isFinite(Date.parse(candidate.capturedAt)) ||
    !Array.isArray(candidate.sources)
  ) {
    return null;
  }
  const sources = candidate.sources.map(decodePendingSourceRef);
  if (sources.some((source) => source === null)) return null;
  return {
    version: 2,
    conversationId: candidate.conversationId,
    queueItemId: candidate.queueItemId,
    clientRequestId: candidate.clientRequestId,
    draftClientRequestId: candidate.draftClientRequestId,
    input: candidate.input,
    selectedTemplateId: candidate.selectedTemplateId,
    sources: sources as PresentationSourceRef[],
    runtime: candidate.runtime,
    capturedAt: candidate.capturedAt,
  };
};

export const readGuidManagedPresentationRecovery = (): GuidManagedPresentationRecovery | null => {
  try {
    const raw = sessionStorage.getItem(GUID_PRESENTATION_PENDING_STORAGE_KEY);
    if (raw === null) return null;
    const attempt = decodeGuidManagedAttempt(raw);
    if (attempt === null) return null;
    return {
      conversationId: attempt.conversationId,
      draftClientRequestId: attempt.draftClientRequestId,
      input: attempt.input,
      selectedTemplateId: attempt.selectedTemplateId,
      sources: copySourceRefs(attempt.sources),
      runtime: attempt.runtime,
    };
  } catch {
    return null;
  }
};

const isExactPendingAttempt = (
  attempt: GuidManagedPresentationAttempt,
  input: string,
  runtime: 'aionrs' | 'acp',
  managed: GuidManagedPresentationDeps
): boolean =>
  attempt.input === input &&
  attempt.runtime === runtime &&
  attempt.selectedTemplateId === managed.selectedTemplateId &&
  attempt.draftClientRequestId === managed.draftClientRequestId &&
  (managed.conversationId === undefined || attempt.conversationId === managed.conversationId) &&
  sameSourceRefs(attempt.sources, managed.sourceRefs);

const getOrCreateGuidManagedAttempt = (
  input: string,
  runtime: 'aionrs' | 'acp',
  managed: GuidManagedPresentationDeps
): { attempt: GuidManagedPresentationAttempt; existing: boolean } => {
  const raw = sessionStorage.getItem(GUID_PRESENTATION_PENDING_STORAGE_KEY);
  if (raw !== null) {
    const existing = decodeGuidManagedAttempt(raw);
    if (existing === null) throw new Error('Managed Guid presentation pending snapshot is invalid');
    return { attempt: existing, existing: true };
  }
  const attempt: GuidManagedPresentationAttempt = {
    version: 2,
    conversationId: managed.conversationId ?? crypto.randomUUID(),
    queueItemId: crypto.randomUUID(),
    clientRequestId: crypto.randomUUID(),
    draftClientRequestId: managed.draftClientRequestId,
    input,
    selectedTemplateId: managed.selectedTemplateId,
    sources: copySourceRefs(managed.sourceRefs),
    runtime,
    capturedAt: new Date().toISOString(),
  };
  const serialized = JSON.stringify(attempt);
  sessionStorage.setItem(GUID_PRESENTATION_PENDING_STORAGE_KEY, serialized);
  if (sessionStorage.getItem(GUID_PRESENTATION_PENDING_STORAGE_KEY) !== serialized) {
    throw new Error('Managed Guid presentation pending snapshot was not durably accepted');
  }
  return { attempt, existing: false };
};

const clearGuidManagedAttempt = (attempt: GuidManagedPresentationAttempt): void => {
  const raw = sessionStorage.getItem(GUID_PRESENTATION_PENDING_STORAGE_KEY);
  if (raw === null) return;
  const current = decodeGuidManagedAttempt(raw);
  if (
    current?.conversationId !== attempt.conversationId ||
    current.queueItemId !== attempt.queueItemId ||
    current.clientRequestId !== attempt.clientRequestId
  ) {
    return;
  }
  sessionStorage.removeItem(GUID_PRESENTATION_PENDING_STORAGE_KEY);
};

const isExactQueueItem = (item: PresentationCommandQueueItem, attempt: GuidManagedPresentationAttempt): boolean =>
  item.queueItemId === attempt.queueItemId &&
  item.clientRequestId === attempt.clientRequestId &&
  item.input === attempt.input &&
  item.selectedTemplateId === attempt.selectedTemplateId &&
  sameSourceRefs(item.sources, attempt.sources);

const findExactQueueItem = (
  controller: PresentationCommandQueueController,
  attempt: GuidManagedPresentationAttempt
): PresentationCommandQueueItem | null => {
  const candidate = controller
    .read()
    .items.find((item) => item.queueItemId === attempt.queueItemId || item.clientRequestId === attempt.clientRequestId);
  if (candidate === undefined) return null;
  if (!isExactQueueItem(candidate, attempt)) {
    throw new Error('Managed Guid presentation queue identity collision');
  }
  return candidate;
};

type SafeGuidHandoffExecution = Extract<
  PresentationCommandQueueItem['execution'],
  { state: 'committed' | 'dispatching' | 'bound' | 'dispatch_uncertain' }
>;

type SafeGuidHandoffItem = PresentationCommandQueueItem & { execution: SafeGuidHandoffExecution };

const isSafeGuidHandoff = (item: PresentationCommandQueueItem): item is SafeGuidHandoffItem =>
  item.execution.state === 'committed' ||
  item.execution.state === 'dispatching' ||
  item.execution.state === 'bound' ||
  item.execution.state === 'dispatch_uncertain';

const AUTHORITATIVE_GUID_SUCCESSORS = {
  committed: [
    'committed',
    'dispatching',
    'bound',
    'terminal_verified',
    'retained',
    'failed_retained',
    'dispatch_uncertain',
    'discarded',
  ],
  dispatching: [
    'dispatching',
    'bound',
    'terminal_verified',
    'retained',
    'failed_retained',
    'dispatch_uncertain',
    'discarded',
  ],
  bound: ['bound', 'terminal_verified', 'retained', 'failed_retained', 'dispatch_uncertain', 'discarded'],
  dispatch_uncertain: ['dispatch_uncertain'],
} as const satisfies Record<SafeGuidHandoffExecution['state'], readonly PresentationRunPublicDto['dispatchStatus'][]>;

const isAuthoritativeGuidSuccessor = (execution: SafeGuidHandoffExecution, run: PresentationRunPublicDto): boolean => {
  const successors = AUTHORITATIVE_GUID_SUCCESSORS[
    execution.state
  ] as readonly PresentationRunPublicDto['dispatchStatus'][];
  if (!successors.includes(run.dispatchStatus)) return false;
  const localRevision = execution.revision;
  if (localRevision === null) return run.dispatchStatus === execution.state;
  return run.dispatchStatus === execution.state ? run.revision >= localRevision : run.revision > localRevision;
};

const proveAuthoritativeGuidHandoff = async (
  item: SafeGuidHandoffItem,
  attempt: GuidManagedPresentationAttempt
): Promise<boolean> => {
  try {
    const conversation = await ipcBridge.conversation.get.invoke({ id: attempt.conversationId });
    if (conversation?.id !== attempt.conversationId) return false;
    const lookup = await ipcBridge.presentationRuns.get.invoke({
      conversation_id: attempt.conversationId,
      client_request_id: attempt.clientRequestId,
    });
    if (!lookup.ok) return false;
    return (
      lookup.run.runId === item.execution.runId &&
      lookup.run.clientRequestId === attempt.clientRequestId &&
      lookup.run.conversationId === attempt.conversationId &&
      lookup.run.selectedTemplateId === attempt.selectedTemplateId &&
      isAuthoritativeGuidSuccessor(item.execution, lookup.run)
    );
  } catch {
    return false;
  }
};

const recoveredCommittedStart = (
  run: PresentationRunPublicDto,
  attempt: GuidManagedPresentationAttempt
): StartPresentationRunResult | null => {
  if (
    run.dispatchStatus !== 'committed' ||
    run.artifactPhase === 'none' ||
    run.conversationId !== attempt.conversationId ||
    run.clientRequestId !== attempt.clientRequestId ||
    run.selectedTemplateId !== attempt.selectedTemplateId
  ) {
    return null;
  }
  return {
    ok: true,
    run: {
      ...run,
      dispatchStatus: 'committed',
      artifactPhase: run.artifactPhase,
    },
  };
};

export type GuidSendDeps = {
  // Input state
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  files: string[];
  setFiles: React.Dispatch<React.SetStateAction<string[]>>;
  dir: string;
  setDir: React.Dispatch<React.SetStateAction<string>>;
  projectId?: string;
  setProjectId: React.Dispatch<React.SetStateAction<string | undefined>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  loading: boolean;

  // Assistant state
  selectedAssistantId: string | null;
  selectedAssistantBackend: string;
  selectedMode: string;
  selectedAcpModel: string | null;
  selectedThoughtLevelValue?: string;
  currentAcpCachedModelInfo: AcpModelInfo | null;
  current_model: TProviderWithModel | undefined;

  guidDisabledBuiltinSkills: string[] | undefined;
  guidEnabledSkills: string[] | undefined;
  assistantDefaultSkillIds?: string[];
  assistantDefaultDisabledBuiltinSkillIds?: string[];
  availableMcpServers: IMcpServer[];
  selectedMcpServerIds: string[] | undefined;
  assistantDefaultMcpIds?: string[];
  isGoogleAuth: boolean;

  // Mention state reset
  setMentionOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setMentionQuery: React.Dispatch<React.SetStateAction<string | null>>;
  setMentionSelectorOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setMentionActiveIndex: React.Dispatch<React.SetStateAction<number>>;

  // Presentation template (optional — landing-page gallery wiring)
  composePresentationSend?: (
    message: string,
    files: string[]
  ) => { input: string; files: string[]; injectSkills: string[] };
  onPresentationTemplateConsumed?: () => void;
  requiresPresentationSourceReselect?: boolean;
  onPresentationSourceReselectRequired?: () => void;
  managedPresentation?: GuidManagedPresentationDeps;

  // Navigation
  navigate: NavigateFunction;
  t: TFunction;
  localeKey: string;
};

export type GuidSendResult = {
  handleSend: () => Promise<void>;
  sendMessageHandler: () => void;
  isButtonDisabled: boolean;
  managedPresentationRecovery: GuidManagedPresentationRecovery | null;
  managedPresentationPending: boolean;
  retireManagedPresentationAttemptAfterSourceChange: (succeeded: boolean) => Promise<void>;
};

/**
 * Hook that manages the send logic for ACP and Aion CLI conversations.
 */
export const useGuidSend = (deps: GuidSendDeps): GuidSendResult => {
  const {
    input,
    setInput,
    files,
    setFiles,
    dir,
    setDir,
    projectId,
    setProjectId,
    setLoading,
    loading,
    selectedAssistantId,
    selectedAssistantBackend,
    selectedMode,
    selectedAcpModel,
    selectedThoughtLevelValue,
    currentAcpCachedModelInfo,
    current_model,
    guidDisabledBuiltinSkills,
    guidEnabledSkills,
    assistantDefaultSkillIds,
    assistantDefaultDisabledBuiltinSkillIds,
    availableMcpServers,
    selectedMcpServerIds,
    assistantDefaultMcpIds,
    composePresentationSend,
    onPresentationTemplateConsumed,
    requiresPresentationSourceReselect,
    onPresentationSourceReselectRequired,
    managedPresentation,
    setMentionOpen,
    setMentionQuery,
    setMentionSelectorOpen,
    setMentionActiveIndex,
    navigate,
    t,
    localeKey,
  } = deps;
  const sendingRef = useRef(false);
  const [managedPresentationRecovery] = useState(readGuidManagedPresentationRecovery);
  const [managedPresentationPending, setManagedPresentationPending] = useState(false);

  const handleSend = useCallback(async () => {
    if (!selectedAssistantId) {
      return;
    }

    const managedRuntime: 'aionrs' | 'acp' = selectedAssistantBackend === 'aionrs' ? 'aionrs' : 'acp';
    const managedAttemptState = managedPresentation
      ? getOrCreateGuidManagedAttempt(input, managedRuntime, managedPresentation)
      : null;
    const managedQueueController = managedAttemptState
      ? createPresentationCommandQueueController({ conversationId: managedAttemptState.attempt.conversationId })
      : null;
    if (managedAttemptState?.existing && managedQueueController) {
      const existingHandoff = findExactQueueItem(managedQueueController, managedAttemptState.attempt);
      if (existingHandoff !== null && isSafeGuidHandoff(existingHandoff)) {
        if (!(await proveAuthoritativeGuidHandoff(existingHandoff, managedAttemptState.attempt))) {
          throw new Error('Managed Guid presentation handoff is not confirmed by main');
        }
        await navigate(`/conversation/${managedAttemptState.attempt.conversationId}`);
        clearGuidManagedAttempt(managedAttemptState.attempt);
        managedPresentation?.onHandoffAccepted?.();
        return;
      }
      if (!isExactPendingAttempt(managedAttemptState.attempt, input, managedRuntime, managedPresentation)) {
        throw new Error('Managed Guid presentation attempt belongs to another submission');
      }
    }

    const preparedManagedSources = managedPresentation
      ? await managedPresentation.prepareSourceOwner(
          managedAttemptState?.existing ? managedAttemptState.attempt.conversationId : undefined
        )
      : null;
    if (preparedManagedSources && 'code' in preparedManagedSources) {
      throw new Error(preparedManagedSources.code);
    }
    if (preparedManagedSources?.ok && managedAttemptState) {
      const canonicalSources = sourceRefsFromOwner(preparedManagedSources);
      if (!sameSourceRefs(canonicalSources, managedAttemptState.attempt.sources)) {
        throw new Error('Managed Guid presentation source snapshot changed; reselect sources');
      }
      if (
        preparedManagedSources.owner.owner_type === 'conversation' &&
        preparedManagedSources.owner.conversation_id !== managedAttemptState.attempt.conversationId
      ) {
        throw new Error('Managed Guid presentation source owner does not match the pending conversation');
      }
    }

    const isCustomWorkspace = !!dir;
    const finalWorkspace = dir || '';

    // Fold a selected presentation template into the first message: directive
    // text wraps the user's prompt, and the template's THEME.md (+ reference
    // deck) rides along as attached files. The conversation title keeps the
    // raw user input.
    const composed =
      !managedPresentation && composePresentationSend
        ? composePresentationSend(input, files)
        : { input, files: managedPresentation ? [] : files, injectSkills: [] as string[] };

    const assistantConversationId = selectedAssistantId;
    const assistantBackend = selectedAssistantBackend;
    const enabled_skills_to_send = guidEnabledSkills ?? assistantDefaultSkillIds;
    const excludeBuiltinSkills = guidDisabledBuiltinSkills ?? assistantDefaultDisabledBuiltinSkillIds;
    const selectedAllMcpServerIds = selectedMcpServerIds ?? [];
    const selectedMcpServerIdSet = new Set(selectedAllMcpServerIds);
    const selectedUserMcpServerIds = availableMcpServers
      .filter((server) => selectedMcpServerIdSet.has(server.id) && server.builtin !== true)
      .map((server) => server.id);
    const selectedAllSessionMcpServers = availableMcpServers
      .filter((server) => selectedMcpServerIdSet.has(server.id))
      .map((server) => toSessionMcpServer(server));
    const selectedSessionMcpServers = availableMcpServers
      .filter((server) => selectedMcpServerIdSet.has(server.id) && server.builtin === true)
      .map((server) => toSessionMcpServer(server));
    const defaultSelectedMcpServerIds = mergeCommodityMcpServerIds(assistantDefaultMcpIds ?? [], availableMcpServers);
    const defaultSelectedUserMcpServerIds = availableMcpServers
      .filter((server) => (defaultSelectedMcpServerIds ?? []).includes(server.id) && server.builtin !== true)
      .map((server) => server.id);
    // Image generation, the IDP (GreenNode) server, and the vision (image-analysis)
    // server are globally-enabled capabilities (toggled in Settings > Tools), not
    // per-chat picks — and their built-in servers are hidden from the MCP picker.
    // Always attach the enabled hidden servers so the agent can invoke them without
    // the user selecting them per conversation.
    const imageGenServer = availableMcpServers.find(
      (server) => server.enabled === true && isImageGenBuiltinServer(server)
    );
    const idpServer = availableMcpServers.find((server) => server.enabled === true && isIdpBuiltinServer(server));
    const visionServer = availableMcpServers.find((server) => server.enabled === true && isVisionBuiltinServer(server));
    const hiddenAutoAttachServers = [imageGenServer, idpServer, visionServer].filter(
      (server): server is IMcpServer => !!server
    );

    const assistantOverrideMcpIdsBase =
      selectedMcpServerIds !== undefined ? selectedAllMcpServerIds : defaultSelectedMcpServerIds;
    const missingAutoAttachMcpIds = hiddenAutoAttachServers
      .filter((server) => !assistantOverrideMcpIdsBase.includes(server.id))
      .map((server) => server.id);
    const assistantOverrideMcpIds = [...assistantOverrideMcpIdsBase, ...missingAutoAttachMcpIds];
    const selectedUserMcpServerIdsToSend =
      selectedMcpServerIds !== undefined ? selectedUserMcpServerIds : defaultSelectedUserMcpServerIds;
    const selectedSessionMcpServersBase =
      selectedMcpServerIds !== undefined
        ? selectedAllSessionMcpServers
        : availableMcpServers
            .filter((server) => (defaultSelectedMcpServerIds ?? []).includes(server.id))
            .map((server) => toSessionMcpServer(server));
    const missingAutoAttachSessionServers = hiddenAutoAttachServers.filter(
      (server) => !selectedSessionMcpServersBase.some((existing) => existing.id === server.id)
    );
    const selectedSessionMcpServersToSend = [
      ...selectedSessionMcpServersBase,
      ...missingAutoAttachSessionServers.map((server) => toSessionMcpServer(server)),
    ];

    const assistantOverrideModel =
      selectedAcpModel || currentAcpCachedModelInfo?.current_model_id || current_model?.use_model || undefined;
    const assistantOverrides = {
      model: assistantOverrideModel,
      permission: selectedMode || undefined,
      thought_level: selectedThoughtLevelValue || undefined,
      skill_ids: enabled_skills_to_send,
      disabled_builtin_skill_ids: excludeBuiltinSkills,
      mcp_ids: assistantOverrideMcpIds,
    };

    // Global ("Chat") + project instructions, appended into the first-turn
    // preset context. Used by the backend only when the chat's assistant has
    // no rules of its own (general/default + project chats); a specialized
    // assistant's rules take precedence (out of scope — see design spec).
    const injectedContext = resolveInjectedContext(projectId);

    // Pick up anything dropped into the project's Knowledge Base folder since
    // the last sync. Deliberately NOT awaited: ingestion can take
    // seconds-to-minutes and blocking send on it is unacceptable. This chat
    // therefore uses whatever is already `ready` (the same frozen-at-creation
    // boundary as the MCP descriptor below); the sync benefits the next one.
    if (projectId) {
      const projectWorkspace = findProjectById(projectId)?.workspace;
      if (projectWorkspace) {
        void ipcBridge.projectKnowledge.syncFolder
          .invoke({ projectId, workspace: projectWorkspace })
          .catch((syncError: unknown) => console.error('Failed to sync knowledge folder on chat creation:', syncError));
      }
    }

    // Project knowledge base: attach the per-project search server as a pure
    // session MCP (full stdio transport, never a repo-registered row) so the
    // agent can retrieve from the project's curated documents. Only attaches
    // for project chats whose knowledge index has at least one ready source —
    // getSessionMcpServer returns null otherwise. A failure here must never
    // block sending, so it degrades to "no knowledge tool".
    const kbSessionServer = projectId
      ? await ipcBridge.projectKnowledge.getSessionMcpServer.invoke({ projectId }).catch((): null => null)
      : null;
    const withKbServer = (servers: ISessionMcpServer[]): ISessionMcpServer[] =>
      kbSessionServer && !servers.some((server) => server.name === kbSessionServer.name)
        ? [...servers, kbSessionServer]
        : servers;

    type ConversationCreateRequest = Parameters<typeof ipcBridge.conversation.create.invoke>[0];
    const createOrRecoverConversation = async (request: ConversationCreateRequest) => {
      if (!managedAttemptState) return ipcBridge.conversation.create.invoke(request);
      const expectedId = managedAttemptState.attempt.conversationId;
      const recover = async () => {
        try {
          const existing = await ipcBridge.conversation.get.invoke({ id: expectedId });
          return existing?.id === expectedId ? existing : null;
        } catch {
          return null;
        }
      };
      const sourceAlreadyBound =
        preparedManagedSources?.ok &&
        preparedManagedSources.owner.owner_type === 'conversation' &&
        preparedManagedSources.owner.conversation_id === expectedId;
      if (managedAttemptState.existing || sourceAlreadyBound) {
        const existing = await recover();
        if (existing) return existing;
      }
      try {
        const created = await ipcBridge.conversation.create.invoke({ ...request, id: expectedId });
        if (created?.id !== expectedId) {
          throw new Error('Managed Guid conversation creation returned a different identity');
        }
        return created;
      } catch (error) {
        const recovered = await recover();
        if (recovered) return recovered;
        throw error;
      }
    };

    const runManagedHandoff = async (conversationId: string): Promise<void> => {
      if (!managedPresentation || !managedAttemptState || !managedQueueController || !preparedManagedSources?.ok) {
        return;
      }
      const { attempt } = managedAttemptState;
      let conversationOwnerRevision: number | null = null;
      if (preparedManagedSources.owner.owner_type === 'draft') {
        let bound: BindPresentationDraftResult | null;
        try {
          bound = await managedPresentation.bindDraft(conversationId);
        } catch (error) {
          const reconciled = await managedPresentation.prepareSourceOwner(conversationId);
          if (
            !reconciled.ok ||
            reconciled.owner.owner_type !== 'conversation' ||
            reconciled.owner.conversation_id !== conversationId ||
            reconciled.ownerRevision <= 0 ||
            !sameSourceRefs(sourceRefsFromOwner(reconciled), attempt.sources)
          ) {
            throw error;
          }
          conversationOwnerRevision = reconciled.ownerRevision;
          bound = null;
        }
        if (bound === null && conversationOwnerRevision === null) {
          throw new Error('Managed Guid draft binding returned no authoritative result');
        }
        if (bound !== null) {
          if ('code' in bound) throw new Error(bound.code);
          if (bound.conversationId !== conversationId || bound.draftId !== preparedManagedSources.owner.draft_id) {
            throw new Error('Managed Guid draft binding returned a conflicting identity');
          }
          conversationOwnerRevision = bound.revision;
        }
      } else {
        if (preparedManagedSources.owner.conversation_id !== conversationId) {
          throw new Error('Managed Guid draft is bound to a different conversation');
        }
        if (preparedManagedSources.ownerRevision <= 0) {
          throw new Error('Managed Guid draft binding is not confirmed by main');
        }
        conversationOwnerRevision = preparedManagedSources.ownerRevision;
      }
      if (conversationOwnerRevision === null) {
        throw new Error('Managed Guid draft binding is not confirmed by main');
      }

      let item = findExactQueueItem(managedQueueController, attempt);
      if (item === null) {
        const sourceOwner: PresentationGrantOwner | null =
          attempt.sources.length > 0 ? { owner_type: 'conversation', conversation_id: conversationId } : null;
        item = await managedQueueController.enqueue({
          queueItemId: attempt.queueItemId,
          clientRequestId: attempt.clientRequestId,
          input: attempt.input,
          selectedTemplateId: attempt.selectedTemplateId,
          sources: copySourceRefs(attempt.sources),
          sourceOwner,
          expectedOwnerRevision: attempt.sources.length > 0 ? conversationOwnerRevision : null,
        });
      }
      if (item.execution.state === 'persisting') {
        await managedQueueController.recoverPersisting();
        item = findExactQueueItem(managedQueueController, attempt);
        if (item === null) throw new Error('Managed Guid presentation queue recovery lost its pending item');
      }
      if (item.execution.state === 'queued') {
        item = await managedQueueController.claimHead(attempt.queueItemId);
      }
      if (item.execution.state === 'claimed') {
        item = await managedQueueController.allocateClaimed(attempt.queueItemId, async (request) => {
          try {
            return await ipcBridge.presentationRuns.start.invoke(request);
          } catch (error) {
            const lookup = await ipcBridge.presentationRuns.get.invoke({
              conversation_id: attempt.conversationId,
              client_request_id: attempt.clientRequestId,
            });
            if (lookup.ok) {
              const recovered = recoveredCommittedStart(lookup.run, attempt);
              if (recovered !== null) return recovered;
            }
            throw error;
          }
        });
      }
      if (!isSafeGuidHandoff(item)) {
        throw new Error(`Managed Guid presentation handoff stopped in ${item.execution.state}`);
      }
    };

    if (assistantBackend === 'aionrs') {
      if (!current_model) {
        Message.warning(t('conversation.noModelConfigured'));
        if (managedPresentation) throw new Error('Managed Guid presentation requires a configured model');
        return;
      }
      try {
        const conversation = await createOrRecoverConversation({
          name: input,
          model: current_model,
          assistant: {
            id: assistantConversationId,
            locale: localeKey,
            conversation_overrides: assistantOverrides,
          },
          extra: {
            project_id: projectId,
            ...(injectedContext ? { preset_rules: injectedContext } : {}),
            default_files: composed.files,
            workspace: finalWorkspace,
            custom_workspace: isCustomWorkspace,
            selected_mcp_server_ids: selectedUserMcpServerIdsToSend,
            selected_session_mcp_servers: withKbServer(selectedSessionMcpServersToSend),
          },
        });

        if (!conversation || !conversation.id) {
          Message.error(t('conversation.createFailed'));
          if (managedPresentation) throw new Error('Managed Guid conversation creation was not durable');
          return;
        }

        await runManagedHandoff(conversation.id);

        if (isCustomWorkspace) {
          updateWorkspaceTime(finalWorkspace);
        }

        if (assistantConversationId) {
          await Promise.all([
            swrMutate(`guid.assistant.detail.${assistantConversationId}.${localeKey}`),
            swrMutate('assistants.list'),
          ]);
        }

        emitter.emit('chat.history.refresh');

        if (managedAttemptState) {
          await navigate(`/conversation/${conversation.id}`);
          clearGuidManagedAttempt(managedAttemptState.attempt);
          managedPresentation?.onHandoffAccepted?.();
          return;
        }

        const initialMessage = {
          input: composed.input,
          files: composed.files.length > 0 ? composed.files : undefined,
          injectSkills: composed.injectSkills.length > 0 ? composed.injectSkills : undefined,
        };
        sessionStorage.setItem(`aionrs_initial_message_${conversation.id}`, JSON.stringify(initialMessage));

        await navigate(`/conversation/${conversation.id}`);
      } catch (error: unknown) {
        console.error('Failed to create Aion CLI conversation:', error);
        throw error;
      }
      return;
    }

    try {
      const conversation = await createOrRecoverConversation({
        name: input,
        assistant: {
          id: assistantConversationId,
          locale: localeKey,
          conversation_overrides: assistantOverrides,
        },
        extra: {
          project_id: projectId,
          ...(injectedContext ? { preset_context: injectedContext } : {}),
          workspace: finalWorkspace,
          custom_workspace: isCustomWorkspace,
          default_files: composed.files,
          selected_mcp_server_ids: selectedUserMcpServerIdsToSend,
          selected_session_mcp_servers: withKbServer(
            selectedMcpServerIds !== undefined ? selectedSessionMcpServers : selectedSessionMcpServersToSend
          ),
        },
      });
      if (!conversation || !conversation.id) {
        console.error('Failed to create ACP conversation - conversation object is null or missing id');
        if (managedPresentation) throw new Error('Managed Guid conversation creation was not durable');
        return;
      }

      await runManagedHandoff(conversation.id);

      if (isCustomWorkspace) {
        updateWorkspaceTime(finalWorkspace);
      }

      if (assistantConversationId) {
        await Promise.all([
          swrMutate(`guid.assistant.detail.${assistantConversationId}.${localeKey}`),
          swrMutate('assistants.list'),
        ]);
      }

      emitter.emit('chat.history.refresh');

      if (managedAttemptState) {
        await navigate(`/conversation/${conversation.id}`);
        clearGuidManagedAttempt(managedAttemptState.attempt);
        managedPresentation?.onHandoffAccepted?.();
        return;
      }

      const initialMessage = {
        input: composed.input,
        files: composed.files.length > 0 ? composed.files : undefined,
      };
      sessionStorage.setItem(`acp_initial_message_${conversation.id}`, JSON.stringify(initialMessage));

      await navigate(`/conversation/${conversation.id}`);
    } catch (error: unknown) {
      console.error('Failed to create ACP conversation:', error);
      throw error;
    }
  }, [
    input,
    files,
    dir,
    projectId,
    selectedAssistantId,
    selectedAssistantBackend,
    selectedMode,
    selectedAcpModel,
    selectedThoughtLevelValue,
    currentAcpCachedModelInfo,
    current_model,
    guidDisabledBuiltinSkills,
    guidEnabledSkills,
    assistantDefaultSkillIds,
    assistantDefaultDisabledBuiltinSkillIds,
    availableMcpServers,
    selectedMcpServerIds,
    assistantDefaultMcpIds,
    composePresentationSend,
    managedPresentation,
    navigate,
    t,
    localeKey,
  ]);

  const sendMessageHandler = useCallback(() => {
    if (loading || sendingRef.current) return;
    if (requiresPresentationSourceReselect) {
      onPresentationSourceReselectRequired?.();
      return;
    }
    sendingRef.current = true;
    if (managedPresentation) setManagedPresentationPending(true);
    setLoading(true);
    handleSend()
      .then(() => {
        setInput('');
        setMentionOpen(false);
        setMentionQuery(null);
        setMentionSelectorOpen(false);
        setMentionActiveIndex(0);
        setFiles([]);
        setDir('');
        setProjectId(undefined);
        onPresentationTemplateConsumed?.();
      })
      .catch((error) => {
        console.error('Failed to send message:', error);
        Message.error(getConversationCreateErrorMessage(error, t));
      })
      .finally(() => {
        sendingRef.current = false;
        if (managedPresentation) setManagedPresentationPending(false);
        setLoading(false);
      });
  }, [
    loading,
    requiresPresentationSourceReselect,
    onPresentationSourceReselectRequired,
    managedPresentation,
    handleSend,
    setLoading,
    setInput,
    setMentionOpen,
    setMentionQuery,
    setMentionSelectorOpen,
    setMentionActiveIndex,
    setFiles,
    setDir,
    setProjectId,
    onPresentationTemplateConsumed,
    t,
  ]);

  // Calculate button disabled state
  const isButtonDisabled = loading || managedPresentationPending || !input.trim() || !selectedAssistantId;

  const retireManagedPresentationAttemptAfterSourceChange = useCallback(async (succeeded: boolean): Promise<void> => {
    if (!succeeded) return;
    try {
      const raw = sessionStorage.getItem(GUID_PRESENTATION_PENDING_STORAGE_KEY);
      if (raw === null) return;
      const attempt = decodeGuidManagedAttempt(raw);
      if (attempt === null) return;
      const controller = createPresentationCommandQueueController({ conversationId: attempt.conversationId });
      const item = findExactQueueItem(controller, attempt);
      if (item !== null) {
        if (item.execution.state !== 'preflight_failed') return;
        await controller.removePreflightFailed(item.queueItemId);
      }
      clearGuidManagedAttempt(attempt);
    } catch {
      // Preserve the frozen pending attempt unless every safe retirement step succeeds.
    }
  }, []);

  return {
    handleSend,
    sendMessageHandler,
    isButtonDisabled,
    managedPresentationRecovery,
    managedPresentationPending,
    retireManagedPresentationAttemptAfterSourceChange,
  };
};
