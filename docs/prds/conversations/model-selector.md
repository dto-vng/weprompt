# Conversation Model and Reasoning Selector

Status: provider-neutral v1 product contract
Applies to: active conversations, New Chat, Project New Chat, assistants,
teams, and scheduled tasks

## Outcome

The selector shows the selected model and only the reasoning controls that the
exact active provider/model has proven it supports. It preserves provider-native
labels, values, ranges, defaults, and dependencies. The UI does not infer
capability from provider names, model names, compatibility protocols, or a
generic reasoning badge.

## Source of truth

The selector consumes a versioned immutable `ModelReasoningProfile` and a
separate `ObservedModelReasoningProfile` containing scoped current selections.
Capability precedence is:

1. the active runtime's observed profile;
2. an exact verified adapter profile for the provider/model;
3. unsupported.

Unknown means non-writable. An absent, malformed, older, or future contract
version hides reasoning controls without preventing the application or backend
from starting.

## Provider-neutral v1 contract

```typescript
export type CapabilitySource = {
  kind: 'runtime' | 'adapter';
  id: string;
  version: string;
  verifiedAt?: string;
};

export type ReasoningControlValue = string | boolean | number;

export type ReasoningSelectionValue = { kind: 'provider_default' } | { kind: 'explicit'; value: ReasoningControlValue };

export type ReasoningControlDescriptor = {
  id: string;
  semantic: 'effort' | 'mode' | 'enabled' | 'budget' | 'provider_defined';
  input: 'enum' | 'boolean' | 'integer';
  label: string;
  description?: string;
  defaultValue: ReasoningSelectionValue;
  resolvedDefault?: ReasoningControlValue;
  choices?: Array<{ value: ReasoningControlValue; label: string; description?: string }>;
  minimum?: number;
  maximum?: number;
  step?: number;
  unit?: string;
  visibleWhen?: Array<{ controlId: string; equals: ReasoningControlValue }>;
};

export type ModelReasoningProfile =
  | { contractVersion: 1; state: 'unsupported'; controls: []; source: CapabilitySource }
  | {
      contractVersion: 1;
      state: 'fixed';
      controls: [];
      summary: string;
      source: CapabilitySource;
    }
  | {
      contractVersion: 1;
      state: 'configurable';
      controls: [ReasoningControlDescriptor, ...ReasoningControlDescriptor[]];
      source: CapabilitySource;
    };

export type ReasoningModelScope = {
  backend: string;
  providerId: string;
  capabilityRevision: string;
  modelId: string;
};

export type ReasoningSelection = {
  scope: ReasoningModelScope & { controlId: string };
  value: ReasoningSelectionValue;
};

export type ObservedModelReasoningProfile = {
  scope: ReasoningModelScope;
  profile: ModelReasoningProfile;
  selections: ReasoningSelection[];
  activeControlIds: string[];
};
```

Provider request mappings are adapter-private. They are never accepted from or
serialized to the renderer.

## User experience

### Unsupported

Show no reasoning row or placeholder. Model selection continues to work.

### Fixed

Show a read-only reasoning summary when the selector has room to do so. Do not
show a switch, dropdown, or numeric input and do not emit a reasoning field.

### Configurable

Render every control listed in authoritative `activeControlIds`, in profile
order:

- `enum`: provider-supplied choices and labels;
- `boolean`: accessible switch or On/Off choices;
- `integer`: bounded numeric input with the advertised step and unit.

The existing model selector remains the acquisition surface; ACP and AionRS
reuse one schema renderer and do not create provider-specific selector stacks.
Model search and provider grouping remain model-list concerns and are unchanged
by this contract.

### Provider default

Each configurable control includes a **Provider default** choice. This is an
application/backend sentinel, never a provider value. Selecting it preserves
`{ kind: 'provider_default' }` in the observed selection and causes the adapter
to omit that control's native request field. If an evidenced resolved default is
available, explanatory copy may describe it without changing the selection to
an explicit value.

There is no universal reasoning scale. Values such as Kimi `max`, OpenAI
`high`, ACP `xhigh`, and Sol `ultra` remain opaque and are never ranked,
translated, or declared equivalent.

## Dependencies

Multiple `visibleWhen` predicates use logical AND. An explicit controller
selection evaluates to its primitive value. A provider-default controller uses
its verified `resolvedDefault`; if that evidence is missing or invalid, the
dependent control is hidden and non-writable.

The backend's `activeControlIds` is authoritative after runtime creation.
Pre-chat may calculate the initial set from defaults using the same rule and
must fail closed on uncertainty.

## Selection and mutation behavior

All values are scoped to
`{ backend, providerId, capabilityRevision, modelId, controlId }`.

While model selection, capability refresh, or a reasoning mutation is pending,
disable the affected controls. A model/provider/revision change refreshes the
profile and full selection set atomically from the user's perspective. Late
responses for an old generation or scope are discarded.

A write succeeds only when the runtime returns a complete observed envelope
under the same scope and contract version, containing:

- the immutable profile;
- the full scoped selection set;
- authoritative active control IDs;
- the requested value; and
- every dependency-driven change.

An acknowledgement, HTTP success, unchanged selection set, or partial envelope
does not update the UI. Keep the prior observed state and show localized,
actionable feedback.

## Persistence and launch surfaces

New Chat, Project New Chat, assistant defaults/preferences, teams, schedules,
active conversations, restart, and resume use the same scoped selection set.
On restore or scope change, retain values only when contract version, revision,
control ID, schema, value, active status, and all dependencies still validate.
Otherwise reset to provider defaults without sending an unsupported field.

If an assistant uses Auto model selection, reasoning is also Auto until the
runtime advertises and returns a compatible observed profile. Fixed and
unsupported models persist no writable selection.

## Accessibility and responsive behavior

- Use the existing Arco-based selector primitives and no raw interactive HTML.
- Every control has a provider label, current value, disabled/pending state,
  keyboard operation, visible focus, and an accessible name.
- Descriptions are reachable by keyboard and assistive technology, not only
  pointer hover.
- Numeric controls announce bounds, step, and unit.
- Desktop and mobile expose the same controls and state, with layout adapted to
  available space.

## Acceptance criteria

- [ ] Unsupported, malformed, and unknown-version profiles expose no setter.
- [ ] Fixed profiles are informational and emit no reasoning field.
- [ ] Arbitrary enum values pass through without a renderer allowlist.
- [ ] Boolean and bounded integer controls enforce their exact schemas.
- [ ] Multiple controls and AND dependencies behave identically pre-chat and at runtime.
- [ ] Provider default omits the native field while remaining observed as provider default.
- [ ] Model/provider/revision changes cannot leak stale values or controls.
- [ ] Every successful write returns and installs the complete observed envelope.
- [ ] ACP runtime labels/options remain authoritative; AionRS profiles are exact-model adapter data.
- [ ] Public payloads contain no request mapping, native field/path, credentials, endpoints, or provider bodies.
- [ ] The canonical fixtures in `docs/design/provider-reasoning-capability-matrix.md` pass AionRS, AionCore, and WePrompt conformance suites unchanged.
