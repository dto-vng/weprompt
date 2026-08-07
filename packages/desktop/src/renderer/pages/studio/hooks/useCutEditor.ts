/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type {
  StudioCut,
  StudioEditableCut,
  StudioEditableCutClip,
  StudioRendererProject,
} from '@/common/types/project/creativeStudioTypes';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type StudioCutMoveAnnouncement = {
  fromPosition: number;
  toPosition: number;
  total: number;
};

export type UseCutEditorResult = {
  project: StudioRendererProject;
  activeCut: StudioCut | null;
  mutationPending: boolean;
  errorMessageKey: string | null;
  moveAnnouncement: StudioCutMoveAnnouncement | null;
  moveClip: (clipId: string, targetIndex: number) => Promise<boolean>;
  updateClip: (clipId: string, edit: StudioEditableCutClip) => Promise<boolean>;
  resetClip: (clipId: string) => Promise<boolean>;
  restoreStoryboardOrder: () => Promise<boolean>;
  placeScenes: (sceneIds: string[], beforeClipId: string | null) => Promise<boolean>;
};

const editableCut = (cut: StudioCut): StudioEditableCut => ({
  orderMode: cut.orderMode,
  clipOrder: [...cut.clipOrder],
  clips: Object.fromEntries(
    Object.entries(cut.clips).map(([clipId, clip]) => [
      clipId,
      {
        sourceInSeconds: clip.sourceInSeconds,
        sourceOutSeconds: clip.sourceOutSeconds,
        crop: clip.crop === null ? null : { ...clip.crop },
        filters: clip.filters
          .filter((filter) => filter.amount !== 0)
          .map((filter) => ({ id: filter.id, amount: filter.amount })),
      },
    ])
  ),
});

const activeCutFrom = (project: StudioRendererProject): StudioCut | null =>
  project.activeCutId === null || project.activeCutId === undefined
    ? null
    : (project.cuts?.[project.activeCutId] ?? null);

