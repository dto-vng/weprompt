import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import SettingsSider from '@/renderer/pages/settings/components/SettingsSider';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => true,
  resolveExtensionAssetUrl: (url: string) => url,
}));

vi.mock('@/renderer/hooks/system/useExtensionSettingsTabs', () => ({
  useExtensionSettingsTabs: () => [],
}));

vi.mock('@/renderer/hooks/system/useExtI18n', () => ({
  useExtI18n: () => ({ resolveExtTabName: (tab: { name: string }) => tab.name }),
}));

describe('SettingsSider — Desktop Pet feature flag', () => {
  it('hides the Desktop Pet tab when DESKTOP_PET_ENABLED is off, even on desktop', () => {
    render(
      <MemoryRouter initialEntries={['/settings/system']}>
        <SettingsSider />
      </MemoryRouter>
    );

    // Neighbor tabs still render
    expect(screen.getByText('settings.webui')).toBeInTheDocument();
    expect(screen.getByText('settings.system')).toBeInTheDocument();
    // Pet tab is gone
    expect(screen.queryByText('pet.desktopPet')).not.toBeInTheDocument();
  });
});
