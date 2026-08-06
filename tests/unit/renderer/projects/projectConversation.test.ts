/**
 * @vitest-environment node
 */

import { describe, expect, it, vi } from 'vitest';
import { BackendHttpError } from '@/common/adapter/httpBridge';
import type { TChatConversation } from '@/common/config/storage';
import type { StudioProject } from '@/common/types/project/creativeStudioTypes';
import {
  buildDetachedProjectExtra,
  detachAndRemoveProject,
  resolveConversationProject,
  resolveConversationStudioProject,
  resolveStudioProjectBriefConversation,
} from '@/renderer/pages/conversation/projects/projectConversation';

type StudioBindingProject = Pick<StudioProject, 'id' | 'briefConversationId'>;

const conversation = (): TChatConversation =>
  ({
    id: 'conv-1',
    name: 'Review June close',
    created_at: 1,
    modified_at: 1,
    type: 'aionrs',
    model: {},
    extra: {
      project_id: 'project-1',
      workspace: '/Users/me/Finance Close',
      custom_workspace: true,
      pinned: true,
      pinned_at: 123,
      skills: ['officecli'],
      mcp_servers: ['project-knowledge'],
      session_mcp_servers: [{ name: 'session-only' }],
    },
  }) as TChatConversation;

const studioConversation = (id: string, studioProjectId?: string): TChatConversation => {
  const item = conversation();
  return {
    ...item,
    id,
    extra: {
      ...item.extra,
      ...(studioProjectId === undefined ? {} : { studio_project_id: studioProjectId }),
    },
  } as TChatConversation;
};

describe('projectConversation', () => {
  it('resolves a consistent Studio binding in both directions', () => {
    const project: StudioBindingProject = { id: 'studio_1', briefConversationId: 'conv-brief' };
    const brief = studioConversation('conv-brief', project.id);

    expect(resolveConversationStudioProject(brief, [project])).toBe(project);
    expect(resolveStudioProjectBriefConversation(project, [brief])).toBe(brief);
  });

  it('treats a conversation as stale when its Studio back-reference disagrees with the project', () => {
    const authoritativeProject: StudioBindingProject = {
      id: 'studio_authoritative',
      briefConversationId: 'conv-brief',
    };
    const staleConversation = studioConversation('conv-brief', 'studio_other');

    expect(resolveConversationStudioProject(staleConversation, [authoritativeProject])).toBeNull();
    expect(resolveStudioProjectBriefConversation(authoritativeProject, [staleConversation])).toBeNull();
  });

  it('keeps a deleted project conversation while resolving its back-reference to null', () => {
    const keptConversation = studioConversation('conv-brief', 'studio_deleted');

    expect(resolveConversationStudioProject(keptConversation, [])).toBeNull();
    expect(keptConversation.id).toBe('conv-brief');
    expect(keptConversation.extra.studio_project_id).toBe('studio_deleted');
  });

  it('returns null for a deleted conversation without clearing the dangling project id', () => {
    const project: StudioBindingProject = { id: 'studio_1', briefConversationId: 'conv-deleted' };

    expect(resolveStudioProjectBriefConversation(project, [])).toBeNull();
    expect(project.briefConversationId).toBe('conv-deleted');
  });

  it('returns null for an unbound Studio project and an ordinary conversation', () => {
    expect(resolveConversationStudioProject(studioConversation('conv-ordinary'), [])).toBeNull();
    expect(resolveStudioProjectBriefConversation({ id: 'studio_1', briefConversationId: null }, [])).toBeNull();
  });

  it('builds a minimal detach patch without protected runtime snapshots', () => {
    expect(buildDetachedProjectExtra(conversation())).toEqual({
      project_id: null,
      custom_workspace: false,
    });
  });

  it('resolves older Project chats by their matching workspace', () => {
    const legacyProjectChat = conversation();
    delete legacyProjectChat.extra.project_id;

    expect(
      resolveConversationProject(legacyProjectChat, [
        {
          id: 'project-1',
          name: 'Finance Close',
          workspace: '/Users/me/Finance Close',
          created_at: 1,
          updated_at: 1,
        },
      ])
    ).toMatchObject({ id: 'project-1', name: 'Finance Close' });
  });

  it('removes project metadata only after every chat detaches', async () => {
    const callOrder: string[] = [];
    const detachConversation = vi.fn(async (item: TChatConversation) => {
      callOrder.push(`detach:${item.id}`);
      return true;
    });
    const removeProjectMetadata = vi.fn(() => {
      callOrder.push('remove:project-1');
      return true;
    });

    await expect(
      detachAndRemoveProject({
        projectId: 'project-1',
        conversations: [conversation(), { ...conversation(), id: 'conv-2' }],
        detachConversation,
        removeProjectMetadata,
      })
    ).resolves.toEqual({ success: true });

    expect(callOrder).toEqual(['detach:conv-1', 'detach:conv-2', 'remove:project-1']);
  });

  it('keeps project metadata when a chat returns an unsuccessful detach result', async () => {
    const removeProjectMetadata = vi.fn(() => true);

    await expect(
      detachAndRemoveProject({
        projectId: 'project-1',
        conversations: [conversation()],
        detachConversation: vi.fn().mockResolvedValue(false),
        removeProjectMetadata,
      })
    ).resolves.toEqual({
      success: false,
      reason: 'chat_detach_failed',
      diagnostics: [{ conversationId: 'conv-1', code: 'DETACH_REJECTED' }],
    });

    expect(removeProjectMetadata).not.toHaveBeenCalled();
  });

  it('retains the backend error code while keeping its raw message out of the result', async () => {
    const backendError = new BackendHttpError({
      method: 'PATCH',
      path: '/api/conversations/conv-1',
      status: 409,
      body: { code: 'IMMUTABLE_EXTRA_FIELD', error: 'Protected field includes a private path' },
    });

    await expect(
      detachAndRemoveProject({
        projectId: 'project-1',
        conversations: [conversation()],
        detachConversation: vi.fn().mockRejectedValue(backendError),
        removeProjectMetadata: vi.fn(() => true),
      })
    ).resolves.toEqual({
      success: false,
      reason: 'chat_detach_failed',
      diagnostics: [{ conversationId: 'conv-1', code: 'IMMUTABLE_EXTRA_FIELD', status: 409 }],
    });
  });

  it('distinguishes changed project state from a storage write failure', async () => {
    const baseInput = {
      projectId: 'project-1',
      conversations: [] as TChatConversation[],
      detachConversation: vi.fn().mockResolvedValue(true),
    };

    await expect(detachAndRemoveProject({ ...baseInput, removeProjectMetadata: vi.fn(() => false) })).resolves.toEqual({
      success: false,
      reason: 'project_state_changed',
      diagnostics: [],
    });

    await expect(
      detachAndRemoveProject({
        ...baseInput,
        removeProjectMetadata: vi.fn(() => {
          throw Object.assign(new Error('quota exceeded'), { code: 'STORAGE_QUOTA_EXCEEDED' });
        }),
      })
    ).resolves.toEqual({
      success: false,
      reason: 'project_storage_failed',
      diagnostics: [{ code: 'STORAGE_QUOTA_EXCEEDED' }],
    });
  });
});
