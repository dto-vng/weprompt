# Stream A Task 1 — can the shipped AionRS Moonshot path carry a reasoning parameter?

**Verdict: GO**, conditional on one non-engineering commitment (§5).

Evidence base, read via `git show`/`git grep` at pinned refs — **not** the working trees, both of which are
stale and are what sent EPIC-003's earlier plans at a baseline we do not ship:

| Repo     | Ref read                                                  | Why this one                                                 |
| -------- | --------------------------------------------------------- | ------------------------------------------------------------ |
| AionRS   | tag `v0.2.6` = `3cb928d451f278e3f88a9664c39ea3db5d13129a` | the pin in the shipped AionCore's `Cargo.toml:56-61`         |
| AionCore | `d4d8e87714690cdb230ab7a6987de3ceacbea275` (v0.1.51)      | `ACCEPTED_AIONCORE_SOURCE_COMMIT` (`prepare-aioncore.js:44`) |

Recon correction worth keeping: the **stale local aioncore working tree pins aionrs `v0.2.2`**, while the
**shipped commit pins `v0.2.6`**. Reading the working tree would have investigated the wrong AionRS
entirely. Also confirmed against the remote: published aioncore tags stop at **v0.1.54**, so v0.1.55 was
never published and the Sprint 3 release really is parked.

---

## 1. AionRS needs NO changes — the parameter is already wired

This is the headline, and it **removes the need for the fork** this plan previously required.

- `crates/aion-providers/src/projector.rs:196` — literally `body["reasoning_effort"] = json!(effort);`,
  top-level in the chat-completions body, gated on `compat.supports_effort()` (`:194-203`).
- `crates/aion-config/src/compat.rs:305-309` — `openai_defaults()` sets `supports_effort: Some(true)` and
  `effort_levels: Some(["low","medium","high"])`. **The gate is already open** for any OpenAI-shaped
  provider, which is how Moonshot resolves.
- `crates/aion-agent/src/engine.rs:561-568` — `LlmRequest { …, reasoning_effort: … }`.
- Two public setters already exist: `set_initial_reasoning_effort` (`engine.rs:347`) and
  `apply_config_update(…, effort, …)` (`engine.rs:1103-1111`).

**AionCore calls neither.** `git grep -n "set_initial_reasoning_effort\|apply_config_update" d4d8e877 --
'crates/**/*.rs'` returns **zero hits**. That is the entire defect.

## 2. AionCore — about five contained edits in one crate, no new migration

**A1 — advertise and accept the option.** `crates/aionui-ai-agent/src/manager/aionrs/agent.rs`:
`config_options()` (`:571-575`) returns a hardcoded one-element vector; add a `thought_level` entry whose
`options` come from the **live resolved compat** `effort_levels()` (aionrs `compat.rs:437-439`), emitted
only when `supports_effort()` is true. `set_config_option()` (`:577-596`) currently hard-rejects any id
that is not the mode option — accept the new id, **validate the value against `effort_levels()` first**
(see §4.3), then call `apply_config_update(None, None, None, None, Some(value), None)` and return
`ConfigOptionConfirmation::Observed`, which is what unlocks the persistence that already exists.

**A2 — a shipped test pins the opposite.** `crates/aionui-ai-agent/src/agent_task.rs:601-609`
(`aionrs_set_config_option_rejects_unavailable_option`) asserts on the literal string `"thought_level"`.
It goes red the moment A1 lands; re-point it at a genuinely unknown id.

**A3 — make the value survive a session rebuild** (three files, still no migration).
`AionrsBuildExtra` has no `thought_level` field while `AcpBuildExtra` does — and
`aionui-conversation/src/service.rs:867-871` **already writes `extra.thought_level` without gating on
agent type**. The value is therefore already in the database today and is silently dropped at
deserialization. Add the field, carry it onto `AionrsResolvedConfig` (`factory/aionrs.rs:181-198`), apply
it via `set_initial_reasoning_effort`, and read it back on rebuild
(`session_context.rs:394-396`). **Do not route it through `CliArgs`** — that struct has no effort field
(aionrs `config.rs:310-325`) and AionCore hardcodes `thinking: None, thinking_budget: None`
(`agent.rs:190-191`).

**A4 — do NOT add migration 028 and do NOT reseed 015.** In-conversation advertisement is served by the
**live runtime** (`ensure_runtime` → `agent.get_config_options()`, `service.rs:3054-3092`), not from
stored `agent_metadata.config_options`.

## 3. WePrompt — zero renderer changes, zero new i18n keys

For the **in-conversation** control: `AionrsSendBox.tsx:320-328` already calls `useAcpConfigOptions`,
which derives the option by category with an id fallback (`useAcpConfigOptions.ts:47-58,279`), and
`AionrsModelSelector.tsx:122` renders it only when non-null. Nothing indexes `config_options[0]` or
asserts its length. `agent.thoughtLevel.label` already exists.

