/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * White-box tests for FeedbackButton: verifies the text-link renders the
 * expected label and forwards the module + autoScreenshot flag to useFeedback.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from '@arco-design/web-react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

const feedbackState = vi.hoisted(() => ({
  isFeedbackAvailable: true,
  openFeedbackMock: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/renderer/hooks/context/FeedbackContext', () => ({
  useFeedback: () => ({
    isFeedbackAvailable: feedbackState.isFeedbackAvailable,
    openFeedback: feedbackState.openFeedbackMock,
  }),
}));

import FeedbackButton from '@/renderer/components/base/FeedbackButton';

const renderButton = (ui: React.ReactElement) => render(<ConfigProvider>{ui}</ConfigProvider>);

describe('FeedbackButton', () => {
  beforeEach(() => {
    feedbackState.isFeedbackAvailable = true;
    feedbackState.openFeedbackMock.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the one-click feedback label', () => {
    renderButton(<FeedbackButton module='mcp-tools' />);
    expect(screen.getByText('settings.oneClickFeedback')).toBeInTheDocument();
  });

  it('calls openFeedback with the given module and autoScreenshot=true on click', async () => {
    const user = userEvent.setup();
    renderButton(<FeedbackButton module='agent-detection' />);

    await user.click(screen.getByRole('button'));

    expect(feedbackState.openFeedbackMock).toHaveBeenCalledTimes(1);
    expect(feedbackState.openFeedbackMock).toHaveBeenCalledWith({
      module: 'agent-detection',
      autoScreenshot: true,
    });
  });

  it('stops click propagation so wrapping handlers do not fire', async () => {
    const parentClick = vi.fn();
    const user = userEvent.setup();
    renderButton(
      <div onClick={parentClick}>
        <FeedbackButton module='conversation-session' />
      </div>
    );

    await user.click(screen.getByRole('button'));

    expect(feedbackState.openFeedbackMock).toHaveBeenCalledTimes(1);
    expect(parentClick).not.toHaveBeenCalled();
  });

  it('still invokes openFeedback when module is omitted (undefined flows through)', async () => {
    const user = userEvent.setup();
    renderButton(<FeedbackButton />);

    await user.click(screen.getByRole('button'));

    expect(feedbackState.openFeedbackMock).toHaveBeenCalledWith({
      module: undefined,
      autoScreenshot: true,
    });
  });

  it('swallows rejections from openFeedback without throwing to the caller', async () => {
    feedbackState.openFeedbackMock.mockRejectedValueOnce(new Error('boom'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    renderButton(<FeedbackButton module='system-settings' />);

    await user.click(screen.getByRole('button'));
    // Let the rejected promise settle
    await Promise.resolve();
    await Promise.resolve();

    expect(feedbackState.openFeedbackMock).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('does not render a feedback entry point in browser/WebUI mode', () => {
    feedbackState.isFeedbackAvailable = false;
    renderButton(<FeedbackButton module='system-settings' />);
    expect(screen.queryByText('settings.oneClickFeedback')).not.toBeInTheDocument();
  });
});
