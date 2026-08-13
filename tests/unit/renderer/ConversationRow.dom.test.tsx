/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import type { ConversationRowProps } from '@/renderer/pages/conversation/GroupedHistory/types';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@/renderer/hooks/agent/usePresetAssistantInfo', () => ({
  usePresetAssistantInfo: () => ({ info: undefined }),
}));

vi.mock('@/renderer/utils/model/agentLogo', () => ({
  useAgentLogos: () => ({}),
}));

vi.mock('@/renderer/utils/ui/siderTooltip', () => ({
  cleanupSiderTooltips: vi.fn(),
  getSiderTooltipProps: (enabled = false) => ({
    disabled: !enabled,
    popupVisible: enabled,
    unmountOnExit: true,
    popupHoverStay: false,
    getPopupContainer: () => document.body,
  }),
}));

vi.mock('@/renderer/pages/cron', () => ({
  CronJobIndicator: ({ status }: { status: string }) => <span data-testid={`cron-status-${status}`} />,
}));

vi.mock('@/renderer/pages/conversation/utils/conversationAssistantIdentity', () => ({
  resolveConversationLeadingMark: () => ({ kind: 'image', value: 'assistant.png', label: 'Agent' }),
}));

import ConversationRow from '@/renderer/pages/conversation/GroupedHistory/ConversationRow';

const conversation = {
  id: 'conversation-1',
  name: 'Review the release notes',
  created_at: 1,
  modified_at: 1,
  type: 'acp',
  model: { provider: 'openai', model: 'gpt-5' },
  extra: { backend: 'codex' },
} satisfies TChatConversation;

const waitingApprovalConversation = {
  ...conversation,
  runtime: {
    state: 'waiting_confirmation',
    can_send_message: false,
    has_task: true,
    task_status: 'running',
    is_processing: true,
    pending_confirmations: 1,
    turn_id: 'turn-1',
  },
} satisfies TChatConversation;

