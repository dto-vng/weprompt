/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import SystemSettings from '@/renderer/pages/settings/SystemSettings';

vi.mock('@/renderer/components/settings/SettingsModal/contents/SystemModalContent', () => ({
  default: () => <div data-testid='system-modal-content'>SystemModalContent</div>,
}));

vi.mock('@/renderer/pages/settings/components/SettingsPageWrapper', () => ({
  default: ({ children, contentClassName }: { children: React.ReactNode; contentClassName?: string }) => (
    <div data-testid='settings-page-wrapper' {...(contentClassName ? { 'data-content-class': contentClassName } : {})}>
      {children}
    </div>
  ),
}));

describe('SystemSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the system content inside the settings page wrapper', () => {
    render(<SystemSettings />);
    expect(screen.getByTestId('settings-page-wrapper')).toBeInTheDocument();
    expect(screen.getByTestId('system-modal-content')).toBeInTheDocument();
  });

  it('applies no content-width override', () => {
    // The narrow 640px cap existed only for the removed About page; system
    // content should fill the wrapper's default width.
    render(<SystemSettings />);
    expect(screen.getByTestId('settings-page-wrapper')).not.toHaveAttribute('data-content-class');
  });

  it('renders without a router, since it no longer branches on the route', () => {
    // react-router-dom is deliberately not mocked here: if SystemSettings starts
    // reading location again, this render throws outside a Router.
    expect(() => render(<SystemSettings />)).not.toThrow();
  });
});
