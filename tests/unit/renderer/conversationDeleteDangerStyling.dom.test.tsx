/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Message, Modal } from '@arco-design/web-react';
import { useConversationActions } from '@/renderer/pages/conversation/GroupedHistory/hooks/useConversationActions';

// Deleting a conversation is irreversible, so its confirm must read as danger (red),
// not warning (orange). Asserted on the argument handed to Modal.confirm rather than on
// rendered DOM: Arco portals the dialog, and the styling contract lives in okButtonProps.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/common', () => ({
  ipcBridge: { conversation: { remove: { invoke: vi.fn().mockResolvedValue(true) } } },
}));

const wrapper = ({ children }: { children: React.ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

const setup = (selected: string[] = []) =>
  renderHook(
    () =>
      useConversationActions({
        batchMode: selected.length > 0,
        selectedConversationIds: new Set(selected),
        setSelectedConversationIds: vi.fn(),
        toggleSelectedConversation: vi.fn(),
        markAsRead: vi.fn(),
      }),
    { wrapper }
  );

describe('conversation delete confirmations', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Arco's Message mounts through the legacy ReactDOM.render, which React 18 removed;
    // letting it run for real throws an unhandled error out of the test.
    vi.spyOn(Message, 'warning').mockReturnValue(undefined as never);
  });

  it('confirms a single delete in danger red', () => {
    const confirm = vi.spyOn(Modal, 'confirm').mockReturnValue({ close: vi.fn() } as never);

    setup().result.current.handleDeleteClick('conv-1');

    expect(confirm).toHaveBeenCalledTimes(1);
    const arg = confirm.mock.calls[0][0] as { okButtonProps?: { status?: string } };
    expect(arg.okButtonProps?.status).toBe('danger');
    expect(arg.okButtonProps?.status).not.toBe('warning');
  });

  it('confirms a batch delete in danger red', () => {
    const confirm = vi.spyOn(Modal, 'confirm').mockReturnValue({ close: vi.fn() } as never);

    setup(['conv-1', 'conv-2']).result.current.handleBatchDelete();

    expect(confirm).toHaveBeenCalledTimes(1);
    const arg = confirm.mock.calls[0][0] as { okButtonProps?: { status?: string } };
    expect(arg.okButtonProps?.status).toBe('danger');
  });

  it('does not confirm at all when a batch delete has no selection', () => {
    const confirm = vi.spyOn(Modal, 'confirm').mockReturnValue({ close: vi.fn() } as never);

    setup([]).result.current.handleBatchDelete();

    expect(confirm).not.toHaveBeenCalled();
  });
});
