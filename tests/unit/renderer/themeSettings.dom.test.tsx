/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Theme } from '@/common/theme/types';
import { DARK_THEME_ID, LIGHT_THEME_ID } from '@/common/theme/constants';
import CssThemeSettings from '@/renderer/pages/settings/AppearanceSettings/CssThemeSettings';

const mocks = vi.hoisted(() => ({
  selectTheme: vi.fn(),
  getConfig: vi.fn(),
  getExtensionThemes: vi.fn(),
  messageSuccess: vi.fn(),
  messageError: vi.fn(),
}));

const userTheme: Theme = {
  id: 'user-theme',
  name: 'User Theme',
  appearance: 'light',
  css: ':root { --color-primary: #111; }',
  builtin: false,
  created_at: 1,
  updated_at: 1,
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) => {
      const translations: Record<string, string> = {
        'settings.cssTheme.addManually': 'Add Theme',
        'settings.cssTheme.followSystem': 'Follow System',
        'settings.cssTheme.selectOrCustomize': 'Select a theme',
        'settings.cssTheme.applied': `Applied ${values?.name ?? ''}`,
        'settings.cssTheme.applyFailed': 'Failed to apply theme',
      };
      return translations[key] ?? key;
    },
  }),
}));

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: mocks.getConfig,
    set: vi.fn(),
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    extensions: {
      getThemes: {
        invoke: mocks.getExtensionThemes,
      },
    },
  },
}));

vi.mock('@/renderer/hooks/context/ThemeContext.tsx', () => ({
  useThemeContext: () => ({
    theme: 'light',
    activeId: LIGHT_THEME_ID,
    activeTheme: { id: LIGHT_THEME_ID },
    selectTheme: mocks.selectTheme,
  }),
}));

vi.mock('@/renderer/pages/settings/AppearanceSettings/CssThemeModal.tsx', () => ({
  default: () => <div data-testid='css-theme-modal' />,
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: {
      success: mocks.messageSuccess,
      error: mocks.messageError,
    },
  };
});

describe('CssThemeSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getConfig.mockReturnValue([userTheme]);
    mocks.getExtensionThemes.mockResolvedValue([
      {
        id: 'extension-theme',
        name: 'Extension Theme',
        css: ':root { --color-primary: #222; }',
        created_at: 2,
        updated_at: 2,
      },
    ]);
  });

  it('shows only the official Forge themes in the normal theme screen', async () => {
    render(<CssThemeSettings />);

    expect(screen.getByText('Select a theme')).toBeInTheDocument();
    expect(await screen.findByText('Forge Light')).toBeInTheDocument();
    expect(screen.getByText('Forge Dark')).toBeInTheDocument();

    await waitFor(() => {
      expect(mocks.getExtensionThemes).toHaveBeenCalled();
    });

    expect(screen.queryByText('Hello Kitty')).not.toBeInTheDocument();
    expect(screen.queryByText('Retro Windows')).not.toBeInTheDocument();
    expect(screen.queryByText('Misaka Mikoto Theme')).not.toBeInTheDocument();
    expect(screen.queryByText('User Theme')).not.toBeInTheDocument();
    expect(screen.queryByText('Extension Theme')).not.toBeInTheDocument();
    expect(screen.queryByText('Follow System')).not.toBeInTheDocument();
  });

  it('renders official themes as radio options and applies the selected theme', async () => {
    render(<CssThemeSettings />);

    const lightRadio = await screen.findByRole('radio', { name: 'Forge Light' });
    const darkRadio = screen.getByRole('radio', { name: 'Forge Dark' });

    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(lightRadio).toBeChecked();
    expect(darkRadio).not.toBeChecked();

    fireEvent.click(darkRadio);

    await waitFor(() => {
      expect(mocks.selectTheme).toHaveBeenCalledWith(DARK_THEME_ID);
    });
  });

  it('does not expose custom theme creation from the normal theme screen', async () => {
    render(<CssThemeSettings />);

    expect(await screen.findByText('Forge Light')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Theme' })).not.toBeInTheDocument();
  });
});
