# Creative Studio — the Write assistant

**Status:** proposed design · **Date:** 2026-08-05 · **Branch family:** `creative-suite`
**Depends on:** `creative-studio-brief-conversation-design.md` (this reuses its conversation and writer model)
**Independent of:** the video-capability spike

## 1. Today

Write is a shot table. Each row edits `title`, `purpose`, `narration`, `prompt` (the visual prompt), `duration` and media kind, with a details expander. `PacingBar` plus `fitStoryboard` redistribute durations toward the target. `useStoryboardEditor` holds per-row drafts with conflict handling.

**There is one model-backed affordance, and the assistant surface overstates itself.** `AssistantDock` (204 lines) renders a description, the storyboard provider and model, a text-charge disclosure, and a single **Draft storyboard** button, presented inline or in a drawer. It has no input field and no conversation. Both entry points lead to the same place: **Ask assistant** opens the drawer, and **Suggest a visual** selects the shot and opens the same drawer — it makes no model call of any kind.

Meanwhile the copy reads *"Use the assistant to develop story structure, shot ideas, and prompts."* The assistant can do exactly one thing: regenerate the entire storyboard from the brief. Per-shot help does not exist. **This overpromise is a defect in the same class as the false audio claim, and this design fixes it or the copy must change.**

For supporting images, the only existing path is `chooseAndImportReference` — import a file from disk. There is **no** generate-an-image path anywhere in the Studio API.

## 2. Shape: one conversation, a second surface

**Write does not get its own conversation.** It is a second surface onto the *same* project conversation that Brief creates.

Three reasons, in order of weight:

1. **The MCP set is immutable after conversation creation** (aioncore-enforced; see the Brief design §5). A per-phase conversation would mean attaching the Studio tools twice and maintaining two frozen snapshots.
2. **Continuity is the point.** Tone, audience and intent negotiated in Brief must carry into shot-level refinement. Two conversations means re-establishing context, and paying for it in tokens.
3. **The tool surface is already sufficient.** Brief's design defines read tools for script, settings and takes, and propose tools for a whole script, a revision to named shots, re-pacing, and a visual prompt. Shot-level refinement needs no new text tools.

So `AssistantDock` changes role: from a launcher for a one-shot draft into a conversation surface bound to the project conversation, retaining its provider/model display and charge disclosure.

### 2.1 Selection is turn context, not a thread

When a shot is selected, the Write surface attaches that focus to the turn — "the user is looking at shot 3" — rather than opening a per-shot thread. The tools already read the whole script, so the assistant has full context and the focus is a hint about intent.

**Suggest a visual** therefore becomes real: it selects the shot, opens the surface, and pre-fills a turn asking for a visual prompt for that shot. It stops being pure navigation.

### 2.2 The one-shot draft stays

**Draft storyboard** is not removed. Per the Brief design §7, the strict-JSON one-shot planner remains the route for users who do not want a conversation, and the fallback when no tool-capable model is configured. Both live in the same surface.

## 3. Writer model: unchanged

Tools propose; the user accepts; the main process is the only writer. Proposals are durable records carrying the project revision they were computed against, and accepting a stale one fails closed with a re-propose action. All of this is inherited from the Brief design §3 and is not re-litigated here.

### 3.1 Write's extra wrinkle: unsaved row drafts

Brief has no per-field drafts. Write does — `useStoryboardEditor` tracks `hasUnsavedSceneDrafts` and exposes `flushAllSceneDrafts`, and `useStudioModels` already guards mutations behind a `beforeMutation` hook that flushes drafts and refuses when any remain dirty.

An accepted proposal must use that same discipline: **flush pending drafts first, and refuse the accept if any draft cannot be flushed.** A proposal must never silently discard something the user typed and had not yet committed. This is the single most likely place for this feature to lose user work, and it needs a test that types into a row, accepts a proposal touching that row, and asserts nothing typed was lost.

## 4. Supporting images — the new capability

This is the only genuinely new machinery in this design. Two distinct targets, which must not be conflated:

**A reference / first-frame image** conditions the shot's own generation. The scene already carries `referenceAssetId`, and route constraints already carry `supportsFirstFrame`. Today such an image can only arrive via `chooseAndImportReference` from disk. What is missing is a *generate* path: produce an image through the configured image route and attach it as the scene's reference.

**A take** is the shot's own rendered media, and already exists through `submitScenes`.

### 4.1 The rule, restated

**The assistant may propose what to generate. It may never cause a paid call.** Inherited from the Brief design §4 and non-negotiable here, because Write is where the temptation is strongest — "just make me a reference for this shot" is one sentence away from an unconfirmed charge.

So the flow is: the assistant proposes an image prompt and a target (reference or take); the proposal renders in the surface; the user confirms through the **existing** `GenerationReviewModal` charge path; the existing generation machinery runs. The assistant never reaches the job manager.

### 4.2 What has to be built

A main-process path parallel to `chooseAndImportReference` that takes a generated image asset and attaches it as a scene's `referenceAssetId`, under the same CAS/revision guards and the same lineage validation the media store already applies to provider output. Generated references must be distinguishable from imported ones in the store, so a later change of mind is traceable.

Reference generation counts against the same concurrency accounting as any other paid generation — the global FIFO semaphores plus the per-project cap. A reference image is not a free operation with a different budget.

## 5. Copy honesty

`assistantDescription` currently describes a capability that does not exist. Either it becomes true when this ships, or it must be corrected in the meantime. Do not ship a conversation surface whose description still promises more than the tools provide — the whole point of the propose-and-accept model is that the user can trust what the assistant says it is doing.

## 6. Verification

- **Selection focus reaches the model** as turn context, and changing the selected shot mid-turn does not silently retarget an in-flight proposal.
- **Unsaved drafts survive.** Type into a row, accept a proposal that touches that row, assert the typed content is either flushed or the accept is refused — never dropped. (§3.1)
- **No paid call from a conversational turn.** Assert against the job manager, not by inspection: no tool path reaches submit.
- **Generated references are attached under CAS guards**, are distinguishable from imported references, and consume normal generation capacity.
- **Stale proposal fails closed**, as in the Brief design.
- **The one-shot draft still works** when no tool-capable model is configured.
- **i18n** across 12 locales, with ru/uk plural forms where counts appear.

Assertion strength matters here as elsewhere: a suite that mocks the proposal channel can pass while proposing nothing and writing nothing. Prefer observable store state and job-manager state over spy expectations.

## 7. Open questions

1. **Does "supporting image" include takes, or only references?** §4 supports both, but the product intent behind "creating supporting images" was not pinned down. If only references, §4.2 narrows considerably.
2. **Proposal granularity.** One shot at a time, or may a turn propose changes across several shots? Multi-shot is fewer confirmations but a coarser undo.
3. **Selection changing mid-turn** — retarget, or bind the proposal to the shot that was focused when the turn started? Binding is safer and is the assumed default until decided.
4. **Whether Produce's "Write the visual" deep link** should also pre-fill an assistant turn, or keep only focusing the field.

## 8. Non-goals

- The Brief conversation itself (its own spec; this consumes it)
- The Review editor and the edit-decision model
- Any video capability
- Replacing `fitStoryboard` — the assistant may propose re-pacing, but the deterministic fit remains available and authoritative
- Removing the one-shot storyboard draft (§2.2)
