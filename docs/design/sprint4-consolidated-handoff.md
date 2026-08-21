# Sprint 4 consolidated — delivery notes and integration guide

**Branch:** `ghk/sprint4-consolidated` @ `bed09ba69`
**Base:** `sprint4` + `ghk/main` (0 commits behind mainline)
**Excludes:** Creative Studio — `codex/creative-studio-table-board-ui-design` diverged 2026-08-11, before this sprint, and is still in flight.

```bash
git fetch ghk && git checkout sprint4-consolidated
```

**Verification state:** 8,471 tests passing, 19 skipped, 0 failing. `tsc`, oxlint, oxfmt and `check-i18n` all clean. Pushed through the full `just push` gate.

---

## Key deliveries

### Backend / platform

- **App-operations model port** — the operations model and latency now surface on provider model rows, with health checks and a live smoke run against the running app.
- **Thinking-level control reachable on AionRS/Kimi** (Stream A) via a per-model backend advertisement.
- **EPIC-002 live creation smoke** (Stream B) — exercised end-to-end on both backends in both languages.
- **Provider failures tell the truth** — an exhausted provider account is no longer reported as a rate limit (BUG-055). New `quota` failure class, non-retryable, with billing-oriented copy in all 12 locales.
- **A throwing IPC provider now rejects its caller instead of hanging it forever** (BUG-047). This one is load-bearing for everything else: before it, any main-process throw left the renderer pending with no error.

### Project knowledge

- Semantic search enabled and verified with a controlled experiment.
- **RRF ranking fixed** (BUG-056) — a passage only the semantic arm can find is no longer truncated away by the lexical arm.
- Embed actions disabled until an embedding model exists, instead of failing silently.

### Chat & composer

- **Auto-compaction resurrected** — completed turns were never counted, so the 8-turn trigger could not fire on any conversation.
- **Send works while an IME composition is open** (BUG-059). Typing Vietnamese, the arrow stayed disabled until you hit space; a single-word message could not be sent at all.
- Context gauge coloured by fill level rather than budget status; the non-functional local token counter removed.

### UI

- App Operations screen rebuilt to the attached design; provider and model rows aligned.
- Dark-mode contrast raised to WCAG AA on the affected token pair.
- **Arco portal controls are clickable under the titlebar** (BUG-057) — a full-width `-webkit-app-region: drag` band made the top 46px of every drawer, modal, popover and dropdown dead to a real mouse.
- Project-home composer aligned to its card; **the project hub now reflows on its own width** rather than the window's (BUG-058) — the fixed 356px rail was crushing the main column to 77px at an 880px window.

### Correctness sweep

Eleven bugs closed. Two were much wider than reported and are worth knowing about because the same shape may exist elsewhere:

- **BUG-052** — one unescaped URL path segment was reported; **76** existed. All interpolations written directly after a `/` are now escaped, guarded by a test that reports offenders by line.
- **BUG-048** — the UUID-shaped `conversation_id` assumption was reported as "~10 more sites"; **27** existed across 6 files and both processes. The app mints short hex ids (`1af97a0d`), never UUIDs. There is now **one** shared predicate, `isBoundedConversationId` in `common/types/office/conversationId.ts` — please do not add a fourth copy of the rule.

---

## Integrating `feat/wp24045-24111-24112`

**Good news: the merge is clean.** A dry run of your branch into `sprint4-consolidated` produces **zero conflicts**, because this branch already contains `ghk/main` and yours is main + 12 commits.

```bash
git checkout sprint4-consolidated
git merge ghk/feat/wp24045-24111-24112
```

Your two touches to shared files are purely additive and do not collide: the `resources/sso-config.json` extraResource, and the `@azure/msal-node` dependency.

---

## What to pay attention to

A clean text merge is not a clean semantic one. These are the decisions on this branch that could surprise you.

### 1. The renderer's local-token auth deliberately differs from mainline

**This is the one to read first.**

Mainline appends the local secret to WebSocket, EventSource and `<img src>` URLs as a fallback (`withLocalTokenQuery`). This branch does **not**. Commit `44f00a112` replaced that with `installLocalBackendAuth`, which injects `Authorization: Bearer` from `session.webRequest.onBeforeSendHeaders` for every app-shell request to the backend — `http://` and `ws://` alike, and `<img src>` too, which is the case mainline's fallback exists for.

The effect is the same coverage without the secret appearing in URLs, where it reaches logs, referrers and process listings.

Practical consequences:

- `withLocalTokenQuery` and `getWsProtocols` still exist and are exported, but have **no production callers** on this branch. That is intentional, not an oversight.
- Mainline's test asserting the query fallback was **inverted, not deleted**, so a later merge cannot quietly reintroduce it. If you see `Electron mode with a local token: still keeps it out of the URL` fail, something has restored the fallback.
- `mainHttpRequest` sends `Authorization: Bearer` only. Mainline also sent the legacy `X-AionUI-Local-Token` there, which mainline's own comments say aioncore never reads and which nothing consumes.

If your SSO work needs a URL-borne credential for some path, raise it rather than reverting this — the header-injection seam can almost certainly cover it.

### 2. AionCore moved to v0.1.54, and the source pin moved with it

`aioncoreVersion` is now mainline's `v0.1.54`. That meant `ACCEPTED_AIONCORE_SOURCE_COMMIT` had to move too, because `assertAcceptedActionsRun` throws unless an Actions run's head SHA matches it exactly.

The new value was **resolved out-of-band, not guessed** — the BUG-040 failure mode was a fabricated SHA that existed on neither host:

```
git ls-remote https://github.com/khoapnt-vng/aioncore.git 'refs/tags/v0.1.54^{}'
git ls-remote https://code.vng.vn/dto/aioncore.git       'refs/tags/v0.1.54^{}'
```

Both return `9bd693b3b43cdb1003061de0e4f62259ab6f42ae` (verified 2026-08-21). The same command re-confirmed the previous pin resolves to `d4d8e877…`.

**This means the branch expects a newer backend than a dev environment pinned to v0.1.51.** Your `c46177e73 feat(startup): let users reset incompatible local data on migration failure` lands in exactly the right place for that — it makes the version step recoverable for users instead of a hard crash on a migration mismatch.

### 3. `electron-builder.yml` — a hook that mainline does not have

This branch defines a third hook, `artifactBuildStarted: scripts/afterSign.js`, which mainline does not. Taking mainline's version of that file wholesale drops it, and `releasePackagingConfig.test.ts` will fail if it goes missing. Worth checking after any future mainline merge — it was caught here only by that test.

`scripts/afterPack.js` now carries **both** sides' additions: this branch's presentation-template resource verification and mainline's bundled-aioncore Mach-O signing for notarization.

### 4. Test-suite behaviour you will notice immediately

- **Console output is no longer intercepted** (`disableConsoleIntercept: true` in `vitest.config.ts`). Test logs print raw to stdout instead of being attributed per test. This was BUG-054's fix: Vitest buffers intercepted console output and flushes it from a microtask onto the worker RPC, so a write during environment teardown left `onUserConsoleLog` pending against a closing channel and reddened the gate with **zero failing tests**. Losing the `stdout | file > test` header costs nothing here — a green full run emits no intercepted console output at all.
- **Four `prepareAioncoreActionsArtifact` cases carry a 120s budget.** They build a fake POSIX toolchain on disk; isolated they take 3.5–6.4s, and against the 10s global timeout all four failed in full-suite position. Do not lower this back toward the default without re-measuring under load.

### 5. Your i18n coverage is thin outside `common.json`

Your branch adds `login.json`, `settings.json` and `conversation.json` keys to **2 of 12 locales** (en-US and zh-CN); `common.json` got all 12.

This will **not** fail the gate — `check-i18n.js` treats missing translations as a warning, not an error. The practical effect is that the SSO login gate and Profile SSO UI fall back to English in the other 10 locales. Flagging it because this repo's convention is that each UI change ships its own translated keys, and batching them later designs in a red window.

### 6. One open bug, deliberately not dismissed

**BUG-060** — `does not let stale finalization remove a newer same-key operation` in `broker.test.ts` fails intermittently. Established as intermittent on an identical tree (green → red → green; 3/3 green isolated), and confirmed not caused by any sprint-4 change.

It is filed as a **P2, not a flake**, because what gave way is the exact invariant the test is named for. A racy _assertion_ would be one thing; the guarded _behaviour_ failing under timing pressure is equally consistent with a latent race in the broker that favourable timing normally hides. Leads are recorded in `TASKS.md` — the identity guard at `broker.ts:494`, and attempt accounting exhausting the two-value request mock. Neither is confirmed; the failure has not been reproduced deliberately.

---

## A note on running the gate

Two full suites on one machine inflate durations enough to produce false timeouts. During this work a gate run failed with six unrelated files all timing out at ~19s, at load average 16, with a sibling session's suite running 10 workers at up to 112% CPU. The same tree passed minutes earlier and minutes later.

If you see a scatter of uniform-duration timeouts across unrelated subsystems, check `uptime` before believing them — and judge runs by exit code, not by grepping the output, since the error that reddened BUG-054's gate matched neither `Tests` nor `FAIL`.
