/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ForgeProject } from '@/common/types/project/projectTypes';
import { resolveLocaleKey } from '@/common/utils';
import { Button, Card, Input } from '@arco-design/web-react';
import { ArrowUp } from '@icon-park/react';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import AssistantSelectionArea from '@renderer/pages/guid/components/AssistantSelectionArea';
import { useGuidAssistantSelection } from '@renderer/pages/guid/hooks/useGuidAssistantSelection';
import { useGuidInput } from '@renderer/pages/guid/hooks/useGuidInput';
import { useGuidModelSelection } from '@renderer/pages/guid/hooks/useGuidModelSelection';
import { useGuidSend } from '@renderer/pages/guid/hooks/useGuidSend';

export type ProjectNewChatComposerProps = {
  project: ForgeProject;
};

/**
 * Project Home new-chat composer (C6).
 *
 * A lightweight, project-scoped prompt box. Submitting creates the
 * conversation in place — via the same `useGuidInput` + `useGuidSend`
 * machinery GuidPage uses, seeded with this project's `workspace`/`id`
 * through `useGuidInput`'s `locationState` option — and lands the user
 * directly on `/conversation/:id`. Reusing these hooks keeps create logic
 * single-sourced there instead of a second, divergent implementation living
 * here; `useGuidSend` already sets `extra.project_id` / `extra.workspace`
 * from the `projectId`/`dir` it reads off `useGuidInput`.
 *
 * There is no skill/MCP/mode picker on this surface, so the corresponding
 * `useGuidSend` deps are passed as `undefined`/empty — `useGuidSend` then
 * falls back to the selected assistant's own defaults for skills, disabled
 * builtin skills, and MCP servers (see its `guidEnabledSkills ??
 * assistantDefaultSkillIds` fallback chain), same as GuidPage before it
 * resolves per-conversation overrides.
 *
 * `locationKey: 'project-home'` scopes `useGuidAssistantSelection`'s
 * reset-on-navigation bookkeeping to this surface, distinct from Guid's own
 * `location.key`-keyed instance — the two never share a selection reset.
 */
const ProjectNewChatComposer: React.FC<ProjectNewChatComposerProps> = ({ project }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const localeKey = resolveLocaleKey(i18n.language);

  const locationState = useMemo(
    () => ({ workspace: project.workspace, projectId: project.id }),
    [project.workspace, project.id]
  );
  const guidInput = useGuidInput({ locationState });
  const modelSelection = useGuidModelSelection('aionrs');
  const agentSelection = useGuidAssistantSelection({ locationKey: 'project-home' });

  // `models[0]` is the same value useGuidAssistantSelection treats as an
  // assistant's default elsewhere (see resolveInitialAssistantModel) and is
  // already on the Assistant object, so it can be shown as a read-only hint
  // without a second async lookup.
  const defaultModel = agentSelection.selectedAssistant?.models?.[0];

  // No mention/@-file picker on this surface — useGuidSend only needs these
  // setters to reset mention UI state after a send, so no-ops are correct
  // (mirrors GuidPage's own resetMentionOpen/Query/ActiveIndex).
  const resetMentionOpen = useCallback<React.Dispatch<React.SetStateAction<boolean>>>(() => {}, []);
  const resetMentionQuery = useCallback<React.Dispatch<React.SetStateAction<string | null>>>(() => {}, []);
  const resetMentionActiveIndex = useCallback<React.Dispatch<React.SetStateAction<number>>>(() => {}, []);

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

    // No skill/MCP picker here — see doc comment above.
    guidDisabledBuiltinSkills: undefined,
    guidEnabledSkills: undefined,
    assistantDefaultSkillIds: undefined,
    assistantDefaultDisabledBuiltinSkillIds: undefined,
    availableMcpServers: [],
    selectedMcpServerIds: undefined,
    assistantDefaultMcpIds: undefined,
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

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        if (!guidInput.input.trim()) return;
        send.sendMessageHandler();
      }
    },
    [guidInput.input, send.sendMessageHandler]
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
      <div className='flex flex-col gap-12px'>
        <Input.TextArea
          value={guidInput.input}
          onChange={(value) => guidInput.setInput(value)}
          onKeyDown={handleKeyDown}
          autoSize={{ minRows: 2, maxRows: 8 }}
          placeholder={t('conversation.projectHome.composerPlaceholder')}
        />
        <AssistantSelectionArea
          selectedAssistantId={agentSelection.selectedAssistantId}
          assistants={agentSelection.assistants}
          localeKey={localeKey}
          onSelectAssistant={agentSelection.setSelectedAssistantId}
        />
        <div className='flex items-center justify-between gap-10px'>
          {defaultModel ? (
            <span className='max-w-200px truncate rd-999px bg-fill-2 px-10px py-4px text-12px text-t-secondary'>
              {defaultModel}
            </span>
          ) : (
            <span />
          )}
          <Button
            type='primary'
            shape='circle'
            aria-label={t('common.send')}
            disabled={send.isButtonDisabled}
            icon={<ArrowUp theme='filled' size='14' fill='white' strokeWidth={5} />}
            onClick={send.sendMessageHandler}
            data-testid='project-composer-submit'
          />
        </div>
      </div>
    </Card>
  );
};

export default ProjectNewChatComposer;
