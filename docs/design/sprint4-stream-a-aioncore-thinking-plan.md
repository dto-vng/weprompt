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

## Task 0: Decide the advertisement gate — **do this first, it shapes Task 1**

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
