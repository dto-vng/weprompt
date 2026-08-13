/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * @vitest-environment node
 */

import { describe, expect, it, vi } from 'vitest';

import { createPresentationRuntimeLifecycleOwner } from '@/process/services/presentation-template/run/service/PresentationRunLifecycleCoordinator';

type BackendCredentials = { port: number; token: string };

describe('presentation runtime lifecycle startup owner', () => {
  it('constructs one coordinator after readiness and rotates every initial, late, and recovery credential', async () => {
    const coordinators: Array<{
      backendReady: ReturnType<typeof vi.fn>;
      dispose: ReturnType<typeof vi.fn>;
    }> = [];
    const createCoordinator = vi.fn(() => {
      const coordinator = {
        backendReady: vi.fn(async (_credentials: BackendCredentials) => {}),
        dispose: vi.fn(async () => {}),
      };
      coordinators.push(coordinator);
      return coordinator;
    });
    const owner = createPresentationRuntimeLifecycleOwner({ createCoordinator });

    await owner.backendReady({ port: 13400, token: 'initial-secret' });
    await owner.backendReady({ port: 13401, token: 'late-secret' });
    await owner.backendReady({ port: 13402, token: 'recovery-secret' });

    expect(createCoordinator).toHaveBeenCalledOnce();
    expect(coordinators[0]?.backendReady.mock.calls).toEqual([
      [{ port: 13400, token: 'initial-secret' }],
      [{ port: 13401, token: 'late-secret' }],
      [{ port: 13402, token: 'recovery-secret' }],
    ]);
  });

  it('keeps connection creation lazy and disconnects when the flag is false with no reconciliation work', async () => {
    let enabled = false;
    let reconciliationRuns = 0;
    const connect = vi.fn();
    const disconnect = vi.fn();
    const createCoordinator = vi.fn(() => ({
      backendReady: vi.fn(async (credentials: BackendCredentials) => {
        if (enabled || reconciliationRuns > 0) connect(credentials);
        else disconnect();
      }),
      dispose: vi.fn(async () => disconnect()),
    }));
    const owner = createPresentationRuntimeLifecycleOwner({ createCoordinator });

    await owner.backendReady({ port: 13400, token: 'disabled-secret' });
    expect(connect).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledOnce();

    reconciliationRuns = 1;
    await owner.backendReady({ port: 13401, token: 'recovery-secret' });
    expect(connect).toHaveBeenLastCalledWith({ port: 13401, token: 'recovery-secret' });

    reconciliationRuns = 0;
    enabled = true;
    await owner.backendReady({ port: 13402, token: 'enabled-secret' });
    expect(connect).toHaveBeenLastCalledWith({ port: 13402, token: 'enabled-secret' });

    enabled = false;
    await owner.backendReady({ port: 13403, token: 'disabled-again-secret' });
    expect(disconnect).toHaveBeenCalledTimes(2);
  });

  it('disposes before shutdown and supports a fresh coordinator on re-initialization', async () => {
    const instances: Array<{
      backendReady: ReturnType<typeof vi.fn>;
      dispose: ReturnType<typeof vi.fn>;
    }> = [];
    const createCoordinator = vi.fn(() => {
      const coordinator = { backendReady: vi.fn(async () => {}), dispose: vi.fn(async () => {}) };
      instances.push(coordinator);
      return coordinator;
    });
    const owner = createPresentationRuntimeLifecycleOwner({ createCoordinator });

    await owner.backendReady({ port: 13400, token: 'first-secret' });
    await owner.dispose();
    await owner.dispose();
    await owner.backendReady({ port: 13401, token: 'second-secret' });

    expect(createCoordinator).toHaveBeenCalledTimes(2);
    expect(instances[0]?.dispose).toHaveBeenCalledOnce();
    expect(instances[1]?.backendReady).toHaveBeenCalledWith({ port: 13401, token: 'second-secret' });
  });

  it('serializes shutdown behind an in-flight readiness scan before backend stop ownership returns', async () => {
    let releaseReadiness!: () => void;
    const readinessGate = new Promise<void>((resolve) => {
      releaseReadiness = resolve;
    });
    const order: string[] = [];
    const coordinator = {
      backendReady: vi.fn(async () => {
        order.push('readiness-start');
        await readinessGate;
        order.push('readiness-finish');
      }),
      dispose: vi.fn(async () => {
        order.push('dispose');
      }),
    };
    const owner = createPresentationRuntimeLifecycleOwner({ createCoordinator: () => coordinator });

    const readiness = owner.backendReady({ port: 13400, token: 'first-secret' });
    await vi.waitFor(() => expect(coordinator.backendReady).toHaveBeenCalledOnce());
    const shutdown = owner.dispose();
    await Promise.resolve();
    expect(coordinator.dispose).not.toHaveBeenCalled();

    releaseReadiness();
    await Promise.all([readiness, shutdown]);
    expect(order).toEqual(['readiness-start', 'readiness-finish', 'dispose']);
  });
});
