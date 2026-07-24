/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IMcpServer, TProviderWithModel } from '@/common/config/storage';
import type { AssistantDetail } from '@/common/types/agent/assistantTypes';
import type { ForgeProject } from '@/common/types/project/projectTypes';
import { resolveLocaleKey } from '@/common/utils';
import { useInputFocusRing } from '@/renderer/hooks/chat/useInputFocusRing';
import { ensureBackendMcpCatalog } from '@/renderer/hooks/mcp/catalog';
import { Card } from '@arco-design/web-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import useSWR from 'swr';

import AssistantSelectionArea from '@renderer/pages/guid/components/AssistantSelectionArea';
import GuidActionRow from '@renderer/pages/guid/components/GuidActionRow';
import GuidInputCard from '@renderer/pages/guid/components/GuidInputCard';
import GuidModelSelector from '@renderer/pages/guid/components/GuidModelSelector';
import { useGuidAssistantSelection } from '@renderer/pages/guid/hooks/useGuidAssistantSelection';
import { useGuidInput } from '@renderer/pages/guid/hooks/useGuidInput';
import { useGuidModelSelection } from '@renderer/pages/guid/hooks/useGuidModelSelection';
import { useGuidSend } from '@renderer/pages/guid/hooks/useGuidSend';
import { resolveGuidAssistantDefaults } from '@renderer/pages/guid/utils/assistantDefaults';

import styles from './ProjectNewChatComposer.module.css';

export type ProjectNewChatComposerProps = {
  project: ForgeProject;
};

// Agents that use configured model providers instead of ACP probe-based models.
// Only aionrs now — Gemini runs as a regular ACP backend with ACP-cached models.
// (Mirrors the constant GuidPage keeps inline; hoisted here since it is immutable.)
const PROVIDER_BASED_AGENTS = new Set(['aionrs']);

/**
 * Project Home new-chat composer (C6).
 *
 * Full parity with GuidPage's composer: assistant picker, model picker, the
 * tools/skills + MCP + file-attach menu, and the prompt box — all scoped to
 * this project's workspace. Submitting creates the conversation in place via
 * the same `useGuidInput` + `useGuidSend` machinery GuidPage uses, seeded
 * with this project's `workspace`/`id` through `useGuidInput`'s
 * `locationState` option, and lands the user directly on
 * `/conversation/:id`.
 *
 * The skills/MCP-catalog state, the per-assistant defaults effect, and the
 * derived model/mode/skill/MCP setters below are reproduced from GuidPage's
 * own wiring (not imported — GuidPage owns page-level concerns like the
 * welcome hero and prompt-example grid that don't belong here), so that
 * picking an assistant on this surface applies its default model,
 * permission mode, thought level, skills, and MCP servers exactly like it
 * does on the main new-chat screen. GuidPage itself is intentionally left
 * untouched so upstream merges of it stay clean (see AGENTS.md).
 *
 * Deliberately left out relative to GuidPage — none of these were requested
 * for this surface, and `GuidInputCard`/`GuidActionRow` treat them as
 * optional:
 * - The typewriter placeholder: this surface keeps the static, already
 *   project-scoped `composerPlaceholder` string instead.
 * - The `/` slash-command menu and its builtin "open file" command.
 * - Speech-to-text input.
 * - The assistant example-prompt starter grid.
 *
 * Hidden on this surface, without forking `GuidInputCard`: its baked-in
 * workspace footnote (folder pill with change/clear controls). A project's
 * folder is fixed to `project.workspace`, so per-chat folder controls would
 * be misleading here. `GuidInputCard` always renders that footnote and
 * takes no prop to suppress it, and `GuidWorkspaceFootnote` is upstream
 * Guid-page code this project must not fork/edit (see AGENTS.md), so
 * `ProjectNewChatComposer.module.css`'s `.composerNoFolderPill` hides it
 * structurally instead (see that file for how). `workspaceDir`/
 * `onSelectWorkspace`/`onClearWorkspace` stay wired identically to
 * GuidPage's own composer — only the footnote's visibility changes;
 * `useGuidInput`'s `dir` (seeded from `project.workspace`) still flows to
 * `useGuidSend` unchanged, so created chats stay scoped to the project's
 * folder.
 */
