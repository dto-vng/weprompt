/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageToolCall } from '@/common/chat/chatLib';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/renderer/components/base/FileChangesPanel', () => ({
  default: () => <div>file changes</div>,
}));

vi.mock('@/renderer/hooks/file/useDiffPreviewHandlers', () => ({
  useDiffPreviewHandlers: () => ({ handleFileClick: vi.fn(), handleDiffClick: vi.fn() }),
}));

import MessageToolCall from '@/renderer/pages/conversation/Messages/components/MessageToolCall';

describe('MessageToolCall', () => {
  it('does not render token watermark diagnostics as chat content', () => {
    const message: IMessageToolCall = {
      id: 'token-watermark-1',
      conversation_id: 'conv-1',
      type: 'tool_call',
      content: {
        call_id: 'token-watermark-1',
        name: 'Token watermark override: provider=0, local_estimate=19756, using=19756',
        status: 'completed',
      },
    };

    const { container } = render(<MessageToolCall message={message} />);

    expect(screen.queryByText(/Token watermark override/)).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });
});
