/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * @vitest-environment node
 */

import type { LookupAddress, LookupAllOptions, LookupOneOptions } from 'node:dns';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { RemoteMediaError, RemoteMediaResponse } from '@process/services/remote-media/remoteMediaDownloader';
import {
  createNodeRemoteMediaRequest,
  downloadRemoteMedia,
  REMOTE_MEDIA_DEFAULT_TIMEOUT_MS,
} from '@process/services/remote-media/remoteMediaDownloader';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

type AllAddressLookup = (
  hostname: string,
  options: LookupAllOptions,
  callback: (error: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void
) => void;

type SingleAddressLookup = (
  hostname: string,
  options: LookupOneOptions,
  callback: (error: NodeJS.ErrnoException | null, address: string, family: number) => void
) => void;

const captureNodeLookup = (): {
  lookup: NonNullable<http.RequestOptions['lookup']>;
  finish: () => Promise<void>;
} => {
  let capturedLookup: http.RequestOptions['lookup'];
  const request = Object.assign(new EventEmitter(), {
    setTimeout: vi.fn(),
    end: vi.fn(),
    destroy: vi.fn(),
  }) as unknown as http.ClientRequest;
  const requestSpy = vi.spyOn(http, 'request').mockImplementation(((options: http.RequestOptions) => {
    capturedLookup = options.lookup;
    return request;
  }) as typeof http.request);
  const pending = createNodeRemoteMediaRequest(1_000)({
    url: new URL('http://media.example.test/output.png'),
    hostname: 'media.example.test',
    port: 80,
    address: '8.8.8.8',
    family: 4,
  });
  if (capturedLookup === undefined) throw new Error('Node request did not receive a pinned lookup');
  return {
    lookup: capturedLookup,
    finish: async () => {
      request.emit('error', new Error('test transport stopped'));
      await expect(pending).rejects.toMatchObject<Partial<RemoteMediaError>>({ code: 'remote_download_failed' });
      requestSpy.mockRestore();
    },
  };
};

describe('createNodeRemoteMediaRequest', () => {
  it('returns exactly the pinned address when Node requests all lookup results', async () => {
    const { lookup, finish } = captureNodeLookup();
    let callbackResult: [NodeJS.ErrnoException | null, LookupAddress[]] | undefined;

    (lookup as unknown as AllAddressLookup)('media.example.test', { all: true }, (error, addresses) => {
      callbackResult = [error, addresses];
    });

    expect(callbackResult).toEqual([null, [{ address: '8.8.8.8', family: 4 }]]);
    await finish();
  });

  it('returns exactly the pinned address in the single-address lookup form', async () => {
    const { lookup, finish } = captureNodeLookup();
    let callbackResult: [NodeJS.ErrnoException | null, string, number] | undefined;

    (lookup as unknown as SingleAddressLookup)('media.example.test', {}, (error, address, family) => {
      callbackResult = [error, address, family];
    });

    expect(callbackResult).toEqual([null, '8.8.8.8', 4]);
    await finish();
  });
});

describe('downloadRemoteMedia', () => {
  it('uses the resolved address as a pinned lookup and consumes only a matching peer', async () => {
    const request = vi.fn(async () => ({
      statusCode: 200,
      headers: { 'content-length': '3', 'Content-Type': 'Image/PNG; charset=binary' },
      remoteAddress: '8.8.8.8',
      body: Readable.from([Buffer.from('png')]),
    }));
    const chunks: Buffer[] = [];

    const result = await downloadRemoteMedia('https://media.example.test/output.png', {
      lookup: async () => [{ address: '8.8.8.8', family: 4 }],
      request,
      write: async (chunk) => chunks.push(chunk),
      maxBytes: 10,
    });

    expect(result.byteSize).toBe(3);
    expect(result.contentType).toBe('image/png');
    expect(Buffer.concat(chunks).toString()).toBe('png');
    expect(request.mock.calls[0]?.[0]).toMatchObject({ hostname: 'media.example.test', address: '8.8.8.8' });
  });

  it('rejects a peer-address mismatch before it writes response bytes', async () => {
    const write = vi.fn();
    await expect(
      downloadRemoteMedia('https://media.example.test/output.png', {
        lookup: async () => [{ address: '8.8.8.8', family: 4 }],
        request: async () => ({
          statusCode: 200,
          headers: {},
          remoteAddress: '1.1.1.1',
          body: Readable.from([Buffer.from('secret')]),
        }),
        write,
        maxBytes: 10,
      })
    ).rejects.toMatchObject<Partial<RemoteMediaError>>({ code: 'remote_download_failed' });
    expect(write).not.toHaveBeenCalled();
  });

  it('revalidates redirects instead of following a newly private address', async () => {
    const lookup = vi
      .fn()
      .mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }])
      .mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);
    await expect(
      downloadRemoteMedia('https://media.example.test/output.png', {
        lookup,
        request: async () => ({
          statusCode: 302,
          headers: { location: 'https://redirect.example.test/private.png' },
          remoteAddress: '8.8.8.8',
          body: Readable.from([]),
        }),
        write: async () => undefined,
        maxBytes: 10,
      })
    ).rejects.toMatchObject<Partial<RemoteMediaError>>({ code: 'unsafe_remote_address' });
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('rejects an HTTPS redirect downgrade to an untrusted public HTTP origin', async () => {
    const request = vi.fn(async () => ({
      statusCode: 302,
      headers: { location: 'http://redirect.example.test/output.png' },
      remoteAddress: '8.8.8.8',
      body: Readable.from([]),
    }));

    await expect(
      downloadRemoteMedia('https://media.example.test/output.png', {
        lookup: async () => [{ address: '8.8.8.8', family: 4 }],
        request,
        write: async () => undefined,
        maxBytes: 10,
      })
    ).rejects.toMatchObject<Partial<RemoteMediaError>>({ code: 'unsafe_remote_address' });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('rejects a declared or streamed size over the limit without returning remote detail', async () => {
    await expect(
      downloadRemoteMedia('https://media.example.test/output.png', {
        lookup: async () => [{ address: '8.8.8.8', family: 4 }],
        request: async () => ({
          statusCode: 200,
          headers: { 'content-length': '11' },
          remoteAddress: '8.8.8.8',
          body: Readable.from([Buffer.alloc(11)]),
        }),
        write: async () => undefined,
        maxBytes: 10,
      })
    ).rejects.toMatchObject<Partial<RemoteMediaError>>({ code: 'remote_too_large' });
  });

  it.each([
    ['3.0', [Buffer.from('png')]],
    ['4', [Buffer.from('png')]],
  ])('rejects malformed or mismatched declared content length %s', async (declaredLength, body) => {
    await expect(
      downloadRemoteMedia('https://media.example.test/output.png', {
        lookup: async () => [{ address: '8.8.8.8', family: 4 }],
        request: async () => ({
          statusCode: 200,
          headers: { 'content-length': declaredLength },
          remoteAddress: '8.8.8.8',
          body: Readable.from(body),
        }),
        write: async () => undefined,
        maxBytes: 10,
      })
    ).rejects.toMatchObject<Partial<RemoteMediaError>>({ code: 'remote_download_failed' });
  });

  it('rejects a malformed response Content-Type instead of exposing it to media persistence', async () => {
    const write = vi.fn();
    await expect(
      downloadRemoteMedia('https://media.example.test/output.png', {
        lookup: async () => [{ address: '8.8.8.8', family: 4 }],
        request: async () => ({
          statusCode: 200,
          headers: { 'content-type': 'image/png, text/plain' },
          remoteAddress: '8.8.8.8',
          body: Readable.from([Buffer.from('png')]),
        }),
        write,
        maxBytes: 10,
      })
    ).rejects.toMatchObject<Partial<RemoteMediaError>>({ code: 'remote_download_failed' });
    expect(write).not.toHaveBeenCalled();
  });

  it('normalizes IPv4-mapped peer addresses before comparing the pin', async () => {
    await expect(
      downloadRemoteMedia('https://media.example.test/output.png', {
        lookup: async () => [{ address: '8.8.8.8', family: 4 }],
        request: async () => ({
          statusCode: 200,
          headers: { 'content-length': '3' },
          remoteAddress: '::ffff:8.8.8.8',
          body: Readable.from([Buffer.from('png')]),
        }),
        write: async () => undefined,
        maxBytes: 10,
      })
    ).resolves.toEqual({ byteSize: 3, contentType: null });
  });

  it('destroys and drains unconsumed responses for redirects, bad peers, and non-success statuses', async () => {
    const cleanup = vi.fn();
    const makeResponse = (statusCode: number, remoteAddress = '8.8.8.8') => ({
      statusCode,
      headers: statusCode === 302 ? { location: 'https://redirect.example.test/output.png' } : {},
      remoteAddress,
      body: Readable.from([]),
      destroy: cleanup,
      drain: cleanup,
    });
    const request = vi.fn().mockResolvedValueOnce(makeResponse(302)).mockResolvedValueOnce(makeResponse(500));

    await expect(
      downloadRemoteMedia('https://media.example.test/output.png', {
        lookup: async () => [{ address: '8.8.8.8', family: 4 }],
        request,
        write: async () => undefined,
        maxBytes: 10,
      })
    ).rejects.toMatchObject<Partial<RemoteMediaError>>({ code: 'remote_download_failed' });
    expect(cleanup).toHaveBeenCalled();
  });

  it('maps the injected deadline to a typed timeout and aborts the request', async () => {
    let triggerTimeout: (() => void) | undefined;
    const signalSeen = vi.fn();
    let startRequest: (() => void) | undefined;
    const requestStarted = new Promise<void>((resolve) => {
      startRequest = resolve;
    });
    const download = downloadRemoteMedia('https://media.example.test/output.png', {
      lookup: async () => [{ address: '8.8.8.8', family: 4 }],
      request: async (_target, options) => {
        signalSeen(options?.signal?.aborted);
        startRequest?.();
        return await new Promise(() => undefined);
      },
      write: async () => undefined,
      maxBytes: 10,
      timeoutMs: 5,
      setTimer: (callback) => {
        triggerTimeout = callback;
        return 'timer';
      },
      clearTimer: vi.fn(),
    });
    await requestStarted;
    expect(triggerTimeout).toBeTypeOf('function');
    expect(signalSeen).toHaveBeenCalledWith(false);
    triggerTimeout?.();
    await expect(download).rejects.toMatchObject<Partial<RemoteMediaError>>({ code: 'remote_timeout' });
  });

  it('does not resolve DNS when the caller signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const lookup = vi.fn(async () => [{ address: '8.8.8.8', family: 4 as const }]);

    await expect(
      downloadRemoteMedia('https://media.example.test/output.png', {
        lookup,
        request: async () => {
          throw new Error('request should not run');
        },
        write: async () => undefined,
        maxBytes: 10,
        signal: controller.signal,
      })
    ).rejects.toMatchObject<Partial<RemoteMediaError>>({ code: 'remote_download_failed' });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('times out a hung initial DNS lookup with the one overall deadline', async () => {
    let triggerTimeout: (() => void) | undefined;
    const download = downloadRemoteMedia('https://media.example.test/output.png', {
      lookup: async () => await new Promise(() => undefined),
      request: async () => {
        throw new Error('request should not run');
      },
      write: async () => undefined,
      maxBytes: 10,
      timeoutMs: 5,
      setTimer: (callback) => {
        triggerTimeout = callback;
        return 'timer';
      },
      clearTimer: vi.fn(),
    });

    await Promise.resolve();
    expect(triggerTimeout).toBeTypeOf('function');
    triggerTimeout?.();
    await expect(download).rejects.toMatchObject<Partial<RemoteMediaError>>({ code: 'remote_timeout' });
  });

  it('arms the finite default deadline before a hung DNS lookup', async () => {
    let triggerTimeout: (() => void) | undefined;
    const setTimer = vi.fn((callback: () => void) => {
      triggerTimeout = callback;
      return 'timer';
    });
    const download = downloadRemoteMedia('https://media.example.test/output.png', {
      lookup: async () => await new Promise(() => undefined),
      request: async () => {
        throw new Error('request should not run');
      },
      write: async () => undefined,
      maxBytes: 10,
      setTimer,
      clearTimer: vi.fn(),
    });

    await Promise.resolve();
    expect(setTimer).toHaveBeenCalledWith(expect.any(Function), REMOTE_MEDIA_DEFAULT_TIMEOUT_MS);
    triggerTimeout?.();
    await expect(download).rejects.toMatchObject<Partial<RemoteMediaError>>({ code: 'remote_timeout' });
  });

  it('keeps the finite default deadline active while the response body hangs', async () => {
    let triggerTimeout: (() => void) | undefined;
    let markBodyStarted: (() => void) | undefined;
    const bodyStarted = new Promise<void>((resolve) => {
      markBodyStarted = resolve;
    });
    const body = {
      async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
        markBodyStarted?.();
        await new Promise(() => undefined);
        yield new Uint8Array();
      },
    };
    const setTimer = vi.fn((callback: () => void) => {
      triggerTimeout = callback;
      return 'timer';
    });
    const download = downloadRemoteMedia('https://media.example.test/output.png', {
      lookup: async () => [{ address: '8.8.8.8', family: 4 }],
      request: async () => ({
        statusCode: 200,
        headers: {},
        remoteAddress: '8.8.8.8',
        body,
      }),
      write: async () => undefined,
      maxBytes: 10,
      setTimer,
      clearTimer: vi.fn(),
    });

    await bodyStarted;
    expect(setTimer).toHaveBeenCalledWith(expect.any(Function), REMOTE_MEDIA_DEFAULT_TIMEOUT_MS);
    triggerTimeout?.();
    await expect(download).rejects.toMatchObject<Partial<RemoteMediaError>>({ code: 'remote_timeout' });
  });

  it('keeps one extended whole-download timer across redirects and body streaming', async () => {
    const bodyStarted = deferred<void>();
    const releaseBody = deferred<void>();
    const setTimer = vi.fn((_callback: () => void, _timeoutMs: number) => 'timer');
    const clearTimer = vi.fn();
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        statusCode: 302,
        headers: { location: 'https://redirect.example.test/output.png' },
        remoteAddress: '8.8.8.8',
        body: Readable.from([]),
      })
      .mockResolvedValueOnce({
        statusCode: 200,
        headers: { 'content-length': '3' },
        remoteAddress: '8.8.8.8',
        body: {
          async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
            bodyStarted.resolve(undefined);
            await releaseBody.promise;
            yield Buffer.from('png');
          },
        },
      });

    const download = downloadRemoteMedia('https://media.example.test/output.png', {
      lookup: async () => [{ address: '8.8.8.8', family: 4 }],
      request,
      write: async () => undefined,
      maxBytes: 10,
      timeoutMs: 900_000,
      setTimer,
      clearTimer,
    });

    await bodyStarted.promise;
    expect(setTimer).toHaveBeenCalledOnce();
    expect(setTimer).toHaveBeenCalledWith(expect.any(Function), 900_000);
    expect(clearTimer).not.toHaveBeenCalled();
    releaseBody.resolve(undefined);
    await expect(download).resolves.toEqual({ byteSize: 3, contentType: null });
    expect(clearTimer).toHaveBeenCalledWith('timer');
  });

  it('reports caller abort separately from timeout and destroys the active response', async () => {
    const controller = new AbortController();
    const bodyStarted = deferred<void>();
    const destroy = vi.fn();
    const body = {
      async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
        bodyStarted.resolve(undefined);
        await new Promise(() => undefined);
        yield new Uint8Array();
      },
    };
    const download = downloadRemoteMedia('https://media.example.test/output.png', {
      lookup: async () => [{ address: '8.8.8.8', family: 4 }],
      request: async () => ({ statusCode: 200, headers: {}, remoteAddress: '8.8.8.8', body, destroy }),
      write: async () => undefined,
      maxBytes: 10,
      timeoutMs: 900_000,
      signal: controller.signal,
    });

    await bodyStarted.promise;
    controller.abort();
    await expect(download).rejects.toMatchObject<Partial<RemoteMediaError>>({ code: 'remote_download_failed' });
    expect(destroy).toHaveBeenCalledOnce();
  });

  it.each(['destroy', 'drain'] as const)('cleans up a response that resolves after timeout via %s', async (seam) => {
    let triggerTimeout: (() => void) | undefined;
    const requestStarted = deferred<void>();
    const response = deferred<RemoteMediaResponse>();
    const cleanup = vi.fn();
    const download = downloadRemoteMedia('https://media.example.test/output.png', {
      lookup: async () => [{ address: '8.8.8.8', family: 4 }],
      request: async () => {
        requestStarted.resolve(undefined);
        return response.promise;
      },
      write: async () => undefined,
      maxBytes: 10,
      timeoutMs: 5,
      setTimer: (callback) => {
        triggerTimeout = callback;
        return 'timer';
      },
      clearTimer: vi.fn(),
    });

    await requestStarted.promise;
    triggerTimeout?.();
    await expect(download).rejects.toMatchObject<Partial<RemoteMediaError>>({ code: 'remote_timeout' });
    response.resolve({
      statusCode: 200,
      headers: {},
      remoteAddress: '8.8.8.8',
      body: { [Symbol.asyncIterator]: () => Readable.from([])[Symbol.asyncIterator]() },
      ...(seam === 'destroy' ? { destroy: cleanup } : { drain: cleanup }),
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('observes a request rejection that arrives after timeout', async () => {
    let triggerTimeout: (() => void) | undefined;
    const requestStarted = deferred<void>();
    const response = deferred<RemoteMediaResponse>();
    const unhandledRejection = vi.fn();
    process.on('unhandledRejection', unhandledRejection);
    try {
      const download = downloadRemoteMedia('https://media.example.test/output.png', {
        lookup: async () => [{ address: '8.8.8.8', family: 4 }],
        request: async () => {
          requestStarted.resolve(undefined);
          return response.promise;
        },
        write: async () => undefined,
        maxBytes: 10,
        timeoutMs: 5,
        setTimer: (callback) => {
          triggerTimeout = callback;
          return 'timer';
        },
        clearTimer: vi.fn(),
      });

      await requestStarted.promise;
      triggerTimeout?.();
      await expect(download).rejects.toMatchObject<Partial<RemoteMediaError>>({ code: 'remote_timeout' });
      response.reject(new Error('late transport failure'));
      await new Promise((resolve) => setImmediate(resolve));
      expect(unhandledRejection).not.toHaveBeenCalled();
    } finally {
      process.removeListener('unhandledRejection', unhandledRejection);
    }
  });

  it('destroys the active response and never starts a write after timeout', async () => {
    let triggerTimeout: (() => void) | undefined;
    const bodyStarted = deferred<void>();
    const releaseBody = deferred<void>();
    const destroy = vi.fn();
    const write = vi.fn(async () => undefined);
    const body = {
      async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
        bodyStarted.resolve(undefined);
        await releaseBody.promise;
        yield Buffer.from('late');
      },
    };
    const download = downloadRemoteMedia('https://media.example.test/output.png', {
      lookup: async () => [{ address: '8.8.8.8', family: 4 }],
      request: async () => ({ statusCode: 200, headers: {}, remoteAddress: '8.8.8.8', body, destroy }),
      write,
      maxBytes: 10,
      timeoutMs: 5,
      setTimer: (callback) => {
        triggerTimeout = callback;
        return 'timer';
      },
      clearTimer: vi.fn(),
    });

    await bodyStarted.promise;
    triggerTimeout?.();
    await expect(download).rejects.toMatchObject<Partial<RemoteMediaError>>({ code: 'remote_timeout' });
    expect(destroy).toHaveBeenCalledOnce();
    releaseBody.resolve(undefined);
    await new Promise((resolve) => setImmediate(resolve));
    expect(write).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'fails closed for an invalid explicit timeout: %s',
    async (timeoutMs) => {
      const lookup = vi.fn(async () => [{ address: '8.8.8.8', family: 4 as const }]);
      await expect(
        downloadRemoteMedia('https://media.example.test/output.png', {
          lookup,
          request: async () => ({
            statusCode: 200,
            headers: {},
            remoteAddress: '8.8.8.8',
            body: Readable.from([]),
          }),
          write: async () => undefined,
          maxBytes: 10,
          timeoutMs,
          setTimer: vi.fn(),
        })
      ).rejects.toMatchObject<Partial<RemoteMediaError>>({ code: 'remote_download_failed' });
      expect(lookup).not.toHaveBeenCalled();
    }
  );

  it('keeps one deadline active across a redirect and its DNS re-resolution', async () => {
    let triggerTimeout: (() => void) | undefined;
    let startSecondLookup: (() => void) | undefined;
    const secondLookupStarted = new Promise<void>((resolve) => {
      startSecondLookup = resolve;
    });
    const lookup = vi
      .fn()
      .mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }])
      .mockImplementationOnce(async () => {
        startSecondLookup?.();
        return await new Promise(() => undefined);
      });
    const setTimer = vi.fn((callback: () => void) => {
      triggerTimeout = callback;
      return 'timer';
    });
    const clearTimer = vi.fn();

    const download = downloadRemoteMedia('https://media.example.test/output.png', {
      lookup,
      request: async () => ({
        statusCode: 302,
        headers: { location: 'https://redirect.example.test/output.png' },
        remoteAddress: '8.8.8.8',
        body: Readable.from([]),
      }),
      write: async () => undefined,
      maxBytes: 10,
      timeoutMs: 5,
      setTimer,
      clearTimer,
    });

    await secondLookupStarted;
    expect(setTimer).toHaveBeenCalledTimes(1);
    expect(clearTimer).not.toHaveBeenCalled();
    triggerTimeout?.();
    await expect(download).rejects.toMatchObject<Partial<RemoteMediaError>>({ code: 'remote_timeout' });
  });
});
