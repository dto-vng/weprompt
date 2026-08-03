/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

const modalSpy = vi.fn();
vi.mock('@/renderer/components/settings/SettingsModal/contents/FeedbackReportModal', () => ({
  __esModule: true,
  default: (props: {
    visible: boolean;
    onCancel: () => void;
    defaultModule?: string;
    prefilledScreenshots?: Array<{ filename: string; data: Uint8Array; type: string }>;
  }) => {
    modalSpy(props);
    if (!props.visible) return null;
    return (
      <div data-testid='modal-stub'>
        <span>{props.defaultModule ?? 'none'}</span>
        <span>{props.prefilledScreenshots?.length ?? 0}</span>
        <button type='button' onClick={props.onCancel}>
          close
        </button>
      </div>
    );
  },
}));

import { FeedbackProvider, useFeedback } from '@/renderer/hooks/context/FeedbackContext';

type CaptureFn = () => Promise<{ filename: string; data: number[] } | null>;

function setElectronAPI(options?: { capture?: CaptureFn; exportAvailable?: boolean }): void {
  (window as unknown as { electronAPI?: Record<string, unknown> }).electronAPI = options?.exportAvailable
    ? {
        captureFeedbackScreenshot: options.capture,
        exportLocalFeedbackDiagnostics: vi.fn(),
      }
    : undefined;
}

const Trigger: React.FC<{ autoScreenshot?: boolean; module?: string }> = ({ autoScreenshot, module }) => {
  const { isFeedbackAvailable, openFeedback } = useFeedback();
  return (
    <button
      type='button'
      data-available={String(isFeedbackAvailable)}
      onClick={() => void openFeedback({ autoScreenshot, module })}
    >
      open
    </button>
  );
};

describe('FeedbackProvider / useFeedback', () => {
  beforeEach(() => {
    modalSpy.mockClear();
    setElectronAPI();
  });

  afterEach(() => cleanup());

  it('hides the unsupported feedback modal in WebUI/browser mode', async () => {
    const user = userEvent.setup();
    render(
      <FeedbackProvider>
        <Trigger module='mcp-tools' />
      </FeedbackProvider>
    );

    expect(document.querySelector('button')?.dataset.available).toBe('false');
    expect(modalSpy).not.toHaveBeenCalled();
    await user.click(document.querySelector('button')!);
    expect(modalSpy).not.toHaveBeenCalled();
  });

  it('mounts one hidden modal when local Electron export is available', () => {
    setElectronAPI({ exportAvailable: true });
    render(
      <FeedbackProvider>
        <Trigger />
      </FeedbackProvider>
    );

    expect(modalSpy).toHaveBeenCalled();
    expect(modalSpy.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ visible: false }));
  });

  it('opens the modal and forwards the selected module', async () => {
    setElectronAPI({ exportAvailable: true });
    const user = userEvent.setup();
    render(
      <FeedbackProvider>
        <Trigger module='mcp-tools' />
      </FeedbackProvider>
    );

    await user.click(document.querySelector('button')!);
    expect(modalSpy.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ defaultModule: 'mcp-tools', visible: true })
    );
  });

  it('captures a screenshot only through the authorized Electron bridge', async () => {
    const capture = vi.fn().mockResolvedValue({ filename: 'shot.png', data: [1, 2, 3, 4] });
    setElectronAPI({ capture, exportAvailable: true });
    const user = userEvent.setup();
    render(
      <FeedbackProvider>
        <Trigger autoScreenshot module='agent-detection' />
      </FeedbackProvider>
    );

    await user.click(document.querySelector('button')!);
    await waitFor(() => {
      expect(modalSpy.mock.calls.at(-1)?.[0]).toEqual(
        expect.objectContaining({
          prefilledScreenshots: [expect.objectContaining({ filename: 'shot.png' })],
          visible: true,
        })
      );
    });
    expect(capture).toHaveBeenCalledOnce();
  });

  it('clears screenshots when the modal is cancelled', async () => {
    const capture = vi.fn().mockResolvedValue({ filename: 'shot.png', data: [1, 2, 3, 4] });
    setElectronAPI({ capture, exportAvailable: true });
    const user = userEvent.setup();
    const view = render(
      <FeedbackProvider>
        <Trigger autoScreenshot />
      </FeedbackProvider>
    );
    await user.click(document.querySelector('button')!);
    await view.findByTestId('modal-stub');
    await user.click(view.getByText('close'));

    expect(modalSpy.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ prefilledScreenshots: undefined, visible: false })
    );
  });

  it('returns an unavailable no-op outside the provider', async () => {
    const user = userEvent.setup();
    render(<Trigger />);
    expect(document.querySelector('button')?.dataset.available).toBe('false');
    await expect(user.click(document.querySelector('button')!)).resolves.toBeUndefined();
  });
});
