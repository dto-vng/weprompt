# Creative Studio — script-level assistant v1 (Brief conversation + reference pool)

**Status:** agreed design, ready for planning · **Date:** 2026-08-07 · **Code branch:** `creative-suite-sprint2`
**Parent spec:** [Brief as a conversation, rev 3](creative-studio-brief-conversation-design.md) — its P0 corrections, allow-list decision and freeze semantics govern wherever this document is silent.
**Consumed later by:** [Write assistant](creative-studio-write-assistant-design.md) (second surface onto the same conversation).

## 0. The operating model this serves

Decided 2026-08-07, after studying invideo's Agent Two flow against our build. Two tiers of assistant, with different machinery because durability should match stakes:

- **Script level — big changes.** The user works with an assistant that holds the whole picture: the brief, attached material, the full script, per-shot take state. High-stakes writes (a whole script) go through durable, CAS-guarded proposals the user explicitly accepts. This is the conversation, and it is this document.
- **Scene level — small adjustments.** Stateless one-shot assists with **bounded context — this scene, the brief, the neighbours' titles; bounded, not blind.** Results land in the editor's existing draft state and the user is the accept step; no conversation, no proposals, no MCP. **Deferred.** Recorded here so the v1 tool surface stays small on purpose, not by omission.

Phase 1 of the operating model is "refine the brief, produce a script, and produce the supporting images video models need". The scope decision (product owner, 2026-08-07): **v1 ships script + references** — the assistant plans the visuals inside the script proposal; the user pulls every paid trigger through the existing review flow.

## 1. What is already built (measured 2026-08-07 on `creative-suite-sprint2@646d5db7d`)

| Capability                | Evidence                                                                                                                                                                                                                                        | Missing piece                |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Project↔conversation bind | `extra.studio_project_id` (`storage.ts:244`), `briefConversationId`, `bindBriefConversation` IPC, resolvers both directions (`projectConversation.ts`)                                                                                          | a caller                     |
| Curated conversation      | `createStudioBriefConversation` takes an explicit allow-list, then re-reads all four frozen snapshot fields and **throws on drift**                                                                                                             | a caller                     |
| Proposal ledger           | `recordProposal`/`list`/`accept`/`reject`/`reapAbandonedProposals`/`watchProposals` in `store.ts`, with validators, `O_EXCL` slot capacity and a path-segment guard; reap+watch wired at `runtime.ts:193`; IPC + `proposalUpdated` emitter live | a producer and a card UI     |
| Reference consumption     | `referenceAssetId → firstFrame → provider`, capability-gated main (`jobManager.ts:535`) and renderer (`routeSupport.ts:44`)                                                                                                                     | a generated-reference path   |
| Scene fields              | `StudioEditableScene` already carries `visualPrompt`; `referenceAssetId` is renderer-editable                                                                                                                                                   | nothing                      |
| Spend safety              | `GenerationReviewModal` batch confirm + honest-cost line; FIFO semaphores (image 2 / video 1)                                                                                                                                                   | nothing — references ride it |
| No-conversation route     | one-shot strict-JSON planner + `StoryboardDraftModal`                                                                                                                                                                                           | keep as-is                   |

The irreducibly new work: **one subprocess, one enum, two UI surfaces.**

## 2. Slice A — the Brief conversation

### 2.1 The server

`builtin-mcp-studio`: a new stdio subprocess in `packages/desktop/src/process/resources/builtinMcp/`, cloned from `knowledgeServer`'s per-conversation session pattern (env keys defined centrally, populated at conversation creation, parsed by the subprocess). One new entry in `scripts/build-mcp-servers.js` — bundling is an allow-list.

`STUDIO_ENV` carries exactly two paths: the project's own directory (read) and its `proposals/pending/` directory (write). The server never receives the store root and cannot enumerate other projects. Reads go straight to the project's `project.json` — main's temp-file+rename writes mean a concurrent read sees the old or the new file, never a torn one. Writes go only into `proposals/pending/`; the store's segment guard and record validation reject anything else.

### 2.2 Tools — two, exactly

