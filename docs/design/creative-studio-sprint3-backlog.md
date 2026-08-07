# Creative Studio — Sprint 3 backlog

**Compiled:** 2026-08-07 · **Epic:** `EPIC-006` — Brief as a conversation, script-level v1
**Design of record:** [script-level v1 design](creative-studio-script-level-v1-design.md) (parent: [Brief as a conversation, rev 3](creative-studio-brief-conversation-design.md))
**Code branch:** `creative-suite-sprint2` in the **Documents** clone (`/Users/lap16603/Documents/WePrompt`). Design docs live here in the Projects clone on `sprint2` — the two are separate clones, not worktrees; point executors at the right one.

## 1. Shape of the sprint

Two independent slices — no shared files, either lands first, both ride existing spend safety:

- **Slice A — the conversation** (A1 → A2 → A3, sequential): the Studio MCP server, the curated Brief conversation, the proposal cards.
- **Slice P — the reference pool** (P1+P2 together → P3): the `outputRole` enum, the two validator widenings, the inspector affordances.

The joint deliverable: talk → accept a script whose scenes carry visual direction → generate the product sheet once → point shots at it → produce.

## 2. Backlog items

### A1 — `builtin-mcp-studio` server — **M**

The new stdio subprocess in `builtinMcp/`, cloned from `knowledgeServer`'s per-conversation session pattern, plus its `build-mcp-servers.js` entry and `STUDIO_ENV` (project dir read, `proposals/pending/` write — never the store root).

Tools: `read_storyboard`, `propose_storyboard` (whole-script `replace_storyboard` records carrying `baseRevision`; return says **recorded**, never accepted).

**Acceptance:** a tool call writes one valid pending record atomically and the watcher emits `proposalUpdated`; project state is byte-unchanged by any tool call; a malformed or out-of-tree write is rejected and surfaces no card.

### A2 — curated Brief conversation, created lazily — **M**

First callers for `createStudioBriefConversation` and `bindBriefConversation`. Created on the **first message sent** from Brief (not on entry); allow-list is exactly `[builtin-mcp-studio]`; Brief conversations hidden from the general sidebar (one predicate on `extra.studio_project_id`); dangling `briefConversationId` detected with an offer to start fresh.

**Acceptance:** persisted snapshot equals the allow-list on all four frozen fields **and** each of the six auto-attach ids is individually absent; no paid call reachable from a tool turn, instrumented at the image-generation client **and** the Studio job manager; opening Brief without sending creates nothing; deleting the conversation out from under a project leaves Brief functional with the recreate offer.

### A3 — proposal cards, accept/reject, Brief surface — **L**

`BriefPhase` keeps name/aspect/duration controls, hosts the conversation surface (Brief owns the single mount), renders proposal cards from `listProposals` + `proposalUpdated`. Cards show added/removed/changed scenes against the current script. Accept → CAS-guarded `acceptProposal`; stale fails closed and offers a prefilled re-propose turn; accept **flushes-or-refuses** unsaved row drafts first, and the same guard wraps the retained one-shot **Draft storyboard** path (today it clears drafts without flushing).

**Acceptance:** a subprocess-written proposal appears without refresh and survives restart; stale accept fails closed with the project unchanged; the flush-or-refuse test fails on today's silently-discarding behaviour and passes after; the tool-incapable model degrades to prose + button with no error state; i18n ×12 with ru/uk plurals on counts.

### P1 — `outputRole: take | reference` through the job pipeline — **M**

The enum threaded confirm → submit → job record → completion, default `take`. `reference` jobs route to the **image** role regardless of `scene.mediaKind` (`jobManager.ts:526`), require image output (`mediaStore.ts:964` becomes role-aware), commit as **pool assets** — `sceneId: null`, new managed collection `references` — and set the requesting scene's `referenceAssetId` without touching takes or review state (`mediaStore.ts:1134`). Reference jobs get their own idempotency key.

**Acceptance:** a reference job on a **video** scene routes image and completes into the pool; the take path regresses nothing; a reference never sets `selectedAssetId` and never yields a clip.

### P2 — the two ownership widenings — **S** (lands with P1)

`store.ts:1027` and `jobManager.ts:568-574` widen identically to _scene-owned or pool_ (`sceneId === null` **and** collection `references`); the image-kind requirement and byte cap stay.

**Acceptance:** pool references validate and submit; an asset owned by a different scene, a render output, and a non-image all still reject.

### P3 — Generate-reference + picker in `SceneInspector` — **M**

**Generate reference** beside the existing import, prefilled from `scene.visualPrompt` (with the multi-section product-sheet prompt template — schema cost zero), through `GenerationReviewModal` with the line visibly tagged as a reference, on the image semaphore. A picker points any scene's `referenceAssetId` at any pool asset.

**Acceptance:** the modal names the job as a reference and keeps the honest-cost line; generated pool references appear in the picker with thumbnails; pointing a second scene at the sheet works and renders with `firstFrame` populated; i18n ×12.

## 3. Explicitly not in this epic

Scene-level assistant (bounded-context one-shots into editor drafts — deferred by design), the chip question card, additional proposal payload kinds, allow-list widening (KB search et al. — product decision when it comes; affects only future conversations), the Write surface, orphan-conversation reaping.

## 4. Boundary with sprint 2 — corrected 2026-08-07

The items below are **sprint-2 closeout scope** (one week remains as of 2026-08-07), not sprint-3 work as this section first claimed. Sprint 3 inherits only what slips past the sprint-2 boundary.

- **v1.1 cut editor** — **R2 closes sprint 2**; **R3 → R5 are sprint 3** (R3 is an XL indivisible slice and does not open in a closeout week) — [v1.1 plan](creative-studio-v11-cut-editor-plan.md); no files shared with this epic.
- **Sprint-2 bug tail** — BUG-024 (design settled), BUG-029, BUG-027, and a timeboxed BUG-025 instrumentation run; BUG-028 gets its design note in sprint 2, its implementation is expected to slip to sprint 3 — all specified in `TASKS.md`.
- **EPIC-005-G1** provenance — idle-lane filler in sprint 2, otherwise sprint 3 — `TASKS.md`.
- **FFmpeg licensing** — with the legal desk; chase during sprint 2 closeout; release-blocking, not merge-blocking.
- **Data-connector spikes S1/S2** — run in sprint-2 closeout if connectors are to be a sprint-3 platform candidate; they inform planning, not build.

## 5. Execution notes

Same discipline as v1: one agent per slice in a provisioned worktree (verify provisioning from outside the sandbox), independent revert-proof before merge, logged full suite at merge points in a quiet window, `just push` after each merge and verify pushes by ref equality. BUG-025 gate policy applies: a full-suite failure on exactly that test → rerun the file in isolation, record, proceed. New user-facing text means `bun run i18n:types` + `node scripts/check-i18n.js` before push. A1's subprocess work needs no display and no sockets; nothing in this epic renders video, so the sandbox VideoToolbox constraint is irrelevant here.
