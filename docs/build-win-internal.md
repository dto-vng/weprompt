# Internal Windows (x64 / Intel-AMD) Build — Pre-configured Installer

Builds `Forge-<version>-win-x64.exe` (NSIS installer) with the GreenNode/
MiniMax provider and the OpenCode agent working on first launch — for
internal distribution to colleagues. Built on GitHub Actions because the
Windows native modules cannot be cross-compiled from macOS.

## One-time setup

1. **Repo must be private.** `khoapnt-vng/WePrompt` → Settings → General →
   Danger Zone → Change visibility → Private. On a public repo, anyone can
   download Actions artifacts — which embed the shared API key.
2. **Add the key as an Actions secret.** Settings → Secrets and variables →
   Actions → New repository secret → name `FORGE_GREENNODE_API_KEY`, value =
   the shared GreenNode key. **Never commit the key.**
3. Optional, later: add `FORGE_TAVILY_API_KEY` the same way to also
   pre-configure built-in Web Search. No code change needed — the workflow
   already passes it; existing installs pick the key up on upgrade.

## Build

```bash
gh workflow run build-manual.yml --repo khoapnt-vng/WePrompt \
  -f branch=WePrompt -f platform=windows-x64
gh run list --repo khoapnt-vng/WePrompt --workflow build-manual.yml --limit 1
gh run watch --repo khoapnt-vng/WePrompt <run-id>
```

Takes ~25–40 minutes on the `windows-2022` runner. Then download the
`windows-build-x64` artifact from the run page (or
`gh run download <run-id> --repo khoapnt-vng/WePrompt -n windows-build-x64`)
— it contains `Forge-<version>-win-x64.exe`.

Note: the workflow's Windows build step does not fail the run on build
errors — judge success by the artifact existing and containing the `.exe`.

## What first launch seeds (one-shot)

Identical to the macOS build (see `build-mac-internal.md`): GreenNode
provider (`minimax/minimax-m2.5`, `openai/gpt-5`) enabled; OpenCode agent
installed from the Agent Hub with the same models mirrored into
`~/.config/opencode/`; built-in Web Search activates only when a build
carries `FORGE_TAVILY_API_KEY`. Users can change or remove any of it and
their choice sticks.

## Distributing (unsigned build)

The installer is not Authenticode-signed. Recipients:

1. Run `Forge-<version>-win-x64.exe`.
2. SmartScreen shows "Windows protected your PC" →
   **More info → Run anyway** (needed once).
3. Follow the install wizard, then launch — chat (MiniMax) and the OpenCode
   agent work with no setup.
