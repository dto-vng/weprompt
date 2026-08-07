# Template Creation — Plan of Record (post-EPIC-002 restart)

**Date:** 2026-08-04 · **Revised:** 2026-08-07 after the EPIC-002 postmortem
**Status:** unified epic **retired**; work re-split into Epics A / B / C below
**Priority:** Epic A → **Sprint 2 backlog** (registration in the canonical `TASKS.md` on
`origin/sprint2` is a fresh-base follow-up; do not edit stale local copies). Epics B and C are
not scheduled.
**History:** the original unified plan (T0–T4) and its review hardening are superseded by this
revision. The complete implementation history lives in the EPIC-002 SDD ledger
(local, gitignored: `.superpowers/sdd/core-implementation-plan/progress.md` in the epic worktree).

## Postmortem summary (why the unified epic was retired)

EPIC-002 stalled after Task 3. It did not fail on code quality — reviews contained every unsafe
step, and nothing was integrated, pushed, or enabled. It stalled because "create a reusable
template" silently combined **seven hard problems** (mutable-source reading, raw Office content
under a privacy policy, sanitization, crash-safe persistence, idempotent recovery, gallery
installation, multi-backend skill routing), and storage was implemented before the
storage↔filesystem **authority seam** was frozen. Each review round then discovered another
compositional gap, and scope was repaired instead of cut.

The decisive mis-pricing happened on day one: choosing **all three formats** for v1 read as
feature scope, but pptx/docx raw ingestion is what carried effectively all of the security and
lifecycle burden. HTML template creation needs almost none of it.

Contrast evidence from the same sprint: EPIC-001's foundation (MR 57) froze contracts, limits,
state machine, and crash-injection boundaries *before* any consumer existed — and passed
independent review on the first pass.

### What the epic produced (real, preserved, reusable)

| Asset | Where | Disposition |
| --- | --- | --- |
| **Accepted Store V2 foundation** — exact durable-byte head protection, root authority checks, permanent committed ownership, sanitizer identity validation, PPTX/DOCX reload parity | `2f883cee531d5334250870f4bbe66b6bf472adc2` | **Consumed as-is by Epic A. API frozen; Epic A may not extend or modify it** |
| Blocked Task 3 candidate — source copying, pack snapshots, transient cleanup, 119 focused tests | `a1754a13e01c886458db6c1385fa88e6b0719823` | Preserved as **Epic C reference material** (mine its tests; never rebase it into A or B) |
| Task 1 proposal + marker contracts | frozen in the SDD area | Carried into Epic A unchanged |
| Privacy decision | resolved as **sanitize-v1** during the epic | Applies to Epics B/C; Epic A's staged artifact is reviewable text, so disclosure-on-card suffices |

## The split

Split by **hard problem**, not by task. Strictly ordered; each epic ships user value on its own.

| Epic | Outcome | Hard problems carried | Status |
| --- | --- | --- | --- |
| **A** | HTML template creation end-to-end from chat | none beyond what is already solved and accepted | **Sprint 2 backlog** |
| **B** | Office templates sourced from app-owned artifacts (EPIC-001 retained run candidates) | gallery install for binary packs; no raw ingestion, no sanitizer | Not scheduled; wants EPIC-001's retained-candidate machinery live first |
| **C** | Raw workspace Office ingestion + sanitization | all of them — this is a security/lifecycle epic and must be chartered as one | Not scheduled; may never be needed if B covers real usage |

**Scope guard (binding for every epic below):** each epic's charter names its hard problems and
seams **up front**; Epic A declares exactly two (below). If a task needs a sanitizer, an
**undeclared** authority seam, or an **undeclared** crash-recovery protocol, the task is in the
wrong epic — stop and re-charter rather than absorb it. (The original absolute form of this guard
was revised 2026-08-07: review showed Epic A's staging and installation contracts were *not*
already solved, so pretending it carries zero hard problems would have reproduced the EPIC-002
pattern of discovering boundaries mid-implementation.)

**Decision record (2026-08-07):** A/B/C decomposition **approved**. Epic A **conditionally
approved** after correcting the staging and installation contracts (folded in below). No Office
sanitizer, Store V3, historical chronology, or raw Office ingestion enters Epic A.

## Epic A — HTML template creation (Sprint 2 backlog)

**Outcome:** a user asks the assistant, mid-conversation, to create a reusable HTML template;
the agent writes a `THEME.md` and emits the accepted marker; WePrompt stages the single bounded
text file, shows a review card (name, preview, disclosure), and on explicit confirm installs it
into the Template Gallery as a user pack.

**The two declared hard problems (review-verified 2026-08-07 — Epic A is small, not free):**

1. **Storage-owned immutable staging of one bounded `THEME.md`.** Verified gap:
   `TemplateProposalStore.recordStagedSnapshot()` accepts a caller-supplied snapshot receipt and
   copies its digest/files/byteLength into durable state after structural assertion only, and
   `beginValidation()`'s "proof" compares caller fields against those same caller fields —
   circular. HTML avoids Office privacy, but not mutable-source, symlink/swap, or
   previewed-vs-installed divergence. Epic A therefore charters **one narrow internal
   Store/coordinator seam** that: copies and re-inspects the exact marker-bound file, **mints
   the physical snapshot proof inside trusted storage code** (never accepts it), and previews
   and installs only that immutable snapshot.
2. **Atomic, idempotent gallery installation consuming Store V2's reserved template ID.**
   Verified gap: `importThemeSpec()` mints its own `uniqueId(slugify(name))`, writes the pack's
   three files sequentially at the final destination — no destination-local temp directory, no
   atomic rename — so a crash leaves a partial pack and a retry produces `name-2` instead of
   completing the original commit. Epic A's installer writes into a temporary gallery directory,
   atomically renames, consumes the **reserved** ID, and survives duplicate confirmation and
   restart without creating a second template.

