# Sprint 4 Plan

- **Drafted:** 2026-08-17
- **Proposed window:** 2026-08-17 → 2026-08-28 (two weeks)
- **Status:** draft for review
- **Predecessor:** [Sprint 3 plan](sprint3-plan.md). Sprint 3 was closed as-is; its internal release
  was **not** published and is parked (see Parked, below).

## Sprint goal

**Make the reasoning control reach the runtime our users actually use.**

Sprint 4 is deliberately small. It has two streams and no release work.

Success looks like: a user on AionRS with `kimi-k2.6` can choose how hard the model thinks, using
the control that already exists in the product — and the in-chat template-creation path is proven
working end to end instead of merely merged.

### Non-goals

- **Release and packaging work of any kind.** Parked by decision (below).
- **Creative Studio 2** — its own programme on `feat/creative-studio-2`, with its own gates and
  capacity. Not in this sprint's budget.
- EPIC-004 Excel, the Outlook/FDL connectors, SSO, the VNG org transfer.
- BUG-015 Kimi token totals — explicitly deferred this sprint. When it returns it should share one
  live Kimi session with Stream A's acceptance.
- Kimi-through-OpenRouter stays unsupported until OpenRouter-specific evidence exists.
- The `/health` capability seam — **superseded for this slice**, see DR-A1.

---

## What planning discovered, and why the sprint changed shape

Sprint 4 was first scoped as "EPIC-003 flagship plus a reliability lane". Live probing changed it
twice. The evidence is recorded here because it invalidates parts of EPIC-003's charter that are
still written as current fact elsewhere.

### Finding 1 — a reasoning control already ships, and it is evidence-based

`buildAgentRuntimeThoughtLevelOption` (`agentRuntimeCatalog.ts:238`) derives a **Thinking level**
option from the runtime's advertised `config_options`, matching id or category `thought_level` or
`reasoning_effort`. It is rendered by `AcpSendBox.tsx:1252`, `AionrsSendBox.tsx:1321`, the ACP /
AionRS / Guid model selectors, and the assistant editor's defaults section, and it writes back
through `ipcBridge.acpConversation.setConfigOption`. This is not a name heuristic and it is not a
gap. EPIC-003's rationale — that no reasoning control exists — is **wrong** and must be corrected.

Sprint 3 also already landed the fail-closed half: `06cd65bed` stopped heuristics granting reasoning
support, and `b972d3be2` made the discovery-only guard structurally un-disableable.

### Finding 2 — that control is unreachable on every runtime we can run

Measured 2026-08-17 against a live dev instance (`~/.aionui-dev`, aioncore 0.1.53):

| Source of truth          | Method                                                                | Result                                                                                                                                                        |
| ------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent catalog, 41 agents | `GET /api/agents/management`                                          | Only **Aion CLI** (aionrs, installed) advertises any option, and only `mode`. All ACP entries advertise nothing statically.                                   |
| Installed runtimes       | `binary_name` on PATH                                                 | Only `opencode` present. `claude`, `codex`, `gemini` absent, so 39 of 41 agents are `installed: false`.                                                       |
| OpenCode 1.17.13         | **live ACP handshake** (`opencode acp`, `initialize` + `session/new`) | Advertises `model` and `mode` only. Full-payload keyword scan: `reasoning: 0`, `thought: 0`, `effort: 0`. Its model list _does_ include `moonshot/kimi-k2.6`. |
| 34 conversations         | `GET /api/conversations`                                              | All `aionrs`, all on `kimi-k2.6`. Zero carry `config_options`. Zero mentions of a thought level.                                                              |
| 28 assistants            | `GET /api/assistants`                                                 | Zero thought-level fields.                                                                                                                                    |

So the control renders for nobody, and the population that would want it — AionRS on Kimi, which is
34 of 34 real conversations — is exactly the population that cannot get it.

### Finding 3 — the missing piece is one backend advertisement, not a three-repo epic

`mode` and `model` already round-trip: advertised in `config_options`, rendered by the existing
selectors, written back via `setConfigOption`, resumed from conversation `extra`
(`session_mode`, `current_model_id`, `cached_config_options`, `pending_config_options`).

If AionRS advertised a reasoning option under id or category `thought_level` / `reasoning_effort`,
**the existing WePrompt UI would render it with no client change.**

Two pieces of schema are already shipped inside the 001–027 baseline:

