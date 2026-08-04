/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { StudioEditableScene } from '@/common/types/project/creativeStudioTypes';

export type StudioSceneDraftFields = StudioEditableScene;

export type PersistedDrafts = {
  revision: number;
  scenes: Record<string, Partial<StudioSceneDraftFields>>;
};

export const draftKey = (projectId: string): string => `weprompt.studio.drafts.${projectId}`;

export const persistDrafts = (projectId: string, revision: number, scenes: PersistedDrafts['scenes']): void => {
  if (Object.keys(scenes).length === 0) {
    sessionStorage.removeItem(draftKey(projectId));
    return;
  }
  sessionStorage.setItem(draftKey(projectId), JSON.stringify({ revision, scenes } satisfies PersistedDrafts));
};

export const takePersistedDrafts = (projectId: string, currentRevision: number): PersistedDrafts['scenes'] | null => {
  const raw = sessionStorage.getItem(draftKey(projectId));
  sessionStorage.removeItem(draftKey(projectId));
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as PersistedDrafts;
    return parsed.revision === currentRevision ? parsed.scenes : null;
  } catch {
    return null;
  }
};
