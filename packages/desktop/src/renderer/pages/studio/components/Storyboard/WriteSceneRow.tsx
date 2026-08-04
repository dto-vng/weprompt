/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  StudioAsset,
  StudioEditableScene,
  StudioMediaKind,
  StudioScene,
} from '@/common/types/project/creativeStudioTypes';
import { Button, Input, InputNumber, Select } from '@arco-design/web-react';
import { Picture } from '@icon-park/react';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { SelectedSceneSaveState } from '../../hooks/useStoryboardEditor';
import type { StudioSceneDurationBounds } from '../../studioRouteConstraints';
import { createManagedStudioAssetUrl } from '../Preview/StagePreview';

type ActionResult = void | Promise<unknown>;

export type WriteSceneRowProps = {
  projectId: string;
  scene: StudioScene;
  draft: StudioEditableScene;
  referenceAsset: StudioAsset | null;
  saveState: SelectedSceneSaveState;
  errorMessageKey?: string | null;
  conflict: boolean;
  selected: boolean;
  mutationPending: boolean;
  importingReference: boolean;
  durationBounds: StudioSceneDurationBounds;
  onSelect: () => void;
  onUpdate: (patch: Partial<StudioEditableScene>) => void;
  onFlush: () => ActionResult;
  onRetryConflict: () => ActionResult;
  onDiscardConflict: () => ActionResult;
  onImportReference: () => ActionResult;
};

const SAVE_STATUS_KEYS = {
  saved: 'conversation.creativeStudio.inspector.saved',
  dirty: 'conversation.creativeStudio.inspector.unsavedChanges',
  saving: 'conversation.creativeStudio.inspector.saving',
  failed: 'conversation.creativeStudio.inspector.saveFailed',
} as const satisfies Record<SelectedSceneSaveState, string>;

