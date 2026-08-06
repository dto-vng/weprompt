# Template Creation Skill — Plan of Record

**Date:** 2026-08-04
**Priority:** **Next** — not a Sprint 2 release commitment. T0/T1 groundwork may run in
parallel, but enablement must not displace the P0/P1 reliability bugs or EPIC-001's
release boundary.
**Supersedes:** `docs/superpowers/specs/2026-08-04-template-creation-design.md` (local
brainstorm spec; this document carries the hardened revision + review fixes)
**Related:** `docs/design/artifact-quality-epic-plan.md`,
`docs/design/wms-presentation-quality-incident.md`

## Outcome

Users can derive a template from a workspace artifact, or describe an HTML template,
review the proposal in chat, and explicitly add or discard it before anything appears in
the Template Gallery.

- **Source rule:** PPTX/DOCX are artifact-derived only; HTML supports artifact-derived
  and description-only creation. A from-description deck template composes as: generate
  the deck through the normal flow first, then save it as a template.
- **Trust boundary:** the agent writes theme/reference candidates and a terminal marker;
  WePrompt owns identity, validation, preview, manifest, state, and installation.

## T0 — Close the design and capability gaps

- Land this plan under `docs/design/` (this document).
- Define a **versioned marker** bound to conversation, completed assistant message, and
  source-artifact identity — not a bare directory pointer.
- Verify AionRS skill delivery, and produce a **named ACP backend capability matrix**
  rather than assuming all ACP agents hot-load skills.
- **Extend the shared OfficeCLI seam** with injected, typed, resource-bounded `validate`,
  structured-text extraction, and preview-render operations. Verified: the current runner
  (`officeCliRunner.ts`) exposes only `validate` plus the watch/preview spawn — no
  text or screenshot APIs. This is required new work, not integration.
- Define a **durable proposal record**: opaque proposal ID, source/staged hashes,
  reserved gallery ID, status, committed ID. Ordinary React renders and history reloads
  query state; they never repeat staging work.
- **Resolve the privacy decision before implementation:** Office references retain source
  text, notes, metadata, and embedded content, and are attached to future model calls on
  every templated send. Either sanitize the reference or disclose the retained file and
  future provider use explicitly before confirmation.

## T1 — Secure immutable staging

- Accept only `.template-staging/<valid-slug>` inside the main-process-authorized
  conversation workspace; reject absolute/traversal paths, symlink or hardlink escapes,
  unexpected files, active/mismatched Office formats, excessive file counts/sizes, and
  changed content.
- The main process **copies allowed bytes immediately into an app-owned,
  permission-restricted snapshot** and binds preview plus confirmation to its hash. A
  changed source creates a new proposal requiring new consent; commit never reads mutable
  agent-workspace bytes.
- Cleanup owns only app-created snapshots. Discard or conversation deletion must never
  recursively remove an agent-selected workspace path. Bounded expiry / startup garbage
  collection handles abandoned proposals.

## T2 — Format validation and safe manifest derivation

- Validate a visual-system-only theme contract per format; validate PPTX/DOCX references;
  derive manifest/kind/description deterministically; keep optional `sampleTokens`
  backward-compatible.
- Treat extracted proper nouns/numbers as **bounded review candidates, not automatic hard
  gates**: exclude common values, disclose retained candidates, and require the canonical
  2B layer to consume approved tokens.
- Built-in pack alignment to the same token/contract model is **owned by EPIC-001
  (Track 0 / 2B)** — this plan depends on that work and must not carry duplicate work
  items against the same THEME.md files.
- Preview failure is a visible warning with deterministic SVG fallback. PPTX confirmation
  needs a **contact sheet** or a source-inspection action; a cover-only image is not
  enough to review a multi-layout template.

## T3 — Durable review and commit lifecycle

- Render localized validating / proposed / failed / changed / added / discarded / expired
  states; expose complete theme and source inspection from the card.
- Status, commit, and discard are **idempotent** across StrictMode, history reload, app
  restart, retries, and double clicks.
- Reserve collision-safe destination IDs atomically; install via a destination-local
  temporary directory plus atomic rename/rollback. Successful commit refreshes the
  existing `presentation-templates` SWR cache.

## T4 — Skill delivery and release verification

- Add the skill to the backend-owned auto-inject corpus; package it with an explicit
  completeness gate.
- Add positive/negative **trigger evaluations**. Open item: confirm whether an in-product
  skill-creation flow ("skill creator") exists that this could conflict with — if so,
  name it here; if not, drop the conflict constraint (trigger evals stay either way).
- Verification: security/path and resource-limit tests; format-aware theme and manifest
  tests; marker streaming / malformed / multiple-marker tests; concurrency, crash,
  restart, expiry, and cleanup coverage; i18n and native-IPC exhaustive fixtures;
  packaged AionRS and each supported ACP backend smoke from creation → confirmation →
  gallery use.

## Dependencies

- Release waits for **EPIC-001 2B contract factoring** and **BUG-014 packaged-template
  acceptance**; coordinate the backend skill/version change with **BUG-013**.
- Reuse BUG-003 validation behavior **without reopening BUG-003** (corruption class stays
  closed; this feature is in the quality/grounding class).
- ⚠ **Confirm before circulation:** BUG-013, BUG-014, and EPIC-001 IDs must be verified
  against the origin backlog (origin requires VPN; the local checkout's backlog knowledge
  ends at sprint-1 closure via !47).

## Architecture gate

Implement from a fresh `origin/sprint1` base. Directory-limit facts (measured in the
local checkout 2026-08-04 — re-verify on the fresh base, the checkouts diverge):

| Directory                                          | Children | Consequence                                                                                              |
| -------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `process/services/presentation-template/`          | 8        | Adding `templateStaging.ts` + test reaches exactly 10 — compliant as direct children; factoring optional |
| `renderer/components/chat/TemplateGallery/`        | 10       | At the limit — no new direct children                                                                    |
| `renderer/utils/chat/`                             | 13       | Already over — the marker parser must land in a factored submodule                                       |
| `renderer/pages/conversation/Messages/components/` | 21       | Already over — the proposal card must land in a factored submodule                                       |

## Open confirmations (resolve during T0)

1. BUG-013 / BUG-014 / EPIC-001 resolve to the assumed backlog items on origin.
2. The "existing skill creator" reference in T4 — name the real feature or drop it.
3. Directory counts re-measured on the fresh `origin/sprint1` base.
4. The T0 privacy decision (sanitize vs disclose) — blocks all implementation.

## Out of scope (v1)

Gallery rename/edit/delete by chat; preview-toolbar trigger; sharing/export; forking
built-in templates.
