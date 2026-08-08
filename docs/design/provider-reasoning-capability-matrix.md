# Provider Reasoning Capability Matrix

Status: G0/G1/G2 contract candidate
Evidence frozen: 2026-08-07 (Asia/Ho_Chi_Minh)
Contract version: `1`

This document is the evidence and conformance gate for provider- and model-aware
reasoning controls. It does not enable a provider, change a runtime, or authorize
implementation. Unknown behavior is non-writable and resolves to `unsupported`.

## Immutable evidence bases

All refs were fetched successfully on 2026-08-07 before this document was
written.

| Repository | Fresh ref        | Immutable base                             | Untouched checkout status                                                                                                                                                            |
| ---------- | ---------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AionRS     | `origin/main`    | `4cf42f2d5d0a04d44462bda3df7c1ed66c03be81` | Existing `/Users/lap16603/Projects/aionrs` checkout remained on `fix/compact-reasoning-empty-response` at `e4c4ed982f3114c20563cbeecb8938d3d84800fe`; no files changed in this wave. |
| AionCore   | `origin/main`    | `81ef258913e6ac5076a86d4adcc7edcc0f8f21ef` | Existing checkout remained on local `main` at `928f91c8981bb2475040ff05792f01940eaebc97`, 153 commits behind refreshed `origin/main`; no files changed in this wave.                 |
| WePrompt   | `origin/sprint2` | `02ee3f8d693c572c2f8b33e7d92f5e6d5890af0e` | This detached worktree was clean at the same commit before documentation edits.                                                                                                      |

No runtime baseline suite was run: this bounded wave permits focused,
read-only/document validation only. The baseline statement above is repository
status, not a claim that the three runtime suites pass.

## Evidence rules

A writable profile requires either:

1. an exact model contract from the provider's authoritative documentation and
   an adapter-owned exact-model mapping; or
2. a runtime-advertised profile whose version and full observed envelope pass
   the v1 parser.

An OpenAI-compatible endpoint, a reasoning capability badge, a model-name
substring, or documentation for a different endpoint is not sufficient. A
probe must demonstrate both request acceptance and effective behavior without
retaining prompts, responses, headers, provider bodies, credentials, or private
reasoning. This wave found no approved provider credential in its environment,
so no credentialed probe was run.

## Current enabled inventory

The current WePrompt seed at the immutable base enables two direct-provider
families and permits ACP agents to advertise their own runtime options.

| Runtime/provider              | Exact model            | Authoritative native behavior                                                                                                                                                                                                                                                | v1 profile admitted now                                                                                                                                                                       | Probe status                                      | Decision                                                                                                                                                |
| ----------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Moonshot via AionRS           | `kimi-k2.6`            | `thinking.type` accepts `enabled` (documented default) or `disabled`; omission means enabled. Response evidence is `reasoning_content` when enabled. `thinking.keep` is separate preserved-history behavior and is not exposed as a v1 reasoning control in the first slice. | Configurable enum control `thinking`, values `enabled`/`disabled`, `provider_default` with `resolvedDefault: "enabled"`. Adapter-private mapping is `thinking.type`; default omits the field. | Not run: credential unavailable.                  | **Evidence-ready**, but feature remains disabled until adapter conformance and observed roundtrip pass.                                                 |
| Moonshot via AionRS           | `kimi-k2.5`            | Thinking is enabled by default and can be disabled with `thinking.type`; preserved thinking is not supported. The model is unavailable to newly registered users and is scheduled for platform sunset on 2026-08-31.                                                         | Same descriptor shape as K2.6, with a distinct exact-model adapter rule and source version.                                                                                                   | Not run: credential unavailable.                  | **Evidence-ready but rollout-risky**. Do not add it for new users; retain only while the existing seed and provider availability require compatibility. |
| GreenNode via AionRS/OpenCode | `minimax/minimax-m2.5` | MiniMax documents native `MiniMax-M2.5` as a reasoning model whose thinking cannot be disabled. That does not prove the GreenNode alias, gateway protocol, or effective response behavior.                                                                                   | Unsupported.                                                                                                                                                                                  | Not run: `FORGE_GREENNODE_API_KEY` unavailable.   | **Unknown at gateway**. Keep hidden until a GreenNode-specific contract or bounded acceptance/effect probe exists.                                      |
| GreenNode via AionRS/OpenCode | `openai/gpt-5`         | OpenAI documents configurable reasoning for official GPT-5 endpoints. That does not prove GreenNode's alias, supported wire API, accepted values, omission default, or effective behavior.                                                                                   | Unsupported.                                                                                                                                                                                  | Not run: `FORGE_GREENNODE_API_KEY` unavailable.   | **Unknown at gateway**. Keep hidden until GreenNode-specific evidence exists.                                                                           |
| ACP agents                    | Runtime-defined        | ACP session config options are authoritative only when the active runtime advertises a safely normalizable option and returns a complete post-write observation.                                                                                                             | Runtime profile or unsupported; never a static allowlist.                                                                                                                                     | No active ACP envelope was captured in this wave. | **Unknown per session** until observed.                                                                                                                 |