const buildProps = (overrides: Partial<ConversationRowProps> = {}): ConversationRowProps => ({
  conversation,
  isGenerating: false,
  completion: undefined,
  recentFailureAt: undefined,
  recentStoppedAt: undefined,
  collapsed: false,
  tooltipEnabled: false,
  batchMode: false,
  checked: false,
  selected: false,
  menuVisible: false,
  onToggleChecked: vi.fn(),
  onConversationClick: vi.fn(),
  onOpenMenu: vi.fn(),
  onMenuVisibleChange: vi.fn(),
  onEditStart: vi.fn(),
  onDelete: vi.fn(),
  onTogglePin: vi.fn(),
  getJobStatus: () => 'none',
  ...overrides,
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ConversationRow status', () => {
  it('shows a running indicator while a chat is generating', () => {
    render(<ConversationRow {...buildProps({ isGenerating: true })} />);

    expect(screen.getByTestId('conversation-status-running-conversation-1')).toBeInTheDocument();
    expect(screen.queryByAltText('Agent')).not.toBeInTheDocument();
  });

  it('keeps an idle chat free of a leading logo', () => {
    render(<ConversationRow {...buildProps()} />);

    expect(screen.queryByAltText('Agent')).not.toBeInTheDocument();
    expect(screen.queryByTestId('conversation-status-idle-conversation-1')).not.toBeInTheDocument();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('keeps an unseen completion green after sixty seconds', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-14T00:01:00Z'));

    render(<ConversationRow {...buildProps({ completion: { completedAt: Date.now() - 60_000 } })} />);

    expect(screen.getByTestId('conversation-status-done-conversation-1')).toBeInTheDocument();
  });

  it('turns a seen completion grey at its original sixty-second deadline', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-14T00:00:00Z'));
    const completedAt = Date.now();

    render(
      <ConversationRow
        {...buildProps({
          completion: { completedAt, seenAt: completedAt + 30_000 },
        })}
      />
    );

    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByTestId('conversation-status-done_idle-conversation-1')).toHaveAccessibleName(
      `${conversation.name} conversation.statusTooltip.doneIdle`
    );
  });

  it('renders a seen completion grey immediately when opened after sixty seconds', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-14T00:01:00Z'));
    const completedAt = Date.now() - 60_000;

    render(
      <ConversationRow
        {...buildProps({
          completion: { completedAt, seenAt: completedAt + 30_000 },
        })}
      />
    );

    expect(screen.getByTestId('conversation-status-done_idle-conversation-1')).toBeInTheDocument();
  });

  it('resumes only the remaining completion time after remounting', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-14T00:00:00Z'));
    const completedAt = Date.now();
    const completion = { completedAt, seenAt: completedAt + 10_000 };
    const firstRender = render(<ConversationRow {...buildProps({ completion })} />);

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(vi.getTimerCount()).toBe(1);
    firstRender.unmount();
    expect(vi.getTimerCount()).toBe(0);
    render(<ConversationRow {...buildProps({ completion })} />);

    act(() => {
      vi.advanceTimersByTime(29_999);
    });
    expect(screen.getByTestId('conversation-status-done-conversation-1')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByTestId('conversation-status-done_idle-conversation-1')).toBeInTheDocument();
  });

  it('keeps an unseen completion green after status-tooltip timers run', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-14T00:00:00Z'));

    render(<ConversationRow {...buildProps({ completion: { completedAt: Date.now() } })} />);

    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByTestId('conversation-status-done-conversation-1')).toBeInTheDocument();
  });

  it('shows stopped for sixty seconds and then returns to neutral idle', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-14T00:00:00Z'));

    render(<ConversationRow {...buildProps({ recentStoppedAt: Date.now() })} />);
    expect(screen.getByTestId('conversation-status-stopped-conversation-1')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.queryByTestId('conversation-status-stopped-conversation-1')).not.toBeInTheDocument();
  });

  it('keeps the title visible while a generating chat waits for confirmation', () => {
    render(<ConversationRow {...buildProps({ conversation: waitingApprovalConversation, isGenerating: true })} />);

    expect(screen.getByTestId('conversation-status-needs_you-conversation-1')).toHaveAccessibleName(
      `${conversation.name} conversation.statusTooltip.waitingApproval`
    );
    expect(screen.getByText(conversation.name)).toBeInTheDocument();
    expect(screen.queryByTestId('conversation-status-running-conversation-1')).not.toBeInTheDocument();
  });

  it('keeps the selected row background while approval is required', () => {
    render(
      <ConversationRow
        {...buildProps({ conversation: waitingApprovalConversation, isGenerating: true, selected: true })}
      />
    );

    expect(document.getElementById('c-conversation-1')).toHaveClass('!bg-fill-3');
  });

  it('uses the approval mark when a collapsed chat waits for confirmation', () => {
    render(
      <ConversationRow
        {...buildProps({ conversation: waitingApprovalConversation, isGenerating: true, collapsed: true })}
      />
    );

    expect(screen.getByTestId('conversation-status-needs_you-conversation-1')).toHaveAccessibleName(
      `${conversation.name} conversation.statusTooltip.waitingApproval`
    );
    expect(screen.queryByTestId('conversation-status-running-conversation-1')).not.toBeInTheDocument();
  });

  it('keeps the conversation name in the collapsed approval tooltip', async () => {
    render(
      <ConversationRow
        {...buildProps({
          conversation: waitingApprovalConversation,
          isGenerating: true,
          collapsed: true,
          tooltipEnabled: true,
        })}
      />
    );

    const tooltipContent = await waitFor(() => {
      const content = document.querySelector('[role="tooltip"] .arco-tooltip-content-inner');
      expect(content).not.toBeNull();
      return content;
    });
    expect(tooltipContent).toHaveTextContent(conversation.name);
    expect(tooltipContent).toHaveTextContent('conversation.statusTooltip.waitingApproval');
    expect(document.querySelectorAll('[role="tooltip"]')).toHaveLength(1);
  });

  it('shows approval when pending confirmations are reported without the waiting state', () => {
    const countOnlyApprovalConversation = {
      ...waitingApprovalConversation,
      runtime: {
        ...waitingApprovalConversation.runtime,
        state: 'running',
      },
    } satisfies TChatConversation;

    render(<ConversationRow {...buildProps({ conversation: countOnlyApprovalConversation, isGenerating: true })} />);

    expect(screen.getByTestId('conversation-status-needs_you-conversation-1')).toBeInTheDocument();
    expect(screen.queryByTestId('conversation-status-running-conversation-1')).not.toBeInTheDocument();
  });

  it('shows a failed mark until the data layer clears the failure timestamp', () => {
    render(<ConversationRow {...buildProps({ recentFailureAt: Date.now() })} />);

    expect(screen.getByTestId('conversation-status-failed-conversation-1')).toHaveAccessibleName(
      `${conversation.name} conversation.statusTooltip.failed`
    );
    expect(screen.getByText(conversation.name)).toBeInTheDocument();
  });

  it('keeps failure visible when generating is also reported', () => {
    render(<ConversationRow {...buildProps({ recentFailureAt: Date.now(), isGenerating: true })} />);

    expect(screen.getByTestId('conversation-status-failed-conversation-1')).toBeInTheDocument();
    expect(screen.queryByTestId('conversation-status-running-conversation-1')).not.toBeInTheDocument();
  });

  it.each([
    [
      'an unseen green completion',
      { completion: { completedAt: Date.now() } },
      'done',
      'conversation.statusTooltip.doneUnseen',
    ],
    [
      'a recently viewed green completion',
      { completion: { completedAt: Date.now(), seenAt: Date.now() } },
      'done',
      'conversation.statusTooltip.doneSeen',
    ],
    [
      'a viewed grey completion',
      { completion: { completedAt: 1, seenAt: 2 } },
      'done_idle',
      'conversation.statusTooltip.doneIdle',
    ],
  ] satisfies Array<[string, Partial<ConversationRowProps>, string, string]>)(
    'explains %s from the status icon',
    async (_caseName, statusProps, status, tooltipKey) => {
      render(<ConversationRow {...buildProps(statusProps)} />);

      expect(screen.getByTestId(`conversation-status-${status}-conversation-1`)).toHaveAccessibleName(
        `${conversation.name} ${tooltipKey}`
      );
      expect(await screen.findByRole('tooltip')).toHaveTextContent(tooltipKey);
    }
  );

  it.each([
    [
      'needs_you',
      { conversation: waitingApprovalConversation, isGenerating: true },
      'conversation.statusTooltip.waitingApproval',
    ],
    ['running', { isGenerating: true }, 'conversation.statusTooltip.running'],
    ['stopped', { recentStoppedAt: Date.now() }, 'conversation.statusTooltip.stopped'],
    ['failed', { recentFailureAt: Date.now() }, 'conversation.statusTooltip.failed'],
  ] satisfies Array<[string, Partial<ConversationRowProps>, string]>)(
    'shows the explanatory tooltip for %s',
    async (status, statusProps, tooltipKey) => {
      render(<ConversationRow {...buildProps(statusProps)} />);

      expect(screen.getByTestId(`conversation-status-${status}-conversation-1`)).toHaveAccessibleName(
        `${conversation.name} ${tooltipKey}`
      );
      expect(await screen.findByRole('tooltip')).toHaveTextContent(tooltipKey);
    }
  );

  it.each([
    ['needs_you', { conversation: waitingApprovalConversation }],
    ['failed', { recentFailureAt: 1 }],
    ['running', { isGenerating: true }],
    ['stopped', { recentStoppedAt: Date.now() }],
    ['done', { completion: { completedAt: Date.now() } }],
    ['done_idle', { completion: { completedAt: 1, seenAt: 2 } }],
  ] satisfies Array<[string, Partial<ConversationRowProps>]>)(
    'keeps the assistant identity for %s in batch mode',
    (_status, statusProps) => {
      render(
        <ConversationRow
          {...buildProps({
            ...statusProps,
            batchMode: true,
            getJobStatus: () => 'active',
          })}
        />
      );

      expect(screen.getByAltText('Agent')).toBeInTheDocument();
      expect(screen.queryByTestId('cron-status-active')).not.toBeInTheDocument();
    }
  );

  it('lets a cron indicator override a quiet grey completion', () => {
    render(
      <ConversationRow
        {...buildProps({
          completion: { completedAt: 1, seenAt: 2 },
          getJobStatus: () => 'active',
        })}
      />
    );

    expect(screen.getByTestId('cron-status-active')).toBeInTheDocument();
    expect(screen.queryByTestId('conversation-status-done_idle-conversation-1')).not.toBeInTheDocument();
  });

  it.each([
    ['done', { completion: { completedAt: Date.now() } }],
    ['stopped', { recentStoppedAt: Date.now() }],
  ] satisfies Array<[string, Partial<ConversationRowProps>]>)(
    'shows %s instead of the scheduled-task indicator',
    (status, statusProps) => {
      render(
        <ConversationRow
          {...buildProps({
            ...statusProps,
            getJobStatus: () => 'active',
          })}
        />
      );

      expect(screen.getByTestId(`conversation-status-${status}-conversation-1`)).toBeInTheDocument();
      expect(screen.queryByTestId('cron-status-active')).not.toBeInTheDocument();
    }
  );

  it('fades a pinned quiet completion so the pin can replace it on hover', () => {
    const pinnedConversation = {
      ...conversation,
      extra: { ...conversation.extra, pinned: true },
    } satisfies TChatConversation;

    const { container } = render(
      <ConversationRow
        {...buildProps({
          conversation: pinnedConversation,
          completion: { completedAt: 1, seenAt: 2 },
        })}
      />
    );

    expect(screen.getByTestId('conversation-status-done_idle-conversation-1')).toHaveClass(
      'group-hover:opacity-0',
      'transition-opacity'
    );
    expect(container.querySelector('.group-hover\\:opacity-100')).toBeInTheDocument();
  });

  it('shows actionable approval instead of the scheduled-task indicator', () => {
    render(
      <ConversationRow
        {...buildProps({
          conversation: waitingApprovalConversation,
          getJobStatus: () => 'active',
        })}
      />
    );

    expect(screen.getByTestId('conversation-status-needs_you-conversation-1')).toBeInTheDocument();
    expect(screen.queryByTestId('cron-status-active')).not.toBeInTheDocument();
  });

  it('does not fade an actionable mark on a pinned row', () => {
    const pinnedApprovalConversation = {
      ...waitingApprovalConversation,
      extra: { ...waitingApprovalConversation.extra, pinned: true },
    } satisfies TChatConversation;

    render(<ConversationRow {...buildProps({ conversation: pinnedApprovalConversation })} />);

    expect(screen.getByTestId('conversation-status-needs_you-conversation-1')).not.toHaveClass('group-hover:opacity-0');
  });
});

