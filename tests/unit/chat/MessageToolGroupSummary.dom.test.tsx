/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { IMessageAcpToolCall, IMessageToolCall } from '@/common/chat/chatLib';
import MessageToolGroupSummary from '@/renderer/pages/conversation/Messages/components/MessageToolGroupSummary';

// LocalImageView owns the image render, click-to-enlarge preview, and download;
// mock it to a simple img so these tests focus on MessageToolGroupSummary wiring.
vi.mock('@/renderer/components/media/LocalImageView', () => ({
  __esModule: true,
  default: ({ src, alt, className }: { src: string; alt: string; className?: string }) => (
    <img src={src} alt={alt} className={className} data-testid='local-image' />
  ),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('MessageToolGroupSummary ACP image output', () => {
  it('renders the generated image prominently (not gated behind technical details)', () => {
    const imagePath = '/Users/test/.codex/generated_images/session/ig_test_image.png';
    const message: IMessageAcpToolCall = {
      id: 'ig_test_image',
      conversation_id: 'conv-1',
      type: 'acp_tool_call',
      content: {
        sessionId: 'sess-1',
        update: {
          sessionUpdate: 'tool_call_update',
          tool_call_id: 'ig_test_image',
          status: 'completed',
          title: 'Image generation',
          kind: 'execute',
          raw_output: { image: { path: imagePath } },
          content: [{ type: 'content', content: { type: 'text', text: 'Revised prompt: 一张小猫照片' } }],
        },
      },
    };

    render(<MessageToolGroupSummary messages={[message]} />);

    // The image is visible without expanding the technical-details toggle.
    const image = screen.getByTestId('local-image');
    expect(image).toHaveAttribute('src', imagePath);
    expect(image).toHaveAttribute('alt', 'ig_test_image.png');
  });

  it('renders the generated image for an aionrs (tool_call) image result', () => {
    const imagePath = '/Users/me/Library/Application Support/Forge-Dev/aionui/img-1.png';
    const message: IMessageToolCall = {
      id: 'tc-1',
      conversation_id: 'conv-1',
      type: 'tool_call',
      content: {
        call_id: 'tc-1',
        name: 'aionui_image_generation',
        status: 'completed',
        output: `Generated image saved to: ${imagePath}`,
      },
    } as unknown as IMessageToolCall;

    render(<MessageToolGroupSummary messages={[message]} />);

    const image = screen.getByTestId('local-image');
    expect(image).toHaveAttribute('src', imagePath);
  });

  it('does not render an image for tool calls without image output', () => {
    const message: IMessageToolCall = {
      id: 'tool-1',
      conversation_id: 'conv-1',
      type: 'tool_call',
      content: {
        call_id: 'tool-1',
        name: 'Shell Command',
        args: {},
        status: 'completed',
      },
    };

    render(<MessageToolGroupSummary messages={[message]} />);
    fireEvent.click(screen.getByText('common.technical_details'));

    expect(screen.queryByTestId('local-image')).not.toBeInTheDocument();
  });
});

describe('MessageToolGroupSummary plain-language activity', () => {
  const acpStep = (status: string, toolCallId: string): IMessageAcpToolCall =>
    ({
      id: toolCallId,
      conversation_id: 'conv-1',
      type: 'acp_tool_call',
      content: {
        sessionId: 'sess-1',
        update: {
          sessionUpdate: 'tool_call_update',
          tool_call_id: toolCallId,
          status,
          title: 'forge-reports_render_report',
          kind: 'execute',
        },
      },
    }) as unknown as IMessageAcpToolCall;

  it('does not show token watermark telemetry in technical details', () => {
    const diagnosticStep: IMessageAcpToolCall = {
      id: 'token-watermark-1',
      conversation_id: 'conv-1',
      type: 'acp_tool_call',
      content: {
        sessionId: 'sess-1',
        update: {
          sessionUpdate: 'tool_call_update',
          tool_call_id: 'token-watermark-1',
          status: 'completed',
          title: 'Token watermark override: provider=0, local_estimate=19756, using=19756',
          kind: 'info',
        },
      },
    };

    render(<MessageToolGroupSummary messages={[acpStep('completed', 't1'), diagnosticStep]} />);
    fireEvent.click(screen.getByText('common.technical_details'));

    expect(screen.queryByText(/Token watermark override/)).not.toBeInTheDocument();
  });

  it('shows a single live line with the running label while working', () => {
    render(<MessageToolGroupSummary messages={[acpStep('in_progress', 't1')]} />);
    expect(screen.getByText('messages.toolActivity.tools.render_report.running')).toBeInTheDocument();
    expect(screen.queryByText('common.technical_details')).not.toBeInTheDocument();
  });

  it('shows the done label and a technical-details toggle when settled', () => {
    render(<MessageToolGroupSummary messages={[acpStep('completed', 't1')]} />);
    expect(screen.getByText('messages.toolActivity.tools.render_report.done')).toBeInTheDocument();
    expect(screen.getByText('common.technical_details')).toBeInTheDocument();
  });

  it('coalesces consecutive retries into one live line with an attempt count', () => {
    render(
      <MessageToolGroupSummary
        messages={[acpStep('failed', 't1'), acpStep('failed', 't2'), acpStep('in_progress', 't3')]}
      />
    );
    expect(screen.getByText(/messages\.toolActivity\.tools\.render_report\.running/)).toBeInTheDocument();
    expect(screen.getByText(/messages\.toolActivity\.attempt/)).toBeInTheDocument();
  });

  it('renders a friendly error card for a final give-up', () => {
    render(<MessageToolGroupSummary messages={[acpStep('failed', 't1')]} />);
    expect(screen.getByText('messages.toolActivity.tools.render_report.failedTitle')).toBeInTheDocument();
    expect(screen.getByText('messages.toolActivity.error.suggestion')).toBeInTheDocument();
  });
});
