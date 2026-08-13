/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type { StudioProject } from '@/common/types/project/creativeStudioTypes';
import type { ForgeProject } from '@/common/types/project/projectTypes';

import { findProjectByWorkspace, readProjects } from './projectStorage';

export const resolveConversationProject = (
  conversation: Pick<TChatConversation, 'extra'> | null | undefined,
  projects: ForgeProject[] = readProjects()
): ForgeProject | null => {
  const projectId = conversation?.extra?.project_id;
  if (projectId) {
    const projectById = projects.find((project) => project.id === projectId);
    if (projectById) {
      return projectById;
    }
  }
  const workspace = conversation?.extra?.workspace;
  return workspace ? findProjectByWorkspace(workspace, projects) : null;
};

type StudioBindingProject = Pick<StudioProject, 'id' | 'briefConversationId'>;

/** Resolves a conversation's Studio project only when the project authority points back to it. */
export const resolveConversationStudioProject = <Project extends StudioBindingProject>(
  conversation: Pick<TChatConversation, 'id' | 'extra'> | null | undefined,
  projects: Project[]
): Project | null => {
  const projectId = conversation?.extra?.studio_project_id;
  if (!projectId || !conversation) return null;
  const project = projects.find((candidate) => candidate.id === projectId);
  return project?.briefConversationId === conversation.id ? project : null;
};

/** Resolves a project's Brief conversation only when its mutable back-reference still agrees. */
export const resolveStudioProjectBriefConversation = <Conversation extends Pick<TChatConversation, 'id' | 'extra'>>(
  project: StudioBindingProject | null | undefined,
  conversations: Conversation[]
): Conversation | null => {
  const conversationId = project?.briefConversationId;
  if (!conversationId || !project) return null;
  const conversation = conversations.find((candidate) => candidate.id === conversationId);
  return conversation?.extra?.studio_project_id === project.id ? conversation : null;
};

export type DetachedProjectExtraPatch = {
  project_id: null;
  custom_workspace: false;
};

export const buildDetachedProjectExtra = (_conversation: TChatConversation): DetachedProjectExtraPatch => ({
  project_id: null,
  custom_workspace: false,
});

export type ProjectRemovalFailureReason = 'chat_detach_failed' | 'project_state_changed' | 'project_storage_failed';

export type ProjectRemovalDiagnostic = {
  conversationId?: string;
  code: string;
  status?: number;
};

export type ProjectRemovalResult =
  | { success: true }
  | {
      success: false;
      reason: ProjectRemovalFailureReason;
      diagnostics: ProjectRemovalDiagnostic[];
    };

export const PROJECT_REMOVAL_FAILURE_MESSAGE_KEYS = {
  chat_detach_failed: 'conversation.history.removeProjectChatDetachFailed',
  project_state_changed: 'conversation.history.removeProjectStateChanged',
  project_storage_failed: 'conversation.history.removeProjectStorageFailed',
} as const satisfies Record<ProjectRemovalFailureReason, string>;

type DetachAndRemoveProjectInput = {
  projectId?: string;
  conversations: TChatConversation[];
  detachConversation: (conversation: TChatConversation, extra: DetachedProjectExtraPatch) => Promise<boolean>;
  removeProjectMetadata: (projectId: string) => boolean;
};

const buildRemovalDiagnostic = (
  error: unknown,
  fallbackCode: string,
  conversationId?: string
): ProjectRemovalDiagnostic => {
  if (isBackendHttpError(error)) {
    return {
      ...(conversationId ? { conversationId } : {}),
      code: error.code || fallbackCode,
      status: error.status,
    };
  }

  const candidateCode =
    error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && error.code
      ? error.code
      : fallbackCode;
  return { ...(conversationId ? { conversationId } : {}), code: candidateCode };
};

/**
 * Detach every chat before deleting local project metadata. Failure details are
 * reduced to machine codes so callers can log diagnostics without exposing raw
 * backend messages in the UI.
 */
export const detachAndRemoveProject = async ({
  projectId,
  conversations,
  detachConversation,
  removeProjectMetadata,
}: DetachAndRemoveProjectInput): Promise<ProjectRemovalResult> => {
  const detachDiagnostics = await Promise.all(
    conversations.map(async (conversation): Promise<ProjectRemovalDiagnostic | null> => {
      try {
        const detached = await detachConversation(conversation, buildDetachedProjectExtra(conversation));
        return detached ? null : { conversationId: conversation.id, code: 'DETACH_REJECTED' };
      } catch (error) {
        return buildRemovalDiagnostic(error, 'DETACH_FAILED', conversation.id);
      }
    })
  );
  const failedDetachDiagnostics = detachDiagnostics.filter(
    (diagnostic): diagnostic is ProjectRemovalDiagnostic => diagnostic !== null
  );
  if (failedDetachDiagnostics.length > 0) {
    return {
      success: false,
      reason: 'chat_detach_failed',
      diagnostics: failedDetachDiagnostics,
    };
  }

  if (!projectId) return { success: true };

  try {
    if (!removeProjectMetadata(projectId)) {
      return { success: false, reason: 'project_state_changed', diagnostics: [] };
    }
  } catch (error) {
    return {
      success: false,
      reason: 'project_storage_failed',
      diagnostics: [buildRemovalDiagnostic(error, 'PROJECT_STORAGE_WRITE_FAILED')],
    };
  }

  return { success: true };
};
