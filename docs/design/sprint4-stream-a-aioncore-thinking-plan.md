# Stream A — AionCore thinking-control implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or
> superpowers:executing-plans to implement this plan task by task. Use
> superpowers:test-driven-development for every behaviour change.

**Goal:** Let a user turn Kimi's thinking on or off from the chat UI, on the runtime and model they
actually use (AionRS + `kimi-k2.6`), using the parameter Moonshot actually honours.

**Architecture:** AionRS already emits `body["thinking"] = {"type":"enabled"|"disabled"}` on the
OpenAI-compatible path, with **no gate**, and `apply_config_update` already accepts the exact strings
`"enabled"`/`"disabled"`. WePrompt already renders a control for any advertised option with category
`thought_level`. The only missing link is AionCore: it never advertises the option, hard-rejects the id,
and never calls the setter. This plan closes that link and nothing else.

**Tech Stack:** Rust 2024 / Cargo (AionCore), Rust (AionRS, read-only), TypeScript (WePrompt, pin only).

**Supersedes:** the `reasoning_effort` design in
[sprint4-aionrs-reasoning-findings.md](sprint4-aionrs-reasoning-findings.md) §2. That design targeted a
field **kimi-k2.6 ignores** — see §6/§6b of that document for the probe and the vendor docs.

---

## Why this shape, in one table

| Model                            | Knob Moonshot documents               | What AionRS sends today          |
| -------------------------------- | ------------------------------------- | -------------------------------- |
| `kimi-k2.6` (what our users run) | `thinking: {type: enabled\|disabled}` | nothing — AionCore never sets it |
| `kimi-k2.5`                      | `thinking: {type}`                    | nothing                          |
| `kimi-k3`                        | `reasoning_effort: low\|high\|max`    | `reasoning_effort`, if ever set  |

Measured against the live API on 2026-08-18: `reasoning_effort` on `kimi-k2.6` returns 200 for the
nonsense value `"banana"`, while `temperature: 0` is rejected with a precise 400 — the signature of a
field the provider does not parse.

## Immutable bases

- AionCore: fork from `d4d8e87714690cdb230ab7a6987de3ceacbea275` (tag `v0.1.51`), the commit WePrompt
  pins at `prepare-aioncore.js:44`. Published tags stop at **v0.1.54**; v0.1.55 was never published.
- AionRS: `v0.2.6` = `3cb928d451f278e3f88a9664c39ea3db5d13129a`. **Read-only — no changes, no fork.**
- Read pinned refs, never the working trees: the local aioncore tree is v0.1.45 and pins aionrs v0.2.2,
  neither of which we ship.

## Global constraints

- **No new migration, and no reseed of migration 015.** The in-conversation catalog is served by the
  live runtime (`ensure_runtime` → `agent.get_config_options()`), not from stored `agent_metadata`.
  WePrompt pins the exact migration lineage and compares it with `isDeepStrictEqual`
  (`verify-bundled-aioncore-resources.js:188`), so any migration turns a backend-only change into a
  coupled cross-repo release with a hand-edited integrity manifest.
- **No provider-name special cases in shared logic.** EPIC-003 exists to replace family-shaped
  assumptions with per-model capability evidence. Gate on capability, never on the string "moonshot".
- `apply_config_update` **silently ignores** an invalid thinking value — it appends
  `thinking: ignored invalid value "…"` to a returned `Vec<String>` and returns `Ok`. **Validate before
  calling it**, or a bad selection is a silent no-op.
- Every claim in an acceptance report needs a `file:line` or literal command output.

---

## Task 0: DONE 2026-08-18 — gate decided: (a) compat-driven, per exact model

**AionCore can already supply the compat user layer, and does.** It builds a `ProviderCompat` and passes
it into the engine:

- `factory/aionrs.rs:100` — `resolve_model_compat_overrides(&model_id, &row.model_settings)`
- `:102` — `let (base_url, mut compat_overrides) = resolve_aionrs_url_and_compat_with_mode(…)`
- `:110` — `compat_overrides.image_input = model_overrides.image_input;`
- `:191` — `compat_overrides` passed on to construction

`ProviderCompat` (aionrs `compat.rs:12-29`) flattens `reasoning: ReasoningCompat` — the struct holding
`supports_thinking` / `supports_effort` / `effort_levels` (`:139-152`) — right next to `image_input`.