- `019_assistant_thought_level_defaults.sql` — `default_thought_level_mode` (`auto`|`fixed`) and
  `default_thought_level_value` on `assistant_definitions`, `last_thought_level_value` on
  `assistant_preferences`, `default_thought_level_mode` and `resolved_thought_level_value` on
  `conversation_assistant_snapshots`.
- `027_provider_model_settings.sql` — the per-exact-model carrier. **Not independently verified
  here:** the local aioncore checkout is v0.1.45 and carries only 20 migrations, so this rests on
  Sprint 3's T5.1 re-charter. A1 must confirm it against the shipped release line before A3 relies
  on it.

- `015_aionrs_mode_catalog.sql` is the precedent for _how_ a non-ACP runtime advertises options: it
  seeds the catalog into `agent_metadata.config_options` by SQL precisely because aionrs gets no ACP
  handshake sync, so that pre-chat surfaces reading `/api/agents/management` can see it.

**Consequence: no new migration is required for this slice**, and EPIC-003's `028`/`029` plan steps
are not part of it. (Those numbers are stale anyway — Sprint 3's v0.1.55 candidate takes
`028_oauth_token_client_id.sql`.)

---

## Decisions recorded

| id        | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **DR-A1** | **Capability discovery rides `config_options`, not `/health`.** This answers BUG-045's open question in the affirmative: the existing handshake mechanism already satisfies the discovery-seam requirement. The earlier decision to extend `GET /health` is **superseded for this slice** and should not be built. Revisit only if a consumer needs a capability fact that no runtime catalog or session can carry.                                                                                                                  |
| **DR-A2** | **No runtime schema floor in contract v1.** Unchanged. Only the packaging-time floor (`minimumSupportedVersion: 19`) exists; a second, independently maintained floor would drift, and a drifted floor fails open.                                                                                                                                                                                                                                                                                                                   |
| **DR-A3** | **AionRS is forked to an owned host.** The six `aion-*` crates are pinned to `github.com/iOfficeAI/aionrs`, which the team cannot merge into. Fork to `khoapnt-vng/aionrs` at the **shipped** tag and re-pin. Do not silently adopt the four-tag gap to `v0.2.10` that EPIC-003's plans assumed.                                                                                                                                                                                                                                     |
| **DR-A4** | **Per-exact-model gating, not a runtime-wide seed.** Seeding one reasoning option onto the aionrs runtime the way `015` seeds `mode` would show the control for models that cannot honour it — which breaks the epic's own rule and re-creates the fail-open the Sprint 3 guard closed. Gate on exact model via `027_provider_model_settings`.                                                                                                                                                                                       |
| **DR-A5** | **Verification is in dev; shipping is not in scope.** AionRS compiles into the aioncore binary, which WePrompt bundles. Dev resolves aioncore from PATH, so the slice is fully verifiable in dev with a locally built backend. Reaching a user needs a tagged backend release, which is parked. Say this plainly in the sprint review; do not describe the slice as shipped.                                                                                                                                                         |
| **DR-A6** | **EPIC-003's charter text is corrected, not silently superseded.** TASKS.md and the backend decision record still assert that no reasoning control exists and that the epic is 31 tasks across three repositories. Both are wrong as of Finding 1. Correcting the record is a task, not a courtesy.                                                                                                                                                                                                                                  |
| **DR-A7** | **The advertised option is `category: "thought_level"`, `id: "reasoning_effort"`.** Not a free choice: WePrompt derives on category `thought_level` with id candidates `thought_level` and `reasoning_effort` (`agentRuntimeCatalog.ts:238`, `useAcpConfigOptions.ts:279`), the existing AionRS test fixture uses exactly this pair, and the cron detail page already renders the i18n key `acp.config.reasoning_effort` (`TaskDetailPage.tsx:581`). Pin the pair in a test so a later rename cannot silently un-render the control. |

---

## Stream A — the reasoning control reaches AionRS and Kimi

Ordered. Each task ends with evidence, not with an opinion.

### A1 Confirm the provider path can carry a reasoning parameter — **spike, timeboxed to one day**

- [ ] Read the aionrs provider adapter for Moonshot and establish whether a reasoning/effort
      parameter can be passed through to the Moonshot API at all, and under what field name.
- [ ] Record the exact field, its accepted values, and the per-model differences between
      `kimi-k2.6` and `kimi-k2.5`.
