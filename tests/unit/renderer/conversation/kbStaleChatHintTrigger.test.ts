/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { BUILTIN_KNOWLEDGE_NAME } from '@/common/knowledge/constants';
import {
  kbChangedHintDismissKey,
  kbStaleHintDismissKey,
  shouldShowKbChangedHint,
  shouldShowKbStaleHint,
  type KbChangedChatHintTrigger,
  type KbStaleChatHintTrigger,
} from '@/renderer/pages/conversation/knowledge/useKbStaleChatHint';

const KNOWLEDGE_SERVER = { id: 'project-kb-p1', name: BUILTIN_KNOWLEDGE_NAME, transport: { type: 'stdio' } };
const OTHER_SERVER = { id: 'mcp_1', name: 'greennode-idp', transport: { type: 'stdio' } };

/** The one combination that must show the notice. */
const TRIGGERING: KbStaleChatHintTrigger = {
  conversationId: 'c1',
  projectId: 'p1',
  sessionMcpServers: [OTHER_SERVER],
  hasIndexedSource: true,
  dismissed: false,
};

describe('shouldShowKbStaleHint', () => {
  it('shows the notice for a project chat that lacks the knowledge server while the project has indexed sources', () => {
    expect(shouldShowKbStaleHint(TRIGGERING)).toBe(true);
  });

  it('shows it when the frozen snapshot is empty — the zero-ready-sources case at create time', () => {
    expect(shouldShowKbStaleHint({ ...TRIGGERING, sessionMcpServers: [] })).toBe(true);
  });

  describe('truth table: exactly one of the 16 combinations shows the notice', () => {
    const dimensions = {
      project: [
        { label: 'project', value: 'p1' as string | undefined },
        { label: 'non-project', value: undefined },
      ],
      tool: [
        { label: 'lacks-tool', value: [OTHER_SERVER] as unknown },
        { label: 'has-tool', value: [OTHER_SERVER, KNOWLEDGE_SERVER] as unknown },
      ],
      ready: [
        { label: 'ready-sources', value: true },
        { label: 'no-sources', value: false },
      ],
      dismissed: [
        { label: 'not-dismissed', value: false },
        { label: 'dismissed', value: true },
      ],
    };

    const cells: Array<{ name: string; trigger: KbStaleChatHintTrigger; expected: boolean }> = [];
    for (const project of dimensions.project) {
      for (const tool of dimensions.tool) {
        for (const ready of dimensions.ready) {
          for (const dismissed of dimensions.dismissed) {
            cells.push({
              name: `${project.label} × ${tool.label} × ${ready.label} × ${dismissed.label}`,
              trigger: {
                conversationId: 'c1',
                projectId: project.value,
                sessionMcpServers: tool.value,
                hasIndexedSource: ready.value,
                dismissed: dismissed.value,
              },
              expected:
                project.label === 'project' &&
                tool.label === 'lacks-tool' &&
                ready.label === 'ready-sources' &&
                dismissed.label === 'not-dismissed',
            });
          }
        }
      }
    }

    it('covers all 16 combinations', () => {
      expect(cells).toHaveLength(16);
      expect(cells.filter((cell) => cell.expected)).toHaveLength(1);
    });

    for (const cell of cells) {
      it(`${cell.name} → ${cell.expected ? 'shows' : 'hidden'}`, () => {
        expect(shouldShowKbStaleHint(cell.trigger)).toBe(cell.expected);
      });
    }
  });

  describe('fails closed on anything uncertain', () => {
    it('hides when there is no conversation id', () => {
      expect(shouldShowKbStaleHint({ ...TRIGGERING, conversationId: undefined })).toBe(false);
    });

    it('hides when the snapshot is absent — we cannot tell what the session was given', () => {
      expect(shouldShowKbStaleHint({ ...TRIGGERING, sessionMcpServers: undefined })).toBe(false);
    });

    it('hides when the snapshot is not an array', () => {
      expect(shouldShowKbStaleHint({ ...TRIGGERING, sessionMcpServers: 'aionui-project-knowledge' })).toBe(false);
      expect(shouldShowKbStaleHint({ ...TRIGGERING, sessionMcpServers: { name: 'x' } })).toBe(false);
    });

    it('tolerates malformed entries inside the snapshot without throwing', () => {
      expect(shouldShowKbStaleHint({ ...TRIGGERING, sessionMcpServers: [null, 7, 'x', {}] })).toBe(true);
      expect(shouldShowKbStaleHint({ ...TRIGGERING, sessionMcpServers: [null, KNOWLEDGE_SERVER] })).toBe(false);
    });
  });
});