> **Correction, 2026-08-18 (found during Task 1).** This section originally claimed
> `compat_overrides.reasoning.supports_thinking` was directly reachable because `ProviderCompat` flattens
> `reasoning`. **That was wrong.** AionCore's `compat_overrides` is a _bespoke_ `AionrsCompatOverrides`
> (`crates/aionui-ai-agent/src/types.rs`), not aionrs's `ProviderCompat`, and it had no reasoning field at
> all. Task 1 therefore added an `AionrsReasoningOverrides` sub-struct and merges it onto the resolved
> `config.compat.reasoning` at construction. The **conclusion survives** — the gate is compat-driven, needs
> no TOML file and no fork — but it cost one new struct rather than zero. Verify a field path compiles
> before asserting it is reachable.

AionCore never references these fields today: `git grep -n "ReasoningCompat|supports_thinking|supports_effort|effort_levels" d4d8e877 -- crates` returns **zero hits**. That absence is the whole gap.

**Decision: (a) compat-driven.** Advertise the thinking option iff `compat.supports_thinking()`, and set
that flag from **per-exact-model evidence**, mirroring how `image_input` already works. Moonshot's docs
give the evidence: `thinking.type` for `kimi-k2.5`, `kimi-k2.6`, `kimi-k2.7-code`.

**Why this is the right shape rather than a convenience.** The doc comment on `image_input`
(`compat.rs:23-26`) states the principle outright:

> "Image-input support resolved for the concrete provider/model pair. `None` is treated as `Unknown`;
> **provider presets intentionally do not supply family-level defaults.**"

`image_input` obeys that rule. `reasoning` breaks it — `openai_defaults()` claims `supports_effort: true`
for the entire OpenAI family (`compat.rs:305-309`), which is exactly how we ended up sending Kimi a field
it discards. Fixing this aligns `reasoning` with the precedent already living in the same struct, and it
is precisely what EPIC-003 was chartered to do: capability evidence per exact model, never a
provider-name or family assumption.

**Blast radius — the question Task 0 had to answer.** Only models with recorded evidence get
`supports_thinking = true`, so only they are advertised, so only they can have a `thinking` field set.
Every other provider and model is byte-identical to today. This matters because the projector emits
`thinking` **ungated** (`projector.rs:205-215`): gating advertisement is what keeps the field off routes
we have not evidenced.

**Follow-on requirement discovered while deciding (do not skip).** Because emission is ungated and the
engine holds thinking as session state, a mid-conversation **model switch** would carry a previously
selected `thinking` to a model with no evidence. `apply_config_update` already handles exactly this
hazard for image input — it resets `compat.image_input` when `model_changed` — so mirror that: on model
change, clear thinking unless the new model also has evidence. Cover it with a test.

### Task 1b — populate the capability evidence (REQUIRED; Task 1 alone ships nothing)

**Task 1 is done (`27c832f4b` on `feat/aionrs-thinking`) and the option is still invisible on every real
conversation.** The gate works, but nothing sets it: `factory/aionrs.rs` never assigns
`compat_overrides.reasoning`, and the OpenAI-compatible preset sets `supports_thinking: Some(false)`
(aionrs `compat.rs:306`), so `supports_thinking()` is false for Kimi and the option is omitted.

This was a scoping error in the Task 1 brief, not an implementer omission — the brief listed the gate but
not the evidence that opens it. Close it here:

- [ ] Populate `compat_overrides.reasoning.supports_thinking` from **per-exact-model evidence**, set
      alongside `compat_overrides.image_input` at `factory/aionrs.rs:110`.
- [ ] Source the evidence from a registry asset mirroring
      `assets/model-capabilities/image_input_models.json` (same `schema_version` + `providers → models`
      shape), seeded from the vendor docs: `kimi-k2.5`, `kimi-k2.6`, `kimi-k2.7-code`. **Do not match on
      the string "moonshot".**
- [ ] Failing test first: a resolved config for `kimi-k2.6` advertises the option; one for a model with no
      evidence does not.
- [ ] Note for whoever does this: `services/provider_health.rs:230-241` applies the other compat overrides
      but not `reasoning`. Harmless for a connectivity probe, but it is a divergence — decide deliberately
      whether to mirror it there.

### Status 2026-08-18 — Tasks 1, 1b and 2 are DONE on `feat/aionrs-thinking`