- **`read_storyboard`** — the script (scene order + fields), project settings (aspect, target duration), and per-scene take/reference state. Read-only.
- **`propose_storyboard`** — a whole-script replacement (`replace_storyboard`, the single payload kind that exists). Writes one validated, bounded pending record atomically; carries the `baseRevision` it was computed against. The tool's return tells the model **"recorded"**, with the proposal id — never "accepted". Whether the user accepted is a later turn's readable fact.

No per-scene tools, no re-pacing kind, no reference-proposal kind. A partial revision ("tighten shots 2–4") is a whole-script proposal where most scenes are unchanged, and the card shows what changed. One payload kind, indefinitely.

**Growth note (mechanism, verified):** the conversation-creation freeze is **per-server, not per-tool** — the snapshot stores server descriptors (`id`/`name`/`transport`); tools are discovered when the subprocess starts each session. Tools added to this server later reach existing Brief conversations. A new _server_ (e.g. knowledge) never does; widening the allow-list only affects conversations created afterwards.

### 2.3 Brief UI

`BriefPhase` keeps name / aspect ratio / target duration as explicit controls and replaces the intent sentence with the conversation surface. Brief **owns the mount** — the message list is single-mount, and Write's reuse of the same conversation is the Write-assistant spec's problem, later.

Proposal cards render from `listProposals` on mount plus `proposalUpdated`, both already live. A card shows which scenes are added, removed and changed against the current script (per-field diff is later polish, not v1 acceptance). Accept → `acceptProposal` IPC → CAS-guarded write. Reject → `rejectProposal`. A stale card (base revision no longer current) fails closed and offers **re-propose** — a prefilled turn asking the assistant to redraft against the current script.

The one-shot **Draft storyboard** button stays visible regardless: it is the no-conversation route, and the fallback when the configured model does not call tools (the conversation still streams prose in that case; nothing breaks, tools simply never fire).

### 2.4 Lifecycle decisions

- **Creation is lazy, on the first message sent from Brief** — not on entry, so merely opening Brief never mints a conversation. Creation applies the allow-list (`[builtin-mcp-studio]` only), binds `studio_project_id`, then `bindBriefConversation` records the back-pointer.
- **Brief conversations are hidden from the general sidebar list** (one predicate on `extra.studio_project_id`). They are owned by the Studio surface; surfacing them in the chat list would invite deletion and renaming paths Brief would then have to defend against anyway.
- **Dangling binding** (conversation deleted through any path): Brief detects the dead `briefConversationId`, says so, and offers to start a fresh conversation — rebinding through the existing IPC. A deleted project must likewise not strand its conversation: project deletion removes the binding target, and the hidden-list predicate keeps the orphan out of sight; a reap of orphaned Brief conversations is explicitly **not** v1.
- **No undo** of an accepted proposal beyond revision history; recovery is re-proposing. Consistent with the cut model's no-undo stance.
- **Reaping** of abandoned pending proposals: already built, runs at startup. Parent-spec open question #5 is closed by the build.
- **Stale-conversation hint generalisation: deferred.** Under lazy creation every conversation is born with the current server set; the stale case first exists when the allow-list widens. That widening is the recorded trigger for the work.
- **Accept flushes-or-refuses first.** If `hasUnsavedSceneDrafts`, flush via `flushAllSceneDrafts` before applying, or refuse with a message — never silently drop typed content. The same guard wraps the retained one-shot **Draft storyboard** path, which today clears drafts without flushing (`useStoryboardEditor.ts:1543`; the discard is proven by an existing test) — that is parent spec §7's explicit requirement, closed here rather than inherited.

## 3. Slice B — the reference pool

### 3.1 `outputRole`

A generation request/job field: `outputRole: 'take' | 'reference'`, default `take` everywhere it is absent. (Named to avoid colliding with the existing `scene.purpose`, which is narrative content.) Threaded confirm → submit → job record → completion. The measured touch points:

- `jobManager.ts:526` — route derivation stops reading `scene.mediaKind` alone: a `reference` job routes to the **image** role regardless of the scene's media kind.
- `mediaStore.ts:964` — the output-kind check becomes role-aware: a take must still match the scene's media kind; a reference must be an image.
- `mediaStore.ts:1134` — completion stops being unconditional: a `take` commits as today (selected take, scene complete); a `reference` commits as a **pool asset** and never touches takes or review state.
- Reference jobs need their own idempotency/duplicate-prevention key — today's is per-scene-per-kind and would collide with a take in flight.

