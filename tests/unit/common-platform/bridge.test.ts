/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type TransportEmitter = {
  emit: (name: string, data: unknown) => unknown;
};

const loadLoopbackBridge = async () => {
  vi.resetModules();
  const { bridge } = await import('@/common/platform/bridge');
  let incoming: TransportEmitter | undefined;
  const outbound: Array<{ name: string; data: unknown }> = [];

  bridge.adapter({
    emit(name, data) {
      outbound.push({ name, data });
      return incoming?.emit(name, data);
    },
    on(emitter) {
      incoming = emitter;
    },
  });

  return { bridge, getIncoming: () => incoming, outbound };
};

/**
 * Loopback bridge that JSON round-trips every message, mirroring the real
 * Electron IPC / WebSocket transports (adapter/main.ts serializes with
 * JSON.stringify, which silently drops `undefined` values).
 */
const loadSerializingBridge = async () => {
  vi.resetModules();
  const { bridge } = await import('@/common/platform/bridge');
  let incoming: TransportEmitter | undefined;

  bridge.adapter({
    emit(name, data) {
      const wire = JSON.stringify({ name, data });
      const parsed = JSON.parse(wire) as { name: string; data: unknown };
      return incoming?.emit(parsed.name, parsed.data);
    },
    on(emitter) {
      incoming = emitter;
    },
  });

  return { bridge };
};

/**
 * BUG-047: before this, a provider that threw left its caller pending forever.
 * The catch logged and emitted nothing, so the `subscribe.callback-*` listener
 * `invoke` waits on never fired. Every provider channel in the app was
 * affected, and it is why BUG-046 presented as an invisible hang for nine days
 * instead of a loud error.
 *
 * `Promise.race` against a timer, not a bare await: a regression here does not
 * fail an assertion, it hangs the test until vitest kills the file.
 */
