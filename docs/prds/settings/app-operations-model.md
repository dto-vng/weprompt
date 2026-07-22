# App Operations Model

Status: Proposed
Date: 2026-07-22
Target branch: `feat/app-operations-model`

## Summary

WePrompt needs one app-wide language model for internal intelligence that is independent of whichever model a user chooses in an individual chat. This model will first power conversation context compaction and will later support Memory and the interactive Butler.

The feature consists of an AionCore-owned model selection plus a central broker in the desktop main process. Callers invoke registered operations such as `context.compact`; they do not choose providers, construct clients, or define retry policy themselves. Normal chats remain usable when the operations model is missing or unhealthy.

## Why This Comes Before Memory

Memory is a collection of durable conversation and work context. User Context is a separate user profile containing personal information, preferences, and standing instructions. Both may eventually be read or updated by models, but Memory first needs a consistent writer.

Today, multiple chats can run concurrently on different providers and models. If each chat model writes memory or compacts context independently, the format, quality, latency, cost, and failure behavior vary by session. A dedicated app-wide role gives WePrompt a stable execution boundary before Memory storage and retrieval are introduced.

## Current State

- Providers and assistants are backend-owned business data exposed through AionCore APIs.
- Individual conversations store their own selected provider and model.
- AionRS context compaction already creates a structured snapshot and compatible `Context.md` handoff.
- The current local compaction path resolves the conversation's model, builds a provider client directly, and applies compaction-specific timeout, retry, parsing, and error behavior.
- The Butler resolves a normal assistant and uses the existing interactive assistant runtime.
- There is no app-wide model role, shared background-task registry, or central policy for non-interactive model calls.

## Goals

- Give app-owned operations one explicit model selection, independent of chat models.
- Make Auto mode useful without hiding which model was resolved.
- Give Fixed mode predictable behavior when a user wants an explicit provider and model.
- Centralize provider resolution, health, task policy, structured-output validation, retries, concurrency, cancellation, and operational metadata.
- Keep task prompts and limits registered in code rather than supplied by renderer callers.
- Migrate context compaction as the first real consumer without changing its snapshot or `Context.md` contracts.
- Provide a stable foundation for Memory and Butler without implementing either feature in this slice.
- Keep normal chat functional when app operations are not configured or are temporarily unavailable.

## Non-Goals

- Implementing Memory persistence, retrieval, ranking, editing, or UI.
- Changing User Context or merging it with Memory.
- Changing Butler behavior or moving interactive assistant execution into the broker.
- Creating hidden conversations to execute background operations.
- Supporting tools, streaming, multi-turn sessions, or permission prompts in the broker.
- Silently using the active chat model as a fallback.
- Allowing each feature to create its own provider client or choose arbitrary generation settings.
- Cross-model failover after an operation starts.
- Cloud synchronization of the app operations setting or audit history in this slice.

## User Experience

### Settings Placement

Add an **App operations** section under **Settings > Models**. It contains:

- **Selection**: `Auto` or `Fixed`.
- **Model**: provider and model picker, enabled only in Fixed mode.
- **Resolved model**: the provider and model currently used by Auto or Fixed resolution.
- **Health**: `Ready`, `Checking`, `Setup required`, or `Unavailable` with an actionable explanation.
- **Used by**: initially `Context compaction`; later this list can include `Memory` and `Butler` without changing the selection model.

Changing the selection affects new operations. It does not change existing conversations or their selected models.

### Auto Mode

Auto is the default mode. It uses the single app-default provider/model resolved by AionCore. It does not choose an arbitrary model from the user's provider list.

For the first release, eligibility means:

1. the provider is enabled and has usable credentials or an authentication mechanism available;
2. the model is enabled;
3. the provider/model supports text chat completion;
4. the most recent health state is not a known hard failure; and
5. AionCore has designated the candidate as the current app default.

The UI always shows the resolved provider and model. Auto is not an instruction to switch models per task or per call.

### Fixed Mode

Fixed mode stores a provider ID and model ID. The broker uses only that pair. If the provider is deleted, disabled, unauthenticated, or unhealthy, app operations pause and Settings shows `Unavailable`. The broker never silently substitutes another model.

### No Available Model

If Auto cannot resolve a candidate, Settings shows `Setup required` and links to provider setup. Normal chats continue to work. Context compaction uses its deterministic rules-based fallback, so context handoff remains available at lower quality.

### Health Semantics

