/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button } from '@arco-design/web-react';
import { Download, Magic, VideoOne } from '@icon-park/react';
import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import type { StudioPhase } from '../../studioPhaseRoute';
import { BriefPhase, ProducePhase, ReviewPhase, WritePhase } from './phases';
import { StudioPhaseHeader } from './StudioPhaseHeader';
import { StudioPhaseNav } from './StudioPhaseNav';
import type { StudioPhaseControllers } from './types';
import styles from './StudioPhaseShell.module.css';

export type StudioPhaseShellProps = {
  activePhase: StudioPhase;
  controller: StudioPhaseControllers;
  navigationDisabled: boolean;
  onBack: () => void;
};

export const StudioPhaseShell: React.FC<StudioPhaseShellProps> = ({
  activePhase,
  controller,
  navigationDisabled,
  onBack,
}) => {
  const { t } = useTranslation();
  const previousPhaseRef = useRef(activePhase);

  useEffect(() => {
    if (previousPhaseRef.current === activePhase) return;
    previousPhaseRef.current = activePhase;
    if (activePhase === 'write' && controller.writeFocusIntent !== null) return;
    const frame = requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('[data-studio-phase-heading]')?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [activePhase, controller.writeFocusIntent]);

  const hasStoryboard = controller.project.sceneOrder.length > 0;
  const storyboardReady =
    controller.models.catalog?.storyboard.status === 'ready' && controller.models.catalog.storyboard.selected !== null;
  const headerAction = (() => {
    switch (activePhase) {
      case 'brief':
        return (
          <Button type='primary' onClick={() => controller.requestTransition({ phase: 'write' })}>
            {t('conversation.creativeStudio.phase.brief.startWriting')}
          </Button>
        );
      case 'write':
        return (
          <Button
            type={hasStoryboard ? 'default' : 'primary'}
            icon={<Magic />}
            loading={controller.editor.drafting}
            disabled={
              controller.editor.drafting ||
              controller.editor.conflict !== null ||
              !storyboardReady ||
              controller.mutationPending
            }
            onClick={controller.openDraftReview}
          >
            {t(
              hasStoryboard
                ? 'conversation.creativeStudio.draft.redraftAction'
                : 'conversation.creativeStudio.draft.action'
            )}
          </Button>
        );
      case 'produce':
        return (
          <div className={styles.actionStack}>
            <Button
              icon={<VideoOne />}
              loading={controller.jobs.mutationPending}
              disabled={
                controller.mutationPending ||
                controller.readiness.readySceneIds.length === 0 ||
                controller.readiness.durationDeltaSeconds !== 0
              }
              onClick={() => void controller.openReadyScenesReview()}
            >
              {t('conversation.creativeStudio.review.generateReadyScenes', {
                count: controller.readiness.readySceneIds.length,
              })}
            </Button>
            {(controller.readiness.readySceneIds.length === 0 || controller.readiness.durationDeltaSeconds !== 0) && (
              <span className={styles.actionIssue} aria-live='polite'>
                {t(
                  controller.readiness.readySceneIds.length === 0
                    ? 'conversation.creativeStudio.review.noReadyScenes'
                    : 'conversation.creativeStudio.review.disabledDurationMismatch'
                )}
              </span>
            )}
          </div>
        );
      case 'review':
        return (
          <div className={styles.actionStack}>
            <Button
              icon={<Download />}
              disabled={controller.mutationPending || controller.readiness.selectedAssetCount === 0}
              onClick={controller.openExport}
            >
              {t('conversation.creativeStudio.export.action')}
            </Button>
            {controller.readiness.selectedAssetCount === 0 && (
              <span className={styles.actionIssue} aria-live='polite'>
                {t('conversation.creativeStudio.export.noAssetsToExport')}
              </span>
            )}
          </div>
        );
    }
  })();

  return (
    <div className={styles.shell}>
      <StudioPhaseHeader project={controller.project} onBack={onBack} actions={headerAction} />
      <StudioPhaseNav
        activePhase={activePhase}
        disabled={navigationDisabled}
        onSelect={(phase) => {
          if (phase !== activePhase) controller.requestTransition({ phase });
        }}
      />
      <div className={styles.phaseFrame}>
        {activePhase === 'brief' && <BriefPhase controller={controller} />}
        {activePhase === 'write' && <WritePhase controller={controller} />}
        {activePhase === 'produce' && <ProducePhase controller={controller} />}
        {activePhase === 'review' && <ReviewPhase controller={controller} />}
      </div>
    </div>
  );
};
