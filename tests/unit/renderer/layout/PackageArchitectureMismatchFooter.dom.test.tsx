import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  InstallationIntegrityFooter,
  PackageArchitectureMismatchFooter,
} from '@/renderer/components/layout/InstallationIntegrityDialog';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/FeedbackReportModal', () => ({
  __esModule: true,
  default: () => null,
}));

describe('PackageArchitectureMismatchFooter', () => {
  beforeEach(() => {
    (window as unknown as { electronAPI?: Record<string, unknown> }).electronAPI = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    (window as unknown as { electronAPI?: Record<string, unknown> }).electronAPI = undefined;
  });

  it('renders the localized recovery action and invokes the supplied close handler', () => {
    const onClose = vi.fn();

    render(<PackageArchitectureMismatchFooter onClose={onClose} />);
    fireEvent.click(screen.getByTestId('package-architecture-mismatch-close'));

    expect(screen.getByText('common.backendStartup.packageArchitectureMismatch.closeApplication')).toBeVisible();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes the current window when no handler is supplied', () => {
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => undefined);

    render(<PackageArchitectureMismatchFooter />);
    fireEvent.click(screen.getByTestId('package-architecture-mismatch-close'));

    expect(closeSpy).toHaveBeenCalledOnce();
  });

  it('hides the local report action when Electron export is unavailable in WebUI mode', () => {
    render(
      <InstallationIntegrityFooter
        diagnostics={{ source: 'runtime_status' }}
        diagnosticsKind='recoverable_database_corruption'
      />
    );

    expect(screen.queryByTestId('installation-integrity-report')).not.toBeInTheDocument();
    expect(screen.getByTestId('recoverable-database-corruption-rebuild')).toBeVisible();
  });

  it('shows the local report action when Electron export is available', () => {
    (window as unknown as { electronAPI?: Record<string, unknown> }).electronAPI = {
      exportLocalFeedbackDiagnostics: vi.fn(),
    };

    render(<InstallationIntegrityFooter diagnostics={{ source: 'runtime_status' }} />);

    expect(screen.getByTestId('installation-integrity-report')).toBeVisible();
  });

  it('keeps database recovery functional when diagnostics export is unavailable', async () => {
    const recoverCorruptedDatabase = vi.fn().mockResolvedValue(undefined);
    (window as unknown as { electronAPI?: Record<string, unknown> }).electronAPI = { recoverCorruptedDatabase };

    render(
      <InstallationIntegrityFooter
        diagnostics={{ source: 'runtime_status' }}
        diagnosticsKind='recoverable_database_corruption'
      />
    );

    fireEvent.click(screen.getByTestId('recoverable-database-corruption-rebuild'));

    await waitFor(() => expect(recoverCorruptedDatabase).toHaveBeenCalledOnce());
    expect(screen.queryByTestId('installation-integrity-report')).not.toBeInTheDocument();
  });
});