- [ ] **This is the one genuine unknown in the slice.** The local aioncore checkout is 153 commits
      behind, so read the shipped line, not the working tree. If the parameter cannot be carried,
      **stop and re-plan** — every later task depends on it.

**Expected:** a written answer naming the field and values, with file:line references on the shipped
release line.

### A2 Fork AionRS to an owned host and re-pin

- [ ] Fork `iOfficeAI/aionrs` to `khoapnt-vng/aionrs`. Record the fork point as a full 40-character
      SHA **and** the tag it corresponds to.
- [ ] Re-pin all six `aion-*` crates (`Cargo.toml:56-61`) to the owned host at the **currently
      shipped** tag. Do not change the tag and the host in the same commit.
- [ ] Prove the workspace builds and its tests pass with **no behaviour change** before any reasoning
      work begins. A green build on the re-pin alone is the gate.

**Expected:** two separable commits, the second a pure host swap with identical test results.

### A3 Advertise the reasoning option, gated per exact model

- [ ] Emit a `config_options` entry with `category: "thought_level"` and `id: "reasoning_effort"`
      (DR-A7) for models whose `027_provider_model_settings` evidence says they support it.
- [ ] A model with no evidence advertises **nothing**. Absent must mean unsupported, never
      permissive — this is the fail-open the Sprint 3 guard exists to prevent.
- [ ] Failing test first: with evidence present the option is advertised; with evidence absent it is
      not; an unknown model is not.

**Expected:** focused Rust tests covering supported, unsupported, and unknown models.

### A4 Honour the selected value

- [ ] Apply the selected value on the request to the provider, using A1's exact field.
- [ ] `provider_default` remains a sentinel: omit the field rather than sending a guessed value.
- [ ] An unknown or unvalidated value is rejected, not passed through.

**Expected:** tests proving the field is present when selected, absent for `provider_default`, and
that an invalid value never reaches the provider.

### A5 Verify in the running application

- [ ] Build the backend locally, launch dev with it on PATH, and confirm by observation:
      the **Thinking level** menu appears for `kimi-k2.6`, the selection survives a reload, and the
      menu is **absent** for a model with no reasoning evidence.
- [ ] Capture the live handshake payload as evidence, the same way planning did. A passing unit test
      is not this task's evidence.
- [ ] Keep a control model in the same session so an all-absent result cannot pass vacuously.

**Expected:** the observed handshake, plus before/after observations of the menu on both models.

### A6 Scheduled tasks carry the reasoning level — **depends on A5**

- [ ] `CreateTaskDialog` renders `GuidModelSelector` but never passes `thoughtLevelOption`, and its
      `config_options` state is only ever hydrated from an edited job or reset to `undefined`. No
      control ever writes it, so a scheduled task cannot carry a level. `resolveCronAgentConfig`
      already forwards `config_options` and `TaskDetailPage.tsx:581` already renders a heading for
      it — the persistence and display halves exist and are currently dead.
- [ ] Pass the derived option in; write the choice into `config_options`.
- [ ] **When the agent advertises no levels, render no control** — consistent with every existing
      chat surface. Do not invent a disabled control for a capability that cannot exist.
- [ ] On the task detail page, when no level was chosen, **show the effective level** marked as the
      default rather than hiding the row. The point of the row is to answer "what will this run at".
- [ ] i18n keys in all 12 locales **inside this task**. A repo test requires every referenced key in
      every locale, so deferring translation designs in a red window.

**Expected:** a task created with a level chosen runs at that level, verified in the running app;
the detail page states the level in both the chosen and default cases.

### A7 Correct the record

- [ ] Update TASKS.md's EPIC-003 entry and the backend decision record for DR-A1 through DR-A6:
      a reasoning control exists and is evidence-based; discovery rides `config_options`; no new
      migration; `028` is taken; the epic is far smaller than 31 tasks.
- [ ] Close BUG-045's remaining live items: the `undefined`-is-permissive idiom and the guard's
      inability to express an explicit negative. Note the `ReadonlySet` item is already fixed by
      `b972d3be2`.
- [ ] **BUG-045's own citations for the idiom are wrong and should be corrected in place.** Verified
      2026-08-17: the sites are `renderer/hooks/agent/useModelProviderList.ts:66` (BUG-045 omits the
      `agent/` segment) and `renderer/pages/guid/utils/modelUtils.ts:39` (BUG-045 says `:38`). Both
      read `(functionCalling === true || functionCalling === undefined) && excluded !== true`.

---