| Commit      | Task                                                             |
| ----------- | ---------------------------------------------------------------- |
| `27c832f4b` | 1 — advertise + accept `thought_level`, gated, lock-free UI read |
| `533375cec` | 1b — pin thinking support from per-exact-model evidence          |
| `e9a83ac64` | 2 — restore the selection across a session rebuild               |

Gates: `aionui-ai-agent`, `aionui-conversation` and `aionui-api-types` suites all green;
`cargo clippy --all-targets -- -D warnings` clean on all three; `cargo check --workspace --all-targets`
clean. `cargo fmt --check` still reports only the pre-existing `aionui-mcp/src/oauth_service.rs` drift
inherited from `c310353d4`. Every new test was mutation-proven.

**Correction to this plan's Task 2 brief (my error, propagated from the spike).** It asserted that
`CliArgs` "has no thinking field". It does — `thinking: Option<String>` and `thinking_budget` at aionrs
`config.rs:315-317`, consumed at `:416`. The operative half of the note still holds: AionCore hardcodes
both to `None` (`agent.rs:198-199`), and routing through `CliArgs` remains wrong because `Config::resolve`
runs before `supports_thinking` is known. But the stated reason was false — verify a field's absence
before building an instruction on it.

**The model-switch hazard is smaller than Task 0 described, and lands elsewhere.** An aionrs model switch
never reaches `apply_config_update` with a model at all: `ConversationService::update` kills the task on
`model_changed` (`service.rs:1948-1956`) and the agent is rebuilt. `apply_config_update` has exactly one
caller repo-wide. So the hazard falls on the **restore** path Task 2 introduces, where it is now gated on
the freshly resolved `supports_thinking`.

**A second gate was needed that nobody anticipated.** `resolved_thought_level_value` is written by _both_
the `thought_level` and `reasoning_effort` categories, so an assistant last used on **ACP** can persist
`"high"` — a value `apply_config_update` silently ignores. The restore path now rejects effort-shaped
values rather than handing them to a function that discards them quietly.

**`services/provider_health.rs` deliberately not mirrored.** `build_probe_engine` passes
`CliArgs.thinking: None`, the probe serves no `config_options`, and `supports_thinking` gates nothing on
the request path (the OpenAI projector emits `body["thinking"]` purely from `request.thinking`). Mirroring
would be a provable no-op that falsely implies the probe measures thinking capability.

**Registry shape.** `assets/model-capabilities/thinking_models.json`, mirroring `image_input_models.json`
(`schema_version: 1`, `providers → { api, models }`), with `moonshot-cn` and `moonshot-global` buckets each
listing `kimi-k2.5`, `kimi-k2.6`, `kimi-k2.7-code`; `kimi-k3` deliberately absent (it uses
`reasoning_effort`, a different capability). Bucket selection is by API root or provider-plus-official-host,
then exact model id — **no provider-name or family branching in logic**. Aggregator endpoints (OpenRouter,
Novita, SiliconFlow, PPIO) list these ids but were deliberately excluded: whether they pass `thinking`
through is untested.

### Implementation note for Task 1's gate

Follow `image_input`'s pattern: extend the per-model capability resolution behind
`resolve_model_compat_overrides` with a thinking capability, sourced from a registry asset alongside
`assets/model-capabilities/image_input_models.json` (same `schema_version` + `providers → models`
shape). Seed it from the vendor documentation: `kimi-k2.5`, `kimi-k2.6`, `kimi-k2.7-code`. Do **not**
match on the string "moonshot".

<details>
<summary>Original Task 0 brief, retained for context</summary>

### Task 0 (original): Decide the advertisement gate

The projector emits `thinking` **ungated** (`projector.rs:205-215` at `shipped-v0.2.6` — contrast the
`reasoning_effort` branch immediately above at `:194-203`, which _is_ gated on `supports_effort()`).
That means once AionCore sets thinking, the field goes to **every** OpenAI-compatible provider on the
conversation's route — including ones that may reject an unknown `thinking` object with a 400.

So the gate must live on **advertisement**: only offer the control where the capability is evidenced.

- [ ] **Step 1: Establish how a compat override reaches AionRS from AionCore.**

`ReasoningCompat { supports_thinking, supports_effort, effort_levels }` is user-configurable TOML,
merged as `user.supports_thinking.or(defaults.supports_thinking)` (aionrs `compat.rs:215`), with
round-trip parsing proven in `compat_test.rs:29-30,143-144`. `openai_defaults()` sets
`supports_thinking: Some(false)` (`compat.rs:306`).

