import { describe, expect, it } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import { buildContextHandoffExtraPatch } from '@/renderer/pages/conversation/contextHandoff/contextConversationUpdate';

const conversation = {
  id: 'conv-1',
  name: 'Monthly Close',
  type: 'aionrs',
  created_at: 1,
  modified_at: 2,
  model: { id: 'p1', platform: 'openai', name: 'OpenAI', base_url: '', api_key: '', use_model: 'gpt-4.1' },
  extra: {
    workspace: '/workspace',
    skills: ['finance-close'],
    mcp_servers: ['filesystem'],
    context_handoff: {
      pinned_context: [
        {
          id: 'pin-1',
          title: 'Reporting unit',
          content: 'Use VND millions.',
          source: 'manual',
          created_at: 1,
          updated_at: 1,
        },
      ],
    },
  },
} satisfies Extract<TChatConversation, { type: 'aionrs' }>;

describe('buildContextHandoffExtraPatch', () => {
  it('patches only context_handoff so immutable skills and MCP snapshots are not resent', () => {
    const patch = buildContextHandoffExtraPatch(conversation, {
      context_file_name: 'Context.md',
      context_file_path: '/workspace/Context.md',
    });

    expect(patch).toEqual({
      context_handoff: {
        pinned_context: conversation.extra.context_handoff?.pinned_context,
        context_file_name: 'Context.md',
        context_file_path: '/workspace/Context.md',
      },
    });
    expect(patch).not.toHaveProperty('skills');
    expect(patch).not.toHaveProperty('mcp_servers');
    expect(patch).not.toHaveProperty('workspace');
  });
});
