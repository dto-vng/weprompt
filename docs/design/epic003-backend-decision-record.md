# EPIC-003 — Backend Decision Record

**Date:** 2026-08-08 · **Status:** accepted (Controller: minhtq)
**Scope:** answers three of the G3 plan rewrite's open questions — upstream pins, contract
discovery, and migration numbering. The remaining open questions are listed at the end with owners.
**Evidence base:** capability matrix
[provider-reasoning-capability-matrix.md](provider-reasoning-capability-matrix.md) (tracked);
G3 rewritten plans (gitignored under `docs/superpowers/plans/`, survivability copies held by the
Controller); code facts verified against `origin/sprint2` @ `43247930c` on 2026-08-08.

---

## DR-1 — Approved immutable commits are outputs of the slices, not inputs

**Question answered:** "Which immutable AionRS and AionCore commits are approved for downstream
consumption?"

**Decision.** The question cannot be answered with SHAs today, because the approved commits do not
exist yet — each is the post-review merge commit of its slice. What is decided now is the
**procedure**:

1. **AionCore:** when the AionCore slice passes independent review, its merge commit becomes the
   approved value and is recorded by setting `ACCEPTED_AIONCORE_SOURCE_COMMIT` in
   `packages/shared-scripts/src/prepare-aioncore.js` (line 35 at this base). That constant already
   fails packaging closed on mismatch (`prepare-aioncore.js:678`) — **no second pinning mechanism
   may be built.** Artifact provenance stays as-is: source `iOfficeAI/AionCore`, cosign-signed
   artifacts via the Forge mirror (`aioncore-trust.js`).
2. **AionRS:** WePrompt does not consume AionRS; AionCore does. The approved AionRS commit is
   therefore recorded **in AionCore** (its dependency pin), never in this repository. Creating a
   WePrompt-side AionRS pin would invent a dependency that does not exist and is prohibited.
3. **Ordering:** AionRS slice → review → its merge commit recorded in AionCore → AionCore slice →
   review → its merge commit recorded here. This is the same direction the G3 plans already
   sequence.

**Precondition (blocking, no code):** reconcile the two AionCore commits currently in play —
the capability matrix's evidence base `81ef258913e6ac5076a86d4adcc7edcc0f8f21ef` versus packaging's
accepted `260dbbc05d5c8d079fb60e0e9578d4250b6e4338`. The reasoning evidence was gathered against
code we do not currently ship. Resolution is DR-3's backend bump: advance the accepted commit to
the agreed base and re-run BUG-013's packaged acceptance. Until that lands, no reasoning slice is
admitted.

## DR-2 — Contract discovery rides the existing startup boundary; no new endpoint

**Question answered:** "Which AionCore endpoint/field reports reasoning contract v1 and the schema
floor?"

**Decision.** None — and none will be added. WePrompt makes no runtime version/info/health/
capabilities call to AionCore today (verified: no such call site exists on `sprint2`), and adding
one is new surface with new failure modes.

Instead, AionCore reports the reasoning contract through the **structured startup boundary** that
BUG-013 shipped and `backendStartupFailure.ts` already parses fail-closed:

- A **success-path** boundary stage `capabilities.reasoning` carrying numeric `contractVersion`
  and `floorVersion`, read with the existing `readBoundaryVersion` helper (the same mechanism that
  today reads `appliedVersion`/`floorVersion`/`latestVersion` at `database.migration_lineage`).
- **Absent, unparseable, or unknown ⇒ `unsupported`.** The renderer never becomes writable for
  reasoning controls without a positive, parsed report. An older development backend silently
  hides the feature; it can never half-enable it. This matches the capability matrix's rule that
  unknown behaviour is non-writable.
- The gap this closes is real but narrow: today's boundary fields arrive **only on failure**
  (`BOOTSTRAP_DATA_INIT_FAILED`). The reasoning feature needs the success-path report; that emission
  is a small, explicit task in the AionCore slice.

**Guard:** the packaging-time floor (`aioncore-migration-lineage.json` → `minimumSupportedVersion`)
and the runtime `floorVersion` must be derived from one source. Two independently maintained floors
drift, and a drifted floor fails **open** — the one failure mode this design exists to exclude.

## DR-3 — Migration numbers are assigned at merge time; the backend bump ships first, alone

**Question answered:** "Are migrations 038/039 still unused at implementation time?"

**Decision, part 1 — kill the race instead of narrowing it.** `038`/`039` are unoccupied at every
inspectable snapshot (local `main` @ 20 migrations; WePrompt's accepted lineage @ 27; upstream
evidence base @ 37). But they are the next free slots on a repo whose merge order we do not
control, so no pre-implementation recheck can hold them. Therefore:

- Reasoning migrations are authored with **placeholder numbers** and receive their final numbers
  **in the merge commit**, taking whatever slots are free at merge time. The plans' "fresh-ref
  recheck" stop-gates are satisfied by construction and `038`/`039` stop being load-bearing.
- The true guard is already shipped and stays authoritative: the lineage `fingerprint` plus
  per-entry checksums, enforced by BUG-013's `backend_database_lineage_incompatible` startup
  rejection. A collision or divergence cannot ship silently; it produces a loud, safe refusal to
  start.

**Decision, part 2 — the hidden scope is sequenced out.** WePrompt ships lineage **27**
(`provider model settings`); the evidence base is at **37**. Landing reasoning migrations there
would drag **ten unrelated migrations** (028–037: `project_bind`, `user_scope`,
`team_capability_criteria`, `conversation_fork`, `adoption_once_marker`,
`conversation_name_source`, `direct_agent_prompt_capabilities`, and three builtin-agent seeds)
into production as a side effect of a reasoning epic. Instead:

- **A standalone pre-epic change** bumps `ACCEPTED_AIONCORE_SOURCE_COMMIT` to the agreed base,
  extends the accepted lineage 27 → 37, and passes BUG-013's packaged migration/recovery
  acceptance (macOS ARM, macOS Intel, Windows) **on that alone**.
- EPIC-003's migrations then land on a validated floor. If something breaks, we know which of the
  twelve changes did it.
- **Rejected alternative:** basing the reasoning migrations on the current v27 line. It avoids the
  jump but permanently forks our numbering from upstream — a worse trade than one well-tested bump.

---

## Remaining open questions (not decided here)

| #   | Question                                                                                                             | Owner                                                                                                                       | Blocking?                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | Exact AionCore request/startup DTO field carrying `{ backend, providerId, capabilityRevision, modelId }` into AionRS | AionCore slice design (fork branch)                                                                                         | Blocks the AionRS slice's wire task only                                                   |
| 2   | Is `kimi-k2.5` still admitted given its documented 2026-08-31 sunset?                                                | Controller                                                                                                                  | No — matrix default already answers: no new K2.5 rollout behaviour without an explicit yes |
| 3   | Packaged-schema/release coordination proving migrations + contract v1 before the UI becomes writable                 | Resolved in substance by DR-2/DR-3 (single-source floor + pre-epic bump); the release checklist item remains with packaging | No                                                                                         |

## Consequences for the G3 plans

- The WePrompt plan's backend wire task now has its discovery seam defined (DR-2) and stays stopped
  until the DR-1 procedure produces the AionCore merge commit.
- The AionCore plan gains one small task (success-path `capabilities.reasoning` boundary emission)
  and loses its implicit reservation of `038`/`039` (DR-3 part 1).
- A new, separately reviewed pre-epic change (DR-3 part 2) precedes every reasoning slice.
