/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

import styles from './StudioPhaseShell.module.css';

export type AssistantDockProps = {
  children: React.ReactNode;
};

export const AssistantDock: React.FC<AssistantDockProps> = ({ children }) => (
  <aside className={styles.assistantDock}>{children}</aside>
);
