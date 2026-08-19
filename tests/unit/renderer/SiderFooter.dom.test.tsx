import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import SiderFooter from '@/renderer/components/layout/Sider/SiderFooter';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const values: Record<string, string> = {
        'common.back': 'Back to Chat',
        'common.settings': 'Settings',
        'settings.darkMode': 'Dark',
        'settings.lightMode': 'Light',
      };
      return values[key] ?? key;
    },
  }),
}));

describe('SiderFooter', () => {
  it('shows only utility actions without a user profile', () => {
    const onSettingsClick = vi.fn();

    render(
      <SiderFooter
        isMobile={false}
        isSettings={false}
        theme='light'
        siderTooltipProps={{}}
        onSettingsClick={onSettingsClick}
        onThemeToggle={vi.fn()}
      />
    );

    expect(screen.queryByText('NL')).not.toBeInTheDocument();
    expect(screen.queryByText('Nhung Le')).not.toBeInTheDocument();
    expect(screen.queryByText('Free plan')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(onSettingsClick).toHaveBeenCalledTimes(1);
  });

  // C-09 — the dark-mode toggle was reachable only from the Settings screen,
  // because `showThemeToggle` was `isSettings && !collapsed`. The reporter asked
  // for it on the home screen too, next to Settings.
  it('offers the theme toggle on the home screen, not only inside Settings', () => {
    const onThemeToggle = vi.fn();

    render(
      <SiderFooter
        isMobile={false}
        isSettings={false}
        collapsed={false}
        theme='light'
        siderTooltipProps={{}}
        onSettingsClick={vi.fn()}
        onThemeToggle={onThemeToggle}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    expect(onThemeToggle).toHaveBeenCalledTimes(1);
  });

  it('keeps the theme toggle inside Settings', () => {
    render(
      <SiderFooter
        isMobile={false}
        isSettings
        collapsed={false}
        theme='dark'
        siderTooltipProps={{}}
        onSettingsClick={vi.fn()}
        onThemeToggle={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Light' })).toBeInTheDocument();
  });

  // The collapsed rail has no room for a second control; that rule predates C-09
  // and is deliberately preserved.
  it('hides the theme toggle while the sider is collapsed', () => {
    render(
      <SiderFooter
        isMobile={false}
        isSettings={false}
        collapsed
        theme='light'
        siderTooltipProps={{}}
        onSettingsClick={vi.fn()}
        onThemeToggle={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: 'Dark' })).not.toBeInTheDocument();
  });

  // C-08 — the Settings/Back control was a 32x32 icon-only button with the label
  // carried only by tooltip and aria-label. The reporter asked for it bigger and
  // labelled. `common.back` is already "Back to Chat" in en-US, so this needs no
  // new locale keys.
  it('labels the Settings control in the expanded sider', () => {
    render(
      <SiderFooter
        isMobile={false}
        isSettings={false}
        collapsed={false}
        theme='light'
        siderTooltipProps={{}}
        onSettingsClick={vi.fn()}
        onThemeToggle={vi.fn()}
      />
    );

    const settings = screen.getByRole('button', { name: 'Settings' });
    expect(settings).toHaveTextContent('Settings');
  });

  it('labels the control "Back to Chat" while inside Settings', () => {
    render(
      <SiderFooter
        isMobile={false}
        isSettings
        collapsed={false}
        theme='light'
        siderTooltipProps={{}}
        onSettingsClick={vi.fn()}
        onThemeToggle={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Back to Chat' })).toHaveTextContent('Back to Chat');
  });

  // Collapsed keeps the icon-only treatment the rest of the sider uses: no visible
  // text, but the accessible name survives via aria-label.
  it('drops the visible label when collapsed but keeps the accessible name', () => {
    render(
      <SiderFooter
        isMobile={false}
        isSettings={false}
        collapsed
        theme='light'
        siderTooltipProps={{}}
        onSettingsClick={vi.fn()}
        onThemeToggle={vi.fn()}
      />
    );

    const settings = screen.getByRole('button', { name: 'Settings' });
    expect(settings).not.toHaveTextContent('Settings');
  });
});