describe('ConversationRow keyboard access', () => {
  // The row is the app's primary way to switch conversations. It stays a div because it
  // carries absolutely-positioned overlays and group-hover children that Arco's .arco-btn
  // display rule breaks, so it has to take button semantics by hand.
  it('is reachable and activated by keyboard, not mouse only', () => {
    const onConversationClick = vi.fn();
    render(<ConversationRow {...buildProps({ onConversationClick })} />);

    const row = screen.getByRole('button', { name: 'Review the release notes' });
    expect(row).toHaveAttribute('tabindex', '0');

    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onConversationClick).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(row, { key: ' ' });
    expect(onConversationClick).toHaveBeenCalledTimes(2);
  });

  it('ignores keys that are not Enter or Space', () => {
    const onConversationClick = vi.fn();
    render(<ConversationRow {...buildProps({ onConversationClick })} />);

    const row = screen.getByRole('button', { name: 'Review the release notes' });
    fireEvent.keyDown(row, { key: 'a' });
    fireEvent.keyDown(row, { key: 'Tab' });
    fireEvent.keyDown(row, { key: 'ArrowDown' });

    expect(onConversationClick).not.toHaveBeenCalled();
  });

  it('carries a focus-visible treatment so keyboard position is visible', () => {
    render(<ConversationRow {...buildProps()} />);
    const row = screen.getByRole('button', { name: 'Review the release notes' });
    // jsdom applies no UnoCSS, so the class is the only assertable signal; the ring was
    // confirmed to actually paint by reading computed styles in the running app.
    expect(row.className).toContain('focus-visible:[outline:1px_solid_rgb(var(--primary-6))]');
  });
});

