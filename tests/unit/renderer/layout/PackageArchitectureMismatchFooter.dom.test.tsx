import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PackageArchitectureMismatchFooter } from '@/renderer/components/layout/InstallationIntegrityDialog';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('PackageArchitectureMismatchFooter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
});
