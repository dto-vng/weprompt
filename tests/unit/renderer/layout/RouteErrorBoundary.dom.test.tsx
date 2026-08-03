import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RouteErrorBoundary from '@renderer/components/layout/RouteErrorBoundary';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const values: Record<string, string> = {
        'common.retry': 'Retry',
        'common.routeError.title': 'This page could not be displayed',
        'common.routeError.description': 'Something went wrong while opening this page.',
      };
      return values[key] ?? key;
    },
  }),
}));

const Boom: React.FC<{ shouldThrow: boolean }> = ({ shouldThrow }) => {
  if (shouldThrow) throw new Error('slotWork is not iterable');
  return <span data-testid='route-content'>route content</span>;
};

describe('RouteErrorBoundary', () => {
  beforeEach(() => {
    // React logs the caught error; keep the suite output readable.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the route untouched while nothing throws', () => {
    render(
      <RouteErrorBoundary resetKey='/team/team-1'>
        <Boom shouldThrow={false} />
      </RouteErrorBoundary>
    );

    expect(screen.getByTestId('route-content')).toBeTruthy();
    expect(screen.queryByTestId('route-error-boundary')).toBeNull();
  });

  it('shows the fallback instead of unmounting when the route throws', () => {
    render(
      <RouteErrorBoundary resetKey='/team/team-1'>
        <Boom shouldThrow={true} />
      </RouteErrorBoundary>
    );

    expect(screen.getByTestId('route-error-boundary')).toBeTruthy();
    expect(screen.getByText('This page could not be displayed')).toBeTruthy();
    expect(screen.queryByTestId('route-content')).toBeNull();
  });

  it('keeps the surrounding app mounted when the route throws', () => {
    render(
      <div>
        <span data-testid='app-chrome'>sidebar</span>
        <RouteErrorBoundary resetKey='/team/team-1'>
          <Boom shouldThrow={true} />
        </RouteErrorBoundary>
      </div>
    );

    expect(screen.getByTestId('app-chrome')).toBeTruthy();
    expect(screen.getByTestId('route-error-boundary')).toBeTruthy();
  });

  it('surfaces the failure message so the user can report it', () => {
    render(
      <RouteErrorBoundary resetKey='/team/team-1'>
        <Boom shouldThrow={true} />
      </RouteErrorBoundary>
    );

    expect(screen.getByTestId('route-error-boundary-detail').textContent).toBe('slotWork is not iterable');
  });

  it('retry re-renders the route once the cause is gone', () => {
    const { rerender } = render(
      <RouteErrorBoundary resetKey='/team/team-1'>
        <Boom shouldThrow={true} />
      </RouteErrorBoundary>
    );
    expect(screen.getByTestId('route-error-boundary')).toBeTruthy();

    rerender(
      <RouteErrorBoundary resetKey='/team/team-1'>
        <Boom shouldThrow={false} />
      </RouteErrorBoundary>
    );
    fireEvent.click(screen.getByText('Retry'));

    expect(screen.getByTestId('route-content')).toBeTruthy();
  });

  it('navigating to another route clears a previous failure without a manual retry', () => {
    const { rerender } = render(
      <RouteErrorBoundary resetKey='/team/team-1'>
        <Boom shouldThrow={true} />
      </RouteErrorBoundary>
    );
    expect(screen.getByTestId('route-error-boundary')).toBeTruthy();

    rerender(
      <RouteErrorBoundary resetKey='/guid'>
        <Boom shouldThrow={false} />
      </RouteErrorBoundary>
    );

    expect(screen.getByTestId('route-content')).toBeTruthy();
    expect(screen.queryByTestId('route-error-boundary')).toBeNull();
  });

  it('stays on the fallback while the same broken route re-renders', () => {
    const { rerender } = render(
      <RouteErrorBoundary resetKey='/team/team-1'>
        <Boom shouldThrow={true} />
      </RouteErrorBoundary>
    );

    rerender(
      <RouteErrorBoundary resetKey='/team/team-1'>
        <Boom shouldThrow={false} />
      </RouteErrorBoundary>
    );

    expect(screen.getByTestId('route-error-boundary')).toBeTruthy();
    expect(screen.queryByTestId('route-content')).toBeNull();
  });
});
