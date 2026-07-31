/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ForgeProject } from '@/common/types/project/projectTypes';
import { useEffect, useMemo, useRef } from 'react';

import { updateProject } from '@renderer/pages/conversation/projects/projectStorage';
import { useProjects } from '@renderer/pages/conversation/projects/useProjects';

export type UseProjectHomeResult = {
  project: ForgeProject | null;
  notFound: boolean;
};

/**
 * Resolve a Project by route id from local storage, stamping `last_opened_at`
 * once per opened project. `notFound` is true when an id was given but no
 * project matches (Projects load synchronously, so there is no loading gap).
 */
export const useProjectHome = (projectId: string | undefined): UseProjectHomeResult => {
  const { projects } = useProjects();
  const project = useMemo(
    () => projects.find((candidate) => candidate.id === projectId) ?? null,
    [projects, projectId]
  );

  const stampedId = useRef<string | null>(null);
  useEffect(() => {
    if (project && stampedId.current !== project.id) {
      stampedId.current = project.id;
      try {
        updateProject({ id: project.id, last_opened_at: Date.now() });
      } catch (error) {
        // The stamp only affects Project ordering, so a failed write must never
        // escape the effect and take down the page it decorates.
        console.warn('[useProjectHome] failed to stamp last_opened_at', project.id, error);
      }
    }
  }, [project]);

  return { project, notFound: projectId !== undefined && project === null };
};
