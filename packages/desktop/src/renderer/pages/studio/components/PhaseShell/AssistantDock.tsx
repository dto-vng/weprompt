/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';

import styles from './StudioPhaseShell.module.css';

export type AssistantDockProps = {
  children: React.ReactNode;
  kind?: 'write' | 'produce';
};

export const AssistantDock: React.FC<AssistantDockProps> = ({ children, kind = 'write' }) => {
  const { t } = useTranslation();
  const labelKey =
    kind === 'write'
      ? 'conversation.creativeStudio.phase.write.assistantTitle'
      : 'conversation.creativeStudio.phase.produce.activityTitle';

  return (
    <aside aria-label={t(labelKey)} className={styles.assistantDock}>
      {children}
    </aside>
  );
};
