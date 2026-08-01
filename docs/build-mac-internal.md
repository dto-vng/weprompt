# Internal WePrompt macOS Builds

Build the Apple Silicon and Intel installers separately on macOS. The approved internal outputs are:

- `out/WePrompt-<version>-mac-arm64.dmg`
- `out/WePrompt-<version>-mac-x64.dmg`

Unsigned or ad-hoc-signed packages are acceptable for this internal release. A GitHub Actions artifact, an updater ZIP, or a build from any commit other than the reviewed release commit is not release evidence.

## Verified inputs

Start from the clean release worktree at the commit recorded in `source/DESKTOP-COMMIT.txt`. Verify the source bundle against `source/SOURCE-SHA256SUMS` before using it on another Mac. Each build must use the architecture-matched local AionCore bundle prepared from the reviewed backend commit; do not use a downloaded Actions artifact or a stale `resources/bundled-aioncore` directory.

Load `FORGE_GREENNODE_API_KEY` and `FORGE_TAVILY_API_KEY` from the approved secret store without printing them. A named security owner must accept that these shared desktop credentials are extractable from the main-process bundle.

## Internal build environment

Before each architecture build:

```bash
export WEPROMPT_INTERNAL_RELEASE=1
unset WEPROMPT_UPDATE_BASE_URL
unset SENTRY_DSN SENTRY_AUTH_TOKEN SENTRY_UPLOAD_SOURCE_MAPS
unset SENTRY_ORG SENTRY_PROJECT SENTRY_RELEASE
unset AIONUI_AIONCORE_SOURCE AIONUI_BACKEND_RUN_ID
unset AIONUI_BACKEND_LOCAL_BINARY AIONUI_SKIP_AIONCORE_VERIFY
unset AIONUI_FORGE_SOURCE_REPO AIONUI_FORGE_SOURCE_TAG
test -n "${FORGE_GREENNODE_API_KEY:-}"
test -n "${FORGE_TAVILY_API_KEY:-}"
```

The internal flag makes update and telemetry configuration fail closed. The packaged app must contain no `app-update.yml`, must not query a public AionUi update/download endpoint, and must keep installer/runtime diagnostics local and exportable only.

## Build each architecture

Use a clean `resources/bundled-aioncore` staging directory for each target and set only the reviewed local bundle path:

```bash
export AIONUI_BACKEND_VERSION='v0.1.55-appops-e582874c'

export AIONUI_BACKEND_ARCH=arm64
export AIONUI_BACKEND_LOCAL_BUNDLE_DIR='<release-root>/backend/bundle-darwin-arm64'
bun run build-mac:arm64

export AIONUI_BACKEND_ARCH=x64
export AIONUI_BACKEND_LOCAL_BUNDLE_DIR='<release-root>/backend/bundle-darwin-x64'
bun run build-mac:x64
```

Do not use the multi-architecture shortcut. Verify each app executable and bundled AionCore architecture with `file`, verify the ad-hoc signature with `codesign --verify --deep --strict`, mount each DMG, and require exactly one matching `bundled-aioncore/<platform>-<arch>` directory. Record the installer hash only after payload verification. The Intel DMG must complete its final smoke test on real Intel Mac hardware.

## Replace an existing Forge installation

For an upgrade test or an employee already using Forge:

1. Fully quit Forge.
2. Move only `/Applications/Forge.app` to Trash and remove its stale Dock item.
3. Do **not** delete `~/Library/Application Support/Forge`; WePrompt intentionally reuses this production profile so settings, conversations, and backend data remain available.
4. Open the WePrompt DMG and drag **WePrompt** to **Applications**.
5. Launch WePrompt, confirm the existing state is present, and confirm `aionui://` resolves only to WePrompt.

The final machine should have one installed app and one active protocol handler.

## Gatekeeper first open

Because the internal build is not notarized, right-click **WePrompt** and choose **Open → Open**. If macOS does not offer the override, run this once:

```bash
xattr -cr /Applications/WePrompt.app
```

Record the override and complete the installed-app smoke matrix from a fresh account or isolated application-data directory.