Authoritative sources checked on 2026-08-07:

- [Kimi model list](https://platform.kimi.ai/docs/models)
- [Kimi thinking models](https://platform.kimi.ai/docs/guide/use-thinking-models)
- [Kimi reasoning effort](https://platform.kimi.ai/docs/guide/use-reasoning-effort)
- [MiniMax OpenAI-compatible API](https://platform.minimax.io/docs/api-reference/text-openai-api)
- [OpenAI reasoning API reference](https://platform.openai.com/docs/api-reference/responses-streaming/response/refusal/delta?lang=curl)

## Evidence-only conformance models

These models are not currently enabled by the WePrompt seed. They freeze
contract shapes without authorizing rollout.

| Exact model                                     | Evidence                                                                                                                                      | Canonical profile shape                                                                                       |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `kimi-k3`                                       | Reasoning is always on. Top-level `reasoning_effort` accepts `low`, `high`, or `max`; documented default is `max`; `thinking` is unsupported. | One enum `effort` control with provider default resolving to `max`; adapter-private field `reasoning_effort`. |
| `kimi-k2.7-code` and `kimi-k2.7-code-highspeed` | Thinking and preserved thinking are always on. Passing `thinking.type: disabled` errors.                                                      | `fixed`, no controls, provider summary supplied by adapter evidence, no reasoning field emitted.              |
| Verified enablement-plus-budget adapter fixture | Synthetic provider-neutral fixture only; no enabled model currently supplies sufficient evidence.                                             | Boolean controller plus bounded integer dependent on `enabled === true`. It cannot enable a real model.       |

## Current implementation gap

At the pinned AionRS base, `openai_defaults()` still advertises provider-wide
effort support with `low`, `medium`, and `high`, and `supports_thinking` is also
provider-wide. Those booleans and lists are not v1 evidence and must not be
projected as writable profiles. AionCore currently transports ACP options as
select-oriented DTOs and has no canonical observed reasoning envelope.
WePrompt currently stores only image-input and OpenAI wire-mode model settings.

## Canonical v1 fixture set (G1)

The following JSON is normative. Implementations may deserialize into native
types, but reserialization used by the shared conformance suite must preserve
the same JSON values and must not add adapter-private keys.

Fixture source used below:

```json
{ "kind": "adapter", "id": "fixture.provider-neutral", "version": "2026-08-07" }
```

### `unsupported.json`

```json
{
  "contractVersion": 1,
  "state": "unsupported",
  "controls": [],
  "source": { "kind": "adapter", "id": "fixture.provider-neutral", "version": "2026-08-07" }
}
```

### `fixed.json`

```json
{
  "contractVersion": 1,
  "state": "fixed",
  "controls": [],
  "summary": "Reasoning is always enabled for this model.",
  "source": { "kind": "adapter", "id": "fixture.provider-neutral", "version": "2026-08-07" }
}
```

### `enum.json`

```json
{
  "contractVersion": 1,
  "state": "configurable",
  "controls": [
    {
      "id": "effort",
      "semantic": "effort",
      "input": "enum",
      "label": "Reasoning effort",
      "description": "Provider-native effort setting.",
      "defaultValue": { "kind": "provider_default" },
      "resolvedDefault": "xhigh",
      "choices": [
        { "value": "minimal", "label": "Minimal" },
        { "value": "xhigh", "label": "Extra high" },
        { "value": "ultra", "label": "Ultra" }
      ]
    }
  ],
  "source": { "kind": "adapter", "id": "fixture.provider-neutral", "version": "2026-08-07" }
}
```

### `boolean.json`

```json
{
  "contractVersion": 1,
  "state": "configurable",
  "controls": [
    {
      "id": "enabled",
      "semantic": "enabled",
      "input": "boolean",
      "label": "Reasoning",
      "defaultValue": { "kind": "provider_default" },
      "resolvedDefault": true
    }
  ],
  "source": { "kind": "adapter", "id": "fixture.provider-neutral", "version": "2026-08-07" }
}
```

### `bounded-integer.json`

```json
{
  "contractVersion": 1,
  "state": "configurable",
  "controls": [
    {
      "id": "budgetTokens",
      "semantic": "budget",
      "input": "integer",
      "label": "Reasoning budget",
      "defaultValue": { "kind": "provider_default" },
      "resolvedDefault": 8192,
      "minimum": 1024,
      "maximum": 32768,
      "step": 1024,
      "unit": "tokens"
    }
  ],
  "source": { "kind": "adapter", "id": "fixture.provider-neutral", "version": "2026-08-07" }
}
```

### `dependent-multi-control.json`

```json
{
  "contractVersion": 1,
  "state": "configurable",
  "controls": [
    {
      "id": "enabled",
      "semantic": "enabled",
      "input": "boolean",
      "label": "Reasoning",
      "defaultValue": { "kind": "provider_default" },
      "resolvedDefault": true
    },
    {
      "id": "budgetTokens",
      "semantic": "budget",
      "input": "integer",
      "label": "Reasoning budget",
      "defaultValue": { "kind": "provider_default" },
      "resolvedDefault": 8192,
      "minimum": 1024,
      "maximum": 32768,
      "step": 1024,
      "unit": "tokens",
      "visibleWhen": [{ "controlId": "enabled", "equals": true }]
    }
  ],
  "source": { "kind": "adapter", "id": "fixture.provider-neutral", "version": "2026-08-07" }
}
```

### `observed-dependent.json`

```json
{
  "scope": {
    "backend": "aionrs",
    "providerId": "fixture-provider",
    "capabilityRevision": "cap_fixture_2026_08_07_a",
    "modelId": "fixture-dependent-model"
  },
  "profile": {
    "contractVersion": 1,
    "state": "configurable",
    "controls": [
      {
        "id": "enabled",
        "semantic": "enabled",
        "input": "boolean",
        "label": "Reasoning",
        "defaultValue": { "kind": "provider_default" },
        "resolvedDefault": true
      },
      {
        "id": "budgetTokens",
        "semantic": "budget",
        "input": "integer",
        "label": "Reasoning budget",
        "defaultValue": { "kind": "provider_default" },
        "resolvedDefault": 8192,
        "minimum": 1024,
        "maximum": 32768,
        "step": 1024,
        "unit": "tokens",
        "visibleWhen": [{ "controlId": "enabled", "equals": true }]
      }
    ],
    "source": { "kind": "adapter", "id": "fixture.provider-neutral", "version": "2026-08-07" }
  },
  "selections": [
    {
      "scope": {
        "backend": "aionrs",
        "providerId": "fixture-provider",
        "capabilityRevision": "cap_fixture_2026_08_07_a",
        "modelId": "fixture-dependent-model",
        "controlId": "enabled"
      },
      "value": { "kind": "explicit", "value": true }
    },
    {
      "scope": {
        "backend": "aionrs",
        "providerId": "fixture-provider",
        "capabilityRevision": "cap_fixture_2026_08_07_a",
        "modelId": "fixture-dependent-model",
        "controlId": "budgetTokens"
      },
      "value": { "kind": "explicit", "value": 16384 }
    }
  ],
  "activeControlIds": ["enabled", "budgetTokens"]
}
```

### `unknown-version.json`

```json
{
  "contractVersion": 2,
  "state": "configurable",
  "controls": [],
  "source": { "kind": "adapter", "id": "fixture.future", "version": "future" }
}
```

Expected result: raw JSON parsing may retain a bounded diagnostic, but v1
narrowing fails and no setter can be called. The fixture must never be coerced
to `unsupported` after partial v1 parsing because doing so can hide an unsafe
shape; the feature-facing result is non-writable/hidden.

### Mapping-field absence assertion

Every valid public fixture above must recursively contain none of these keys:

```json
["request_mapping", "requestMapping", "native_field", "nativeField", "field_path", "fieldPath", "api_field", "apiField"]
```

A valid profile copied with any forbidden key inserted at any depth is the
canonical negative fixture and must be rejected at public AionRS serialization,
AionCore normalization/provider CRUD, and WePrompt raw parsing boundaries.

## Normative validation and dependency rules

- `unsupported` and `fixed` contain exactly zero controls.
- `configurable` contains one through eight controls with unique IDs.
- `enum` has one through sixteen unique primitive choices and no integer bounds.
- `boolean` has no choices or integer bounds.
- `integer` has integer `minimum < maximum`, positive integer `step`, aligned
  explicit/default values, and no choices.
- Defaults and dependency values match the referenced schema exactly; numeric
  coercion and string-to-boolean coercion are forbidden.
- Multiple `visibleWhen` predicates are logical AND.
- An explicit controller selection evaluates to its primitive value.
- `provider_default` evaluates through the controller's verified
  `resolvedDefault`. If that evidence is absent or invalid, the dependent is
  inactive and the adapter profile is not eligible for enablement.
- The backend returns authoritative `activeControlIds`. Only pre-chat may
  compute the initial active set, using the same rules and failing closed.
- A successful mutation returns the complete observed envelope. HTTP success,
  command acknowledgement, or a partial selection is not success.

## `capabilityRevision` lifecycle and atomic invalidation (G2)

### Ownership and storage

AionCore owns the revision. It is a randomly generated opaque token stored on
the provider record, returned with every reasoning profile/scope, and copied
into persisted selections. It must not be a hash or encoding of a credential,
URL, Bedrock configuration, or provider body. AionRS and ACP runtimes consume
the revision supplied by AionCore; WePrompt never generates one.

The immutable profile remains inside the existing per-model `model_settings`
storage introduced by AionCore migration `027_provider_model_settings.sql`.
Migration `038` adds the provider revision and any required profile indexes; it
must not recreate or edit migration `027`. Migration `039` adds bounded scoped
selection storage for assistant defaults/preferences and conversation
snapshots.

### Rotation set

Rotate when any of these effective values changes:

- provider endpoint/base URL or full-URL mode;
- platform/protocol, per-model protocol override, or Bedrock configuration;
- credential identity (compare securely; never place secret material in the
  revision or logs);
- model membership or enabled state;
- exact per-model capability metadata/profile or adapter evidence version;
- any future provider setting documented as changing request projection.

Do not rotate for display name, health-check result, last-check time, latency,
or other observational/UI-only metadata. A no-op update does not rotate.

### Atomic semantics

1. Serialize changes under a provider-scoped mutation lock.
2. Validate the complete replacement provider/profile set before mutation.
3. Mark active runtimes for the old revision non-writable.
4. In one database transaction, write the provider change, generate/store the
   new revision, and invalidate persisted selections carrying the old revision
   for conversations, assistant defaults/preferences, teams, and schedules.
5. Commit, invalidate/stop old runtime instances, and publish one sanitized
   revision-change event. The event contains provider ID, old/new opaque
   revision, result category, and sanitized request ID only.
6. Refresh the exact model profile and full selection set. Do not accept a new
   reasoning write until the complete new observed envelope exists.
7. Release the mutation lock.

Any read or write whose scope revision differs from the current provider row is
rejected even if asynchronous cleanup has not finished. Failure before commit
rolls back and leaves the old scope usable. Failure after commit leaves the new
scope feature-closed until runtime refresh; it never re-enables the old scope.
Renderer generations discard late responses from the old scope. Pre-chat,
assistant, team, and schedule state reset to provider defaults unless every
control, value, schema, and dependency remains valid after explicit re-save
under the new revision.

### Migration reservation

Fresh `origin/main` contains immutable migrations through
`037_direct_agent_prompt_capabilities.sql`; `021` and `022` are occupied. A
read across all refreshed `origin/*` refs found no `038_*` or `039_*` files.
EPIC-003 therefore reserves, in order:

1. `038_provider_reasoning_capability_revision.sql`
2. `039_scoped_reasoning_selections.sql`

This is a planning reservation, not a migration creation. Before creating
either file, fetch/rebase and repeat the all-ref check. If either number is then
occupied, stop and return to the Sprint Controller for two new consecutive
numbers. Once either migration has run or merged anywhere, it is immutable.

## Adapter onboarding checklist

- [ ] Exact model ID and endpoint/protocol are known.
- [ ] Authoritative source URL, retrieval date, source version, and adapter
      version are recorded.
- [ ] Profile fixture matches the canonical v1 JSON shapes.
- [ ] Native payload fixture proves exact field/value and provider-default
      omission inside the adapter boundary.
- [ ] Public fixture recursively proves mapping/native-field absence.
- [ ] Invalid value, unsupported, fixed, malformed, and unknown-version cases
      emit no reasoning field.
- [ ] Complete observed roundtrip proves the requested value and all dependency
      changes.
- [ ] Same-ID capability-revision and model-switch fixtures reject stale state.
- [ ] A bounded credentialed smoke proves acceptance and effective behavior
      without retaining sensitive payloads.

## Gate result

- G0 bases and authoritative Moonshot evidence: **PASS**.
- GreenNode effective capability evidence: **UNKNOWN / unsupported**, not a
  blocker for the provider-neutral contract.
- Credentialed probes: **NOT RUN**, because no approved credential was
  available in the task environment.
- G1 golden contract: **FROZEN AS CANDIDATE**, pending independent review.
- G2 migration/state contract: **038/039 RESERVED AS CANDIDATE**, pending the
  mandatory pre-creation recheck and independent review.