- `Ready`: the selection resolves and no current hard failure is known.
- `Checking`: a user-requested or freshness-triggered probe is running.
- `Setup required`: no eligible model can be resolved.
- `Unavailable`: a Fixed selection exists but cannot currently be used, or a recent operation/probe produced a hard provider failure.

Health is advisory and time-bound. A stale success does not guarantee the next request will succeed; execution errors still flow through the broker's normalized error contract.

## Persistence and API Ownership

The app operations selection is business data and must be persisted by AionCore, not `ConfigStorage`, `ProcessConfig`, or a renderer store.

Proposed backend contract:

```ts
type AppOperationsModelSetting =
  | { mode: 'auto' }
  | { mode: 'fixed'; provider_id: string; model_id: string };

type ResolvedAppOperationsModel = {
  setting: AppOperationsModelSetting;
  resolved_model: { provider_id: string; model_id: string } | null;
  health: 'ready' | 'checking' | 'setup_required' | 'unavailable';
  reason_code?:
    | 'no_eligible_model'
    | 'provider_missing'
    | 'provider_disabled'
    | 'model_missing'
    | 'model_disabled'
    | 'auth_required'
    | 'health_check_failed';
  checked_at?: string;
};
```

Endpoints:

- `GET /api/app-operations/model` returns the persisted setting and current resolution.
- `PUT /api/app-operations/model` validates and persists Auto or Fixed selection, then returns the new resolution.
- `POST /api/app-operations/model/check` probes the resolved model and returns refreshed health.

The API never returns provider credentials. AionCore applies current-user isolation in the same way as provider settings.

### Deterministic Auto Resolution

AionCore owns a versioned, deterministic app-default policy so every app process resolves Auto identically. The policy may designate a bundled/recommended provider model or a backend-owned user default, but it must return at most one provider/model pair and expose that pair through the resolution API. The desktop app must not reproduce the ranking policy.

The persisted setting remains `{ mode: 'auto' }`; the resolved pair is derived. If AionCore has no eligible app default, resolution is `setup_required`; it does not fall through to another configured chat model. If provider configuration or the backend policy changes, the next operation may resolve a different pair. A resolution change is visible in Settings and operation metadata.

## Architecture

```text
Renderer settings ──HTTP adapter──> AionCore selection + provider truth
                                           │
                                           v
Feature caller ──typed main-process call──> App Operations Broker
                                           │
                         task registry ─────┤
                         resolver/health ───┤
                         queue/retry/audit ─┤
                                           v
                                     provider client
```

### Component Boundaries

#### AionCore

- Persists Auto or Fixed selection.
- Resolves the effective provider/model from backend-owned provider data.
- Reports selection health without exposing credentials.
- Validates that a Fixed provider/model exists at save time while still preserving a previously valid selection if it later becomes unavailable.

#### Desktop Main Process

- Owns `AppOperationsBroker` under `packages/desktop/src/process/services`.
- Owns the code-defined task registry and provider client construction.
- Fetches a fresh or cached backend resolution before execution.
- Applies input/output validation, timeout, retry, concurrency, deduplication, and cancellation.
- Emits redacted operational metadata.
- Exposes only typed, registered operations across a bridge when a renderer caller is required.

#### Common Layer

- Defines shared API and bridge types.
- Keeps transport adapters free of task logic.

#### Renderer

- Renders and updates the setting through the backend API adapter.
- Shows resolution and health.
- May request a registered task, but cannot supply a system prompt, provider, model, temperature, token limit, retry count, or response parser.

### Butler Boundary

The Butler is interactive and therefore remains on the existing assistant runtime, which already supports streaming, tools, sessions, and permissions. Later, Butler configuration should inherit the resolved App Operations Model as its default model identity. It must not route interactive turns through `AppOperationsBroker`.

## Task Registry

Every operation is registered in code with a typed profile. Call sites identify a task and provide validated task input.

```ts
type AppOperationTaskDefinition<Input, Output> = {
  id: string;
  prompt_version: string;
  validate_input: (value: unknown) => Input;
  build_messages: (input: Input) => Array<{
    role: 'system' | 'user';
    content: string;
  }>;
  output:
    | { mode: 'text'; validate: (value: unknown) => Output }
    | { mode: 'json'; schema: JsonSchema; validate: (value: unknown) => Output };
  temperature: number;
  max_output_tokens: number;
  timeout_ms: number;
  max_transient_retries: number;
};
```

Task definitions are immutable at runtime. Prompt changes require a new `prompt_version`. Secrets and provider credentials never enter task inputs.

The first registered task is `context.compact`.

## Broker Contract

