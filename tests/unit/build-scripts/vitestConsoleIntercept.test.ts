/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import config from '../../../vitest.config';

/**
 * BUG-054: `bun run test` exited 1 while reporting 8368 passed and 0 failed. The
 * error was outside every assertion — `EnvironmentTeardownError: [vitest-worker]:
 * Closing rpc while "onUserConsoleLog" was pending` — so nothing in the suite could
 * catch it and the gate blocked a push that had nothing wrong with it.
 *
 * Vitest buffers intercepted console output and flushes it from a microtask onto
 * the worker RPC. A write during environment teardown leaves that call pending
 * against a closing channel. Interception off means no RPC hop and nothing to
 * leave pending.
 *
 * Asserting the resolved config rather than the file text, so a rename or a
 * reformat cannot make this pass while the option is gone.
 */
describe('vitest console interception', () => {
  it('stays disabled, so a teardown-time log cannot red the gate with zero failures', () => {
    expect(config.test?.disableConsoleIntercept).toBe(true);
  });
});
