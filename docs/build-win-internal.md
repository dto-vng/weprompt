# Internal WePrompt Windows x64 Build

Build `out\WePrompt-<version>-win-x64.exe` on a native Windows x64 machine or VM with Visual Studio Build Tools 2022 and the Windows SDK. A macOS cross-build or an artifact downloaded from an unrelated GitHub Actions workflow is not release evidence.

## Verified source handoff

Transfer these files through the approved internal file-sharing channel:

- `aioncore-appops-e582874c.bundle`
- `weprompt-sprint1-release.bundle`
- `DESKTOP-COMMIT.txt`
- `SOURCE-SHA256SUMS`

Verify every received file with `Get-FileHash -Algorithm SHA256` against `SOURCE-SHA256SUMS` before cloning. Clone the desktop bundle into a new checkout, then require `git rev-parse HEAD` to equal the full commit in `DESKTOP-COMMIT.txt`. Build AionCore from the verified backend bundle at `e582874c881f507034a32d1b282a5c0d956b6b0e`, persist its SHA-256 before packaging, and prepare a complete `bundle-win32-x64` with `sourceType=local-binary`.

## Prepare the internal build

Install exactly the locked dependencies and run the Windows platform gates before packaging:

```powershell
bun install --frozen-lockfile
bunx vitest run
bunx tsc --noEmit
```

Load `FORGE_GREENNODE_API_KEY` and `FORGE_TAVILY_API_KEY` from the approved secret store without printing them. Then set the internal flag and reject ambient update, telemetry, and signing configuration:

```powershell
$env:WEPROMPT_INTERNAL_RELEASE = '1'
$Forbidden = @(
  'WEPROMPT_UPDATE_BASE_URL',
  'SENTRY_DSN',
  'SENTRY_AUTH_TOKEN',
  'SENTRY_UPLOAD_SOURCE_MAPS',
  'SENTRY_ORG',
  'SENTRY_PROJECT',
  'SENTRY_RELEASE',
  'CSC_LINK',
  'CSC_KEY_PASSWORD',
  'WIN_CSC_LINK',
  'WIN_CSC_KEY_PASSWORD'
)
foreach ($Name in $Forbidden) {
  if (-not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($Name))) {
    throw "$Name must be unset for the internal release"
  }
}
if ([string]::IsNullOrWhiteSpace($env:FORGE_GREENNODE_API_KEY)) { throw 'GreenNode key is missing' }
if ([string]::IsNullOrWhiteSpace($env:FORGE_TAVILY_API_KEY)) { throw 'Tavily key is missing' }
```

Clear all ambient AionCore source selectors, recreate the staging directory, and set only the immutable reviewed bundle:

```powershell
$AioncoreSourceVariables = @(
  'AIONUI_AIONCORE_SOURCE',
  'AIONUI_BACKEND_RUN_ID',
  'AIONUI_BACKEND_LOCAL_BUNDLE_DIR',
  'AIONUI_BACKEND_LOCAL_BINARY',
  'AIONUI_SKIP_AIONCORE_VERIFY',
  'AIONUI_FORGE_SOURCE_REPO',
  'AIONUI_FORGE_SOURCE_TAG'
)
foreach ($Name in $AioncoreSourceVariables) {
  [Environment]::SetEnvironmentVariable($Name, $null, 'Process')
}
$env:AIONUI_BACKEND_VERSION = 'v0.1.55-appops-e582874c'
$env:AIONUI_BACKEND_LOCAL_BUNDLE_DIR = 'C:\WePromptReleaseInput\WePrompt-2.1.39\backend\bundle-win32-x64'
bun run build-win:x64
```

Require the native command to exit zero. Verify `out\win-unpacked\WePrompt.exe`, exactly one `resources\bundled-aioncore\win32-x64` runtime, the embedded backend hash, and absence of `resources\app-update.yml`. Record the installer SHA-256 only after those checks. The package must make no public AionUi updater or Sentry request; installer failures must produce only the local diagnostic export.

## Install and upgrade tests

The installer is not Authenticode-signed. On first open, choose **More info → Run anyway** in SmartScreen and record the override.

Test both a fresh install and an in-place upgrade over the exact last internally distributed Forge installer. The upgraded machine must have one Apps & Features row named WePrompt, a working WePrompt shortcut and uninstaller, the existing Forge profile data, and `aionui://` opening WePrompt. A retained physical install directory such as `...\Programs\Forge` is compatible and must not be relocated during this release.

A named security owner must accept the extractable shared desktop credentials before distribution. Transfer the verified EXE together with its build-time hash and provenance evidence through the approved internal channel; do not substitute an Actions artifact.