```ts
type AppOperationErrorCode =
  | 'not_configured'
  | 'model_unavailable'
  | 'provider_auth_failed'
  | 'provider_rate_limited'
  | 'provider_timeout'
  | 'provider_request_failed'
  | 'queue_full'
  | 'invalid_input'
  | 'invalid_output'
  | 'canceled';

type AppOperationSuccess<Output> = {
  ok: true;
  output: Output;
  operation: {
    task_id: string;
    prompt_version: string;
    provider_id: string;
    model_id: string;
    duration_ms: number;
    attempts: number;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
};

type AppOperationFailure = {
  ok: false;
  error: {
    code: AppOperationErrorCode;
    retryable: boolean;
  };
  operation: {
    task_id: string;
    prompt_version: string;
    provider_id?: string;
    model_id?: string;
    duration_ms: number;
    attempts: number;
  };
};
```

The primary API is conceptually `runTask(taskId, input, options)`. Type-safe wrappers such as `runContextCompact(input, options)` should be exported to callers so arbitrary string task IDs do not spread through feature code.

### Execution Sequence

1. Reject an unknown task or invalid input before provider resolution.
2. Resolve the current app operations model from AionCore.
3. Return `not_configured` or `model_unavailable` when resolution is not usable.
4. Enqueue the operation within the broker's bounded in-memory queue.
5. Build task messages and create the provider client only after admission.
6. Execute with the task's timeout and caller cancellation signal.
7. Retry only transient failures against the same provider/model.
8. Parse and validate output using the task definition.
9. Return the normalized result and emit redacted operational metadata.

### Concurrency and Deduplication

- The broker has one app-wide concurrency limit, initially `2`.
- The queue is bounded, initially `50` waiting operations.
- A task wrapper may provide a deterministic deduplication key, such as conversation ID plus target turn ID for context compaction.
- When a queued or running operation with the same task ID and deduplication key exists, callers join the same result rather than creating a duplicate provider request.
- Canceling one joined caller detaches that caller. The underlying operation is canceled only after all joined callers cancel.
- A queued operation canceled before admission never creates a provider client.
- Queue state and retry attempts are in memory and are not durable across app restart.

Durable retry intent belongs to the calling feature. Future Memory jobs, for example, must persist their own pending/failed state rather than depending on the broker queue.

### Retry Policy

The broker retries only provider timeouts, rate limits, and request failures marked transient. It does not retry authentication failures, missing configuration, queue overflow, invalid input, invalid output, or cancellation. Retries use bounded exponential backoff with jitter and remain on the resolved provider/model captured when the operation was admitted.

There is no cross-model failover. A later independent operation in Auto mode may resolve a different model if backend provider state changed.

### Error Ownership

The broker maps provider-specific failures to `AppOperationErrorCode`. Callers decide their product fallback:

- context compaction uses deterministic rules-based compaction;
- future Memory marks its durable job as pending or failed;
- future UI-triggered operations show an actionable localized state.

Provider errors and raw model output do not cross into renderer-facing error messages.

## Operational Metadata and Privacy

Each attempt emits an operational event containing only:

- task ID and prompt version;
- status and normalized error code;
- provider ID and model ID;
- start time and duration;
- attempt count;
- token usage when returned by the provider; and
- queue wait duration and whether a result was deduplicated.

Operational events must not contain system prompts, user prompts, conversation content, task input, model output, provider credentials, full provider URLs, or raw provider errors. Existing application logging and telemetry retention rules apply. This slice does not add a user-facing history database.

## Pilot: `context.compact`

The existing context compaction flow becomes the first broker task.

### Preserved Behavior

- The structured snapshot fields remain `goal`, `current_state`, `decisions`, `artifacts`, `user_preferences`, `open_questions`, `next_steps`, and `do_not_forget`.
- Existing transcript, previous snapshot, previous markdown, and pinned-context limits remain unchanged unless separately measured and approved.
- `through_turn_id` semantics remain unchanged.
- Existing `Context.md` rendering and continuation handoff remain compatible.
- If the model operation cannot run or returns invalid output, deterministic compaction remains the fallback.

### Changed Behavior

- Context compaction uses the resolved App Operations Model, not the conversation's provider/model.
- Prompt, structured-output schema, limits, retry policy, and error normalization move into the `context.compact` task definition and broker.
- Provenance records the actual app operations provider/model and prompt version.
- The feature call site no longer lists providers or constructs a client.

### Compatibility Strategy

