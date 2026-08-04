/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button, Input, InputNumber, Modal, Select } from '@arco-design/web-react';
import { Delete, Down, Drag, Magic, Picture, Up } from '@icon-park/react';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type {
  StudioAsset,
  StudioEditableScene,
  StudioMediaKind,
  StudioScene,
} from '@/common/types/project/creativeStudioTypes';
import type { SelectedSceneSaveState } from '../../../../hooks/useStoryboardEditor';
import type { StudioSceneDurationBounds } from '../../../../studioRouteConstraints';
import type { StudioSceneStatus } from '../../../../studioReadiness';
import { createManagedStudioAssetUrl } from '../../../Preview/StagePreview';

import styles from './write.module.css';

type ActionResult = void | Promise<unknown>;
type SceneMoveDirection = 'up' | 'down';
const MAX_SCENE_TITLE_CHARS = 256;

export type ScriptRowProps = {
  projectId: string;
  scene: StudioScene;
  draft: StudioEditableScene;
  index: number;
  sceneCount: number;
  status: StudioSceneStatus;
  referenceAsset: StudioAsset | null;
  saveState: SelectedSceneSaveState;
  errorMessageKey?: string | null;
  conflict: boolean;
  selected: boolean;
  mutationPending: boolean;
  importingReference: boolean;
  removeDisabled: boolean;
  moveUpDisabled: boolean;
  moveDownDisabled: boolean;
  durationBoundsByMediaKind: Record<StudioMediaKind, StudioSceneDurationBounds>;
  onSelect: () => void;
  onUpdate: (patch: Partial<StudioEditableScene>) => void;
  onFlush: () => ActionResult;
  onRetryConflict: () => ActionResult;
  onDiscardConflict: () => ActionResult;
  onImportReference: () => ActionResult;
  onSuggestVisual: () => void;
  onRemove: () => ActionResult;
  onMove: (direction: SceneMoveDirection) => ActionResult;
};

const SAVE_STATUS_KEYS = {
  saved: 'conversation.creativeStudio.inspector.saved',
  dirty: 'conversation.creativeStudio.inspector.unsavedChanges',
  saving: 'conversation.creativeStudio.inspector.saving',
  failed: 'conversation.creativeStudio.inspector.saveFailed',
} as const satisfies Record<SelectedSceneSaveState, string>;