Determine, with citations, **how AionCore supplies that user layer** — a config file it writes, a
provider record field, a builder argument, or not at all:

```bash
cd /Users/lap16603/Projects/aioncore
git grep -n "compat\|ReasoningCompat\|supports_thinking" d4d8e877 -- 'crates/**/*.rs' | head -30
```

- [ ] **Step 2: Choose the gate and write it down.** Exactly one of:
  - **(a) compat-driven (preferred):** AionCore supplies `supports_thinking = true` for providers whose
    models document it, and advertises the option iff `compat.supports_thinking()`. Capability-driven,
    matches the epic's charter, and needs no new concept.
  - **(b) AionCore-side model evidence:** if AionCore cannot reach the compat user layer, gate on its own
    per-model capability data. State where that data lives.
  - **(c) advertise unconditionally for aionrs:** only if Steps 1–2 prove no non-thinking provider can be
    reached, which is unlikely. Record the blast radius if chosen.

**Expected:** one named gate with citations, and an explicit note of which providers would newly receive
a `thinking` field in their request body.

> **If Step 1 shows AionCore cannot influence compat at all, stop and re-plan.** Advertising a control
> that makes unrelated providers 400 is worse than shipping nothing.

</details>

---

## Task 1: Advertise and accept the thinking option

**Files:**

- Modify: `crates/aionui-ai-agent/src/manager/aionrs/agent.rs`
- Modify: `crates/aionui-ai-agent/src/agent_task.rs` (the test at `:601-609`)

- [ ] **Step 1: Write the failing test first.**

`agent_task.rs:601-609` currently holds `aionrs_set_config_option_rejects_unavailable_option`, which
asserts on the literal string `"thought_level"` — it pins exactly the behaviour we are removing and will
go red on its own. Re-point it at a genuinely unknown id (e.g. `"definitely_not_an_option"`), then add:

```rust
#[tokio::test]
async fn aionrs_advertises_thinking_when_the_provider_supports_it() {
    let agent = test_agent_with_thinking_support().await; // per the Task 0 gate
    let options = agent.config_options().await.expect("config options");
    let thinking = options
        .config_options
        .iter()
        .find(|o| o.id == "thought_level")
        .expect("thought_level advertised");
    assert_eq!(thinking.category.as_deref(), Some("thought_level"));
    assert_eq!(thinking.option_type, "select");
    let values: Vec<&str> = thinking.options.iter().map(|o| o.value.as_str()).collect();
    assert_eq!(values, vec!["enabled", "disabled"]);
}

#[tokio::test]
async fn aionrs_does_not_advertise_thinking_without_capability_evidence() {
    let agent = test_agent_without_thinking_support().await;
    let options = agent.config_options().await.expect("config options");
    assert!(options.config_options.iter().all(|o| o.id != "thought_level"));
}

#[tokio::test]
async fn aionrs_rejects_an_invalid_thinking_value() {
    let agent = test_agent_with_thinking_support().await;
    let err = agent.set_config_option("thought_level", "sometimes").await.unwrap_err();
    assert!(format!("{err}").contains("not selectable"));
}
```

The invalid-value test is **load-bearing**: `apply_config_update` ignores a bad value and returns `Ok`,
so without validation a nonsense selection would silently no-op and the UI would show it as applied.

- [ ] **Step 2: Run them and confirm they fail.**

```bash
cd /Users/lap16603/Projects/aioncore
cargo test -p aionui-ai-agent aionrs_ 2>&1 | tail -20
```

Expected: the three new tests fail; the re-pointed rejection test passes.

- [ ] **Step 3: Add the option builder**, mirroring the existing one at `agent.rs:610-625`:

```rust
const AIONRS_THOUGHT_LEVEL_OPTION_ID: &str = "thought_level";

fn aionrs_thought_level_config_option(current_value: String) -> AcpConfigOptionDto {
    AcpConfigOptionDto {
        id: AIONRS_THOUGHT_LEVEL_OPTION_ID.to_owned(),
        name: Some("Thinking".to_owned()),
        label: None,
        description: None,
        // WePrompt derives its control from this category (agentRuntimeCatalog.ts:238);
        // it is a two-value select, not a low/medium/high scale, because kimi-k2.x
        // exposes thinking.type = enabled|disabled and has no effort levels.
        category: Some("thought_level".to_owned()),
        option_type: "select".to_owned(),
        current_value: Some(current_value),
        options: vec![
            aionrs_mode_select_option("enabled", "On"),
            aionrs_mode_select_option("disabled", "Off"),
        ],
    }
}
```

