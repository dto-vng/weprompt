/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import ThoughtDisplay from '@/renderer/components/chat/ThoughtDisplay';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light' }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

describe('ThoughtDisplay', () => {
  it('renders running state as a compact activity pill', () => {
    render(<ThoughtDisplay running />);

    const display = screen.getByTestId('thought-display');
    expect(display).toHaveClass('thought-display');
    expect(display).toHaveClass('thought-display--running');
    expect(display).not.toHaveClass('mb--20px');
    expect(display).not.toHaveClass('pb-30px');
    expect(display).not.toHaveClass('rd-t-20px');
    expect(screen.getByText('conversation.chat.processing')).toBeInTheDocument();
    expect(screen.getByText('(0s)')).toBeInTheDocument();
  });

  it('keeps thought text compact when a platform provides thought details', () => {
    render(<ThoughtDisplay running thought={{ subject: 'Planning', description: 'Checking files' }} />);

    const display = screen.getByTestId('thought-display');
    expect(display).toHaveClass('thought-display');
    expect(display).toHaveClass('thought-display--running');
    expect(screen.getByText('Planning')).toBeInTheDocument();
    expect(screen.getByText('Checking files')).toBeInTheDocument();
  });
});
