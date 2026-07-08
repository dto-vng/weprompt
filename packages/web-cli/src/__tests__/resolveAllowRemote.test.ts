import { describe, it, expect, vi } from 'vitest';

// index.ts is a CLI entry point that calls main() at import time (no
// require.main-style guard — it's always invoked directly via bin/aionui-web.js
// in production). Importing it here for resolveAllowRemote also runs main(),
// which — in this sandboxed test environment — fails fast on a missing static
// dir and calls process.exit(1). Stub process.exit so that path is a no-op
// instead of tearing down the test worker; it never reaches real server startup.
vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

const { resolveAllowRemote } = await import('../index');

describe('resolveAllowRemote (Forge desktop-only)', () => {
  it('is false even when --remote is passed', () => {
    expect(resolveAllowRemote(new Map([['remote', true]]))).toBe(false);
  });
  it('is false even when env AIONUI_ALLOW_REMOTE=1', () => {
    process.env.AIONUI_ALLOW_REMOTE = '1';
    expect(resolveAllowRemote(new Map())).toBe(false);
    delete process.env.AIONUI_ALLOW_REMOTE;
  });
});