### 3.2 Pool assets

A completed reference persists as a project-level asset: `sceneId: null`, managed collection `references` (new member of the managed-collection union — precedent: render outputs already persist with `sceneId: null` via `persistProjectOutput`). The requesting scene's `referenceAssetId` is set to it on completion; any other scene may point at it afterwards. Pool assets never become clips — clips derive from `selectedAssetId`, which references never set.

### 3.3 The two widenings

Reference ownership is enforced in two places today, and both widen the same way — **scene-owned, or pool**, nothing else:

- `store.ts:1027` — accepts `asset.sceneId === sceneId` **or** (`asset.sceneId === null` and collection `references`).
- `jobManager.ts:568-574` — same widening; the `mediaKind === 'image'` requirement and the byte cap stay exactly as they are.

An asset owned by a _different_ scene stays rejected — the widening adds the pool, not cross-scene reach. The `collection === 'references'` condition is load-bearing: `sceneId: null` alone would let a scene reference a render output.

### 3.4 UI

- **Generate reference** in `SceneInspector`, next to the existing import: prefills a prompt from `scene.visualPrompt` (which the accepted script proposal populated), routes through the existing `GenerationReviewModal` with the line visibly tagged as a reference, consumes the image semaphore like any image job.
- **A picker** to point any scene's `referenceAssetId` at any pool reference (the field is already renderer-editable; the picker is a list of the `references` collection with thumbnails).

The invideo-style multi-section product sheet (turnaround / scale / macro / swatch) is **prompt engineering, not schema** — one pool image generated from a structured prompt template. Zero data-model cost; ship a template in the prefill.

## 4. A rejected path, recorded

"Generate references on an image scene and repoint" reuses every existing pipe and is wrong: a scene with a selected take yields a clip under the implicit-pristine-cut rule, so the reference workbench renders into the film as held stills — the v1 acceptance run measured exactly that behaviour for image takes. Do not revisit.

## 5. Error handling

- Stale `baseRevision` → accept fails closed, card offers re-propose. Silent rebase remains the one forbidden behaviour.
- Snapshot drift at creation → throw (built).
- Subprocess path escape → rejected by the store's segment guard; malformed records → rejected by validators, never surfaced as cards.
- Reference job failure → the normal job-failure surface; pool writes keep the temp+rename discipline; no partial pool state.
- Tool-incapable model → prose-only conversation plus the retained Draft storyboard button; no error state.

## 6. Verification

Parent spec §8 stands in full. The ones that bite, plus slice B's:

- Assert the **persisted** snapshot equals the allow-list on all four frozen fields (`mcp_server_ids`, `mcp_servers`, `mcp_statuses`, `session_mcp_servers`) **and** that each of the six auto-attach ids is individually absent — equality alone can pass vacuously.
- **No paid call from a tool turn**: instrument the image-generation client _and_ the Studio job manager. A job-manager-only assertion is insufficient by construction.
- A subprocess-written proposal becomes a renderer card without manual refresh, and survives restart.
- Project state is byte-unchanged after any tool call (give the subprocess a real store directory and diff it).
- A `reference` job on a **video** scene routes image, completes into the pool, sets `referenceAssetId`, and leaves takes/review state untouched; the take path regresses nothing (output-kind enforcement intact).
- Widened validators accept pool references and still reject an asset owned by another scene, a render output (`sceneId: null` but not `references`), and a non-image.
- Accept with unsaved drafts flushes or refuses — a test that fails on the current silently-discarding behaviour.
- i18n across 12 locales; ru/uk plural forms where counts appear.

## 7. Non-goals

The scene-level assistant (deferred with its bounded-context note); the chip-style question card (prose first — its `Submit answers` would be an ordinary user turn, so nothing is foreclosed); additional proposal payload kinds; knowledge/web/memory servers in the allow-list (widening affects only future conversations — an explicit product decision when it comes); the Write surface; narrative beats (sections assemble the **brief**, shots stay shots); replacing the one-shot planner — it gains the flush-or-refuse guard and nothing else.
