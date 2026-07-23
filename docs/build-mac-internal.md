# Internal macOS (Apple Silicon) Build — Pre-configured DMG

Builds `Forge-<version>-mac-arm64.dmg` with the GreenNode/MiniMax provider,
the OpenCode agent, and built-in Tavily Web Search all working on first
launch — for internal distribution to colleagues.

## Prerequisites

- Apple Silicon Mac with the repo set up (`bun install` done, `resources/bundled-aioncore/darwin-arm64` present).
- The two shared API keys. **Never commit them.**
  - GreenNode/MiniMax key (VNG Cloud MaaS)
  - Tavily key (web search, from tavily.com)

## Build

```bash
export FORGE_GREENNODE_API_KEY='<greennode key>'
export FORGE_TAVILY_API_KEY='<tavily key>'
bun run build-mac:arm64
```

Output: `out/Forge-<version>-mac-arm64.dmg`.

Keys are injected into the main-process bundle at build time (electron-vite
`define`). A build without an env var still succeeds but seeds no key for
that feature (the app logs a `[Seed]` warning and retries on later launches,
e.g. after an upgrade to a keyed build).

Before committing anything after a build, double-check no key leaked into
tracked files: `git status` should be clean of unexpected changes and
`git grep <first-8-chars-of-key>` must return nothing.

## What first launch seeds (one-shot)

- GreenNode provider (`minimax/minimax-m2.5`, `openai/gpt-5`), enabled.
- OpenCode agent installed from the Agent Hub; GreenNode models mirrored into
  `~/.config/opencode/opencode.jsonc` + `~/.local/share/opencode/auth.json`,
  default model `vngcloud/minimax/minimax-m2.5`.
- Built-in Web Search (`aionui-web-search`) enabled with the Tavily key.

Each seed is one-shot: users can later change or remove any of it and their
choice sticks.

## Distributing (unsigned build)

The DMG is ad-hoc signed (no Developer ID, no notarization). Recipients:

1. Open the DMG, drag **Forge** to **Applications**.
2. First open: macOS warns about an unidentified developer →
   **right-click the app → Open → Open** (needed once).
   Fallback if the Open button doesn't appear: `xattr -cr /Applications/Forge.app`.
3. Launch — chat (MiniMax), the OpenCode agent, and Web Search work with no setup.
