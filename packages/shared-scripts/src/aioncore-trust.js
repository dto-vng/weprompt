/**
 * Pinned Forge signer trust anchors for cosign-signed AionCore artifacts.
 *
 * SECURITY (Forge finding #1): when AIONUI_AIONCORE_SOURCE=forge, AionUi
 * downloads an AionCore archive from a Forge mirror release and executes the
 * extracted binary. For this "Forge-signed source" mode the trust anchor is NOT
 * a pinned SHA-256 (a self-built binary's digest changes on every build) — it is
 * the cosign keyless SIGNATURE, verified against the Forge CI signer IDENTITY and
 * OIDC ISSUER pinned HERE (in our repo), BEFORE the archive is extracted/executed.
 *
 * Verification is performed with:
 *   cosign verify-blob \
 *     --bundle <artifact>.cosign.bundle \
 *     --certificate-identity <identity> \
 *     --certificate-oidc-issuer <issuer> \
 *     <artifact>
 *
 * The bundle is served next to the artifact, but — unlike an unsigned checksums
 * file — it cannot be forged without the signer's Sigstore-issued short-lived key
 * AND a matching OIDC identity. Pinning identity+issuer here is what makes a
 * swapped artifact/bundle fail closed: cosign only returns 0 when the embedded
 * certificate was issued to exactly this workflow identity by exactly this issuer.
 *
 * Keyed by AionCore version (WITHOUT the `-forge-poc` suffix) → { identity, issuer }.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW TO REGENERATE ON A VERSION BUMP
 * ─────────────────────────────────────────────────────────────────────────────
 * The Forge build-and-sign workflow (forge-build-sign.yml) signs each artifact
 * keylessly via GitHub OIDC. The signer identity is the workflow ref, and the
 * issuer is GitHub's Actions OIDC token endpoint. To confirm the values for a new
 * version, inspect the signing certificate embedded in the published bundle:
 *
 *   cosign verify-blob \
 *     --bundle aioncore-<tag>-<target>.tar.gz.cosign.bundle \
 *     --certificate-identity <identity> \
 *     --certificate-oidc-issuer https://token.actions.githubusercontent.com \
 *     aioncore-<tag>-<target>.tar.gz
 *
 * A successful (exit 0) verification confirms the identity/issuer are correct.
 * Only after a clean verify against the genuine artifact should the values be
 * committed here. Keep old versions so older pins remain reproducible.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * v0.1.43
 * ─────────────────────────────────────────────────────────────────────────────
 * Mirror release: minhtq1234/Forge-Aion @ v0.1.43-forge-poc
 * Proven this session: `cosign verify-blob` with the identity/issuer below
 * returns 0 for the genuine artifact and NON-zero for a tampered artifact or a
 * wrong issuer (verified manually against the real published bundle).
 */

const FORGE_ISSUER = 'https://token.actions.githubusercontent.com';

const TRUST = {
  'v0.1.43': {
    identity: 'https://github.com/minhtq1234/Forge-Aion/.github/workflows/forge-build-sign.yml@refs/heads/forge-poc-ci',
    issuer: FORGE_ISSUER,
  },
};

/**
 * Look up the pinned Forge signer trust anchor for a version.
 *
 * The version is normalized to include a leading `v` and to drop a trailing
 * `-forge-poc` mirror suffix, so callers may pass either `0.1.43`, `v0.1.43`,
 * or `v0.1.43-forge-poc`.
 *
 * @param {string} version - AionCore version or Forge mirror tag.
 * @returns {{ identity: string; issuer: string } | null} the pinned trust
 *   anchor, or null when no pin exists (fail-closed at the call site).
 */
function getForgeTrustAnchor(version) {
  const key = normalizeVersionKey(version);
  return TRUST[key] || null;
}

/**
 * Normalize a version/tag string to the key used in TRUST.
 * @param {string} version
 * @returns {string}
 */
function normalizeVersionKey(version) {
  let key = String(version || '').trim();
  if (!key) return key;
  if (!key.startsWith('v')) key = `v${key}`;
  return key.replace(/-forge-poc$/, '');
}

module.exports = {
  FORGE_ISSUER,
  TRUST,
  getForgeTrustAnchor,
  normalizeVersionKey,
};
