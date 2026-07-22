/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import type { ForgeProject } from '@/common/types/project/projectTypes';
import { selectProjectConversations } from '@renderer/pages/conversation/projects/selectProjectConversations';

const project: ForgeProject = { id: 'p1', name: 'Alpha', workspace: '/w/alpha', created_at: 1, updated_at: 1 };

const conv = (id: string, extra: Record<string, unknown>, modified_at = 0): TChatConversation =>
  ({ id, name: id, extra, modified_at, created_at: 0, type: 'acp', model: {} }) as unknown as TChatConversation;

describe('selectProjectConversations', () => {
  it('matches conversations by project_id', () => {
    const list = [conv('a', { project_id: 'p1' }), conv('b', { project_id: 'other' })];
    expect(selectProjectConversations(list, project).map((c) => c.id)).toEqual(['a']);
  });

  it('matches by workspace when project_id is absent', () => {
    const list = [conv('a', { workspace: '/w/alpha' }), conv('b', { workspace: '/w/other' })];
    expect(selectProjectConversations(list, project).map((c) => c.id)).toEqual(['a']);
  });

  it('sorts matches by modified_at descending', () => {
    const list = [conv('old', { project_id: 'p1' }, 1), conv('new', { project_id: 'p1' }, 2)];
    expect(selectProjectConversations(list, project).map((c) => c.id)).toEqual(['new', 'old']);
  });
});
