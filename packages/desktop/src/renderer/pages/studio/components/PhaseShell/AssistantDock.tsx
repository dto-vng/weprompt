/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { StudioRouteCatalog } from '@/common/types/project/creativeStudioTypes';
import { Button, Drawer } from '@arco-design/web-react';
import { Magic } from '@icon-park/react';
import React, { useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import type { StudioLayoutMode } from './useStudioLayoutMode';
import styles from './StudioPhaseShell.module.css';

export type AssistantDockProps = {
  children?: React.ReactNode;
  kind?: 'write' | 'produce';
  layoutMode?: StudioLayoutMode;
  drawerVisible?: boolean;
  storyboard?: StudioRouteCatalog['storyboard'] | null;
  catalogLoading?: boolean;
  drafting?: boolean;
  disabled?: boolean;
  onOpenChange?: (visible: boolean) => void;
  onDraftStoryboard?: () => void;
};

const modelIdentity = (providerId: string, model: string): string => `${providerId}\u0000${model}`;

export const AssistantDock: React.FC<AssistantDockProps> = ({
  children,
  kind = 'write',
  layoutMode = 'inline',
  drawerVisible = false,
  storyboard = null,
  catalogLoading = false,
  drafting = false,
  disabled = false,
  onOpenChange,
  onDraftStoryboard,
}) => {
  const { t } = useTranslation();
  const openerRef = useRef<HTMLButtonElement>(null);
  const inlineAssistantRef = useRef<HTMLElement>(null);
  const assistantOwnsFocusRef = useRef(false);
  const previousLayoutModeRef = useRef(layoutMode);
  const previousDrawerVisibleRef = useRef(drawerVisible);
  const labelKey =
    kind === 'write'
      ? 'conversation.creativeStudio.phase.write.assistantTitle'
      : 'conversation.creativeStudio.phase.produce.activityTitle';

  useLayoutEffect(() => {
    const previousLayoutMode = previousLayoutModeRef.current;
    const previousDrawerVisible = previousDrawerVisibleRef.current;
    if (kind === 'write') {
      if (previousLayoutMode === 'drawer' && layoutMode === 'inline' && previousDrawerVisible) {
        if (drawerVisible) onOpenChange?.(false);
        inlineAssistantRef.current?.focus();
        assistantOwnsFocusRef.current = true;
      } else if (previousLayoutMode === 'inline' && layoutMode === 'drawer' && assistantOwnsFocusRef.current) {
        openerRef.current?.focus();
        assistantOwnsFocusRef.current = false;
      } else if (
        previousLayoutMode === 'drawer' &&
        layoutMode === 'drawer' &&
        previousDrawerVisible &&
        !drawerVisible
      ) {
        openerRef.current?.focus();
        assistantOwnsFocusRef.current = false;
      }
    }
    previousLayoutModeRef.current = layoutMode;
    previousDrawerVisibleRef.current = drawerVisible;
  }, [drawerVisible, kind, layoutMode, onOpenChange]);

  if (kind === 'produce') {
    return (
      <aside aria-label={t(labelKey)} className={styles.assistantDock}>
        {children}
      </aside>
    );
  }

  const selected = storyboard?.selected ?? null;
  const selectedOption =
    selected === null
      ? null
      : (storyboard?.options.find(
          (option) =>
            modelIdentity(option.providerId, option.model) === modelIdentity(selected.providerId, selected.model)
        ) ?? null);
  const ready = !catalogLoading && storyboard?.status === 'ready' && selected !== null;
  const statusKey = catalogLoading
    ? 'conversation.creativeStudio.draft.checking'
    : ready
      ? 'conversation.creativeStudio.draft.ready'
      : storyboard?.status === 'setup_required'
        ? 'conversation.creativeStudio.draft.setupRequired'
        : 'conversation.creativeStudio.draft.unavailable';
  const draftDisabled = disabled || drafting || !ready;
  const content = (
    <div
      className='flex flex-col gap-14px'
      onFocusCapture={() => {
        assistantOwnsFocusRef.current = true;
      }}
      onBlurCapture={(event) => {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
          assistantOwnsFocusRef.current = false;
        }
      }}
    >
      <div>
        <h3 className='m-0 text-16px font-600 text-t-primary'>{t(labelKey)}</h3>
        <p className='mb-0 mt-6px text-13px text-t-secondary'>
          {t('conversation.creativeStudio.phase.write.assistantDescription')}
        </p>
      </div>
      <div role='status' aria-live='polite' className='rounded-8px border border-border-2 bg-fill-1 p-12px'>
        <p className='m-0 text-13px font-500 text-t-primary'>{t(statusKey)}</p>
        {ready && selected !== null && (
          <dl className='mb-0 mt-10px grid grid-cols-[max-content_minmax(0,1fr)] gap-x-10px gap-y-6px'>
            <dt className='text-12px text-t-tertiary'>{t('conversation.creativeStudio.draft.providerLabel')}</dt>
            <dd className='m-0 break-all text-13px text-t-primary'>
              {selectedOption?.providerName ?? selected.providerId}
            </dd>
            <dt className='text-12px text-t-tertiary'>{t('conversation.creativeStudio.draft.modelLabel')}</dt>
            <dd className='m-0 break-all text-13px text-t-primary'>{selected.model}</dd>
          </dl>
        )}
      </div>
      <p className='m-0 text-12px text-t-tertiary'>
        {t('conversation.creativeStudio.phase.write.textChargeDisclosure')}
      </p>
      <Button
        type='primary'
        long
        icon={<Magic />}
        loading={drafting}
        disabled={draftDisabled}
        onClick={onDraftStoryboard}
      >
        {t('conversation.creativeStudio.phase.write.draftStoryboard')}
      </Button>
    </div>
  );

  if (layoutMode === 'inline') {
    return (
      <aside
        ref={inlineAssistantRef}
        aria-label={t(labelKey)}
        tabIndex={-1}
        className='min-w-0 rounded-12px border border-border-2 bg-fill-1 p-16px'
      >
        {content}
      </aside>
    );
  }

  return (
    <>
      <Button ref={openerRef} icon={<Magic />} onClick={() => onOpenChange?.(true)}>
        {t('conversation.creativeStudio.phase.write.askAssistant')}
      </Button>
      <Drawer
        visible={drawerVisible}
        title={t(labelKey)}
        width={380}
        footer={null}
        unmountOnExit
        onCancel={() => onOpenChange?.(false)}
      >
        {content}
      </Drawer>
    </>
  );
};
