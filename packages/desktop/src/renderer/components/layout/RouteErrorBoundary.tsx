import { Button } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

type RouteErrorFallbackProps = {
  error: Error;
  onRetry: () => void;
};

const RouteErrorFallback: React.FC<RouteErrorFallbackProps> = ({ error, onRetry }) => {
  const { t } = useTranslation();

  return (
    <div
      data-testid='route-error-boundary'
      role='alert'
      className='flex flex-col items-center justify-center gap-16px h-full min-h-320px px-24px text-center'
    >
      <div className='flex flex-col gap-6px max-w-420px'>
        <span className='text-16px font-semibold'>{t('common.routeError.title')}</span>
        <span className='text-13px text-t-secondary'>{t('common.routeError.description')}</span>
      </div>
      {error.message && (
        <span
          data-testid='route-error-boundary-detail'
          title={error.message}
          className='max-w-420px px-12px py-8px rd-8px bg-fill-2 text-12px text-t-secondary font-mono truncate'
        >
          {error.message}
        </span>
      )}
      <Button type='primary' onClick={onRetry}>
        {t('common.retry')}
      </Button>
    </div>
  );
};

type RouteErrorBoundaryProps = {
  children: React.ReactNode;
  /**
   * Changing this clears a previous failure — pass the current route so
   * navigating away from a broken screen recovers without a manual retry.
   */
  resetKey?: string;
};

type RouteErrorBoundaryState = {
  error: Error | null;
  resetKey?: string;
};

/**
 * Keeps a render failure inside the route that caused it.
 *
 * Without a boundary, anything thrown during a route's render phase — including
 * throws from inside a `setState` updater, which escape the `try/catch` around
 * the call that scheduled them — unmounts the entire React tree and leaves a
 * blank window. Routes are restored on launch, so a single bad screen otherwise
 * turns into an app that white-screens on every start.
 */
class RouteErrorBoundary extends React.Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<RouteErrorBoundaryState> {
    return { error };
  }

  static getDerivedStateFromProps(
    props: RouteErrorBoundaryProps,
    state: RouteErrorBoundaryState
  ): Partial<RouteErrorBoundaryState> | null {
    if (props.resetKey === state.resetKey) return null;
    return { error: null, resetKey: props.resetKey };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[Renderer:routeErrorBoundary] route_render_failed', {
      resetKey: this.props.resetKey,
      error,
      componentStack: errorInfo.componentStack,
    });
    // Dynamic import mirrors main.tsx — keeps sentry-ipc:// out of the web build.
    void import('@sentry/electron/renderer')
      .then((Sentry) => {
        Sentry.captureException(error);
      })
      .catch(() => {});
  }

  private handleRetry = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return <RouteErrorFallback error={error} onRetry={this.handleRetry} />;
  }
}

export default RouteErrorBoundary;
