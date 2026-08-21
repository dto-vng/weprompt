/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import EventEmitter from 'eventemitter3';

type MaybePromise<T> = T | Promise<T>;
type EventHandler = (...args: unknown[]) => unknown;
type Interceptor = (params: { name: string; data: unknown }) => Promise<void>;

export type BridgeEventEmitter = {
  emit: (name: string, data: unknown, ...args: unknown[]) => unknown;
};

export type BridgeAdapter = {
  emit: (name: string, data: unknown, ...args: unknown[]) => unknown;
  on: (emitter: BridgeEventEmitter) => void | (() => void);
};

type ProviderHandler<Data, Params> = [Params] extends [void]
  ? () => MaybePromise<Data>
  : (params: Params) => MaybePromise<Data>;

type ProviderInvoke<Data, Params> = [Params] extends [void] ? () => Promise<Data> : (params: Params) => Promise<Data>;

type RendererQueryInvokeOptions = {
  timeoutMs?: number;
};

type EmitterHandler<Params> = [Params] extends [void] ? () => void : (params: Params) => void;
type EmitterEmit<Params> = [Params] extends [void] ? () => void : (params: Params) => void;

const eventEmitter = new EventEmitter();
const interceptors: Interceptor[] = [];
const listenerWrappers = new Map<string, Map<EventHandler, Set<EventHandler>>>();
const noop = (): void => {};
const DEFAULT_RENDERER_QUERY_TIMEOUT_MS = 3_000;
const REQUEST_ID_SUFFIX_PATTERN = /^[a-f0-9]{8}$/;

let emitToAdapter: BridgeAdapter['emit'] = () => undefined;
let disconnectAdapter: (() => void) | undefined;

const createRequestId = (key: string): string => {
  const suffix = Math.floor(Math.random() * 0x1_0000_0000)
    .toString(16)
    .padStart(8, '0');
  return `${key}${suffix}`;
};

export const adapter = (config: BridgeAdapter): void => {
  disconnectAdapter?.();
  emitToAdapter = config.emit;
  const disconnect = config.on({
    emit(name, data, ...args) {
      return eventEmitter.emit(name, data, ...args);
    },
  });
  disconnectAdapter = typeof disconnect === 'function' ? disconnect : undefined;
};

export const emit = (name: string, data?: unknown, ...args: unknown[]): void => {
  emitToAdapter(name, data, ...args);
};

export const off = (name: string, callback: EventHandler): void => {
  const wrappers = listenerWrappers.get(name)?.get(callback);
  if (!wrappers) {
    eventEmitter.off(name, callback);
    return;
  }

  for (const wrapper of wrappers) {
    eventEmitter.off(name, wrapper);
  }
  listenerWrappers.get(name)?.delete(callback);
  if (listenerWrappers.get(name)?.size === 0) {
    listenerWrappers.delete(name);
  }
};

export const on = (name: string, callback: EventHandler): (() => void) => {
  const wrapped: EventHandler = (...args) => {
    if (/^subscribe(\.callback)?-/.test(name) || interceptors.length === 0) {
      return callback(...args);
    }

    void Promise.all(interceptors.map((interceptor) => interceptor({ name, data: args[0] }))).then(() =>
      callback(...args)
    );
    return undefined;
  };

  let callbacks = listenerWrappers.get(name);
  if (!callbacks) {
    callbacks = new Map();
    listenerWrappers.set(name, callbacks);
  }
  let wrappers = callbacks.get(callback);
  if (!wrappers) {
    wrappers = new Set();
    callbacks.set(callback, wrappers);
  }
  wrappers.add(wrapped);
  eventEmitter.on(name, wrapped);

  return () => {
    eventEmitter.off(name, wrapped);
    wrappers.delete(wrapped);
    if (wrappers.size === 0) {
      callbacks.delete(callback);
    }
    if (callbacks.size === 0) {
      listenerWrappers.delete(name);
    }
  };
};

export const intercept = (callback: Interceptor): (() => void) => {
  interceptors.push(callback);
  return () => {
    const index = interceptors.indexOf(callback);
    if (index >= 0) {
      interceptors.splice(index, 1);
    }
  };
};

export const hasListener = (name: string): boolean => eventEmitter.listenerCount(name) > 0;

/**
 * BUG-047: a provider that throws used to leave its caller pending forever.
 * `subscribe` caught the rejection, logged it, and emitted nothing, so the
 * `subscribe.callback-*` listener `invoke` is waiting on never fired. That is
 * why BUG-046 presented as an invisible hang for nine days instead of an error,
 * and it applied to every provider channel in the app, not to templates alone.
 *
 * Failures travel on their own channel rather than as a sentinel inside the
 * result payload: a provider may legitimately resolve to any shape, and a
 * marker in-band could collide with one. A separate channel also keeps the
 * existing contract intact — a failing provider still emits no success
 * callback.
 *
 * `subscribe.error-*` is as forgeable as `subscribe.callback-*`, so the native
 * adapter refuses both as inbound request names (`common/adapter/main.ts`).
 */
const providerErrorChannel = (name: string, id: string): string => `subscribe.error-${name}${id}`;

type BridgeProviderFailure = { message: string; name: string };

/** Errors cross a JSON transport, so only plain, bounded fields survive. */
const serializeProviderFailure = (error: unknown): BridgeProviderFailure => {
  if (error instanceof Error) {
    return { message: error.message, name: error.name };
  }
  return { message: typeof error === 'string' ? error : 'Provider failed', name: 'Error' };
};

