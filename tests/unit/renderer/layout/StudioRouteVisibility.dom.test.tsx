import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { Outlet } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PanelRoute from '@/renderer/components/layout/Router';

const mocks = vi.hoisted(() => ({
  isElectronDesktop: vi.fn(() => true),
  nativePageLoads: 0,
}));

vi.mock('@renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ status: 'authenticated' }),
}));

vi.mock('@renderer/utils/platform', () => ({
  isElectronDesktop: mocks.isElectronDesktop,
}));

vi.mock('@renderer/components/layout/AppLoader', () => ({
  default: () => <div>route loading</div>,
}));

vi.mock('@renderer/pages/studio/StudioPage', () => {
  mocks.nativePageLoads += 1;
  return {
    default: () => <main>native Studio page</main>,
  };
});

const renderAt = (hash: string) => {
  window.history.replaceState(null, '', hash);
  return render(<PanelRoute layout={<Outlet />} />);
};

describe('Creative Studio route visibility', () => {
  beforeEach(() => {
    mocks.isElectronDesktop.mockReturnValue(true);
  });

  it.each([
    '#/studio',
    '#/studio/project_1/brief',
    '#/studio/project_1/write',
    '#/studio/project_1/produce',
    '#/studio/project_1/review',
  ])('redirects WebUI Studio request %s before the native Studio page loads', async (hash) => {
    mocks.isElectronDesktop.mockReturnValue(false);
    const nativePageLoadsBefore = mocks.nativePageLoads;
    renderAt(hash);

    await waitFor(() => expect(window.location.hash).toBe('#/guid'));
    expect(mocks.nativePageLoads).toBe(nativePageLoadsBefore);
  });

  it.each([
    '#/studio',
    '#/studio/project_1/brief',
    '#/studio/project_1/write',
    '#/studio/project_1/produce',
    '#/studio/project_1/review',
  ])('renders the native Studio page for desktop route %s', async (hash) => {
    renderAt(hash);

    expect(await screen.findByRole('main')).toHaveTextContent('native Studio page');
  });
});