Only the pin changes: `ACCEPTED_AIONCORE_SOURCE_COMMIT` (`prepare-aioncore.js:44`, enforced at
`:687-690`) and the per-platform checksums. The pre-chat surfaces still need the separately planned
client task (spec Finding 3a).

## 4. Corrections to this sprint's plan — three decisions were wrong

**DR-A3 (fork AionRS to `khoapnt-vng`) is unnecessary. Strike it.** §1 shows AionRS needs no edits, so
there is nothing to merge into a fork. The fork was agreed on the assumption that the reasoning
parameter had to be added there; it does not. Re-pinning six crates to a fork we do not need is pure
maintenance cost. **Task 2 of the Stream A plan should be deleted, not executed.**

**DR-A4 (gate per exact model via `027_provider_model_settings`) is wrong.** The migration is three
lines — a single `model_settings TEXT` JSON blob column on `providers`, not a table and not per-model
rows — and its Rust type is closed: `ModelSettings { image_input, openai_api_mode }`
(`aionui-api-types/src/provider.rs:170`). A `reasoning_effort` key written there is **silently discarded**
at the API boundary, with no error. It is also the wrong home conceptually: effort is a per-conversation
runtime selection, not a per-model capability override.

**"No new migration is needed" was right, for the wrong reason** — not because 027 already carries the
setting (it does not), but because the catalog is served by the live runtime. Keeping it that way is a
**hard constraint, not a convenience**: WePrompt pins the exact lineage in
`aioncore-migration-lineage.json` (`entryCount: 27`, per-entry checksums, a fingerprint) and compares it
with `isDeepStrictEqual` (`verify-bundled-aioncore-resources.js:188`). Any 028 — or a 015 reseed for the
pre-chat surface — converts a backend-only change into a coupled cross-repo release with a hand-updated
integrity manifest.

**Migration 019 is real and already read**, with one omission in our record: it also adds
`default_thought_level_mode` to `conversation_assistant_snapshots`, and ends with a destructive
`DELETE FROM client_preferences` purging six retired keys. Resolution precedence
(`override → fixed default → auto last-used`) is live at `service.rs:1381-1389`, and
`service_ops.rs:97-101` already has a `"thought_level" | "reasoning_effort"` persistence branch — gated
on `confirmation == Observed`, which is unreachable for aionrs today only because `set_config_option`
errors first. **The persistence half is already built; it just serves a backend that isn't ours.**

## 5. The hard parts, riskiest first

1. **[HUMAN] Committing to an AionCore release.** There is no WePrompt-only increment with partial user
   value: the runtime hard-rejects the id (`agent.rs:579-583`) and a test pins that rejection. A
   client-only slice ships a control that either does not render or 400s on selection. WePrompt consumes
   AionCore as a checksum-pinned downloaded artifact, so reaching a user requires cutting and publishing
   a tag. Verification in **dev** against a locally built binary needs no publication (spec DR-A5).
2. **[HUMAN] Which effort levels Moonshot actually accepts, and whether it accepts the parameter at
   all.** The shipped code is model-agnostic here: `effort_levels` is a flat `Option<Vec<String>>` on the
   provider (`compat.rs:151`), and AionRS's only per-model rule table (`model_max_tokens`,
   `compat.rs:446-466`) has **no moonshot/kimi entry**. So `["low","medium","high"]` is an OpenAI default
   nobody has confirmed against Moonshot. Shipping a level the provider rejects fails at the provider and
   reads as a product bug.
3. **`apply_config_update` does not error on a bad effort — it returns a string.** aionrs
   `engine.rs:1158-1167` appends `"effort: not supported…"` / `"effort: invalid level…"` to a returned
   change list. So A1 must validate **before** calling it, or an invalid selection silently no-ops.

## 6. Live Moonshot probe — the parameter is NOT demonstrably honoured

Run 2026-08-18 against `https://api.moonshot.ai/v1`, model `kimi-k2.6`, using the key already configured
in the dev profile. The credential was used only inside the renderer and never printed.

**Fact 1 — the API validates parameters it understands, and did not validate this one.**
`temperature: 0` is rejected with a precise `400 invalid temperature: only 1 is allowed for this model`.
`reasoning_effort: "banana"` returns **200**. An API that strictly validates a known field while
silently accepting nonsense in another is describing that other field as unknown.

**Fact 2 — `low` does not curtail reasoning.** With `max_tokens: 4000` on a deliberately hard prompt,
`low` and `high` both ran to the cap (`finish: "length"`, 3999 reasoning tokens), twice each. An honoured
`low` should have stopped early at least once.

**Fact 3 — at a natural stop, the nonsense value behaves like a valid one.** Prompt "What is 17 times 23?",
`max_tokens: 2000`, all runs `finish: "stop"`:

| variant        | reasoning_tokens |
| -------------- | ---------------- |
| `low`          | 103, 125, 114    |
| `high`         | 128, 142, 190    |
| `banana`       | 141, 129         |
| (no parameter) | 116              |

