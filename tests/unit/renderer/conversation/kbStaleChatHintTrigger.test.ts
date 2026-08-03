/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { ISessionMcpServer } from '@/common/config/storage';
import { BUILTIN_KNOWLEDGE_NAME } from '@/common/knowledge/constants';
import {
  kbStaleHintDismissKey,
  shouldShowKbStaleHint,
  type KbStaleChatHintTrigger,
} from '@/renderer/pages/conversation/knowledge/useKbStaleChatHint';

const KNOWLEDGE_SERVER: ISessionMcpServer = {
  id: 'project-kb-p1',
  name: BUILTIN_KNOWLEDGE_NAME,
  transport: { type: 'stdio' },
};
const OTHER_SERVER: ISessionMcpServer = { id: 'mcp_1', name: 'greennode-idp', transport: { type: 'stdio' } };

/** aioncore owns this blob, so the guard is exercised with values the type forbids. */
const untyped = (value: unknown): ISessionMcpServer[] => value as ISessionMcpServer[];

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

  it('stays hidden for a chat that already has the knowledge server', () => {
    // The chat can search. Whether its subprocess has loaded the newest store
    // is not knowable from here, so there is nothing honest to say.
    expect(shouldShowKbStaleHint({ ...TRIGGERING, sessionMcpServers: [OTHER_SERVER, KNOWLEDGE_SERVER] })).toBe(false);
  });

  describe('truth table: exactly one of the 16 combinations shows the notice', () => {
    const dimensions = {
      project: [
        { label: 'project', value: 'p1' as string | undefined },
        { label: 'non-project', value: undefined },
      ],
      tool: [
        { label: 'lacks-tool', value: [OTHER_SERVER] },
        { label: 'has-tool', value: [OTHER_SERVER, KNOWLEDGE_SERVER] },
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
      expect(shouldShowKbStaleHint({ ...TRIGGERING, sessionMcpServers: untyped('aionui-project-knowledge') })).toBe(
        false
      );
      expect(shouldShowKbStaleHint({ ...TRIGGERING, sessionMcpServers: untyped({ name: 'x' }) })).toBe(false);
    });

    it('tolerates malformed entries inside the snapshot without throwing', () => {
      expect(shouldShowKbStaleHint({ ...TRIGGERING, sessionMcpServers: untyped([null, 7, 'x', {}]) })).toBe(true);
      expect(shouldShowKbStaleHint({ ...TRIGGERING, sessionMcpServers: untyped([null, KNOWLEDGE_SERVER]) })).toBe(
        false
      );
    });
  });
});

describe('kbStaleHintDismissKey', () => {
  it('namespaces the dismissal per conversation', () => {
    expect(kbStaleHintDismissKey('abc')).toBe('kb.staleHint.dismissed.abc');
    expect(kbStaleHintDismissKey('def')).not.toBe(kbStaleHintDismissKey('abc'));
  });
});
