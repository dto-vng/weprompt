/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { StudioRouteCatalog, StudioRouteCatalogEntry } from '@/common/types/project/creativeStudioTypes';
import { Button } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import styles from './produce.module.css';

export type ReadyStudioRoute = {
  kind: 'image' | 'video';
  route: StudioRouteCatalogEntry;
};

export type EngineBarProps = {
  routes: readonly ReadyStudioRoute[];
  disabled?: boolean;
  headingId?: string;
  onOpenSettings: (path: '/settings/model') => void;
};

/** Returns only main-canonical ready selections; catalog options are never treated as implicit choices. */
export const getReadySelectedRoutes = (catalog: StudioRouteCatalog | null): ReadyStudioRoute[] =>
  (['video', 'image'] as const).flatMap((kind) => {
    const role = catalog?.[kind];
    const selectedRoute = role?.selectedRoute;
    return role?.status === 'ready' && selectedRoute?.kind === kind ? [{ kind, route: selectedRoute }] : [];
  });

/** Compact display of the actual media routes selected by the main-process catalog. */
export const EngineBar: React.FC<EngineBarProps> = ({
  routes,
  disabled = false,
  headingId = 'studio-produce-phase-heading',
  onOpenSettings,
}) => {
  const { t } = useTranslation();

  return (
    <section className={styles.engineBar} aria-labelledby={headingId}>
      <div className={styles.engineSummary}>
        <h2 id={headingId} data-studio-phase-heading tabIndex={-1} className={styles.engineHeading}>
          {t('conversation.creativeStudio.phase.produce.renderingWith')}
        </h2>
        <ul className={styles.engineRoutes}>
          {routes.map(({ kind, route }) => (
            <li key={`${kind}:${route.choiceId}`} className={styles.engineRoute}>
              {t('conversation.creativeStudio.phase.produce.engineSummary', {
                model: route.model,
                kind: t(
                  kind === 'image'
                    ? 'conversation.creativeStudio.scene.image'
                    : 'conversation.creativeStudio.scene.video'
                ),
                seconds: route.constraints.maxDurationSeconds,
              })}
            </li>
          ))}
        </ul>
      </div>
      <Button
        type='text'
        className={styles.changeEnginesButton}
        disabled={disabled}
        onClick={() => onOpenSettings('/settings/model')}
      >
        {t('conversation.creativeStudio.phase.produce.changeEngines')}
      </Button>
    </section>
  );
};