`aionrs_mode_select_option` (`agent.rs:627`) is a generic `AcpConfigSelectOptionDto` builder; reuse it
rather than duplicating.

- [ ] **Step 4: Advertise it, behind the Task 0 gate**, in `config_options()` (`agent.rs:571-575`):

```rust
pub async fn config_options(&self) -> Result<GetConfigOptionsResponse, AgentError> {
    let mut config_options = vec![aionrs_mode_config_option(self.approval_manager.current_mode())];
    if self.supports_thinking() {
        config_options.push(aionrs_thought_level_config_option(self.current_thinking_value()));
    }
    Ok(GetConfigOptionsResponse { config_options })
}
```

Implement `supports_thinking()` per the Task 0 gate, and `current_thinking_value()` returning
`"enabled"`/`"disabled"` for the session's present state — seeded in Task 2.

- [ ] **Step 5: Accept the selection** in `set_config_option()` (`agent.rs:577-596`), replacing the
      single-id guard with a match that keeps the existing mode branch byte-for-byte:

```rust
match option_id {
    AIONRS_MODE_OPTION_ID => {
        if !is_aionrs_session_mode(value) {
            return Err(AgentError::bad_request(format!(
                "Value '{value}' is not selectable for config option '{option_id}'"
            )));
        }
        self.set_mode(value).await?;
    }
    AIONRS_THOUGHT_LEVEL_OPTION_ID => {
        // apply_config_update ignores an unrecognised value and still returns Ok,
        // so validate here or a bad selection silently no-ops.
        if !matches!(value, "enabled" | "disabled") {
            return Err(AgentError::bad_request(format!(
                "Value '{value}' is not selectable for config option '{option_id}'"
            )));
        }
        self.engine
            .lock()
            .await
            .apply_config_update(None, None, Some(value.to_owned()), None, None, None);
        self.record_thinking_value(value);
    }
    _ => {
        return Err(AgentError::bad_request(format!(
            "Config option '{option_id}' is not available"
        )));
    }
}

Ok(SetConfigOptionResponse {
    confirmation: ConfigOptionConfirmation::Observed,
    config_options: Some(self.config_options().await?.config_options),
})
```

`ConfigOptionConfirmation::Observed` is not cosmetic: WePrompt's persistence branch
(`service_ops.rs:79,97-101`) is gated on it.

- [ ] **Step 6: Run the tests.**

```bash
cargo test -p aionui-ai-agent aionrs_ 2>&1 | tail -20
```

Expected: all pass, including the re-pointed rejection test.

- [ ] **Step 7: Commit.**

```bash
git add crates/aionui-ai-agent/src/manager/aionrs/agent.rs crates/aionui-ai-agent/src/agent_task.rs
git commit -m "feat(aionrs): advertise and accept a thinking control"
```

---

## Task 2: Make the selection survive a session rebuild

Migration 019's columns already exist and are read, and `service.rs:867-871` **already writes
`extra.thought_level` without gating on agent type** — so the value is in the database today and is
dropped at deserialization, because `AionrsBuildExtra` has no field for it while `AcpBuildExtra` does.
**No migration is required.**

**Files:**

- Modify: `crates/aionui-api-types/src/agent_build_extra.rs`
- Modify: `crates/aionui-ai-agent/src/factory/aionrs.rs` (around `:181-198`)
- Modify: `crates/aionui-ai-agent/src/manager/aionrs/agent.rs`
- Modify: `crates/aionui-conversation/src/session_context.rs` (around `:394-396`)

- [ ] **Step 1: Failing test first** — a rebuilt session reports the previously selected value:

```rust
#[tokio::test]
async fn aionrs_restores_the_selected_thinking_value_on_rebuild() {
    let agent = rebuild_agent_with_extra(json!({ "thought_level": "disabled" })).await;
    let options = agent.config_options().await.expect("config options");
    let thinking = options.config_options.iter().find(|o| o.id == "thought_level").expect("advertised");
    assert_eq!(thinking.current_value.as_deref(), Some("disabled"));
}
```

