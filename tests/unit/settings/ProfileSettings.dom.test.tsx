import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

const { configState, setContextMock } = vi.hoisted(() => ({
  configState: { current: { enabled: true, instructions: 'Be concise.' } },
  setContextMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/renderer/hooks/config/useConfig', () => ({
  useConfig: () => [configState.current, setContextMock],
}));

// SettingsPageWrapper pulls in router + layout + extension-tab hooks; stub it so
// the test isolates ProfileSettings' own content. Assert by role so the check
// is independent of whether i18n is initialized in the test env.
vi.mock('@/renderer/pages/settings/components/SettingsPageWrapper', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import ProfileSettings from '@/renderer/pages/settings/ProfileSettings';

describe('ProfileSettings', () => {
  beforeEach(() => {
    configState.current = { enabled: true, instructions: 'Be concise.' };
    setContextMock.mockReset().mockResolvedValue(undefined);
  });

  it('keeps the editable controls and scope note but removes the model-facing preview', () => {
    render(<ProfileSettings />);

    expect(screen.getByRole('textbox', { name: 'settings.profileInstructionsLabel' })).toHaveValue('Be concise.');
    expect(screen.getByRole('switch')).toBeChecked();
    expect(screen.getByText('settings.profileScopeNote')).toBeVisible();
    expect(screen.queryByText('settings.profilePreviewTitle')).not.toBeInTheDocument();
    expect(screen.queryByText(/\[User context\]/)).not.toBeInTheDocument();
  });

  it('still persists instruction edits and the enable switch', () => {
    render(<ProfileSettings />);

    fireEvent.change(screen.getByRole('textbox', { name: 'settings.profileInstructionsLabel' }), {
      target: { value: 'Use formal Vietnamese.' },
    });
    fireEvent.click(screen.getByRole('switch'));

    expect(setContextMock).toHaveBeenNthCalledWith(1, {
      enabled: true,
      instructions: 'Use formal Vietnamese.',
    });
    expect(setContextMock).toHaveBeenNthCalledWith(2, {
      enabled: false,
      instructions: 'Be concise.',
    });
  });
});
