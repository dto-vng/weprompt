import { describe, expect, it, vi } from 'vitest';
import type { TMessage } from '@/common/chat/chatLib';
import type { TChatConversation } from '@/common/config/storage';
import { buildContextMarkdown, getContextFileName } from '@/renderer/pages/conversation/contextHandoff/contextMarkdown';

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
} satisfies TChatConversation;

const messages = [
  {
    id: 'm1',
    msg_id: 'm1',
    conversation_id: 'conv-1',
    type: 'text',
    position: 'right',
    content: { content: 'Build the OPEX dashboard.' },
  },
  {
    id: 'm2',
    msg_id: 'm2',
    conversation_id: 'conv-1',
    type: 'text',
    position: 'left',
    content: { content: 'Current state: chart spec is ready.' },
  },
] satisfies TMessage[];

describe('buildContextMarkdown', () => {
  it('creates the MVP section shape with conversation details and pinned context', () => {
    vi.setSystemTime(new Date('2026-07-09T00:00:00.000Z'));

    const markdown = buildContextMarkdown({ conversation, messages });

    expect(markdown).toContain('# Conversation Context');
    expect(markdown).toContain('## Goal');
    expect(markdown).toContain('Monthly Close');
    expect(markdown).toContain('Use VND millions.');
    expect(markdown).toContain('finance-close');
    expect(markdown).toContain('filesystem');
    expect(markdown).toContain('## Do Not Forget');
  });

  it('keeps exported context concise by using recent message excerpts instead of full transcript export', () => {
    const markdown = buildContextMarkdown({ conversation, messages, maxRecentMessages: 1 });

    expect(markdown).toContain('Current state: chart spec is ready.');
    expect(markdown).not.toContain('Build the OPEX dashboard.');
  });

  it('uses a stable safe filename for the context artifact', () => {
    expect(getContextFileName('Monthly Close / June')).toBe('Monthly Close - June Context.md');
  });
});
