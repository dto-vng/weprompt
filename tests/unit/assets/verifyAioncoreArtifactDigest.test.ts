import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const {
  assertHttpsUrl,
  computeSha256,
  isVerificationSkipped,
  verifyArchiveDigest,
} = require('../../../packages/shared-scripts/src/prepare-aioncore');
const aioncoreChecksums = require('../../../packages/shared-scripts/src/aioncore-checksums');

// A pinned asset/version pair that exists in aioncore-checksums.js. The digest
// is the real committed pin, cross-verified against the release checksums file.
const PINNED_VERSION = 'v0.1.43';
const PINNED_ASSET = 'aioncore-v0.1.43-x86_64-apple-darwin.tar.gz';
const PINNED_DIGEST = '8d857d49a2bf47fc90eee67d2baceb4f9c2d19975fe6f5a4c2ed38f9416b2376';

function sha256Hex(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

describe('verifyArchiveDigest (Forge #1 integrity check)', () => {
  let tmp: string;
  let archivePath: string;

  beforeEach(() => {
    delete process.env.AIONUI_SKIP_AIONCORE_VERIFY;
    tmp = mkdtempSync(join(tmpdir(), 'aionui-verify-digest-'));
    archivePath = join(tmp, PINNED_ASSET);
  });

  afterEach(() => {
    delete process.env.AIONUI_SKIP_AIONCORE_VERIFY;
    rmSync(tmp, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('computeSha256 agrees with node:crypto and the committed pin is present', () => {
    const content = Buffer.from('arbitrary archive bytes');
    writeFileSync(archivePath, content);
    expect(computeSha256(archivePath)).toBe(sha256Hex(content));
    expect(aioncoreChecksums.getPinnedDigest(PINNED_VERSION, PINNED_ASSET)).toBe(PINNED_DIGEST);
  });

  it('proceeds (no throw) when the computed digest equals the pinned digest', () => {
    const content = Buffer.from('matching-archive-content');
    writeFileSync(archivePath, content);
    const digest = sha256Hex(content);

    // Stub the pin so it equals our synthetic archive's real digest; this
    // deterministically exercises the "match" path without shipping a fixture
    // whose bytes collide with a real release digest.
    const spy = vi.spyOn(aioncoreChecksums, 'getPinnedDigest').mockReturnValue(digest);

    expect(() => verifyArchiveDigest({ archivePath, assetName: 'any-asset', version: 'any-version' })).not.toThrow();
    expect(spy).toHaveBeenCalledWith('any-version', 'any-asset');
  });

  it('throws on digest mismatch and does not proceed to extract/exec', () => {
    // Real committed pin for PINNED_ASSET, but the file bytes are wrong.
    writeFileSync(archivePath, Buffer.from('tampered content that will not match the pin'));
    expect(() => verifyArchiveDigest({ archivePath, assetName: PINNED_ASSET, version: PINNED_VERSION })).toThrow(
      /integrity check FAILED/i
    );
  });

  it('throws (fail-closed) when there is no pin for the asset/version', () => {
    writeFileSync(archivePath, Buffer.from('whatever'));
    expect(() =>
      verifyArchiveDigest({
        archivePath,
        assetName: 'aioncore-v9.9.9-x86_64-apple-darwin.tar.gz',
        version: 'v9.9.9',
      })
    ).toThrow(/No pinned SHA-256 digest/i);
  });

  it('skips verification with a loud warning when the break-glass env is set', () => {
    process.env.AIONUI_SKIP_AIONCORE_VERIFY = '1';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    writeFileSync(archivePath, Buffer.from('unverified local dev archive'));

    // No pin exists for this asset, but break-glass must skip the check entirely.
    expect(() =>
      verifyArchiveDigest({ archivePath, assetName: 'unpinned-local.tar.gz', version: 'v0.0.0-dev' })
    ).not.toThrow();
    expect(isVerificationSkipped()).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('SKIPPING AionCore integrity verification');
  });
});

describe('assertHttpsUrl (Forge #1 HTTPS enforcement)', () => {
  it('accepts https URLs', () => {
    expect(() =>
      assertHttpsUrl('https://github.com/iOfficeAI/AionCore/releases/download/v0.1.43/a.tar.gz')
    ).not.toThrow();
  });

  it.each(['http://example.com/a.tar.gz', 'ftp://example.com/a', 'file:///etc/passwd'])(
    'rejects non-https URL %s',
    (url) => {
      expect(() => assertHttpsUrl(url)).toThrow(/non-HTTPS/i);
    }
  );
});
