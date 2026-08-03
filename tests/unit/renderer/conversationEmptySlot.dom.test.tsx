/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import ChatConversation from '@/renderer/pages/conversation/components/ChatConversation';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

// Each platform wrapper is stubbed to render whatever `emptySlot` it was handed, so the test
// asserts the wiring in ChatConversation rather than MessageList's already-covered behaviour.
const { renderEmptySlot } = vi.hoisted(() => ({
  renderEmptySlot: (name: string) => ({
    default: ({ emptySlot }: { emptySlot?: React.ReactNode }) => (
      <div data-testid={`platform-${name}`}>{emptySlot ?? null}</div>
    ),
  }),
}));

vi.mock('@/renderer/pages/conversation/platforms/acp/AcpChat', () => renderEmptySlot('acp'));
vi.mock('@/renderer/pages/conversation/platforms/aionrs/AionrsChat', () => renderEmptySlot('aionrs'));
vi.mock('@/renderer/pages/conversation/platforms/legacy/LegacyReadOnlyConversation', () => renderEmptySlot('legacy'));
vi.mock('@/renderer/pages/conversation/components/ChatLayout', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/renderer/pages/conversation/components/ChatSlider.tsx', () => ({ default: () => null }));
vi.mock('@/renderer/pages/conversation/platforms/aionrs/AionrsModelSelector', () => ({ default: () => null }));
vi.mock('@/renderer/pages/conversation/platforms/gemini/GoogleModelSelector', () => ({ default: () => null }));
vi.mock('@/renderer/components/agent/AcpModelSelector', () => ({ default: () => null }));
vi.mock('@/renderer/pages/cron', () => ({ CronJobManager: () => null }));
vi.mock('@/renderer/pages/conversation/knowledge/KnowledgeCitationsContext', () => ({
  KnowledgeCitationsProvider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/renderer/pages/conversation/hooks/useActiveLease', () => ({ useActiveLease: vi.fn() }));
vi.mock('@/renderer/hooks/agent/usePresetAssistantInfo', () => ({
  usePresetAssistantInfo: () => ({ info: undefined, isLoading: false }),
}));
vi.mock('@/renderer/hooks/agent/useAcpConfigOptions', () => ({
  classifyConfigSetError: () => 'unknown',
  useAcpConfigOptions: () => ({ thoughtLevel: undefined, setStatus: undefined, setConfigOption: vi.fn() }),
}));
vi.mock('@/renderer/hooks/context/LayoutContext', () => ({ useLayoutContext: () => ({ isMobile: false }) }));
vi.mock('@/renderer/pages/conversation/runtime/useConversationRuntimeView', () => ({
  useConversationRuntimeView: () => ({ activeTurnId: undefined, markStopAcknowledged: vi.fn() }),
}));
vi.mock('@/renderer/pages/conversation/platforms/aionrs/useAionrsModelSelection', () => ({
  useAionrsModelSelection: () => ({}),
}));
vi.mock('@/common', () => ({ ipcBridge: { conversation: {} } }));
vi.mock('swr', () => ({ default: () => ({ data: undefined, isLoading: false, mutate: vi.fn() }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

const conversationOfType = (type: string): TChatConversation =>
  ({ id: `c-${type}`, name: 'chat', type, extra: {} }) as unknown as TChatConversation;

describe('solo conversation empty state', () => {
  it('supplies a greeting to the acp platform', () => {
    render(<ChatConversation conversation={conversationOfType('acp')} />);
    expect(screen.getByTestId('platform-acp').textContent).toBe('conversation.emptyChat');
  });

  it('supplies a greeting to the aionrs platform', () => {
    render(<ChatConversation conversation={conversationOfType('aionrs')} />);
    expect(screen.getByTestId('platform-aionrs').textContent).toBe('conversation.emptyChat');
  });

  it('supplies none to a read-only legacy conversation', () => {
    // Inviting someone to start typing in a conversation they cannot type into is a bug.
    render(<ChatConversation conversation={conversationOfType('gemini')} />);
    expect(screen.getByTestId('platform-legacy').textContent).toBe('');
  });
});
