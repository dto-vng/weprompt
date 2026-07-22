/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ForgeProject } from '@/common/types/project/projectTypes';
import { resolveLocaleKey } from '@/common/utils';
import { Button, Card, Input } from '@arco-design/web-react';
import { ArrowUp } from '@icon-park/react';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import AssistantSelectionArea from '@renderer/pages/guid/components/AssistantSelectionArea';
import { useGuidAssistantSelection } from '@renderer/pages/guid/hooks/useGuidAssistantSelection';

export type ProjectNewChatComposerProps = {
  project: ForgeProject;
};

/**
 * Project Home new-chat composer (C6).
 *
 * A lightweight, project-scoped prompt box. Submitting does **not** create
 * the conversation here — it hands off to the existing Guid create flow via
 * `navigate('/guid', { state: { workspace, projectId, prefillPrompt,
 * selectedAssistantId } })`. GuidPage already reads exactly these
 * `location.state` fields (`useGuidInput` seeds the draft, `useGuidSend`
 * resolves the selected assistant's default model and creates the
 * conversation), so create logic stays single-sourced there instead of a
 * second, divergent implementation living here.
 *
 * `locationKey: 'project-home'` scopes `useGuidAssistantSelection`'s
 * reset-on-navigation bookkeeping to this surface, distinct from Guid's own
 * `location.key`-keyed instance — the two never share a selection reset.
 */
const ProjectNewChatComposer: React.FC<ProjectNewChatComposerProps> = ({ project }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const localeKey = resolveLocaleKey(i18n.language);
  const [input, setInput] = useState('');

  const { selectedAssistantId, setSelectedAssistantId, assistants, selectedAssistant } = useGuidAssistantSelection({
    locationKey: 'project-home',
  });

  // `models[0]` is the same value useGuidAssistantSelection treats as an
  // assistant's default elsewhere (see resolveInitialAssistantModel) and is
  // already on the Assistant object, so it can be shown as a read-only hint
  // without a second async lookup (the assistant applies its real default on
  // the Guid side after handoff).
  const defaultModel = selectedAssistant?.models?.[0];

  const handleSubmit = useCallback(() => {
    const trimmedInput = input.trim();
    if (!trimmedInput) return;

    navigate('/guid', {
      state: {
        workspace: project.workspace,
        projectId: project.id,
        prefillPrompt: trimmedInput,
        selectedAssistantId,
      },
    });
    setInput('');
  }, [input, navigate, project.id, project.workspace, selectedAssistantId]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
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
          value={input}
          onChange={(value) => setInput(value)}
          onKeyDown={handleKeyDown}
          autoSize={{ minRows: 2, maxRows: 8 }}
          placeholder={t('conversation.projectHome.composerPlaceholder')}
        />
        <AssistantSelectionArea
          selectedAssistantId={selectedAssistantId}
          assistants={assistants}
          localeKey={localeKey}
          onSelectAssistant={setSelectedAssistantId}
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
            disabled={!input.trim()}
            icon={<ArrowUp theme='filled' size='14' fill='white' strokeWidth={5} />}
            onClick={handleSubmit}
            data-testid='project-composer-submit'
          />
        </div>
      </div>
    </Card>
  );
};

export default ProjectNewChatComposer;