During rollout, the bridge response retains the current compaction result shape required by the renderer. New operation metadata is additive. Older Context snapshots and generated `Context.md` files require no migration.

The deterministic fallback is invoked for `not_configured`, `model_unavailable`, `queue_full`, provider failures, timeout, and `invalid_output`. Cancellation caused by conversation disposal does not trigger a replacement operation.

An older AionCore build that does not expose the app operations endpoints is treated as `not_configured`: Settings explains that an application update is required, normal chats continue to work, and context compaction uses the deterministic fallback. The desktop app does not persist a temporary duplicate setting locally.

## Security Requirements

- Treat all conversation text, previous snapshots, markdown, and pins as untrusted data in task prompts.
- Keep the system prompt code-owned and outside renderer input.
- Do not expose provider credentials across the main/renderer boundary.
- Validate task input before provider resolution and validate model output before returning it.
- Bound input size, output size, timeout, retries, queue length, and concurrency for every task.
- Propagate cancellation on app shutdown and conversation disposal.
- Redact raw provider errors and all model content from operational metadata.
- Preserve current-user isolation when reading or writing the app operations setting.

## Delivery Slices

### Slice 1: Foundation

- AionCore persistence and model-resolution endpoints.
- Shared API types and desktop adapter.
- Settings > Models App operations UI with Auto, Fixed, resolved model, and health.
- Main-process task registry and broker.
- Provider client factory integration.
- Normalized errors, timeout, retries, cancellation, bounded queue, deduplication, and redacted metadata.

### Slice 2: Context Compaction Pilot

- Register `context.compact`.
- Route current model-based compaction through the broker.
- Preserve deterministic fallback and snapshot/`Context.md` compatibility.
- Remove feature-owned provider resolution and client policy after migration.

### Deferred

- Memory storage, retrieval, background jobs, audit UI, and user controls.
- Butler model inheritance and onboarding behavior.
- Additional operations such as title generation or classification.
- Durable job scheduling and cloud synchronization.

## Verification

### Resolver and Settings

- Auto resolves deterministically across restarts with the same provider data.
- Auto updates its visible resolved model after eligible provider data changes.
- Fixed persists across restart and never silently switches.
- Deleting, disabling, or de-authenticating the Fixed provider produces `Unavailable`.
- No eligible model produces `Setup required` while normal chat remains usable.
- Settings updates do not modify any conversation model.

### Broker Unit Tests

- Unknown task and invalid input fail before model resolution or client creation.
- JSON and text output validation accept valid output and reject invalid output.
- Provider failures map to the expected normalized error code.
- Only transient failures retry, with the configured attempt cap.
- Timeout and caller cancellation abort the provider request.
- Operational metadata excludes representative prompt text, conversation text, output text, credentials, URLs, and raw errors.

### Queue and Concurrency Tests

- No more than two operations execute concurrently.
- The bounded queue rejects overflow with retryable `queue_full`.
- Equal task ID and deduplication key share one provider request.
- One joined caller can cancel without canceling remaining callers.
- Canceling all joined callers aborts the underlying request.
- Canceling a queued operation prevents client creation.
- Chat execution is independent of broker saturation or failure.

### Context Compaction Integration Tests

- A successful broker result produces the current snapshot schema and `through_turn_id`.
- Provenance identifies the App Operations Model and prompt version.
- Missing configuration, unavailable model, provider failure, timeout, and invalid output use deterministic fallback.
- Conversation model and App Operations Model can differ, and compaction uses the latter.
- Existing snapshot-to-`Context.md` output remains byte-compatible for the same snapshot fixture.
- Continuation handoff can consume both pre-feature and post-feature snapshots.

## Acceptance Criteria

- A user can choose Auto or a Fixed provider/model under Settings > Models.
- The effective model and health are visible and persist correctly.
- Background operations never silently borrow a chat model.
- A registered task can run through one central main-process broker with validated input and output.
- The broker enforces bounded concurrency, timeout, retry, cancellation, deduplication, normalized errors, and content-free operational metadata.
- Context compaction uses the App Operations Model when available and preserves its deterministic fallback otherwise.
- Existing conversations, snapshots, and `Context.md` handoffs continue to work without migration.
- Memory and Butler remain explicitly outside this implementation slice.

## Follow-On Features

Once this foundation is stable:

1. Memory can persist conversation summaries and granular entries as durable jobs whose LLM work runs through registered broker tasks.
2. Butler can inherit the resolved App Operations Model while continuing to use the interactive assistant runtime.
3. Additional app-owned operations can be added only through reviewed, versioned task definitions.
