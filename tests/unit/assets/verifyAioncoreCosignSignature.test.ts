import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prepareAioncore = require('../../../packages/shared-scripts/src/prepare-aioncore');
const aioncoreTrust = require('../../../packages/shared-scripts/src/aioncore-trust');

const { getAioncoreSource, isIntegrityError, resolveForgeSource, verifyCosignSignature } = prepareAioncore;

// Real pinned trust anchor for v0.1.43 (aioncore-trust.js). Proven this session:
// cosign returns 0 for the genuine artifact and non-zero for a tampered one.
const PINNED_VERSION = 'v0.1.43';
const PINNED_IDENTITY =
  'https://github.com/minhtq1234/Forge-Aion/.github/workflows/forge-build-sign.yml@refs/heads/forge-poc-ci';
const PINNED_ISSUER = 'https://token.actions.githubusercontent.com';

describe('verifyCosignSignature (Forge #1 signature verification)', () => {
  // Snapshot and restore the injectable cosign runner around every test so a
  // stubbed runner never leaks between cases.
  let realRun: (args: string[]) => void;

  beforeEach(() => {
    realRun = prepareAioncore.cosign.run;
    delete process.env.AIONUI_AIONCORE_SOURCE;
    delete process.env.AIONUI_FORGE_SOURCE_REPO;
    delete process.env.AIONUI_FORGE_SOURCE_TAG;
  });

  afterEach(() => {
    prepareAioncore.cosign.run = realRun;
    delete process.env.AIONUI_AIONCORE_SOURCE;
    delete process.env.AIONUI_FORGE_SOURCE_REPO;
    delete process.env.AIONUI_FORGE_SOURCE_TAG;
    vi.restoreAllMocks();
  });

  it('(a) proceeds (no throw) when cosign exits 0', () => {
    // Fake runner that "succeeds" (returns without throwing == exit 0).
    prepareAioncore.cosign.run = vi.fn(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(() =>
      verifyCosignSignature({
        archivePath: '/tmp/a.tar.gz',
        bundlePath: '/tmp/a.tar.gz.cosign.bundle',
        identity: PINNED_IDENTITY,
        issuer: PINNED_ISSUER,
      })
    ).not.toThrow();

    expect(prepareAioncore.cosign.run).toHaveBeenCalledTimes(1);
  });

  it('(b) throws a tagged integrity error when cosign exits non-zero', () => {
    // A non-zero cosign exit surfaces as a thrown error from execFileSync; the
    // fake runner mimics that (with stderr, like the real one).
    prepareAioncore.cosign.run = vi.fn(() => {
      const error: Error & { status?: number; stderr?: string } = new Error('Command failed: cosign verify-blob');
      error.status = 1;
      error.stderr = 'error: no matching signatures: certificate identity mismatch';
      throw error;
    });

    let caught: unknown;
    try {
      verifyCosignSignature({
        archivePath: '/tmp/a.tar.gz',
        bundlePath: '/tmp/a.tar.gz.cosign.bundle',
        identity: PINNED_IDENTITY,
        issuer: PINNED_ISSUER,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(isIntegrityError(caught)).toBe(true);
    expect(String((caught as Error).message)).toMatch(/cosign signature verification FAILED/i);
    // The stderr detail is surfaced so operators can diagnose the mismatch.
    expect(String((caught as Error).message)).toContain('certificate identity mismatch');
  });

  it('(c) throws a tagged integrity error (fail-closed) when the cosign binary is missing (ENOENT)', () => {
    prepareAioncore.cosign.run = vi.fn(() => {
      const error: Error & { code?: string } = new Error('spawnSync cosign ENOENT');
      error.code = 'ENOENT';
      throw error;
    });

    let caught: unknown;
    try {
      verifyCosignSignature({
        archivePath: '/tmp/a.tar.gz',
        bundlePath: '/tmp/a.tar.gz.cosign.bundle',
        identity: PINNED_IDENTITY,
        issuer: PINNED_ISSUER,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(isIntegrityError(caught)).toBe(true);
    expect(String((caught as Error).message)).toMatch(/requires the "cosign" binary/i);
  });

  it('throws (fail-closed) when there is no pinned identity/issuer', () => {
    // cosign must NOT even be invoked when we have no trust anchor.
    prepareAioncore.cosign.run = vi.fn(() => undefined);

    expect(() =>
      verifyCosignSignature({
        archivePath: '/tmp/a.tar.gz',
        bundlePath: '/tmp/a.tar.gz.cosign.bundle',
        identity: undefined,
        issuer: undefined,
      })
    ).toThrow(/No pinned Forge signer identity\/issuer/i);
    expect(prepareAioncore.cosign.run).not.toHaveBeenCalled();
  });

  it('(d) passes the PINNED identity/issuer and the correct cosign args', () => {
    const trust = aioncoreTrust.getForgeTrustAnchor(PINNED_VERSION);
    // Guard: the pin committed in aioncore-trust.js is the real Forge signer.
    expect(trust).toEqual({ identity: PINNED_IDENTITY, issuer: PINNED_ISSUER });

    const run = vi.fn(() => undefined);
    prepareAioncore.cosign.run = run;
    vi.spyOn(console, 'log').mockImplementation(() => {});

    verifyCosignSignature({
      archivePath: '/tmp/aioncore.tar.gz',
      bundlePath: '/tmp/aioncore.tar.gz.cosign.bundle',
      identity: trust.identity,
      issuer: trust.issuer,
    });

    expect(run).toHaveBeenCalledTimes(1);
    const args = run.mock.calls[0][0] as string[];
    expect(args).toEqual([
      'verify-blob',
      '--bundle',
      '/tmp/aioncore.tar.gz.cosign.bundle',
      '--certificate-identity',
      PINNED_IDENTITY,
      '--certificate-oidc-issuer',
      PINNED_ISSUER,
      '/tmp/aioncore.tar.gz',
    ]);
  });
});

describe('getAioncoreSource (Forge #1 source selector)', () => {
  const original = process.env.AIONUI_AIONCORE_SOURCE;

  afterEach(() => {
    if (original === undefined) delete process.env.AIONUI_AIONCORE_SOURCE;
    else process.env.AIONUI_AIONCORE_SOURCE = original;
  });

  it('defaults to upstream when unset (nothing changes unless opted in)', () => {
    delete process.env.AIONUI_AIONCORE_SOURCE;
    expect(getAioncoreSource()).toBe('upstream');
  });

  it('selects forge only for an exact opt-in (case-insensitive, trimmed)', () => {
    process.env.AIONUI_AIONCORE_SOURCE = '  Forge  ';
    expect(getAioncoreSource()).toBe('forge');
  });

  it.each(['upstream', 'anything-else', ''])('falls back to upstream for %o', (value) => {
    process.env.AIONUI_AIONCORE_SOURCE = value;
    expect(getAioncoreSource()).toBe('upstream');
  });
});

describe('resolveForgeSource (Forge mirror URL resolution)', () => {
  afterEach(() => {
    delete process.env.AIONUI_FORGE_SOURCE_REPO;
    delete process.env.AIONUI_FORGE_SOURCE_TAG;
  });

  it('defaults to the Forge PoC mirror and the -forge-poc tag', () => {
    delete process.env.AIONUI_FORGE_SOURCE_REPO;
    delete process.env.AIONUI_FORGE_SOURCE_TAG;
    expect(resolveForgeSource('v0.1.43')).toEqual({
      ownerRepo: 'minhtq1234/Forge-Aion',
      forgeTag: 'v0.1.43-forge-poc',
    });
  });

  it('honors env overrides for owner/repo and tag', () => {
    process.env.AIONUI_FORGE_SOURCE_REPO = 'acme/mirror';
    process.env.AIONUI_FORGE_SOURCE_TAG = 'v0.1.43-custom';
    expect(resolveForgeSource('v0.1.43')).toEqual({
      ownerRepo: 'acme/mirror',
      forgeTag: 'v0.1.43-custom',
    });
  });
});