const settlesWithin = <T>(promise: Promise<T>, label: string) =>
  Promise.race([
    promise.then(
      (value) => ({ state: 'resolved' as const, value }),
      (error: unknown) => ({ state: 'rejected' as const, error })
    ),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${label} never settled`)), 1000)),
  ]);

describe('local bridge', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('routes provider requests and replies through the subscribe protocol', async () => {
    const { bridge, outbound } = await loadLoopbackBridge();
    const provider = bridge.buildProvider<string, { value: string }>('test.echo');
    provider.provider(({ value }) => value.toUpperCase());

    await expect(provider.invoke({ value: 'hello' })).resolves.toBe('HELLO');
    expect(outbound[0]?.name).toBe('subscribe-test.echo');
    expect(outbound[1]?.name).toMatch(/^subscribe\.callback-test\.echo/);
  });

  it('replaces the previous provider for the same key', async () => {
    const { bridge } = await loadLoopbackBridge();
    const endpoint = bridge.buildProvider<string, void>('test.replace');
    const first = vi.fn(() => 'first');
    endpoint.provider(first);
    endpoint.provider(() => 'second');

    await expect(endpoint.invoke()).resolves.toBe('second');
    expect(first).not.toHaveBeenCalled();
  });

  it('ignores malformed requests without invoking the provider', async () => {
    const { bridge, getIncoming } = await loadLoopbackBridge();
    const handler = vi.fn(() => 'unused');
    bridge.buildProvider<string, string>('test.invalid').provider(handler);

    getIncoming()?.emit('subscribe-test.invalid', { data: 'missing-id' });
    await Promise.resolve();

    expect(handler).not.toHaveBeenCalled();
  });

  // Regression: void-param invokes (e.g. window-controls:minimize) send
  // `data: undefined`, which JSON serialization strips from the wire payload.
  // The subscribe guard must not require the `data` key or those requests
  // are silently dropped after crossing a real IPC/WebSocket transport.
  it('handles void-param invokes across a JSON-serializing transport', async () => {
    const { bridge } = await loadSerializingBridge();
    const handler = vi.fn(() => undefined);
    const endpoint = bridge.buildProvider<void, void>('window-controls.test');
    endpoint.provider(handler);

    await expect(endpoint.invoke()).resolves.toBeUndefined();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('logs rejected providers without emitting a success callback', async () => {
    const { bridge, getIncoming, outbound } = await loadLoopbackBridge();
    const error = new Error('provider failed');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    bridge.buildProvider<string, void>('test.failure').provider(() => Promise.reject(error));

    getIncoming()?.emit('subscribe-test.failure', { id: 'request-1', data: undefined });
    await Promise.resolve();
    await Promise.resolve();

    expect(console.error).toHaveBeenCalledWith('[bridge] Provider "test.failure" failed:', error);
    expect(outbound.some(({ name }) => name === 'subscribe.callback-test.failurerequest-1')).toBe(false);
  });

  it('rejects the caller when a provider throws, instead of leaving it pending', async () => {
    const { bridge } = await loadSerializingBridge();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const endpoint = bridge.buildProvider<string, void>('test.throwing');
    endpoint.provider(() => Promise.reject(new Error('provider exploded')));

    const outcome = await settlesWithin(endpoint.invoke(), 'invoke');

    expect(outcome.state).toBe('rejected');
    expect((outcome as { error: Error }).error.message).toContain('provider exploded');
  });

  it('names the provider in the rejection, so a hang-turned-error is traceable', async () => {
    const { bridge } = await loadSerializingBridge();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const endpoint = bridge.buildProvider<string, void>('test.named-failure');
    endpoint.provider(() => Promise.reject(new Error('inner cause')));

    await expect(endpoint.invoke()).rejects.toThrow(/test\.named-failure/);
  });

  it('settles the caller even when a provider rejects with a non-Error', async () => {
    const { bridge } = await loadSerializingBridge();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const endpoint = bridge.buildProvider<string, void>('test.string-failure');
    endpoint.provider(() => Promise.reject('just a string'));

    const outcome = await settlesWithin(endpoint.invoke(), 'invoke');

    expect(outcome.state).toBe('rejected');
  });

  it('leaves no error listener behind after a successful call', async () => {
    const { bridge, getIncoming } = await loadLoopbackBridge();
    const endpoint = bridge.buildProvider<string, void>('test.clean');
    endpoint.provider(() => 'ok');

    await expect(endpoint.invoke()).resolves.toBe('ok');

    // Both channels are disposed on settle; a leaked listener would accumulate
    // one per call for the lifetime of the process.
    expect(bridge.hasListener('subscribe.callback-test.clean')).toBe(false);
    expect(getIncoming()).toBeDefined();
  });

  it('routes renderer-owned queries through the subscribe protocol', async () => {
    const { bridge, outbound } = await loadLoopbackBridge();
    const query = bridge.buildRendererQuery<{ dirtySceneCount: number }>('test.renderer-query', {
      dirtySceneCount: 24,
    });
    query.provider(() => ({ dirtySceneCount: 3 }));

    await expect(query.invoke({ timeoutMs: 100 })).resolves.toEqual({ dirtySceneCount: 3 });
    expect(outbound[0]?.name).toBe('subscribe-test.renderer-query');
    expect(outbound[1]?.name).toMatch(/^subscribe\.callback-test\.renderer-querytest\.renderer-query[a-f0-9]{8}$/);
  });

  it('returns the typed fallback when a renderer query provider rejects', async () => {
    const { bridge } = await loadLoopbackBridge();
    const error = new Error('renderer unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const query = bridge.buildRendererQuery<{ saved: boolean }>('test.renderer-failure', { saved: false });
    query.provider(() => Promise.reject(error));

    await expect(query.invoke({ timeoutMs: 100 })).resolves.toEqual({ saved: false });
    expect(console.error).toHaveBeenCalledWith(
      '[bridge] Renderer query provider "test.renderer-failure" failed:',
      error
    );
  });

  it('disposes a renderer query callback listener when the invoke times out', async () => {
    vi.useFakeTimers();
    const { bridge, getIncoming, outbound } = await loadLoopbackBridge();
    const query = bridge.buildRendererQuery<{ saved: boolean }>('test.renderer-timeout', { saved: false });

    const pending = query.invoke({ timeoutMs: 25 });
    const request = outbound[0]?.data as { id: string };
    const callbackName = `subscribe.callback-test.renderer-timeout${request.id}`;
    const rejection = expect(pending).rejects.toThrow('timed out after 25ms');
    await vi.advanceTimersByTimeAsync(25);
    await rejection;

    expect(getIncoming()?.emit(callbackName, { saved: true })).toBe(false);
  });
});
