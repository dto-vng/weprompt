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
import type { IMcpServer, TProviderWithModel } from '@/common/config/storage';
import { toSessionMcpServer } from '@/renderer/hooks/mcp/catalog';
import { emitter } from '@/renderer/utils/emitter';
import { updateWorkspaceTime } from '@/renderer/utils/workspace/workspaceHistory';
import { Message } from '@arco-design/web-react';
import { useCallback, useRef } from 'react';
import { type TFunction } from 'i18next';
import type { NavigateFunction } from 'react-router-dom';
import { mutate as swrMutate } from 'swr';
import { getConversationCreateErrorMessage } from '@/renderer/pages/conversation/utils/conversationCreateError';
import type { AcpModelInfo } from '../types';
import { resolveInjectedContext } from './resolveInjectedContext';

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

  // Navigation
  navigate: NavigateFunction;
  t: TFunction;
  localeKey: string;
};

export type GuidSendResult = {
  handleSend: () => Promise<void>;
  sendMessageHandler: () => void;
  isButtonDisabled: boolean;
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
    setMentionOpen,
    setMentionQuery,
    setMentionSelectorOpen,
    setMentionActiveIndex,
    navigate,
    t,
    localeKey,
  } = deps;
  const sendingRef = useRef(false);

  const handleSend = useCallback(async () => {
    if (!selectedAssistantId) {
      return;
    }

    const isCustomWorkspace = !!dir;
    const finalWorkspace = dir || '';

    // Fold a selected presentation template into the first message: directive
    // text wraps the user's prompt, and the template's THEME.md (+ reference
    // deck) rides along as attached files. The conversation title keeps the
    // raw user input.
    const composed = composePresentationSend
      ? composePresentationSend(input, files)
      : { input, files, injectSkills: [] as string[] };

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

    if (assistantBackend === 'aionrs') {
      if (!current_model) {
        Message.warning(t('conversation.noModelConfigured'));
        return;
      }
      try {
        const conversation = await ipcBridge.conversation.create.invoke({
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
            selected_session_mcp_servers: selectedSessionMcpServersToSend,
          },
        });

        if (!conversation || !conversation.id) {
          Message.error(t('conversation.createFailed'));
          return;
        }

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
      const conversation = await ipcBridge.conversation.create.invoke({
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
          selected_session_mcp_servers:
            selectedMcpServerIds !== undefined ? selectedSessionMcpServers : selectedSessionMcpServersToSend,
        },
      });
      if (!conversation || !conversation.id) {
        console.error('Failed to create ACP conversation - conversation object is null or missing id');
        return;
      }

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
    navigate,
    t,
    localeKey,
  ]);

  const sendMessageHandler = useCallback(() => {
    if (loading || sendingRef.current) return;
    sendingRef.current = true;
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
        setLoading(false);
      });
  }, [
    loading,
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
  const isButtonDisabled = loading || !input.trim() || !selectedAssistantId;

  return {
    handleSend,
    sendMessageHandler,
    isButtonDisabled,
  };
};
