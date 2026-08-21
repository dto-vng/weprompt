import { describe, expect, it, vi } from 'vitest';
import { installLocalBackendAuth } from '@/process/startup/localBackendAuth';

type BeforeSendHeadersDetails = {
  url: string;
  webContentsId?: number;
  requestHeaders: Record<string, string>;
};

type BeforeSendHeadersCallback = (response: { requestHeaders?: Record<string, string | string[]> }) => void;

describe('installLocalBackendAuth', () => {
  const install = () => {
    let listener: ((details: BeforeSendHeadersDetails, callback: BeforeSendHeadersCallback) => void) | undefined;
    const onBeforeSendHeaders = vi.fn((filter, nextListener) => {
      listener = nextListener;
    });
    const appShell = { id: 17, isDestroyed: () => false };

    installLocalBackendAuth({ webRequest: { onBeforeSendHeaders } } as never, appShell as never, 24680, 'local-secret');

    return { appShell, listener: listener!, onBeforeSendHeaders };
  };

  it('registers only the runtime backend HTTP and WebSocket URL patterns', () => {
    const { onBeforeSendHeaders } = install();

    expect(onBeforeSendHeaders).toHaveBeenCalledWith(
      {
        urls: ['http://127.0.0.1:24680/*', 'ws://127.0.0.1:24680/*'],
      },
      expect.any(Function)
    );
  });

  it.each(['http://127.0.0.1:24680/api/media', 'ws://127.0.0.1:24680/ws'])(
    'adds Bearer auth to an app-shell request for %s',
    (url) => {
      const { appShell, listener } = install();
      const callback = vi.fn();

      listener({ url, webContentsId: appShell.id, requestHeaders: { Accept: '*/*' } }, callback);

      expect(callback).toHaveBeenCalledWith({
        requestHeaders: { Accept: '*/*', Authorization: 'Bearer local-secret' },
      });
    }
  );

  it('does not add auth for another origin', () => {
    const { appShell, listener } = install();
    const callback = vi.fn();

    listener(
      {
        url: 'http://127.0.0.1:24681/api/media',
        webContentsId: appShell.id,
        requestHeaders: { Accept: '*/*' },
      },
      callback
    );

    expect(callback).toHaveBeenCalledWith({ requestHeaders: { Accept: '*/*' } });
  });

  it('does not add auth for guest webContents on the shared session', () => {
    const { listener } = install();
    const callback = vi.fn();

    listener(
      {
        url: 'http://127.0.0.1:24680/api/media',
        webContentsId: 99,
        requestHeaders: { Accept: '*/*' },
      },
      callback
    );

    expect(callback).toHaveBeenCalledWith({ requestHeaders: { Accept: '*/*' } });
  });
});
