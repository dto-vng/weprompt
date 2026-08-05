# Assistant Knowledge Base — Sliced Design

**Status:** 🟡 **Slice 1 approved — five contract amendments are entry criteria before implementation.**
Direction settled; later slices are scoped but not designed.
**Reviewed against:** `origin/sprint2` @ `343b725c4`
**Builds on:** the shipped per-project Knowledge Base (MR !5, follow-ups !6, !10, !11, !15, !17, !21, !22)
**Companion docs:** the round-1/2 review is committed alongside this file as
`assistant-knowledge-base-design-review.md`. The task-by-task implementation plans for Slices 1 and 2
live in the intentionally-gitignored `docs/superpowers/plans/` tree and are therefore **local, not in
the repository** — ask their author if you need them.

### How to use this doc

Work is organised into **slices**. Slice 1 is designed and reviewed; later slices carry scope and
preserved findings but no design. Each brainstorming round appends to the decision log, and either
refines Slice 1 or promotes something out of a later slice. Anything under *Decisions (settled)* or
*Closed by decision* has been argued and verified — reopen only with new evidence, and name it.

### Decision log

| Date | Round | Outcome |
| --- | --- | --- |
| 2026-08-04 | Initial brainstorm | Personal-only KB; WP-managed per-assistant folder; two search tools; local binding; generalize the KB service to an owner scope |
| 2026-08-05 | Design review (round 1) | 9 claims verified, 6 original statements corrected: sibling storage roots, scope/target split, manifest V1→V2, citation identity, privacy disclosure, surface list, lifecycle state machine, directory placement |
| 2026-08-05 | Decisions on review-open items | Bounded `read_assistant_knowledge_source`; user + builtin assistants supported |
| 2026-08-05 | Id-stability spike | **Passed** — builtin slugs and user ids both stable; builtin support confirmed; global orphan-recovery UI deferred |
| 2026-08-05 | Design review (round 2) | 5 contract amendments + 3 factual corrections, all verified; status → 🟡 |
| 2026-08-05 | **Rescope into slices** | Slice 1 = add local files + Q&A + review + create-via-Template-Gallery. **Gallery owns form, KB owns substance.** Materialize-to-workspace, external/shared folders, and other conversation surfaces demoted to later slices |
| 2026-08-05 | Slice 2 design round | Grounding evidence designed: evidence already exists in persisted `tool_call` messages + `turn_id`; report always / gate conditionally on an explicit per-assistant flag; two-tier turn scoping; user-facing deliver-anyway; renderer-side pure evaluator; compaction/`hidden` trap identified |

## Product intent

A user attaches their own reference documents to an assistant so it can answer from them, review
work against them, and produce new artifacts grounded in them.

**Driving use case — PMO Business Case assistant.** A PMO builds an assistant that knows the
organisation's BC standard. It can then (a) answer questions about the standard, (b) review a draft
BC against it, and (c) produce a new BC that conforms to it.

Documents and the binding are local to the installation and never travel when an assistant is
shared, duplicated, exported, or imported.

## Slice map

| Slice | Outcome | Status |
| --- | --- | --- |
| **1** | Add local files as an assistant KB; grounded Q&A; review a draft against the KB; create artifacts via the Template Gallery with the KB supplying substance | **Designed + reviewed.** Blocked only on the 5 entry criteria |
| **2** | Grounding evidence — verify the KB was actually consulted before an artifact is delivered | **Designed.** Report always, gate conditionally; renderer-side evaluator |
| **3** | Shared / team corpora via an external synced folder | Parked mid-round; findings preserved |
| **4** | Assistant KB on other conversation surfaces (team, scheduled, channel-created) | Scoped, not designed |
| — | Backlog: cost guardrails, KB UI design, discovery, duplicate documents across scopes, multi-folder | Unsliced |

---

# Slice 1 — Grounded Q&A, review, and template-driven creation

## Scope

**In:**

- Add local files to an assistant's KB (WP-managed folder per assistant)
- `search_assistant_knowledge` — passage retrieval with scope-aware citations
- `read_assistant_knowledge_source` — bounded, paginated whole-document read
- A documented assistant-instructions pattern binding KB consultation to the work