const ProjectNewChatComposer: React.FC<ProjectNewChatComposerProps> = ({ project }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const localeKey = resolveLocaleKey(i18n.language);
  const { activeBorderColor, inactiveBorderColor, activeShadow } = useInputFocusRing();

  // --- Skills state ---
  // Skill metadata comes from the database-backed catalog. Built-in auto-inject
  // skills default checked; the rest are opt-in per conversation or pre-checked
  // by assistant defaults. (Mirrors GuidPage's own skills/MCP state verbatim.)
  const [allSkills, setAllSkills] = useState<Array<{ name: string; description: string; isAuto: boolean }>>([]);
  const [guidDisabledBuiltinSkills, setGuidDisabledBuiltinSkills] = useState<string[] | undefined>(undefined);
  const [guidEnabledSkills, setGuidEnabledSkills] = useState<string[] | undefined>(undefined);
  const [availableMcpServers, setAvailableMcpServers] = useState<IMcpServer[]>([]);
  const [guidSelectedMcpServerIds, setGuidSelectedMcpServerIds] = useState<string[] | undefined>(undefined);

  useEffect(() => {
    ipcBridge.fs.listAvailableSkills
      .invoke()
      .then((availableSkills) => {
        setAllSkills(
          availableSkills.map((s) => ({
            name: s.name,
            description: s.description,
            isAuto: s.source === 'builtin' && s.is_auto_inject,
          }))
        );
      })
      .catch(() => setAllSkills([]));
  }, []);

  useEffect(() => {
    void ensureBackendMcpCatalog()
      .then(({ allServers }) => {
        setAvailableMcpServers(allServers);
      })
      .catch((error) => {
        console.error('[ProjectNewChatComposer] Failed to load MCP catalog:', error);
        setAvailableMcpServers([]);
      });
  }, []);

  const handleToggleSkill = useCallback((skillName: string, isAuto: boolean) => {
    if (isAuto) {
      setGuidDisabledBuiltinSkills((prev) => {
        const list = prev ?? [];
        return list.includes(skillName) ? list.filter((s) => s !== skillName) : [...list, skillName];
      });
    } else {
      setGuidEnabledSkills((prev) => {
        const list = prev ?? [];
        return list.includes(skillName) ? list.filter((s) => s !== skillName) : [...list, skillName];
      });
    }
  }, []);

  const handleToggleMcpServer = useCallback((serverId: string) => {
    setGuidSelectedMcpServerIds((prev) => {
      const current = prev ?? [];
      return current.includes(serverId) ? current.filter((id) => id !== serverId) : [...current, serverId];
    });
  }, []);

  // --- Hooks ---
  // Only aionrs uses this provider-based model picker now (Gemini runs as a
  // regular ACP backend with its own model selector).
  const modelSelection = useGuidModelSelection('aionrs');

  // `locationKey: 'project-home'` scopes `useGuidAssistantSelection`'s
  // reset-on-navigation bookkeeping to this surface, distinct from Guid's own
  // `location.key`-keyed instance — the two never share a selection reset.
  const agentSelection = useGuidAssistantSelection({ locationKey: 'project-home' });

  const locationState = useMemo(
    () => ({ workspace: project.workspace, projectId: project.id }),
    [project.workspace, project.id]
  );
  const guidInput = useGuidInput({ locationState });

  // No mention/@-file picker on this surface — useGuidSend only needs these
  // setters to reset mention UI state after a send, so no-ops are correct
  // (mirrors GuidPage's own resetMentionOpen/Query/ActiveIndex).
  const resetMentionOpen = useCallback<React.Dispatch<React.SetStateAction<boolean>>>(() => {}, []);
  const resetMentionQuery = useCallback<React.Dispatch<React.SetStateAction<string | null>>>(() => {}, []);
  const resetMentionActiveIndex = useCallback<React.Dispatch<React.SetStateAction<number>>>(() => {}, []);

  const selectedAssistantId = agentSelection.selectedAssistantId;
  const hasSelectedAssistant = selectedAssistantId !== null;
  const { data: selectedAssistantDetail } = useSWR(
    selectedAssistantId ? `guid.assistant.detail.${selectedAssistantId}.${localeKey}` : null,
    async (): Promise<AssistantDetail | null> =>
      ipcBridge.assistants.get
        .invoke({ id: selectedAssistantId!, locale: localeKey })
        .catch((_error: unknown): AssistantDetail | null => null)
  );
  const resolvedAssistantDefaults = useMemo(
    () => resolveGuidAssistantDefaults(selectedAssistantDetail),
    [selectedAssistantDetail]
  );

  const send = useGuidSend({
    // Input state
    input: guidInput.input,
    setInput: guidInput.setInput,
    files: guidInput.files,
    setFiles: guidInput.setFiles,
    dir: guidInput.dir,
    setDir: guidInput.setDir,
    projectId: guidInput.projectId,
    setProjectId: guidInput.setProjectId,
    setLoading: guidInput.setLoading,
    loading: guidInput.loading,

    // Agent state
    selectedAssistantId: agentSelection.selectedAssistantId,
    selectedAssistantBackend: agentSelection.selectedAssistantBackend,
    selectedMode: agentSelection.selectedMode,
    selectedAcpModel: agentSelection.selectedAcpModel,
    selectedThoughtLevelValue: agentSelection.selectedThoughtLevelValue,
    currentAcpCachedModelInfo: agentSelection.currentAcpCachedModelInfo,
    current_model: modelSelection.current_model,

    guidDisabledBuiltinSkills,
    guidEnabledSkills,
    assistantDefaultSkillIds: resolvedAssistantDefaults.skillIds,
    assistantDefaultDisabledBuiltinSkillIds: resolvedAssistantDefaults.disabledBuiltinSkillIds,
    availableMcpServers,
    selectedMcpServerIds: guidSelectedMcpServerIds,
    assistantDefaultMcpIds: resolvedAssistantDefaults.mcpIds,
    isGoogleAuth: modelSelection.isGoogleAuth,

    // Mention state reset (no mention UI on this surface)
    setMentionOpen: resetMentionOpen,
    setMentionQuery: resetMentionQuery,
    setMentionSelectorOpen: resetMentionOpen,
    setMentionActiveIndex: resetMentionActiveIndex,

    // Navigation
    navigate,
    t,
    localeKey,
  });

  // --- Coordinated handlers (depend on multiple hooks) ---
  const handleInputChange = useCallback(
    (value: string) => {
      guidInput.setInput(value);
    },
    [guidInput.setInput]
  );

  const handleInputKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (!guidInput.input.trim()) return;
        send.sendMessageHandler();
      }
    },
    [guidInput.input, send.sendMessageHandler]
  );

  const handleSelectAssistant = useCallback(
    (assistantId: string) => {
      agentSelection.setSelectedAssistantId(assistantId);
    },
    [agentSelection.setSelectedAssistantId]
  );

  // Sync disabledBuiltinSkills + enabledSkills from assistant detail defaults.
  useEffect(() => {
    if (!selectedAssistantId || !selectedAssistantDetail) {
      setGuidDisabledBuiltinSkills(undefined);
      setGuidEnabledSkills(undefined);
      return;
    }

    const resolvedDefaults = resolveGuidAssistantDefaults(selectedAssistantDetail);
    setGuidDisabledBuiltinSkills(resolvedDefaults.disabledBuiltinSkillIds);
    setGuidEnabledSkills(resolvedDefaults.skillIds);
  }, [selectedAssistantDetail, selectedAssistantId]);

  // Applies the selected assistant's default model / permission mode /
  // thought level / skills / MCP servers whenever the assistant (or its
  // resolved defaults) changes — the same "fresh assistant" effect GuidPage
  // runs, so switching assistants here behaves like it does on the main
  // new-chat screen instead of leaving stale selections in place.
  const appliedAssistantDefaultsKeyRef = useRef<string | null>(null);
  const manualModelSelectionAssistantRef = useRef<string | null>(null);
  const manualThoughtLevelSelectionAssistantRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedAssistantId || !selectedAssistantDetail) {
      appliedAssistantDefaultsKeyRef.current = null;
      manualModelSelectionAssistantRef.current = null;
      manualThoughtLevelSelectionAssistantRef.current = null;
      return;
    }

    const signature = JSON.stringify({
      assistantId: selectedAssistantId,
      backend: agentSelection.selectedAssistantBackend,
      defaults: selectedAssistantDetail.defaults,
      preferences: {
        last_model_id: selectedAssistantDetail.preferences.last_model_id,
        last_permission_value: selectedAssistantDetail.preferences.last_permission_value,
        last_thought_level_value: selectedAssistantDetail.preferences.last_thought_level_value,
        last_mcp_ids: selectedAssistantDetail.preferences.last_mcp_ids,
      },
      availableModels: {
        acp: agentSelection.currentAcpCachedModelInfo?.available_models.map((model) => model.id) ?? [],
        aionrs: modelSelection.modelList.map((provider) => ({
          id: provider.id,
          models: provider.models,
        })),
      },
      availableModes: agentSelection.currentAgentModeOptions.map((mode) => mode.value),
      availableThoughtLevels: agentSelection.currentThoughtLevelOption?.options.map((option) => option.value) ?? [],
    });
    if (appliedAssistantDefaultsKeyRef.current === signature) {
      return;
    }
    appliedAssistantDefaultsKeyRef.current = signature;

    const applyAssistantDefaults = async () => {
      const resolvedDefaults = resolveGuidAssistantDefaults(selectedAssistantDetail);
      const effectiveBackend = agentSelection.selectedAssistantBackend;
      const shouldApplyDefaultModel = manualModelSelectionAssistantRef.current !== selectedAssistantId;
      const shouldApplyDefaultThoughtLevel = manualThoughtLevelSelectionAssistantRef.current !== selectedAssistantId;

      if (shouldApplyDefaultModel && effectiveBackend === 'aionrs') {
        if (resolvedDefaults.modelId) {
          const matchedProvider = modelSelection.modelList.find((provider) =>
            provider.models.includes(resolvedDefaults.modelId!)
          );
          if (matchedProvider) {
            await modelSelection.setCurrentModel(
              {
                ...matchedProvider,
                use_model: resolvedDefaults.modelId,
              },
              { persistPreference: false }
            );
          }
        } else {
          await modelSelection.resetCurrentModel({ persistPreference: false });
        }
      } else if (shouldApplyDefaultModel && resolvedDefaults.modelId) {
        const availableModelIds = new Set(agentSelection.currentAcpCachedModelInfo?.available_models.map((m) => m.id));
        agentSelection.setSelectedAcpModel(
          availableModelIds.size === 0 || availableModelIds.has(resolvedDefaults.modelId)
            ? resolvedDefaults.modelId
            : null,
          { persistPreference: false }
        );
      } else if (shouldApplyDefaultModel) {
        agentSelection.setSelectedAcpModel(null, { persistPreference: false });
      }

      if (resolvedDefaults.permissionMode) {
        const availableModeIds = new Set(agentSelection.currentAgentModeOptions.map((mode) => mode.value));
        if (availableModeIds.size === 0 || availableModeIds.has(resolvedDefaults.permissionMode)) {
          agentSelection.setSelectedMode(resolvedDefaults.permissionMode, { persistPreference: false });
        } else {
          const fallbackMode = agentSelection.currentAgentModeOptions[0]?.value;
          if (fallbackMode) {
            agentSelection.setSelectedMode(fallbackMode, { persistPreference: false });
          }
        }
      }
      if (shouldApplyDefaultThoughtLevel && agentSelection.currentThoughtLevelOption) {
        const availableThoughtLevelValues = new Set(
          agentSelection.currentThoughtLevelOption.options.map((option) => option.value)
        );
        if (resolvedDefaults.thoughtLevel && availableThoughtLevelValues.has(resolvedDefaults.thoughtLevel)) {
          agentSelection.setSelectedThoughtLevelValue(resolvedDefaults.thoughtLevel, { persistPreference: false });
        } else {
          const fallbackThoughtLevel =
            agentSelection.currentThoughtLevelOption.currentValue ||
            agentSelection.currentThoughtLevelOption.options[0]?.value ||
            '';
          agentSelection.setSelectedThoughtLevelValue(fallbackThoughtLevel, { persistPreference: false });
        }
      }
      setGuidSelectedMcpServerIds(resolvedDefaults.mcpIds);
    };

    void applyAssistantDefaults().catch((error) => {
      console.error('[ProjectNewChatComposer] Failed to apply assistant defaults:', error);
    });
  }, [
    agentSelection.currentAcpCachedModelInfo?.available_models,
    agentSelection.currentAgentModeOptions,
    agentSelection.currentThoughtLevelOption,
    agentSelection.selectedAssistantBackend,
    agentSelection.setSelectedAcpModel,
    agentSelection.setSelectedMode,
    agentSelection.setSelectedThoughtLevelValue,
    modelSelection.modelList,
    modelSelection.resetCurrentModel,
    modelSelection.setCurrentModel,
    selectedAssistantId,
    selectedAssistantDetail,
  ]);

  const setGuidSelectedMode = useCallback(
    (mode: React.SetStateAction<string>) => {
      agentSelection.setSelectedMode(mode, { persistPreference: !hasSelectedAssistant });
    },
    [agentSelection, hasSelectedAssistant]
  );
  const setGuidSelectedAcpModel = useCallback(
    (model: React.SetStateAction<string | null>) => {
      manualModelSelectionAssistantRef.current = selectedAssistantId;
      agentSelection.setSelectedAcpModel(model, { persistPreference: !hasSelectedAssistant });
    },
    [agentSelection, hasSelectedAssistant, selectedAssistantId]
  );
  const setGuidSelectedThoughtLevel = useCallback(
    (value: string) => {
      manualThoughtLevelSelectionAssistantRef.current = selectedAssistantId;
      agentSelection.setSelectedThoughtLevelValue(value, { persistPreference: !hasSelectedAssistant });
    },
    [agentSelection, hasSelectedAssistant, selectedAssistantId]
  );
  const setGuidCurrentModel = useCallback(
    (model: TProviderWithModel) => {
      manualModelSelectionAssistantRef.current = selectedAssistantId;
      return modelSelection.setCurrentModel(model, { persistPreference: !hasSelectedAssistant });
    },
    [hasSelectedAssistant, modelSelection, selectedAssistantId]
  );

  const isGeminiMode = PROVIDER_BASED_AGENTS.has(agentSelection.selectedAssistantBackend);

  const modelSelectorNode = (
    <GuidModelSelector
      isGeminiMode={isGeminiMode}
      modelList={modelSelection.modelList}
      current_model={modelSelection.current_model}
      setCurrentModel={setGuidCurrentModel}
      currentAcpCachedModelInfo={agentSelection.currentAcpCachedModelInfo}
      selectedAcpModel={agentSelection.selectedAcpModel}
      setSelectedAcpModel={setGuidSelectedAcpModel}
      thoughtLevelOption={isGeminiMode ? null : agentSelection.currentThoughtLevelOption}
      onThoughtLevelSelect={setGuidSelectedThoughtLevel}
    />
  );

  const actionRowNode = (
    <GuidActionRow
      files={guidInput.files}
      onFilesUploaded={guidInput.handleFilesUploaded}
      modelSelectorNode={modelSelectorNode}
      modeBackend={agentSelection.selectedAssistantBackend}
      selectedMode={agentSelection.selectedMode}
      dynamicModes={agentSelection.currentAgentModeOptions}
      onModeSelect={setGuidSelectedMode}
      allSkills={allSkills}
      disabledBuiltinSkills={guidDisabledBuiltinSkills ?? []}
      enabledSkills={guidEnabledSkills ?? []}
      onToggleSkill={handleToggleSkill}
      mcpServers={availableMcpServers}
      selectedMcpServerIds={guidSelectedMcpServerIds ?? []}
      onToggleMcpServer={handleToggleMcpServer}
      loading={guidInput.loading}
      isButtonDisabled={send.isButtonDisabled}
      onSend={send.sendMessageHandler}
    />
  );

  return (
    <Card
      data-testid='project-new-chat-composer'
      title={
        <span className='flex items-baseline gap-6px'>
          <span className='text-15px font-600 text-t-primary'>{t('conversation.projectHome.newChat')}</span>
          <span className='text-12px font-400 text-t-tertiary'>{t('conversation.projectHome.scopedHint')}</span>
        </span>
      }
    >
      <AssistantSelectionArea
        selectedAssistantId={agentSelection.selectedAssistantId}
        assistants={agentSelection.assistants}
        localeKey={localeKey}
        onSelectAssistant={handleSelectAssistant}
      />

      {/*
        Wrapper exists solely to hide GuidInputCard's baked-in workspace
        footnote (folder pill) via `.composerNoFolderPill` — see
        ProjectNewChatComposer.module.css. The project's folder is fixed to
        `project.workspace`, so this per-chat control must not be shown;
        `workspaceDir`/`onSelectWorkspace`/`onClearWorkspace` below are left
        wired for internal consistency, but no longer affect what's visible.
      */}
      <div className={styles.composerNoFolderPill} data-testid='project-composer-input-wrap'>
        <GuidInputCard
          input={guidInput.input}
          onInputChange={handleInputChange}
          onKeyDown={handleInputKeyDown}
          onPaste={guidInput.onPaste}
          onFocus={guidInput.handleTextareaFocus}
          onBlur={guidInput.handleTextareaBlur}
          placeholder={t('conversation.projectHome.composerPlaceholder')}
          isInputActive={guidInput.isInputFocused}
          isFileDragging={guidInput.isFileDragging}
          activeBorderColor={activeBorderColor}
          inactiveBorderColor={inactiveBorderColor}
          activeShadow={activeShadow}
          dragHandlers={guidInput.dragHandlers}
          files={guidInput.files}
          onRemoveFile={guidInput.handleRemoveFile}
          actionRow={actionRowNode}
          workspaceDir={guidInput.dir}
          onSelectWorkspace={(dir) => guidInput.setDir(dir)}
          onClearWorkspace={() => guidInput.setDir('')}
        />
      </div>
    </Card>
  );
};

export default ProjectNewChatComposer;