describe('ConversationRow overflow actions', () => {
  // The action cluster was display:none until mouse hover with no focus-within
  // variant, so pin/rename/delete/export were unreachable without a mouse even
  // once the row itself became focusable.
  it('reveals the action cluster on focus as well as hover', () => {
    render(<ConversationRow {...buildProps()} />);
    const trigger = screen.getByTestId('conversation-row-menu-conversation-1');
    expect(trigger.className).toContain('group-hover:flex');
    expect(trigger.className).toContain('group-focus-within:flex');
  });

  it('opens the menu from the keyboard', () => {
    const onOpenMenu = vi.fn();
    render(<ConversationRow {...buildProps({ onOpenMenu })} />);
    const trigger = screen.getByTestId('conversation-row-menu-conversation-1');

    expect(trigger).toHaveAttribute('role', 'button');
    expect(trigger).toHaveAttribute('tabindex', '0');
    expect(trigger).toHaveAttribute('aria-label', 'conversation.history.moreActions');

    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(onOpenMenu).toHaveBeenCalledTimes(1);
  });

  it('does not also fire the row when the trigger is keyed', () => {
    // The trigger sits inside the row, so without stopPropagation an Enter on the
    // menu would both open the menu and navigate away from the conversation.
    const onOpenMenu = vi.fn();
    const onConversationClick = vi.fn();
    render(<ConversationRow {...buildProps({ onOpenMenu, onConversationClick })} />);

    fireEvent.keyDown(screen.getByTestId('conversation-row-menu-conversation-1'), { key: 'Enter' });

    expect(onOpenMenu).toHaveBeenCalledTimes(1);
    expect(onConversationClick).not.toHaveBeenCalled();
  });
});