- [ ] **Step 2: Add `thought_level: Option<String>` to `AionrsBuildExtra`**, matching `AcpBuildExtra`.
- [ ] **Step 3: Carry it onto `AionrsResolvedConfig`** alongside `session_mode`.
- [ ] **Step 4: Apply it at construction** via `engine.set_initial_reasoning_effort`'s thinking analogue
      — i.e. `apply_config_update(None, None, Some(value), None, None, None)` before the first turn, and
      seed `current_thinking_value()` from it.
      **Do not route it through `CliArgs`:** that struct has no thinking field (aionrs
      `config.rs:310-325`) and AionCore hardcodes `thinking: None, thinking_budget: None` at
      `agent.rs:190-191`.
- [ ] **Step 5: Read it back on rebuild** in `session_context.rs`, mirroring
      `apply_runtime_permission_seed`.
- [ ] **Step 6: Run the tests, then the crate suites.**

```bash
cargo test -p aionui-ai-agent 2>&1 | tail -10
cargo test -p aionui-conversation 2>&1 | tail -10
```

- [ ] **Step 7: Commit.**

---

## Task 3: Prove it on a real Kimi turn — **the acceptance gate**

A unit test cannot show that Moonshot honoured anything. This task is the reason the whole plan exists.

- [ ] **Step 1: Build the backend locally and run WePrompt dev against it.**

```bash
cd /Users/lap16603/Projects/aioncore && cargo build --release 2>&1 | tail -5
cd /Users/lap16603/Projects/WePrompt/.worktrees/sprint4
PATH="/Users/lap16603/Projects/aioncore/target/release:$PATH" bun run dev
```

**Confirm the bundle actually rebuilt before believing any result** — electron-vite does not restart the
main process on source changes, and comparing `out/main/index.js`'s mtime against the source is what
catches a stale run.

- [ ] **Step 2: Observe the control.** Open a `kimi-k2.6` chat; the model selector must offer
      **Thinking → On/Off**. Confirm it is **absent** for a provider without the capability — a control
      that appears everywhere is the fail-open this epic exists to remove.

- [ ] **Step 3: Prove the wire.** With thinking **disabled**, send a reasoning-heavy prompt and capture
      `usage.completion_tokens_details.reasoning_tokens` from the response. Repeat with thinking
      **enabled**. Disabled must produce **materially** fewer reasoning tokens — ideally zero.

This is the discriminating measurement. `reasoning_effort` failed exactly here: `low` and `high` were
statistically indistinguishable and a nonsense value behaved like a valid one. **If enabled/disabled do
not differ, stop — the control is inert and must not ship**, whatever the unit tests say.

- [ ] **Step 4: Prove persistence.** Select a value, reload, and confirm the selector still shows it.
- [ ] **Step 5: Record the evidence** in a results document alongside the smoke record, including the
      token counts for both arms.

---

## Task 4: Ship it

- [ ] Cut and publish a tagged AionCore release with artifacts. **This is khoapnt's** — AionCore build and
      signing ownership is unchanged from Sprint 3, and nothing here authorizes publishing on their behalf.
- [ ] In WePrompt: bump `ACCEPTED_AIONCORE_SOURCE_COMMIT` (`prepare-aioncore.js:44`, enforced at
      `:687-690`) and the per-platform checksums. **Leave `aioncore-migration-lineage.json` untouched** —
      if it needs editing, a migration crept in and this plan was violated.
- [ ] No renderer changes and no new i18n keys for the in-conversation control: `AionrsSendBox.tsx:320-328`
      already consumes `useAcpConfigOptions`, and `agent.thoughtLevel.label` already exists. The pre-chat
      surfaces (Guid, scheduled tasks) remain separate work — spec Finding 3a.

## Verification checklist

- [ ] Task 0's gate is named, cited, and its blast radius recorded.
- [ ] An invalid thinking value is **rejected**, not silently ignored.
- [ ] The option is advertised only where capability is evidenced, and proven absent otherwise.
- [ ] A real `kimi-k2.6` turn shows materially different reasoning-token counts between enabled and
      disabled. **Without this, nothing ships.**
- [ ] The selection survives a reload.
- [ ] No new migration; `aioncore-migration-lineage.json` unchanged.
- [ ] AionRS unchanged — no fork, no re-pin.
