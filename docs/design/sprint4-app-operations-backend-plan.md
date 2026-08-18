# App-operations backend — port and release plan

**Goal:** make the Settings › Model redesign reachable for real users by getting the app-operations
backend onto the VNG release line and into a tagged AionCore release.

**Status of the UI:** direction 1c is **built and merged locally** (`2ee9babe4` on `sprint4`), with all
nine states implemented and tested. Every state except `BACKEND UPDATE REQUIRED` is currently
**unreachable at runtime** — that is the entire problem this plan solves.

## The situation, established by evidence

| Fact                                          | Evidence                                                                                                                                                                                       |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The backend is in **no published release**    | `git grep -l app_operations` = **0 files** at v0.1.51, v0.1.53, v0.1.54, while the control `system_settings` = 7 files at each                                                                 |
| Published tags stop at **v0.1.54**            | `git ls-remote --tags ghk` → v0.1.50 … v0.1.54                                                                                                                                                 |
| The code lives on a **personal fork**         | `refs/heads/feat/app-operations-model` @ `a02c027b` on `contributor` = `github.com/minhtq1234/AionCore`. Not on `ghk`. `git log --all -S"app_operations"` finds it in no ref of the main clone |
| The branch is **stale and diverged**          | last commit 2026-07-29; forked from `4089fced5` (release 0.1.50, 2026-07-21); **96 commits ahead / 15 behind** v0.1.54                                                                         |
| The locally bundled binary is **mislabelled** | manifest says `v0.1.56`, the binary reports `0.1.53`, and no v0.1.55/56 tag exists. This is why the feature looks fine on this machine                                                         |

**Consequence:** on any real user's build the GET 404s and the panel renders the update alert. The feature
has never worked outside this machine.

## The decisive simplification

`030_app_operations_model.sql` is three statements, all on one table:

```sql
ALTER TABLE system_settings ADD COLUMN app_operations_model_mode TEXT NOT NULL DEFAULT 'auto'
  CHECK (app_operations_model_mode IN ('auto','fixed'));
ALTER TABLE system_settings ADD COLUMN app_operations_provider_id TEXT;
ALTER TABLE system_settings ADD COLUMN app_operations_model_id TEXT;
```

`028_project_bind` touches `conversations`/`teams`; `029_add_mimo_code_builtin_acp_agent` inserts into
`agent_metadata`. **App-operations depends on neither.** `system_settings` already exists on the release
line.

**Therefore: renumber 030 → 028 and port it alone.** `project_bind`, `mimo`, and the whole memory feature
(031–034, which is a different product) stay behind. The lineage moves **27 → 28**, one entry.

## Scope

**In:**

- `crates/aionui-db/migrations/030_app_operations_model.sql` → **renumbered `028_`**
- `crates/aionui-db/src/models/system_settings.rs`, `repository/settings.rs`, `repository/sqlite_settings.rs`
- `crates/aionui-api-types/src/system.rs`
- `crates/aionui-system/src/settings.rs`, `src/routes.rs`
- `crates/aionui-ai-agent/src/routes/agent.rs`, `src/services/agent.rs` (eligibility / resolution)
- tests: `crates/aionui-app/tests/app_operations_model_e2e.rs`,
  `crates/aionui-ai-agent/tests/agent_availability_integration.rs`

**Out — do not carry across:**

- migrations `028_project_bind`, `029_add_mimo_code_builtin_acp_agent`, `031`–`034` (memory)
- `crates/aionui-memory/**` and `router/memory_adapters.rs` memory wiring
- the remaining ~90 commits on that branch

## Tasks

### 1 — Branch on the release line

Cut a branch from the current `ghk` release-line head (v0.1.54 or later) on
**`khoapnt-vng/aioncore`**. Per the owner: the BE repo is Khoa's, and this merges into that branch when
ready. Do **not** merge the personal fork wholesale — it is 96 commits of unrelated work off 0.1.50.

### 2 — Port by contract, not cherry-pick

The source is three weeks stale and forked from 0.1.50. Re-apply the _behaviour_ onto the current line and
let its own tests prove it. A cherry-pick across 15 intervening commits invites silent conflicts in
`settings.rs`/`sqlite_settings.rs`.

### 3 — Renumber the migration to `028`

Verify at apply time that `028` is genuinely free on the target head (the line ended at 027 when surveyed;
re-check — a competing 028 is the one thing that breaks this plan). Migrations are immutable once
released: never edit 001–027.

### 4 — Bring the tests across

`app_operations_model_e2e.rs` is the acceptance evidence for the UI's nine states. Port it, and confirm it
exercises the eligibility predicates the renderer reimplements client-side (`AppOperationsModelCard`
~:40-55, :105-124) — a renderer that offers a pair the backend rejects falls into a generic save-failure
with no field-level message.

### 5 — Cut a tagged release with artifacts

**khoapnt's step**, unchanged from Sprint 3. Nothing here authorises publishing on their behalf.

### 6 — WePrompt side, atomic

- `ACCEPTED_AIONCORE_SOURCE_COMMIT` (`prepare-aioncore.js:44`, enforced at `:687-690`)
- per-platform checksums
- **regenerate `aioncore-migration-lineage.json`: `entryCount`/`latestVersion` 27 → 28.** It is compared
  with `isDeepStrictEqual` (`verify-bundled-aioncore-resources.js:188`) and no caller may fall back from
  the failure. Sequence it as one atomic step or packaging breaks.
- Write an independent recomputation test **before** regenerating: the existing lineage tests are
  fixture-echo (they write the module's own input back as the fixture).

### 7 — Retire the mislabelled local bundle

`resources/bundled-aioncore/darwin-arm64/manifest.json` claims `v0.1.56` for a binary reporting `0.1.53`
built from an unmerged branch. Once a real tag exists, replace it. Until then it is a trap: it makes the
feature appear to work on this machine only.

## Verification

The feature is done when, on a build pinned to a **published** tag:

1. The panel leaves `BACKEND UPDATE REQUIRED` and reaches `READY`.
2. Auto resolves a model, and the resolved pair persists across a restart.
3. Fixed pins a pair; deleting that provider yields `KEPT` + `Unavailable`, never a silent swap.
4. `Check now` updates the timestamp.
5. With providers present but none eligible, the panel shows `SETUP REQUIRED`.

Until then the UI is correct and dark, and should be described that way.

## Scope decision — 2026-08-18 (owner)

**Only app-operations ships. Memory (031–034) does not, and neither do `028_project_bind` nor
`029_add_mimo_code_builtin_acp_agent`.** The port is therefore exactly:

- one migration, `030_app_operations_model.sql` **renumbered to `028_`**
- the Rust that reads and writes those three `system_settings` columns
- the two tests that prove it

Lineage moves **27 → 28**. Nothing else on that fork branch crosses. The fork keeps its remaining ~90
commits and the memory feature; that divergence is accepted, not resolved, by this plan.

## Open questions for the owner

2. **Who reviews the port?** Sprint 3's rule was that a reviewer must be out-of-band from whoever produced
   the evidence. The original author is this machine.
3. **Does `028_project_bind` / `029_mimo` need to reach the release line separately?** They are unrelated
   to this screen but currently exist only on the fork.