`high` trends above `low`, which taken alone would look like an effect — but **`banana` sits inside
`high`'s range** and the no-parameter control sits inside `low`'s. If the field were parsed as an enum,
an invalid value would error or fall back to the default; it does neither distinguishably. With
`temperature` forced to 1 and n=2–3, this is underpowered.

**Verdict: INCONCLUSIVE, leaning ignored.** There is no positive evidence Moonshot honours
`reasoning_effort` for `kimi-k2.6`, and one strong indication it does not.

**Why this matters more than it looks.** The GO in §1 rests on `supports_effort()` being true — but that
comes from `openai_defaults()` in **AionRS**, an assumption about the OpenAI _family_, not a fact about
Moonshot. AionRS's only per-model rule table has no Kimi entry. So the chain can be wired perfectly and
still produce a control that changes nothing: the user picks "high", the field goes over the wire, and
the provider discards it. That is the same failure shape as EPIC-002 — a feature that looks wired, passes
every test, and does nothing — which this sprint has already paid to learn once.

**Do not build the AionCore slice on the assumption that Kimi honours this** until it is settled by
vendor documentation or a properly powered comparison. If it turns out to be ignored, the honest product
answer is to advertise the control only for providers with evidence, which is what the epic's
capability-driven design was always for.

## 6b. Vendor docs settle it — and the design was wrong

`platform.moonshot.ai/docs/api/chat` (redirects to `platform.kimi.ai`), read 2026-08-18:

| Model          | Reasoning knob                 | Values                                             |
| -------------- | ------------------------------ | -------------------------------------------------- |
| **kimi-k3**    | `reasoning_effort` (top level) | `low` \| `high` \| `max` (default `max`)           |
| **kimi-k2.6**  | `thinking` **object**          | `type: "enabled"\|"disabled"`, `keep: "all"\|null` |
| kimi-k2.7-code | `thinking` object              | `type` must be `"enabled"`                         |
| kimi-k2.5      | `thinking` object              | `type: "enabled"\|"disabled"`                      |
| moonshot-v1    | none documented                | —                                                  |

So `reasoning_effort` **is** real at Moonshot — but only for **k3**. On **k2.6**, the model 34 of 34 real
conversations use, it is simply an unknown field, which is exactly what the probe measured. The
`["low","medium","high"]` default in AionRS is wrong twice over: `medium` is not a k3 value, and k2.x
does not use effort at all.

**The two AionRS compat flags are exactly backwards for Moonshot.** Verified at `shipped-v0.2.6`:

- `projector.rs:205-211` already emits `body["thinking"] = {"type":"enabled"}` / `{"type":"disabled"}` on
  the OpenAI-shaped path — **precisely the shape Moonshot documents for k2.x**.
- but `compat.rs:306` — `openai_defaults()` sets `supports_thinking: Some(false)` while `:305-309` sets
  `supports_effort: Some(true)`.

Net effect: AionRS sends the parameter Moonshot **ignores** and withholds the one it **honours**. The
"gate is already open" line in §1 is true for `reasoning_effort` and irrelevant, because that gate opens
onto a field k2.6 discards.

**This is a fail-open in the shipped defaults**, and it vindicates EPIC-003's original charter: capability
must be established per **exact model**, not per provider family. `supports_effort: true` for the whole
OpenAI family is precisely the provider-name-shaped assumption the epic was chartered to remove.

### Revised design (supersedes §2's A1)

- **kimi-k2.6 / k2.5 → advertise a thinking on/off control**, mapping to `thinking.type`. It is a
  **boolean**, not a three-level scale. Any UI offering low/medium/high for k2.6 is fiction.
- **kimi-k3 → advertise `reasoning_effort`** with `low`/`high`/`max`.
- Both need a **Moonshot compat override** — `supports_thinking = true`, `supports_effort = false` for
  k2.x. Good news: `ReasoningCompat` is **user-configurable TOML**, merged as
  `user.supports_thinking.or(defaults…)` (`compat.rs:215`, round-trip proven in `compat_test.rs:29-30,143-144`).
  So this remains **configuration, not an AionRS code change** — §1's headline survives, its reasoning
  does not.
- AionCore's side changes accordingly: `apply_config_update` takes `thinking` and `thinking_budget`
  parameters that AionCore currently hardcodes to `None` (`agent.rs:190-191`). The k2.x path calls the
  **thinking** setter, not the effort one.

**Consequence for the sprint:** the approved "build the five edits and publish a tag" plan would have
shipped a three-level effort control that does nothing on k2.6. The work is still small and still worth
doing — but the control's shape, the values it offers, and which setter it calls all change. Re-plan
before writing code.

## 7. Still unverified

- Whether Moonshot honours `reasoning_effort` for `kimi-k2.6`/`k2.5`, and with which values (§5.2). No
  live provider call was made.
- Whether a locally built AionCore can be produced on this machine (Rust toolchain, workspace build time)
  — not attempted in this read-only spike.
- The pre-chat advertisement path for aionrs (`/api/agents/management`) was scoped to migration 015's
  seed; making the control appear on Guid and the cron dialog is separate work (spec Finding 3a).