**Reuse map (contract-checked, not existence-checked):**

- **Proposal persistence:** accepted Store V2 at `2f883cee`, consumed as-is *except* the
  declared seam in problem 1; crash-safe proposals, idempotent terminal operations, and
  committed ownership are reviewed and reused.
- **Pack conversion:** reuse `importThemeSpec`'s **parsing, token extraction, manifest
  derivation, and SVG generation** — explicitly *not* its direct-write workflow as the commit
  mechanism (problem 2 replaces that).
- **Marker + trust boundary:** Task 1's accepted contracts, unchanged.
- **Gallery UI:** existing user-pack listing; review card follows existing message-card patterns.
- **Cross-backend:** templated *use* already works on AionRS and ACP via shared composition;
  cross-backend *creation and marker emission* is unproven and requires explicit smoke evidence
  (see acceptance).

**De-scope valve (per the two-blocked-revisions rule):** if either declared problem blows past
its bounds in review, fall back to **A0** — the assistant writes `THEME.md` and the user imports
it through the existing picker. A0 needs no Store V2 proposal work at all; it sacrifices the
create-review-confirm experience, not safety. The fallback is a scope cut, never added mechanism.

**Scope:**

- Source rule: **artifact-derived and description-only HTML templates.** A from-description
  *deck* template still composes as "generate the deck through the normal flow, then save it" —
  which lands in Epic B, not here.
- Staging accepts exactly one `THEME.md` (bounded size) from the marker-named staging directory
  under the authorized conversation workspace; the existing path/symlink/containment validation
  rules apply, sized for a single text file.
- The card shows the theme content is retained locally and used in future templated sends
  (disclosure, not sanitization — the user reviews the actual text).
- States, idempotency, expiry, and cleanup come from Store V2 semantics, not new machinery.

**Non-goals:** pptx/docx in any form; reference files; sample-token extraction from references
(HTML packs have none); sanitizer or privacy receipts beyond the disclosure line; any Store V2
schema or API change; gallery rename/edit/delete by chat; sharing/export; forking builtins.

**Acceptance:**

- Create → review → confirm → template usable in a new templated send, with **creation and
  marker emission smoke-proven on AionRS and at least one ACP backend** (use-path parity is not
  evidence of creation-path parity).
- **Staging contract:** the installed pack's `THEME.md` is byte-identical to the previewed
  immutable snapshot; the physical proof was minted inside storage code; a mutable-source swap
  after staging is detected and rejected.
- **Installation contract:** duplicate confirmation and app restart complete the *original*
  commit under the reserved ID — no `name-2`, no partial pack ever visible in the gallery; a
  crash mid-install leaves only a temporary directory that cleanup owns.
- Discard, expiry, and terminal idempotency behave per Store V2's accepted semantics; the only
  store change shipped is the declared seam from problem 1.
- The scope guard held: **no seam beyond the one declared**, no sanitizer, no new recovery
  protocol.

## Epic B — Office templates from app-owned artifacts (not scheduled)

EPIC-001's presentation runs retain candidates as app-owned, hash-bound, crash-safe artifacts
(`retained/candidate.pptx` under the run store, MR 57). "Save this deck as a template" sourced
from a retained candidate needs **no raw workspace ingestion**: authority over the bytes is
already proven by reviewed machinery, and the artifact's hash travels with it.

Charter constraints when scheduled: consumes Store V2 and the EPIC-001 run store read-only;
adds reference-file handling to gallery installation; sample-token extraction runs against the
retained candidate; the scope guard above applies. Entry criterion: EPIC-001 retained-candidate
flow live and stable in a packaged build.

## Epic C — Raw workspace Office ingestion (not scheduled; possibly never)

The actual security/lifecycle epic the original plan accidentally contained. If real usage after
A and B still demands ingesting agent-workspace pptx/docx bytes, charter it explicitly with these
**entry criteria, written from the postmortem:**

1. The storage↔filesystem authority seam contract is designed, reviewed, and frozen **before**
   implementation — the store independently proves physical filesystem results; callers can
   never supply structurally-valid evidence.
2. Legacy bypass paths (caller-supplied inspectors, cleaners, allocation/snapshot recorders) are
   **removed or hard-gated in the same change** that introduces the trusted path.
3. Crash/restart semantics are part of the contract deliverable (RED matrix first), not
   discovered during implementation.
4. The preserved `a1754a13` candidate is mined for tests and lessons; it is not rebased.
5. Sanitize-v1 remains the privacy baseline.

## Standing rules exported from this postmortem

These apply to future epics in this repository, not only to template work:

1. **Freeze the seam before the store.** An authority boundary contract is the deliverable of
   the first task; implementing storage against an unfrozen seam is how EPIC-002 stalled.
2. **A secure path beside a callable legacy path is not a boundary.** Removal or gating of the
   old path belongs to the same change.
3. **Two blocked revisions on one task = mandatory scope cut.** Never a third revision that adds
   mechanism.
4. **Count the hard problems in the charter.** More than two → split by problem, not by task.
5. **Reviews need a proportionality question:** "what is the simplest design that satisfies this
   finding?" — findings escalate machinery by default unless someone asks it.

## Follow-ups

- Register **Epic A** in the canonical Sprint 2 `TASKS.md` on a fresh `origin/sprint2` base
  (the register was reconciled 2026-08-07; stale local copies must not be edited — known
  shadow-fork hazard).
- EPIC-002's worktree, SDD ledger, and preserved heads stay untouched until Epic A's charter is
  registered, then archive per the controller's convention.
