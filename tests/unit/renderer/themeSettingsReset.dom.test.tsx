/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  setFontScale: vi.fn(),
  getFontScale: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => (key === 'settings.scaleReset' ? 'Reset' : key),
  }),
}));

vi.mock('@renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({
    fontScale: mocks.getFontScale(),
    setFontScale: mocks.setFontScale,
    theme: 'light',
  }),
}));

vi.mock('@renderer/hooks/context/ThemeContext.tsx', () => ({
  useThemeContext: () => ({
    fontScale: mocks.getFontScale(),
    setFontScale: mocks.setFontScale,
    theme: 'light',
  }),
}));

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({
    fontScale: mocks.getFontScale(),
    setFontScale: mocks.setFontScale,
    theme: 'light',
  }),
}));

describe('ScaleControl reset action', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFontScale.mockReturnValue(1.18);
  });

  const renderScaleControl = async () => {
    const { default: ScaleControl } = await import('@renderer/components/settings/ScaleControl');
    render(<ScaleControl />);
  };

  it('renders reset as a neutral secondary action instead of primary text', async () => {
    await renderScaleControl();

    const reset = screen.getByRole('button', { name: 'Reset' });

    expect(reset).toHaveClass('arco-btn-secondary');
    expect(reset).not.toHaveClass('arco-btn-primary');
    expect(reset).not.toHaveStyle({ color: 'rgb(var(--primary-6))' });
  });
});