/** A controlled, by-ID scene editor. Draft ownership stays in useStoryboardEditor. */
export const WriteSceneRow: React.FC<WriteSceneRowProps> = ({
  projectId,
  scene,
  draft,
  referenceAsset,
  saveState,
  errorMessageKey = null,
  conflict,
  selected,
  mutationPending,
  importingReference,
  durationBounds,
  onSelect,
  onUpdate,
  onFlush,
  onRetryConflict,
  onDiscardConflict,
  onImportReference,
}) => {
  const { t } = useTranslation();
  const [durationChangeInvalid, setDurationChangeInvalid] = useState(false);
  const durationInputInvalidRef = useRef(false);
  const fieldId = (field: string): string => `studio-scene-${field}-${scene.id}`;

  useEffect(() => {
    durationInputInvalidRef.current = false;
    setDurationChangeInvalid(false);
  }, [draft.durationSeconds, durationBounds.maxDurationSeconds, durationBounds.minDurationSeconds, scene.id]);

  const durationInvalid =
    durationChangeInvalid ||
    !Number.isInteger(draft.durationSeconds) ||
    draft.durationSeconds < durationBounds.minDurationSeconds ||
    draft.durationSeconds > durationBounds.maxDurationSeconds;
  const referenceSource =
    scene.referenceAssetId !== null &&
    referenceAsset?.id === scene.referenceAssetId &&
    referenceAsset.projectId === projectId &&
    referenceAsset.sceneId === scene.id &&
    referenceAsset.mediaKind === 'image' &&
    referenceAsset.managedAsset.collection === 'imports' &&
    scene.assetIds.includes(referenceAsset.id)
      ? createManagedStudioAssetUrl(projectId, referenceAsset.id)
      : null;

  const inspectDurationInput = (event: React.FormEvent<HTMLInputElement>): void => {
    const value = Number(event.currentTarget.value);
    durationInputInvalidRef.current =
      !Number.isInteger(value) ||
      value < durationBounds.minDurationSeconds ||
      value > durationBounds.maxDurationSeconds;
    if (durationInputInvalidRef.current) setDurationChangeInvalid(true);
  };

  const updateDuration = (value: number, reason?: string): void => {
    const stepperRecovery = reason === 'increase' || reason === 'decrease';
    if (
      (durationInputInvalidRef.current && !stepperRecovery) ||
      reason === 'outOfRange' ||
      !Number.isInteger(value) ||
      value < durationBounds.minDurationSeconds ||
      value > durationBounds.maxDurationSeconds
    ) {
      setDurationChangeInvalid(true);
      return;
    }
    durationInputInvalidRef.current = false;
    setDurationChangeInvalid(false);
    onUpdate({ durationSeconds: value });
  };

  return (
    <section
      aria-labelledby={`studio-write-scene-${scene.id}`}
      data-selected={selected ? 'true' : 'false'}
      className='min-w-0 rounded-12px border border-border-2 bg-fill-1 p-16px'
      onFocusCapture={onSelect}
    >
      <header className='mb-14px flex items-start justify-between gap-12px'>
        <h3 id={`studio-write-scene-${scene.id}`} className='m-0 min-w-0 break-words text-16px font-600 text-t-primary'>
          {draft.title}
        </h3>
        <span
          role='status'
          aria-live='polite'
          aria-atomic='true'
          data-state={saveState}
          className='text-12px text-t-secondary'
        >
          {t(SAVE_STATUS_KEYS[saveState])}
        </span>
      </header>

      {errorMessageKey !== null && (
        <div role='alert' className='mb-12px rounded-8px border border-danger-3 bg-danger-light-1 p-10px text-danger'>
          {t(errorMessageKey)}
        </div>
      )}

      <div className='grid grid-cols-2 gap-12px max-[760px]:grid-cols-1'>
        <div className='flex min-w-0 flex-col gap-6px'>
          <label htmlFor={fieldId('title')} className='text-12px font-500 text-t-secondary'>
            {t('conversation.creativeStudio.inspector.titleLabel')}
          </label>
          <Input
            id={fieldId('title')}
            value={draft.title}
            onChange={(title) => onUpdate({ title })}
            onBlur={() => void onFlush()}
          />
        </div>
        <div className='flex min-w-0 flex-col gap-6px'>
          <label htmlFor={fieldId('purpose')} className='text-12px font-500 text-t-secondary'>
            {t('conversation.creativeStudio.inspector.purposeLabel')}
          </label>
          <Input.TextArea
            id={fieldId('purpose')}
            value={draft.purpose}
            placeholder={t('conversation.creativeStudio.inspector.purposePlaceholder')}
            rows={2}
            onChange={(purpose) => onUpdate({ purpose })}
            onBlur={() => void onFlush()}
          />
        </div>
        <div className='col-span-2 flex min-w-0 flex-col gap-6px max-[760px]:col-span-1'>
          <label htmlFor={fieldId('prompt')} className='text-12px font-500 text-t-secondary'>
            {t('conversation.creativeStudio.inspector.visualPromptLabel')}
          </label>
          <Input.TextArea
            id={fieldId('prompt')}
            value={draft.visualPrompt}
            placeholder={t('conversation.creativeStudio.inspector.visualPromptPlaceholder')}
            rows={4}
            onChange={(visualPrompt) => onUpdate({ visualPrompt })}
            onBlur={() => void onFlush()}
          />
        </div>
        <div className='flex min-w-0 flex-col gap-6px'>
          <label htmlFor={fieldId('media')} className='text-12px font-500 text-t-secondary'>
            {t('conversation.creativeStudio.inspector.mediaKindLabel')}
          </label>
          <Select
            id={fieldId('media')}
            aria-label={t('conversation.creativeStudio.inspector.mediaKindLabel')}
            value={draft.mediaKind}
            onChange={(mediaKind) => onUpdate({ mediaKind: mediaKind as StudioMediaKind })}
            onBlur={() => void onFlush()}
          >
            <Select.Option value='image'>{t('conversation.creativeStudio.scene.image')}</Select.Option>
            <Select.Option value='video'>{t('conversation.creativeStudio.scene.video')}</Select.Option>
          </Select>
        </div>
        <div className='flex min-w-0 flex-col gap-6px'>
          <label htmlFor={fieldId('duration')} className='text-12px font-500 text-t-secondary'>
            {t('conversation.creativeStudio.inspector.durationLabel')}
          </label>
          <InputNumber
            id={fieldId('duration')}
            aria-label={t('conversation.creativeStudio.inspector.durationLabel')}
            aria-valuemin={durationBounds.minDurationSeconds}
            aria-valuemax={durationBounds.maxDurationSeconds}
            min={durationBounds.minDurationSeconds}
            max={durationBounds.maxDurationSeconds}
            mode='button'
            step={1}
            precision={0}
            value={draft.durationSeconds}
            error={durationInvalid}
            onInput={inspectDurationInput}
            onChange={updateDuration}
            onBlur={() => void onFlush()}
          />
          {durationInvalid && (
            <span role='alert' className='text-12px text-danger'>
              {t('conversation.creativeStudio.inspector.invalidDuration')}
            </span>
          )}
        </div>
        <div className='flex min-w-0 flex-col gap-6px'>
          <label htmlFor={fieldId('narration')} className='text-12px font-500 text-t-secondary'>
            {t('conversation.creativeStudio.inspector.narrationLabel')}
          </label>
          <Input.TextArea
            id={fieldId('narration')}
            value={draft.narration}
            rows={3}
            onChange={(narration) => onUpdate({ narration })}
            onBlur={() => void onFlush()}
          />
        </div>
        <div className='flex min-w-0 flex-col gap-6px'>
          <label htmlFor={fieldId('on-screen-text')} className='text-12px font-500 text-t-secondary'>
            {t('conversation.creativeStudio.inspector.onScreenTextLabel')}
          </label>
          <Input.TextArea
            id={fieldId('on-screen-text')}
            value={draft.onScreenText}
            rows={3}
            onChange={(onScreenText) => onUpdate({ onScreenText })}
            onBlur={() => void onFlush()}
          />
        </div>
      </div>

      <div className='mt-14px flex flex-col gap-8px'>
        {referenceSource !== null && (
          <figure className='m-0 flex items-center gap-10px rounded-8px border border-border-2 bg-fill-2 p-8px'>
            <img
              alt={t('conversation.creativeStudio.preview.importReference')}
              className='h-48px w-72px rounded-6px object-cover'
              src={referenceSource}
            />
            <figcaption className='text-12px text-t-secondary'>
              {t('conversation.creativeStudio.preview.importReference')}
            </figcaption>
          </figure>
        )}
        <Button
          long
          disabled={importingReference || mutationPending}
          icon={<Picture />}
          onClick={() => void onImportReference()}
        >
          {t(
            importingReference
              ? 'conversation.creativeStudio.preview.importing'
              : 'conversation.creativeStudio.preview.importReference'
          )}
        </Button>
      </div>

      {conflict && (
        <div className='mt-12px flex flex-wrap gap-8px'>
          <Button type='primary' loading={mutationPending} onClick={() => void onRetryConflict()}>
            {t('conversation.creativeStudio.storyboard.retry')}
          </Button>
          <Button disabled={mutationPending} onClick={() => void onDiscardConflict()}>
            {t('conversation.creativeStudio.storyboard.discard')}
          </Button>
        </div>
      )}
    </section>
  );
};