**Out:** materializing KB files into the workspace; external/shared folders; team corpora; merged
cross-store ranking; any conversation surface beyond Guid and Project New Chat.

## The form/substance boundary

| | Owns | Machinery |
| --- | --- | --- |
| **Template Gallery** | *Form* — structure, styling, delivery gates | `reference.docx` clone + `THEME.md` + officecli validate/issues/render gates |
| **Assistant KB** | *Substance* — the standard, criteria, precedent documents | index + `search` + bounded `read`, auto-attached |

The three PMO verbs land on this boundary: **answer** → search; **review** → user attaches the
draft, assistant reads the standard; **create** → the user picks the BC template from the gallery
while the KB supplies the rules the content must satisfy.

Consequence: **no materialize-into-workspace operation in Slice 1.** (Worth recording: the KB store
already retains originals as `original.<ext>` beside `converted.md`
(`projectKnowledgeService.ts:382`), so if a later slice needs to hand a real file to an officecli
clone workflow, it is a copy — not a storage change.)

## Composition: binding KB consultation to the work

A templated send already prepends a long directive (read `THEME.md`, clone the reference, replace
all content, run `validate`, `view issues`, screenshot audits, max 3 repair cycles). With KB tools
also attached, two failure modes appear:

1. **Form without substance** — a gate-passing, well-formatted BC that never consulted the standard.
   This is the WMS incident pattern in a new guise: every mechanical gate green, the artifact
   substantively wrong.
2. **Substance without form** — the standard is retrieved but the template contract is ignored.

Two prompt surfaces are available, neither requiring new machinery:

- **The KB tool description** — the KB's only prompt surface. It already lists attached filenames;
  for standards-bearing KBs it must also state that those documents are authoritative for content
  decisions.
- **The assistant's own rules/prompts** — `AssistantRules`/`AssistantPrompts` already exist. The
  PMO assistant's instructions carry the binding: *"When creating or reviewing a Business Case,
  ground structure and criteria in your knowledge base; cite the standard for each judgement."*

Slice 1's deliverable here is therefore a **documented instruction pattern plus a tool-description
rule**, not code. Verification that grounding actually happened is Slice 2.

## Contracts

### Storage layout

```text
Project indexes:    <projectKbRoot>/<projectId>                              (UNCHANGED)
Assistant indexes:  <assistantKbRoot>/<safeOwnerKey>                         (new sibling root)
Assistant files:    <dataDir>/assistant-knowledge/<safeOwnerKey>/Knowledge Base/
```

A new `getAssistantKbRootDir()` sits beside the existing `getProjectKbRootDir()`. Separate roots make
project/assistant overlap structurally impossible — no reserved-name trick. Nesting project stores
under `/project/<id>` was rejected: it would orphan every shipped project KB, silently empty until a
paid re-index.

**Owner key, locked and versioned:** `SHA-256` over the exact UTF-8 bytes of `kind + NUL + id`,
hex-encoded. Assistant ids are opaque API values, never path segments. The original scope identity is
recorded in the manifest so the store is self-describing.

### Scope vs target

```typescript
type KnowledgeScope =
  | { kind: 'project'; id: string }
  | { kind: 'assistant'; id: string };

type KnowledgeTarget =
  | { scope: { kind: 'project'; id: string }; workspace: string }
  | { scope: { kind: 'assistant'; id: string } };
```

**Any operation that resolves a filesystem location takes a `KnowledgeTarget`.** Store-only
operations (list, remove-store, session-descriptor construction) take a `KnowledgeScope`. Native
validation requires `workspace` for project targets and rejects it for assistant targets. Main
derives every assistant path; the renderer never supplies one. Update events carry the full scope.

### Manifest compatibility

```typescript
type KnowledgeManifestV1 = { schemaVersion: 1; projectId: string; /* existing */ };
type KnowledgeManifestV2 = { schemaVersion: 2; scope: KnowledgeScope; /* existing */ };
```

