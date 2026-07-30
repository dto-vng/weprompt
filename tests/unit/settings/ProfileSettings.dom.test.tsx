import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

// SettingsPageWrapper pulls in router + layout + extension-tab hooks; stub it so
// the test isolates ProfileSettings' own content. Assert by role so the check
// is independent of whether i18n is initialized in the test env.
vi.mock('@/renderer/pages/settings/components/SettingsPageWrapper', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import ProfileSettings from '@/renderer/pages/settings/ProfileSettings';

describe('ProfileSettings', () => {
  it('renders the instructions textarea', () => {
    render(<ProfileSettings />);
    expect(screen.getByRole('textbox')).toBeTruthy();
  });
});