/** Controlled, sortable script row. Draft ownership stays in useStoryboardEditor. */
export const ScriptRow: React.FC<ScriptRowProps> = ({
  projectId,
  scene,
  draft,
  index,
  sceneCount,
  status,
  referenceAsset,
  saveState,
  errorMessageKey = null,
  conflict,
  selected,
  mutationPending,
  importingReference,
  removeDisabled,
  moveUpDisabled,
  moveDownDisabled,
  durationBoundsByMediaKind,
  onSelect,
  onUpdate,
  onFlush,
  onRetryConflict,
  onDiscardConflict,
  onImportReference,
  onSuggestVisual,
  onRemove,
  onMove,
}) => {
  const { t } = useTranslation();
  const [durationChangeInvalid, setDurationChangeInvalid] = useState(false);
  const [removeConfirmVisible, setRemoveConfirmVisible] = useState(false);
  const [titleTouched, setTitleTouched] = useState(false);
  const durationInputInvalidRef = useRef(false);
  const fieldId = (field: string): string => `studio-scene-${field}-${scene.id}`;
  const durationBounds = durationBoundsByMediaKind[draft.mediaKind];
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({
    id: scene.id,
    disabled: mutationPending,
  });

  useEffect(() => {
    durationInputInvalidRef.current = false;
    setDurationChangeInvalid(false);
  }, [draft.durationSeconds, durationBounds.maxDurationSeconds, durationBounds.minDurationSeconds, scene.id]);

  const durationInvalid =
    durationChangeInvalid ||
    !Number.isInteger(draft.durationSeconds) ||
    draft.durationSeconds < durationBounds.minDurationSeconds ||
    draft.durationSeconds > durationBounds.maxDurationSeconds;
  const titleInvalid = draft.title.trim().length === 0 || draft.title.length > MAX_SCENE_TITLE_CHARS;
  const titleBlocksFlush = titleInvalid && (titleTouched || !Object.is(draft.title, scene.title));
  const titlePlaceholderKey =
    index === 0
      ? 'conversation.creativeStudio.phase.write.placeholder.opening'
      : index === sceneCount - 1
        ? 'conversation.creativeStudio.phase.write.placeholder.closing'
        : 'conversation.creativeStudio.phase.write.placeholder.middle';
  const displayTitle = draft.title.trim().length > 0 ? draft.title : t(titlePlaceholderKey);
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

  const updateMediaKind = (mediaKind: StudioMediaKind): void => {
    const nextBounds = durationBoundsByMediaKind[mediaKind];
    const integerDuration = Number.isFinite(draft.durationSeconds)
      ? Math.round(draft.durationSeconds)
      : nextBounds.minDurationSeconds;
    const durationSeconds = Math.min(
      nextBounds.maxDurationSeconds,
      Math.max(nextBounds.minDurationSeconds, integerDuration)
    );
    onUpdate({ mediaKind, durationSeconds });
  };

  const flushIfTitleValid = (): void => {
    if (titleBlocksFlush) return;
    void onFlush();
  };

  const actionValues = { number: index + 1, title: displayTitle };
  const sortableStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const statusKey = `conversation.creativeStudio.scene.status.${status}` as const;

  return (
    <li ref={setNodeRef} className={styles.scriptRowItem} style={sortableStyle} data-dragging={isDragging}>
      <section
        aria-labelledby={`studio-write-scene-${scene.id}`}
        data-selected={selected ? 'true' : 'false'}
        className={styles.scriptRow}
        onFocusCapture={onSelect}
      >
        <h3 id={`studio-write-scene-${scene.id}`} className={styles.srOnly}>
          {displayTitle}
        </h3>

        <div data-script-zone='timing' className={`${styles.zone} ${styles.timingZone}`}>
          <div className={styles.shotIdentity}>
            <Button
              ref={setActivatorNodeRef}
              type='text'
              size='small'
              disabled={mutationPending}
              aria-label={t('conversation.creativeStudio.storyboard.dragSceneAccessible', actionValues)}
              title={t('conversation.creativeStudio.storyboard.dragSceneAccessible', actionValues)}
              {...attributes}
              {...listeners}
            >
              <Drag aria-hidden='true' />
            </Button>
            <span className={styles.shotNumber}>{String(index + 1).padStart(2, '0')}</span>
          </div>
          <label htmlFor={fieldId('duration')} className={styles.srOnly}>
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
            onBlur={flushIfTitleValid}
          />
          {durationInvalid && (
            <span role='alert' className={styles.fieldError}>
              {t('conversation.creativeStudio.inspector.invalidDuration')}
            </span>
          )}
          <div className={styles.rowActions}>
            <Button
              type='text'
              size='mini'
              disabled={mutationPending || moveUpDisabled}
              aria-label={t('conversation.creativeStudio.storyboard.moveSceneUpAccessible', actionValues)}
              title={t('conversation.creativeStudio.storyboard.moveSceneUpAccessible', actionValues)}
              onClick={() => void onMove('up')}
            >
              <Up aria-hidden='true' />
            </Button>
            <Button
              type='text'
              size='mini'
              disabled={mutationPending || moveDownDisabled}
              aria-label={t('conversation.creativeStudio.storyboard.moveSceneDownAccessible', actionValues)}
              title={t('conversation.creativeStudio.storyboard.moveSceneDownAccessible', actionValues)}
              onClick={() => void onMove('down')}
            >
              <Down aria-hidden='true' />
            </Button>
            <Button
              type='text'
              size='mini'
              status='danger'
              disabled={mutationPending || removeDisabled}
              aria-label={t('conversation.creativeStudio.storyboard.removeSceneAccessible', actionValues)}
              title={t('conversation.creativeStudio.storyboard.removeSceneAccessible', actionValues)}
              onClick={() => setRemoveConfirmVisible(true)}
            >
              <Delete aria-hidden='true' />
            </Button>
          </div>
        </div>

        <div data-script-zone='script' className={styles.zone}>
          <div className={styles.field}>
            <label htmlFor={fieldId('title')}>{t('conversation.creativeStudio.inspector.titleLabel')}</label>
            <Input
              id={fieldId('title')}
              value={draft.title}
              placeholder={t(titlePlaceholderKey)}
              maxLength={MAX_SCENE_TITLE_CHARS}
              error={titleBlocksFlush}
              onChange={(title) => {
                setTitleTouched(true);
                onUpdate({ title });
              }}
              onBlur={flushIfTitleValid}
            />
            {titleBlocksFlush && (
              <span role='alert' className={styles.fieldError}>
                {t('conversation.creativeStudio.phase.write.invalidTitle')}
              </span>
            )}
          </div>
          <div className={styles.field}>
            <label htmlFor={fieldId('narration')}>{t('conversation.creativeStudio.inspector.narrationLabel')}</label>
            <Input.TextArea
              id={fieldId('narration')}
              value={draft.narration}
              rows={3}
              onChange={(narration) => onUpdate({ narration })}
              onBlur={flushIfTitleValid}
            />
          </div>
          <div className={styles.secondaryFields}>
            <div className={styles.field}>
              <label htmlFor={fieldId('purpose')}>{t('conversation.creativeStudio.inspector.purposeLabel')}</label>
              <Input.TextArea
                id={fieldId('purpose')}
                value={draft.purpose}
                placeholder={t('conversation.creativeStudio.inspector.purposePlaceholder')}
                rows={2}
                onChange={(purpose) => onUpdate({ purpose })}
                onBlur={flushIfTitleValid}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor={fieldId('on-screen-text')}>
                {t('conversation.creativeStudio.inspector.onScreenTextLabel')}
              </label>
              <Input.TextArea
                id={fieldId('on-screen-text')}
                value={draft.onScreenText}
                rows={3}
                onChange={(onScreenText) => onUpdate({ onScreenText })}
                onBlur={flushIfTitleValid}
              />
            </div>
          </div>
        </div>

        <div data-script-zone='visual' className={styles.zone}>
          <div className={styles.field}>
            <label htmlFor={fieldId('prompt')}>{t('conversation.creativeStudio.inspector.visualPromptLabel')}</label>
            <Input.TextArea
              id={fieldId('prompt')}
              value={draft.visualPrompt}
              placeholder={t('conversation.creativeStudio.phase.write.visualPlaceholder')}
              rows={5}
              onChange={(visualPrompt) => onUpdate({ visualPrompt })}
              onBlur={flushIfTitleValid}
            />
          </div>
          {draft.visualPrompt.trim().length === 0 && (
            <Button type='text' size='small' icon={<Magic aria-hidden='true' />} onClick={onSuggestVisual}>
              {t('conversation.creativeStudio.phase.write.suggestVisual')}
            </Button>
          )}
          <div className={styles.referenceSlot}>
            {referenceSource !== null && (
              <figure className={styles.referencePreview}>
                <img
                  alt={t('conversation.creativeStudio.preview.importReference')}
                  src={referenceSource}
                  className={styles.referenceImage}
                />
                <figcaption>{t('conversation.creativeStudio.preview.importReference')}</figcaption>
              </figure>
            )}
            <Button
              size='small'
              disabled={importingReference || mutationPending}
              icon={<Picture aria-hidden='true' />}
              onClick={() => void onImportReference()}
            >
              {t(
                importingReference
                  ? 'conversation.creativeStudio.preview.importing'
                  : 'conversation.creativeStudio.phase.write.addReference'
              )}
            </Button>
          </div>
        </div>

        <div data-script-zone='output' className={`${styles.zone} ${styles.outputZone}`}>
          <div className={styles.field}>
            <label htmlFor={fieldId('media')}>{t('conversation.creativeStudio.inspector.mediaKindLabel')}</label>
            <Select
              id={fieldId('media')}
              aria-label={t('conversation.creativeStudio.inspector.mediaKindLabel')}
              value={draft.mediaKind}
              onChange={(mediaKind) => updateMediaKind(mediaKind as StudioMediaKind)}
              onBlur={flushIfTitleValid}
            >
              <Select.Option value='image'>{t('conversation.creativeStudio.scene.image')}</Select.Option>
              <Select.Option value='video'>{t('conversation.creativeStudio.scene.video')}</Select.Option>
            </Select>
          </div>
          <span role='status' data-readiness={status} className={styles.readiness}>
            <span aria-hidden='true' className={styles.readinessDot} />
            {draft.title.trim().length === 0 ? t('conversation.creativeStudio.phase.write.needsTitle') : t(statusKey)}
          </span>
          <span
            role='status'
            aria-live='polite'
            aria-atomic='true'
            data-state={saveState}
            className={styles.saveStatus}
          >
            {t(SAVE_STATUS_KEYS[saveState])}
          </span>
          {errorMessageKey !== null && (
            <div role='alert' className={styles.errorMessage}>
              {t(errorMessageKey)}
            </div>
          )}
          {conflict && (
            <div className={styles.conflictActions}>
              <Button type='primary' size='small' loading={mutationPending} onClick={() => void onRetryConflict()}>
                {t('conversation.creativeStudio.storyboard.retry')}
              </Button>
              <Button size='small' disabled={mutationPending} onClick={() => void onDiscardConflict()}>
                {t('conversation.creativeStudio.storyboard.discard')}
              </Button>
            </div>
          )}
        </div>
      </section>

      <Modal
        title={t('conversation.creativeStudio.storyboard.removeConfirmTitle')}
        visible={removeConfirmVisible}
        footer={
          <>
            <Button disabled={mutationPending} onClick={() => setRemoveConfirmVisible(false)}>
              {t('conversation.creativeStudio.create.cancel')}
            </Button>
            <Button
              type='primary'
              status='danger'
              loading={mutationPending}
              onClick={() => {
                setRemoveConfirmVisible(false);
                void onRemove();
              }}
            >
              {t('conversation.creativeStudio.storyboard.removeScene')}
            </Button>
          </>
        }
        onCancel={() => !mutationPending && setRemoveConfirmVisible(false)}
      >
        <p>{t('conversation.creativeStudio.storyboard.removeConfirmBody')}</p>
      </Modal>
    </li>
  );
};