const deserializeProviderFailure = (name: string, payload: unknown): Error => {
  const failure = typeof payload === 'object' && payload !== null ? (payload as Partial<BridgeProviderFailure>) : {};
  const message =
    typeof failure.message === 'string' && failure.message.length > 0 ? failure.message : 'Provider failed';
  const error = new Error(`[bridge] Provider "${name}" failed: ${message}`);
  if (typeof failure.name === 'string' && failure.name.length > 0) error.name = failure.name;
  return error;
};

export const subscribe = <Params = unknown, Data = unknown>(
  name: string,
  handler: (data: Params) => MaybePromise<Data>
): (() => void) =>
  on(`subscribe-${name}`, (request) => {
    // Note: no `'data' in request` check — void-param invokes send
    // `data: undefined`, and JSON transports (Electron IPC, WebSocket)
    // strip undefined values, so the key is legitimately absent on the wire.
    if (typeof request !== 'object' || request === null || !('id' in request) || typeof request.id !== 'string') {
      return;
    }

    Promise.resolve(handler((request as { data?: Params }).data as Params))
      .then((result) => emit(`subscribe.callback-${name}${request.id}`, result))
      .catch((error: unknown) => {
        console.error(`[bridge] Provider "${name}" failed:`, error);
        try {
          emit(providerErrorChannel(name, request.id as string), serializeProviderFailure(error));
        } catch (emitError: unknown) {
          // Nothing further can be done for this caller; losing the transport is
          // already terminal, and throwing here would replace one silent failure
          // with another.
          console.error(`[bridge] Provider "${name}" could not report its failure:`, emitError);
        }
      });
  });

const subscribeRendererQuery = <Data>(
  name: string,
  handler: () => MaybePromise<Data>,
  providerFailureResult: Data
): (() => void) =>
  on(`subscribe-${name}`, (request) => {
    if (typeof request !== 'object' || request === null || Array.isArray(request) || !('id' in request)) {
      return;
    }

    const requestId = request.id;
    if (typeof requestId !== 'string' || !requestId.startsWith(name)) {
      return;
    }
    const requestIdSuffix = requestId.slice(name.length);
    if (!REQUEST_ID_SUFFIX_PATTERN.test(requestIdSuffix)) {
      return;
    }
    if ('data' in request && request.data !== undefined) {
      return;
    }

    const emitResponse = (result: Data): void => {
      emit(`subscribe.callback-${name}${requestId}`, result);
    };

    void Promise.resolve()
      .then(handler)
      .then(emitResponse)
      .catch((error: unknown) => {
        console.error(`[bridge] Renderer query provider "${name}" failed:`, error);
        emitResponse(providerFailureResult);
      });
  });

export const invoke = <Data = unknown>(name: string, data?: unknown): Promise<Data> => {
  const id = createRequestId(name);
  const callbackName = `subscribe.callback-${name}${id}`;
  const errorChannel = providerErrorChannel(name, id);

  return new Promise<Data>((resolve, reject) => {
    let settled = false;
    let disposeResult = noop;
    let disposeError = noop;
    const disposeBoth = (): void => {
      disposeResult();
      disposeError();
    };

    disposeResult = on(callbackName, (result) => {
      if (settled) return;
      settled = true;
      disposeBoth();
      resolve(result as Data);
    });
    disposeError = on(errorChannel, (failure) => {
      if (settled) return;
      settled = true;
      disposeBoth();
      reject(deserializeProviderFailure(name, failure));
    });

    try {
      emit(`subscribe-${name}`, { id, data });
    } catch (error) {
      if (settled) return;
      settled = true;
      disposeBoth();
      reject(error);
    }
  });
};

const invokeWithTimeout = <Data>(name: string, data: unknown, timeoutMs: number): Promise<Data> => {
  if (!Number.isFinite(timeoutMs) || !Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    return Promise.reject(new RangeError('[bridge] Renderer query timeout must be a positive integer'));
  }

  const id = createRequestId(name);
  const callbackName = `subscribe.callback-${name}${id}`;

  return new Promise<Data>((resolve, reject) => {
    let settled = false;
    let dispose = noop;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      dispose();
      reject(new Error(`[bridge] Renderer query "${name}" timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    dispose = on(callbackName, (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      dispose();
      resolve(result as Data);
    });

    try {
      emit(`subscribe-${name}`, { id, data });
    } catch (error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      dispose();
      reject(error);
    }
  });
};

export const buildProvider = <Data, Params = undefined>(key: string) => {
  let disposeProvider = noop;

  return {
    provider(handler: ProviderHandler<Data, Params>): () => void {
      disposeProvider();
      disposeProvider = subscribe<Params, Data>(key, handler as (params: Params) => MaybePromise<Data>);
      return disposeProvider;
    },
    invoke: ((params?: Params) => invoke<Data>(key, params)) as ProviderInvoke<Data, Params>,
  };
};

export const buildRendererQuery = <Data>(key: string, providerFailureResult: Data) => {
  let disposeProvider = noop;

  return {
    provider(handler: () => MaybePromise<Data>): () => void {
      disposeProvider();
      disposeProvider = subscribeRendererQuery(key, handler, providerFailureResult);
      return disposeProvider;
    },
    invoke(options: RendererQueryInvokeOptions = {}): Promise<Data> {
      return invokeWithTimeout<Data>(key, undefined, options.timeoutMs ?? DEFAULT_RENDERER_QUERY_TIMEOUT_MS);
    },
  };
};

export const buildEmitter = <Params = undefined>(key: string) => ({
  on: ((callback: EmitterHandler<Params>) => on(key, callback as EventHandler)) as (
    callback: EmitterHandler<Params>
  ) => () => void,
  emit: ((params?: Params) => emit(key, params)) as EmitterEmit<Params>,
});

export const bridge = {
  adapter,
  buildEmitter,
  buildProvider,
  buildRendererQuery,
  emit,
  hasListener,
  intercept,
  invoke,
  off,
  on,
  subscribe,
};