export const useCutEditor = (
  canonicalProject: StudioRendererProject,
  refreshProject?: () => Promise<StudioRendererProject | null>
): UseCutEditorResult => {
  const [project, setProject] = useState(canonicalProject);
  const [mutationPending, setMutationPending] = useState(false);
  const [errorMessageKey, setErrorMessageKey] = useState<string | null>(null);
  const [moveAnnouncement, setMoveAnnouncement] = useState<StudioCutMoveAnnouncement | null>(null);
  const projectRef = useRef(canonicalProject);
  const mutationPendingRef = useRef(false);

  useEffect(() => {
    const current = projectRef.current;
    if (current.id === canonicalProject.id && current.revision > canonicalProject.revision) return;
    projectRef.current = canonicalProject;
    setProject(canonicalProject);
  }, [canonicalProject]);

  const activeCut = useMemo(() => activeCutFrom(project), [project]);

  const commitCut = useCallback(
    async (transform: (cut: StudioEditableCut, source: StudioCut) => StudioEditableCut): Promise<boolean> => {
      if (mutationPendingRef.current) return false;
      const sourceProject = projectRef.current;
      const sourceCut = activeCutFrom(sourceProject);
      if (sourceCut === null) return false;
      const cut = transform(editableCut(sourceCut), sourceCut);
      mutationPendingRef.current = true;
      setMutationPending(true);
      setErrorMessageKey(null);
      try {
        const result = await ipcBridge.creativeStudio.updateCut.invoke({
          projectId: sourceProject.id,
          expectedRevision: sourceProject.revision,
          cutId: sourceCut.id,
          cut,
        });
        if (result.ok === false) {
          setErrorMessageKey(result.error.messageKey);
          return false;
        }
        projectRef.current = result.data;
        setProject(result.data);
        try {
          await refreshProject?.();
        } catch {
          // The guarded mutation already succeeded; a later shell refresh can recover this read.
        }
        return true;
      } catch {
        setErrorMessageKey('conversation.creativeStudio.errors.storage');
        return false;
      } finally {
        mutationPendingRef.current = false;
        setMutationPending(false);
      }
    },
    [refreshProject]
  );

  const moveClip = useCallback(
    async (clipId: string, targetIndex: number): Promise<boolean> => {
      const sourceCut = activeCutFrom(projectRef.current);
      const sourceIndex = sourceCut?.clipOrder.indexOf(clipId) ?? -1;
      if (sourceCut === null || sourceIndex < 0) return false;
      const boundedTarget = Math.min(Math.max(0, targetIndex), sourceCut.clipOrder.length - 1);
      if (boundedTarget === sourceIndex) return false;
      const moved = await commitCut((cut) => {
        cut.clipOrder.splice(sourceIndex, 1);
        cut.clipOrder.splice(boundedTarget, 0, clipId);
        return cut;
      });
      if (moved) {
        setMoveAnnouncement({
          fromPosition: sourceIndex + 1,
          toPosition: boundedTarget + 1,
          total: sourceCut.clipOrder.length,
        });
      }
      return moved;
    },
    [commitCut]
  );

  const updateClip = useCallback(
    (clipId: string, edit: StudioEditableCutClip): Promise<boolean> =>
      commitCut((cut) => {
        if (!Object.hasOwn(cut.clips, clipId)) return cut;
        cut.clips[clipId] = {
          sourceInSeconds: edit.sourceInSeconds,
          sourceOutSeconds: edit.sourceOutSeconds,
          crop: edit.crop === null ? null : { ...edit.crop },
          filters: edit.filters
            .filter((filter) => filter.amount !== 0)
            .map((filter) => ({ id: filter.id, amount: filter.amount })),
        };
        return cut;
      }),
    [commitCut]
  );

  const resetClip = useCallback(
    (clipId: string): Promise<boolean> =>
      updateClip(clipId, {
        sourceInSeconds: null,
        sourceOutSeconds: null,
        crop: null,
        filters: [],
      }),
    [updateClip]
  );

  const restoreStoryboardOrder = useCallback(
    (): Promise<boolean> =>
      commitCut((cut, source) => {
        const scenePositions = new Map(projectRef.current.sceneOrder.map((sceneId, index) => [sceneId, index]));
        cut.orderMode = 'storyboard';
        cut.clipOrder = [...source.clipOrder].toSorted(
          (left, right) =>
            (scenePositions.get(source.clips[left]?.sceneId ?? '') ?? Number.MAX_SAFE_INTEGER) -
            (scenePositions.get(source.clips[right]?.sceneId ?? '') ?? Number.MAX_SAFE_INTEGER)
        );
        return cut;
      }),
    [commitCut]
  );

  const placeScenes = useCallback(
    async (sceneIds: string[], beforeClipId: string | null): Promise<boolean> => {
      if (mutationPendingRef.current || sceneIds.length === 0) return false;
      const sourceProject = projectRef.current;
      const sourceCut = activeCutFrom(sourceProject);
      if (sourceCut === null || sourceCut.orderMode !== 'manual') return false;
      mutationPendingRef.current = true;
      setMutationPending(true);
      setErrorMessageKey(null);
      try {
        const result = await ipcBridge.creativeStudio.placeCutScenes.invoke({
          projectId: sourceProject.id,
          expectedRevision: sourceProject.revision,
          cutId: sourceCut.id,
          sceneIds,
          beforeClipId,
        });
        if (result.ok === false) {
          setErrorMessageKey(result.error.messageKey);
          return false;
        }
        projectRef.current = result.data;
        setProject(result.data);
        try {
          await refreshProject?.();
        } catch {
          // The guarded mutation already succeeded; a later shell refresh can recover this read.
        }
        return true;
      } catch {
        setErrorMessageKey('conversation.creativeStudio.errors.storage');
        return false;
      } finally {
        mutationPendingRef.current = false;
        setMutationPending(false);
      }
    },
    [refreshProject]
  );

  return {
    project,
    activeCut,
    mutationPending,
    errorMessageKey,
    moveAnnouncement,
    moveClip,
    updateClip,
    resetClip,
    restoreStoryboardOrder,
    placeScenes,
  };
};
