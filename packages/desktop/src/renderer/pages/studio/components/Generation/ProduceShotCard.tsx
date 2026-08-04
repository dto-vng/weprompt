/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { StudioScene } from '@/common/types/project/creativeStudioTypes';
import { Button, Tag } from '@arco-design/web-react';
import { Picture, VideoOne } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import type { StudioSceneStatus } from '../../studioReadiness';

export type ProduceShotCardProps = {
  scene: StudioScene;
  index: number;
  status: StudioSceneStatus;
  selected: boolean;
  selectedTakeNumber: number | null;
  mutationPending: boolean;
  onSelect: () => void;
  onAddVisual: () => void;
};

/** One Produce shot summary. Generation review remains in the selected-shot work area. */
export const ProduceShotCard: React.FC<ProduceShotCardProps> = ({
  scene,
  index,
  status,
  selected,
  selectedTakeNumber,
  mutationPending,
  onSelect,
  onAddVisual,
}) => {
  const { t } = useTranslation();
  const sceneLabel = t('conversation.creativeStudio.scene.accessibleName', {
    number: index + 1,
    title: scene.title,
  });
  const hasVisual = scene.visualPrompt.trim().length > 0;
  const MediaIcon = scene.mediaKind === 'image' ? Picture : VideoOne;

  return (
    <li
      aria-label={sceneLabel}
      className={`min-w-240px flex-1 rounded-10px border p-12px ${
        selected ? 'border-primary-6 bg-primary-light-1' : 'border-border-2 bg-fill-1'
      }`}
    >
      <div className='flex items-start gap-10px'>
        <span
          aria-hidden='true'
          className='mt-2px flex h-30px w-30px flex-none items-center justify-center rounded-6px bg-fill-2 text-t-secondary'
        >
          <MediaIcon />
        </span>
        <div className='min-w-0 flex-1'>
          <Button
            type='text'
            className='h-auto max-w-full justify-start p-0 text-left'
            aria-label={sceneLabel}
            aria-current={selected ? 'true' : undefined}
            disabled={mutationPending}
            onClick={onSelect}
          >
            <span className='min-w-0'>
              <span className='block text-11px text-t-tertiary'>
                {t('conversation.creativeStudio.scene.number', { number: index + 1 })}
              </span>
              <span className='block truncate text-14px font-600 text-t-primary'>{scene.title}</span>
            </span>
          </Button>
          <div className='mt-7px flex flex-wrap items-center gap-6px text-11px text-t-secondary'>
            <span>
              {t(
                scene.mediaKind === 'image'
                  ? 'conversation.creativeStudio.scene.image'
                  : 'conversation.creativeStudio.scene.video'
              )}
            </span>
            <span aria-hidden='true'>·</span>
            <span>
              {t('conversation.creativeStudio.scene.durationSeconds', {
                count: scene.durationSeconds,
                seconds: scene.durationSeconds,
              })}
            </span>
          </div>
        </div>
        <Tag>{t(`conversation.creativeStudio.scene.status.${status}`)}</Tag>
      </div>

      {selectedTakeNumber !== null && (
        <p className='mb-0 mt-8px text-11px text-t-secondary'>
          {t('conversation.creativeStudio.preview.versionLabel', { number: selectedTakeNumber })}
        </p>
      )}

      <div className='mt-10px flex flex-wrap justify-end gap-8px'>
        {!hasVisual && (
          <Button size='small' disabled={mutationPending} onClick={onAddVisual}>
            {t('conversation.creativeStudio.phase.produce.addVisual')}
          </Button>
        )}
      </div>
    </li>
  );
};