## Stream B — finish EPIC-002 (template packs from chat)

A0+/1–3 are merged (`!87`, `!90`, `!94`). One gate keeps the epic Active: the path has never been
watched working.

### B1 Run the live creation smoke on both backends

- [ ] Walk it as a user: ask for a reusable template in a chat, in **English and Vietnamese**; see
      the review card; click once to install; confirm it appears in the Template Gallery and is
      usable. Then discard one and confirm nothing is stored.
- [ ] Run on **both** backends (AionRS and ACP), because the send-time composition differs.
- [ ] Confirm the hash binding: change the underlying file between the card appearing and the click,
      and check the card reports the change instead of installing something else.
- [ ] Record the result either way. A failed smoke is the point of running it.

**Expected:** a written walkthrough per backend and per language, with the hash-binding case shown.

### B2 Fix what the smoke finds, or close the epic

- [ ] Fix defects found, failing test first.
- [ ] If clean, mark **Epic A done**. Epic B and Epic C entry criteria are unchanged and remain
      unscheduled.

---

## Parked, by decision

The Sprint 3 internal release is parked entirely. Recorded here so it is not mistaken for done:

- The release candidate is unpublished. `aioncore-source-gates.json` records
  `candidateStatus: conditional_local_candidate_with_green_exact_head_gates_awaiting_independent_review_windows_and_publish_authorization`.
- `go-no-go.md` is unsigned with every identity field pending. BUG-017 remains unbuilt, so its own
  rules admit only _Conditional go_ or _No-go_.
- **The independent-review request is stale**: it names WePrompt `0de7d524f`, but the release
  worktree head is `0d953184c` — five later commits, four of them touching `prepare-aioncore.js`,
  the bundled lineage asset, `_build-reusable.yml`, and the packaging tests. The release's own
  invalidation rules void affected evidence, so the request must be re-bound to a fresh candidate
  before any reviewer signs it.
- BUG-040 (P1), BUG-017 (P1), BUG-015 (P1), BUG-043 (P2) stay open.
- Evidence decays against a moving tree. If slack appears, the highest-value single unpark is
  re-binding the RC and re-issuing the review request.

**Independent review, for whoever picks this up.** It means a named person who did not produce the
evidence verifies nine scope assertions against exact SHAs, and issues a written disposition on two
retained red results — WePrompt's red full-suite attempt 1 and AionCore's invalid Nextest run whose
PTY lost the failing test identity. Silence is not approval. The load-bearing property is being
**out-of-band**: network access to resolve refs on the publishing host, and no stake in the evidence.
That requirement exists because of BUG-040, where a sandboxed agent fabricated a SHA and
self-referential tests greened it. Review and the release-owner authorization are separate steps;
one person may hold both, but then nothing catches a reviewer error, so split them.

---

## Operating rules

- Branch from the exact accepted head; record base and head commits in every acceptance report.
- One bounded change per PR. Failing test first for changed behaviour; focused green evidence; full
  suite before merge.
- Changed user-facing text ships i18n keys in all 12 locales in the same task, then
  `bun run i18n:types` and `node scripts/check-i18n.js`.
- **Every agent-introduced SHA, run id, digest, or checksum is verified out of band at review time.**
  A sandboxed agent asked for a real-world anchor will produce a plausible fabrication, and
  self-referential tests will green it. BUG-040 is why this rule exists.
- Creative Studio 2 runs in parallel on the same machine. Concurrent sessions inflate test durations
  several-fold, so treat a timeout failure as a load artifact until proven otherwise — and do not
  treat a slow run as a failing one.
- Do not leave handoff material in `docs/superpowers/`; that path is local working state and has
  lost documents three times.

## Exit criteria

- [ ] A1 answered in writing against the shipped release line, with the exact provider field named.
- [ ] AionRS forked to an owned host and re-pinned, with an unchanged-behaviour green build.
- [ ] The **Thinking level** menu observed appearing for `kimi-k2.6` and observed **absent** for a
      model without reasoning evidence, in the running application.
- [ ] A scheduled task created with a chosen level runs at that level; the detail page states the
      level in both the chosen and default cases.
- [ ] TASKS.md and the backend decision record corrected for DR-A1…DR-A6; BUG-045's live items closed.
- [ ] The EPIC-002 creation path walked on both backends in both languages, with the result recorded
      either way.
- [ ] The sprint review states plainly that Stream A is verified in dev and **not shipped**, because
      the backend release is parked.
