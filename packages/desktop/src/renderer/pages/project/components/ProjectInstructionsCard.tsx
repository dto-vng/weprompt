/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ForgeProject } from '@/common/types/project/projectTypes';
import { updateProject } from '@renderer/pages/conversation/projects/projectStorage';
import { Button, Card, Input, Message } from '@arco-design/web-react';
import { Info, Plus } from '@icon-park/react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

export type ProjectInstructionsCardProps = {
  project: ForgeProject;
};

/**
 * Project Home instructions card (C4).
 *
 * View mode shows a ~2-line preview of `project.instructions` with an Edit
 * affordance and a small "applies to new chats" note, or — when there are no
 * instructions — a prompt to add some. Edit mode swaps in an autosizing
 * textarea seeded from the current instructions, with Save/Cancel controls.
 *
 * Save persists via `updateProject`, which dispatches `forge:projects-changed`
 * — already consumed by `useProjects`/`useProjectHome` — so the parent
 * re-renders with the new `project.instructions` on its own; this component
 * takes no `onChanged` callback.
 */
const ProjectInstructionsCard: React.FC<ProjectInstructionsCardProps> = ({ project }) => {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const instructions = project.instructions?.trim();

  const startEdit = (): void => {
    setDraft(project.instructions ?? '');
    setEditing(true);
  };

  const handleCancel = (): void => {
    setEditing(false);
  };

  const handleSave = (): void => {
    updateProject({ id: project.id, instructions: draft.trim() });
    setEditing(false);
    Message.success(t('conversation.projectHome.instructionsSaved'));
  };

  return (
    <Card
      data-testid='project-instructions-card'
      title={t('conversation.projectHome.instructions')}
      extra={
        !editing && instructions ? (
          <Button type='text' size='mini' onClick={startEdit}>
            {t('conversation.projectHome.edit')}
          </Button>
        ) : undefined
      }
    >
      {editing ? (
        <div className='flex flex-col gap-10px'>
          <Input.TextArea
            autoFocus
            autoSize={{ minRows: 4, maxRows: 10 }}
            value={draft}
            onChange={(value) => setDraft(value)}
          />
          <div className='flex items-center justify-end gap-8px'>
            <Button onClick={handleCancel}>{t('conversation.projectHome.cancel')}</Button>
            <Button type='primary' onClick={handleSave}>
              {t('conversation.projectHome.save')}
            </Button>
          </div>
        </div>
      ) : instructions ? (
        <div className='flex flex-col gap-10px'>
          <p className='m-0 line-clamp-2 text-13px leading-relaxed text-t-secondary'>{instructions}</p>
          <span className='flex items-center gap-4px text-12px text-t-tertiary'>
            <Info theme='outline' size='13' className='shrink-0' />
            {t('conversation.projectHome.instructionsApplies')}
          </span>
        </div>
      ) : (
        <div className='flex flex-col items-center gap-10px rd-10px border border-dashed border-border-2 px-16px py-20px text-center'>
          <span className='text-13px text-t-secondary'>{t('conversation.projectHome.instructionsEmpty')}</span>
          <Button type='outline' size='small' icon={<Plus theme='outline' size='14' />} onClick={startEdit}>
            {t('conversation.projectHome.addInstructions')}
          </Button>
        </div>
      )}
    </Card>
  );
};

export default ProjectInstructionsCard;