A V1 manifest loads **only** when the expected scope is `project` **and**
`manifest.projectId === expectedScope.id`. A V2 manifest whose recorded scope mismatches the
requested store fails closed. A later atomic write may upgrade metadata to V2 without moving files,
rebuilding BM25, or repeating embedding calls.

### Retrieval tools

Per-scope identity driven by a new `KB_ENV.scopeKind`, with `KB_ENV.projectId` renamed to `scopeId`
(atomic: main process and bundled server ship in one build).

| Scope | Search | Whole-document |
| --- | --- | --- |
| project | `search_project_knowledge` | existing: workspace-relative file reads |
| assistant | `search_assistant_knowledge` | `read_assistant_knowledge_source` |

```typescript
read_assistant_knowledge_source({
  source_id: string,
  cursor?: number          // cursor unit: CHARACTER offset into converted.md
}) -> {
  source_id: string,
  file_name: string,
  text: string,            // capped per page — declare the exact cap, reuse DEFAULT_PAYLOAD_CAP semantics
  next_cursor: number | null
}
```

The assistant search description must route whole-document work to the read tool, because assistant
documents sit outside the conversation workspace and the project instruction ("read it with your
normal file tools inside the working directory", `knowledgeServer.ts:43`) cannot apply.

### Session-MCP identity

`getSessionMcpServer` names the project server `BUILTIN_KNOWLEDGE_NAME`, and the attach helper
(`useGuidSend.ts:236`) dedupes **by name** — so reusing that name would make the existing guard
silently swallow the assistant server. Assistant scope needs `BUILTIN_ASSISTANT_KNOWLEDGE_NAME` and a
distinct stable id; the helper generalizes to merging a list and dropping nulls.

### Citations

```typescript
type KnowledgeCitationTarget = {
  scope: KnowledgeScope;
  sourceId: string;
  fileName: string;
  anchor?: string;
};
```

Verified gaps: `formatHitsAsText` emits ordinal/fileName/headingPath with **no `sourceId`**
(`searchCore.ts:112`); the renderer is filename-only with no tool scope
(`MessageToolGroupSummary.tsx:389`, `ToolOutputCitations.tsx:19`). Required: expose `sourceId` in
search output and carry `{ scope, sourceId, fileName, anchor }` through tool output → Markdown →
citation context → IPC. **Ambiguous filename-only prose stays unlinked — no scope-chooser branch.**

Citation and stale-state resolution derives attached scopes from the conversation's **frozen session
descriptors**, not the current enable state; otherwise disabling a KB breaks citations in
conversations that legitimately still contain its results.

## Privacy disclosure (exact wording, shown before or alongside first enable)

> The binding, managed documents, and index remain local to this WePrompt installation and are not
> included when an assistant is shared, duplicated, exported, or imported. Processing is not
> necessarily local: document text may be sent to the configured embedding provider, scanned pages
> may be sent to a configured vision provider, and retrieved excerpts are sent to the selected
> chat-model provider.

"Local to this installation" is precise: the binding lives in backend client settings
(`configService` PUTs `/api/settings/client`), which is installation-scoped — coinciding with
per-user only because each colleague runs their own install.

## Surfaces and revocation semantics

> Enabled assistant knowledge attaches only to newly created direct conversations through Guid or
> Project New Chat. Existing conversations, team conversations, scheduled tasks, channel-created
> conversations, and other backend-created sessions do not receive it in Slice 1.

Disable and delete are **not live revocation**: an already-created conversation retains its session
descriptor, and a KB subprocess that already loaded its store may retain that content until its
runtime ends. Reuse the shipped "New conversations only" affordance.

## Lifecycle state machine

Persisted states, not a boolean: `enabled | disabled | cleanupPending | orphaned`. Restart-safe —
`cleanupPending` survives a crash mid-delete and is retried; `orphaned` marks a binding whose
assistant is gone but whose documents are retained pending explicit recovery.

| Event | Binding | Watch and sync | Index | Documents | Existing conversations |
| --- | --- | --- | --- | --- | --- |
| Enable succeeds | enabled | ensure folder, catch-up sync, watch | create/update | create or retain | unchanged |
| Enable fails | unchanged | none | retain | retain | unchanged |
| Disable | disabled | unwatch; no new ingestion | retain | retain | unchanged |
| Delete assistant | cleanupPending → removed | unwatch | remove with retry | **retain** | unchanged |
| Re-enable | enabled | one catch-up sync, then watch | resume/update | retain | unchanged |

**The generation token is checked before every new ingestion unit** (each source, OCR call, embedding
batch) — not only before watcher reattachment. `syncAndWatch` re-registers the watcher in `finally`
(`projectKnowledgeBridge.ts:60`), and checking only at reattach would let an in-flight loop keep
embedding after disable.

**Transactional binding.** `configService.set()` does `cache.set()` → `notify()` → *then*
`await fetchJson('PUT', …)` (`configService.ts:97`), so a failed persist leaves the new value cached
and listeners already fired — breaking "enable failure leaves the binding unchanged." Persist first,
then update cache and notify; roll back on failure.

## Identity and source support

| State or source | Slice 1 behavior |
| --- | --- |
| Unsaved assistant (create form) | KB section hidden/disabled — "Create the assistant first" |
| Existing user assistant | Supported |
| Builtin assistant | **Supported** — id-stability spike passed |
| Generated CLI assistant | Excluded |
| Duplicate | New assistant starts disabled; no documents or binding copied |
| Import or share | Starts disabled; no documents or binding imported |
| Retired/disappeared assistant | Preserve documents; remove index only via safe reconciliation |

An assistant whose id reuses an orphaned key must never auto-enable or silently consume the former
assistant's documents — surface an explicit recovery choice when local documents exist. This path is
real: AionCore's `create` accepts a caller-supplied `req.id`, and while duplicate *live* ids are
rejected, a deleted assistant's id is reusable.

## Components

### Main process

- `projectKnowledgeService.ts` — scope/target throughout; queue keyed by the **composite** `kind:id`
  (it keys on `projectId` today, so a project and assistant sharing an id would serialize together).
- `knowledgeFolderWatcher.ts` — per-scope watches with the generation token above.
- Main-owned operations, folder-touching ones taking targets:
  `ensureKnowledgeFolder({ target })`, `showKnowledgeFolder({ target })`,
  `openKnowledgeSource({ target, sourceId })`, plus scope-aware list/remove-store/retry and events.
- `builtinMcp/knowledgeServer.ts` — tool identity and description per `scopeKind`; add the bounded
  read tool for assistant scope.
- **Deferred to a separate mechanical commit:** the `projectKnowledge/` → `knowledge/` directory
  rename and the `project-knowledge.*` channel renames. Cosmetic beside the behavioral change.

### Shared

- `common/knowledge/types.ts` — scope/target/manifest V1+V2/citation-target types.
- `common/knowledge/envKeys.ts` — `scopeId` (renamed), new `scopeKind`.
- `common/knowledge/constants.ts` — `BUILTIN_ASSISTANT_KNOWLEDGE_NAME`.
- `common/knowledge/citationFormat.ts` — scope- and sourceId-bearing links.
- Binding persistence via `configKeys.ts` + `configService.ts` client settings (**not** legacy
  `ConfigStorage`), through the transactional helper. Persisted values are runtime-validated; corrupt
  or unknown entries **fail disabled**. Successful catalog reconciliation owns orphan cleanup; a
  failed or empty fetch never does.

### Renderer

The architecture reference is explicit — *"Used by multiple pages → `renderer/components/`,
`renderer/hooks/`"* — so shared Project-Home + Assistant-Settings code cannot live under a page
directory. Final placement:

```text
renderer/components/knowledge/     # shared card, source preview, preview anchor
renderer/hooks/knowledge/          # useKnowledge(scope)
```

Only conversation-specific pieces stay page-private: the citation controller and stale-chat hint
remain under `pages/conversation/knowledge/`.

Both roots sit at 10 children, so slots are freed narrowly, in separate mechanical commits:

| Root | Action | Result |
| --- | --- | --- |
| `components/` | Delete `IconParkHOC.tsx` and `ShimmerText.tsx` — **verified zero references** across `src` and `tests` | 10 → 8, then `knowledge/` → 9 |
| `hooks/` | Move the lone loose `useLocalTokenUsage.ts` into an existing category dir | 10 → 9, then `knowledge/` → 10 |

Confirm the deletion with `bunx tsc --noEmit` plus a full test run before relying on it.

Also: extracting the shared card/preview/anchor out of `pages/project/components/` takes it from 10 →
7. `AssistantSettings/editor/KnowledgeSection.tsx` takes that directory 6 → 7 — the section holds the
shared card, enable toggle, disclosure, and a **"Show knowledge folder"** action (platform-neutral
copy, not "Reveal in Finder"). `useGuidSend.ts` merges a list of scope descriptors, and one scope
failing must still attach the other and still create the conversation. An app-shell owner registers
assistant watches and runs orphan reconciliation, starting only after **both** client config and an
authoritative assistant catalog fetch succeed.

## Testing

**Storage and manifest** — a project id of `assistant` cannot overlap or delete assistant stores;
arbitrary/Unicode/separator/long/case-differing ids map to distinct owner keys; V1 loads only for
matching project scope; V2 scope mismatch, malformed manifests, and unsupported versions fail closed;
project folder targets require a workspace and assistant targets reject renderer-supplied paths.

**Enable, watch, cleanup** — enabling creates the folder before reveal/watch and persists only after
successful write; a failed persist leaves the binding unchanged (transactional helper); disabling
during sync or a debounced event cannot re-register the watcher, and stops new ingestion units
mid-loop; re-enabling performs exactly one catch-up sync; `cleanupPending` survives restart and
retries; orphan cleanup runs only after a successful assistant-list fetch.

**Conversation attachment** — project-only, assistant-only, both, neither, disabled; both servers
survive merge on AionRS and ACP with distinct ids and names; one descriptor failure still attaches the
other; team/scheduled/channel/existing paths asserted as *excluded*; frozen-session semantics tested.

**Citations and reads** — assistant tool output labeled, recognized, clickable, routed to the
assistant store; the same filename in both scopes opens the correct source per tool output; ambiguous
filename-only prose stays unlinked; links round-trip scope/sourceId/fileName/anchor; the read tool
paginates by character cursor, terminates with `next_cursor: null`, and rejects unknown source ids;
citation resolution works from frozen descriptors after the KB is disabled.

**Composition (new for Slice 1)** — with a template directive *and* KB tools attached, the documented
instruction pattern produces at least one KB consultation; and a review request against a KB standard
reads the whole standard rather than a single passage.

**Lifecycle and UX** — unsaved create form has no KB owner; duplicate/import/share never copy or
enable the binding; support matrix enforced; id reuse requires explicit recovery; the disclosure
appears before first enable; copy localized and platform-neutral; an automated structure check
confirms no modified directory exceeds ten direct children.

**Acceptance criterion (not a verifiable property today):** the binding and documents do not travel
through share/export — no export path exists to test against, though the import half is testable.

**Regression** — project KB *behavior* unchanged. Behavior, not literally unchanged test files:
strict IPC payloads and scope-wide types require minimal test updates.

## Slice 1 entry criteria

The five round-2 amendments are folded into the contracts above and must be honoured as written:

1. Folder operations take `KnowledgeTarget`; store-only operations take `KnowledgeScope`.
2. Persisted lifecycle states + per-ingestion-unit generation checks + transactional binding.
3. End-to-end `{scope, sourceId, fileName, anchor}` carrier + the read-tool contract; ambiguous prose unlinked.
4. `renderer/components/knowledge/` and `renderer/hooks/knowledge/` with slots freed as tabulated.
5. Locked owner-key algorithm; doubly-gated V1 manifest loading; frozen-descriptor scope resolution.

---

# Later slices

## Slice 2 — Grounding evidence · DESIGNED (2026-08-05)

Nothing in Slice 1 *verifies* that the KB was consulted before an artifact is delivered — the
form-without-substance failure. Slice 2 closes that, and pairs with the artifact-quality epic's
completion-states work (`docs/design/artifact-quality-epic-plan.md`, 2D).

**Feasibility finding: the evidence already exists in persisted data.** `messages` rows carry
`type='tool_call'` with content `{call_id, name, status, input, output}`, and a `turn_id` column
groups messages within a turn. So this is a *read* problem, not a plumbing problem — no new
instrumentation.

### Decisions

| Question | Decision |
| --- | --- |
| Gate or report | **Report always; gate conditionally.** Grounding is a distinct completion state; delivery is withheld only when the assistant declares its KB authoritative |
| Evidence scope | **Two-tier** — `this turn` vs `earlier in this chat`, so the common multi-turn pattern (retrieve the standard, generate after feedback) is not a false negative |
| Coverage | **Office artifacts only** (where a delivery moment already exists); gate fires on an **explicit per-assistant flag**, never inferred from instruction prose |
| Escape hatch | **Blocking state with an explicit "deliver anyway"**, recorded. Model-attested exemption rejected: a model that skipped the KB will happily attest it wasn't needed |
| Where it runs | **Renderer-side evaluator + renderer gate.** Evidence is already in loaded messages, the verdict is presentational, and the escape hatch is inherently a human interaction |

### Verdict model

```typescript
type GroundingVerdict =
  | { kind: 'grounded_turn'; sources: KnowledgeCitationTarget[] }
  | { kind: 'grounded_earlier'; sources: KnowledgeCitationTarget[]; turnsAgo: number }
  | { kind: 'none' }
  | { kind: 'not_applicable' };   // conversation has no KB scopes in its frozen descriptors
```

`not_applicable` is a required fourth state: a conversation with no KB attached must not report
"no KB consulted" as though it were a defect.

**Evidence** = a `tool_call` whose `name` is `search_project_knowledge`,
`search_assistant_knowledge`, or `read_assistant_knowledge_source`, whose `status` indicates
success, and whose output is non-empty. A full read is *stronger* grounding than a search, so all
three qualify. A search returning `searchCore`'s "No relevant passages found" literal does **not**
count — a checkable string, not a judgement.

**Gate condition** — all three: binding flagged authoritative **and** verdict `none` **and** the
artifact is an office artifact. Effect: withhold automatic delivery, render the state plus a
*deliver anyway* action, record the override with the completion state.

### Components

- `common/knowledge/grounding.ts` — pure `evaluateGrounding({ messages, artifactTurnId, sessionScopes })`.
  No IO, no DB.
- Slice 1's binding record gains `authoritative?: boolean`. Local — **no backend migration**.
- `KnowledgeSection` gains one checkbox: *"Require grounding in these documents before delivering documents."*
- The artifact completion surface renders the grounding state and owns the deliver-anyway action.
- **`OfficeArtifactService` is unchanged.** Main answers "is this file valid" (BUG-003's fail-closed
  corruption gate); the renderer answers "is this artifact grounded." The gates stay separated.

### Edge cases

- **The compaction trap (most likely way this ships subtly broken):** `messages` has a
  `hidden INTEGER NOT NULL DEFAULT 0` column and this project uses a visible/hidden dual-persist
  model, so compacted messages are hidden rather than deleted. **The evaluator must read hidden
  messages too**, or evidence silently vanishes after a compaction and a genuinely grounded artifact
  starts reporting `none`.
- Errored search → not evidence. Empty-result search → not evidence.
- Multiple artifacts in one turn → each evaluated against the same turn evidence.
- Verdict computed at completion, never mid-stream.
- KB disabled after the fact → verdict derives from frozen descriptors plus historical messages, so
  it stays stable (consistent with Slice 1's frozen-descriptor rule).
- Not flagged authoritative → report only, never gate.

## Slice 3 — Shared / team corpora (parked mid-round; findings preserved)

Parked by the 2026-08-05 rescope. Everything established before parking:

- **A WePrompt "team" is a group of assistants, not people** — `TeamCreateModal` picks
  `TeamAssistantOption` members. A `{kind:'team'}` owner scope would not serve human sharing; that
  earlier suggestion rested on a wrong premise.
- **The real multi-human mechanism is channel pairing** — `assistant_users` +
  `assistant_pairing_codes`, with Lark/WeCom/DingTalk/Weixin/Telegram channel configs.
- **Confirmed usage pattern:** each colleague runs their own install, and the source of record is a
  **synced cloud folder** already present locally on each machine.
- **Recommended approach (unsigned):** an external folder source variant on the binding —
  `{kind:'managed'} | {kind:'external', path}` — read-only, index store unchanged, one source per
  assistant. This would **reopen the "no user-chosen folders" rejection**, justified by new evidence.
- **Risks identified:** cloud placeholder / files-on-demand reads must mean "retry later", never
  "source removed"; corpus identity needs a confirm-time preview of what was found; switching source
  costs a full re-index and needs explicit confirmation.
- **Contract reconciliation required if resumed:** paths are accepted **only** through the explicit
  configure/bind operation — validated, canonicalized, persisted — after which every per-operation
  call derives its path from the binding and never accepts one. This preserves amendment 1's
  invariant with a single sanctioned entry point.

## Slice 4 — Other conversation surfaces

Team, scheduled-task, and channel-created conversations have no KB attach seam at all today. A
scheduled PMO assistant running without its standard is a plausible complaint; the question is
whether to build a shared attach seam or accept the limit. Needs its own spike.

## Backlog (unsliced)

- **Indexing cost guardrails** — nothing warns before someone drags 500 PDFs in and triggers
  embedding plus vision OCR. Arguably a pre-existing project-KB gap that assistant KBs make easier to
  hit. Warn threshold? Cost preview? Size cap?
- **KnowledgeSection UI design** — undesigned; no designer brief exists (unlike Data Connectors).
  Needs one if the section grows past a toggle and a list: indexing progress, failed sources,
  disclosure placement.
- **Discovery** — the KB is invisible until someone opens an assistant editor.
- **Merged cross-store ranking** — Slice 1 gives the model two tools and lets it choose. If it
  habitually misses one, the answer is better descriptions or normalized merged ranking. Decide on
  evidence; ties to the KB eval harness (Stream B).
- **Duplicate documents across scopes** — the same PDF in a project and assistant KB is retrieved
  twice and burns context. Dedupe by content hash, or accept?
- **Folder organization** — one flat `Knowledge Base/` per assistant; do subfolders ever need to mean
  something (per-topic filtering)?

---

# Closed by decision

Reopening needs new evidence, not preference:

- **Exposing the managed assistant folder to general file tools** — rejected on filesystem-access
  grounds; the bounded read tool covers the need.
- **Shipping documents inside a shared/exported assistant** — rejected: packaging potentially
  sensitive files into an export, and it does not solve updates.
- **Per-chat KB toggles** — no demand established.
- **Nesting project stores under a new path segment** — would orphan every shipped project KB.
- **A scope-chooser for ambiguous filename-only citations** — stays unlinked instead.

# Spikes

## Id-stability spike — 2026-08-05: PASSED

**Builtin assistants — stable.** Ids are code-defined manifest slugs (`word-creator`,
`dashboard-creator`, `excel-creator`, `social-job-publisher`). `assistant_definitions` stores
`assistant_id` = `source_ref` = the slug, and `assistant_id` is the durable business key across the
schema (`assistant_overrides` upserts `ON CONFLICT(assistant_id)`; lookups use
`get_by_assistant_id`). Builtin sync updates rows in place rather than recreating them. WePrompt
already binds bare slugs (`migrateAssistants.ts`).

**User assistants — stable.** `create` derives ids from `generate_user_id()`, not from the name, so
renaming never changes an id. Builtin-id collisions are rejected outright.

**Residual risk:** a future builtin slug rename would orphan a binding. Note the earlier
`builtin-word-creator → word-creator` change was **frontend-prefix normalization, not a canonical
slug rename** — no canonical slug has ever been renamed, so this risk is hypothetical. Any future
migration that renames a builtin slug must also migrate the binding and owner key; that stays on the
migration checklist as cheap insurance.

## No further spikes required for Slice 1

Slice 3 (external folders) and Slice 4 (other surfaces) each need their own spike if resumed — a
shared-folder permission and availability model, and a shared attach seam for backend-created
conversations respectively.