describe('kbStaleHintDismissKey', () => {
  it('namespaces the dismissal per conversation', () => {
    expect(kbStaleHintDismissKey('abc')).toBe('kb.staleHint.dismissed.abc');
    expect(kbStaleHintDismissKey('def')).not.toBe(kbStaleHintDismissKey('abc'));
  });

  it('is a different key from the changed-hint dismissal, so one does not silence the other', () => {
    expect(kbChangedHintDismissKey('abc')).toBe('kb.changedHint.dismissed.abc');
    expect(kbChangedHintDismissKey('abc')).not.toBe(kbStaleHintDismissKey('abc'));
  });
});

/**
 * Case B: verified real on 2026-07-31 — a running session's knowledge subprocess
 * serves a snapshot frozen at spawn, so files indexed mid-chat are invisible to
 * it even though the chat has the tool.
 */
describe('shouldShowKbChangedHint', () => {
  const CHANGED: KbChangedChatHintTrigger = {
    conversationId: 'c1',
    projectId: 'p1',
    sessionMcpServers: [OTHER_SERVER, KNOWLEDGE_SERVER],
    knowledgeChangedSinceMount: true,
    dismissed: false,
  };

  it('shows when a chat that HAS the tool sees the knowledge base change under it', () => {
    expect(shouldShowKbChangedHint(CHANGED)).toBe(true);
  });

  it('stays hidden until something actually changes', () => {
    expect(shouldShowKbChangedHint({ ...CHANGED, knowledgeChangedSinceMount: false })).toBe(false);
  });

  it('stays hidden once dismissed', () => {
    expect(shouldShowKbChangedHint({ ...CHANGED, dismissed: true })).toBe(false);
  });

  it('defers to the stale notice for a chat that never had the tool', () => {
    const lacksTool = { ...CHANGED, sessionMcpServers: [OTHER_SERVER] };
    expect(shouldShowKbChangedHint(lacksTool)).toBe(false);
    // ...and that same conversation is exactly the stale case instead.
    expect(
      shouldShowKbStaleHint({
        conversationId: 'c1',
        projectId: 'p1',
        sessionMcpServers: [OTHER_SERVER],
        hasIndexedSource: true,
        dismissed: false,
      })
    ).toBe(true);
  });

  it('never shows both notices for the same conversation', () => {
    const withTool = {
      conversationId: 'c1',
      projectId: 'p1',
      sessionMcpServers: [OTHER_SERVER, KNOWLEDGE_SERVER],
      dismissed: false,
    };
    const stale = shouldShowKbStaleHint({ ...withTool, hasIndexedSource: true });
    const changed = shouldShowKbChangedHint({ ...withTool, knowledgeChangedSinceMount: true });
    expect(stale && changed).toBe(false);
  });

  it('fails closed for non-project chats and unreadable snapshots', () => {
    expect(shouldShowKbChangedHint({ ...CHANGED, projectId: undefined })).toBe(false);
    expect(shouldShowKbChangedHint({ ...CHANGED, conversationId: undefined })).toBe(false);
    expect(shouldShowKbChangedHint({ ...CHANGED, sessionMcpServers: undefined })).toBe(false);
    expect(shouldShowKbChangedHint({ ...CHANGED, sessionMcpServers: 'nope' })).toBe(false);
  });
});
