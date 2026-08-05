# Creative Studio — the Write assistant

**Status:** rev 2 — revised after execution review · **Date:** 2026-08-05 · **Branch family:** `creative-suite`
**Depends on:** `creative-studio-brief-conversation-design.md` (rev 2 — inherits its conversation, binding and writer model)
**Independent of:** the video-capability spike

> **Rev 2** incorporates a verification review whose verdict on rev 1 was: *do not plan implementation from this spec unchanged.* Three P0 defects and two factual errors. Corrections are marked **[rev 2]** and superseded claims are stated rather than deleted.

## 1. Today

Write is a shot table. Each row edits `title`, `purpose`, `narration`, `prompt` (the visual prompt), `duration`, media kind **and [rev 2] `onScreenText`** — rev 1 omitted that last field (`ScriptRow.tsx:313`). `PacingBar` plus `fitStoryboard` redistribute durations toward the target. `useStoryboardEditor` holds per-row drafts with conflict handling.

**There is one model-backed affordance, and the assistant surface overstates itself.** `AssistantDock` is exactly 204 lines: a description, the storyboard provider and model, a charge disclosure, and a single **Draft storyboard** button, rendered inline or in a drawer. No input field, no conversation. Both entry points lead there — **Ask assistant** opens the drawer, and **Suggest a visual** selects the shot and opens the same drawer, making no model call (`WritePhase.tsx:197`).

The copy reads *"Use the assistant to develop story structure, shot ideas, and prompts"* (`en-US/conversation.json:760`), while the only capability is regenerating the whole storyboard. **All 11 other locales make the equivalent promise.** This overpromise is a defect of the same class as the false audio claim, and this design fixes it or the copy must change.

**[rev 2] On reference images, rev 1 was too absolute.** `chooseAndImportReference` is the only *creation-and-attachment UX*, and no generated-reference job exists — but `updateScene` accepts an editable scene containing `referenceAssetId` and will attach any eligible same-project, same-scene image (`creativeStudioService.ts:1184`).

## 2. Shape: one conversation, a second surface

**Write does not get its own conversation.** It is a second surface onto the same project conversation Brief creates. The MCP set is immutable after creation, tone and intent must carry over from Brief, and Brief's tool surface already covers shot-level text refinement.

So `AssistantDock` changes role: from a launcher for a one-shot draft into a conversation surface, retaining its provider/model display and charge disclosure.

### 2.1 [rev 2] Sharing is workable — but only single-mounted

The review confirms the economy survives, with a hard constraint rev 1 did not state. The phase shell mounts exactly one phase at a time (`StudioPhaseShell.tsx:117`), and send-box drafts are keyed by conversation so they survive unmount and remount (`useSendBoxDraft.ts:171`). Sequential surfaces are fine.

**Two simultaneous mounts are unsafe:**

- Conversation prefill supports only one consumer — a newer listener *replaces* the previous one (`useSendBoxDraft.ts:47`, and `useConversationSendBoxPrefill.dom.test.ts:98` asserts it).
- Message rendering uses global DOM ids via `document.getElementById` (`MessageList.tsx:651`), which collide across duplicate mounts.

Therefore: **exactly one mounted conversation body at a time.** This is a requirement, not a preference.

Also note `ChatConversation` is a full-page layout, not a dock-ready component (`ChatConversation.tsx:414`). Reusing the conversation UI inside a dock is more work than rev 1 implied — either extract a mountable body or accept a full-width Brief-style surface in Write.

### 2.2 Selection is turn context, not a thread

When a shot is selected, the surface attaches that focus to the turn rather than opening a per-shot thread. The tools read the whole script, so focus is a hint about intent. **Suggest a visual** therefore becomes real: select the shot, open the surface, pre-fill a turn asking for a visual prompt.

### 2.3 The one-shot draft stays — but not unchanged

**Draft storyboard** remains the route for users who do not want a conversation and the fallback when no tool-capable model is configured. **[rev 2]** It cannot remain as-is, however: it carries a live draft-loss bug (§3.1).

## 3. Writer model: inherited

Tools propose; the user accepts; the main process is the only writer of project state. Proposals are durable records carrying the revision they were computed against, and accepting a stale one fails closed. See the Brief design §3–§3.1 — including that proposal *observation* is entirely new plumbing, and that `StoryboardDraftModal` is **not** the propose-then-accept precedent rev 1 claimed.

### 3.1 [rev 2] Draft loss is a PRESENT bug, not a future risk

Rev 1 framed this as a risk to design around. It is already happening.

The retained `proposeStoryboard` flow calls IPC **without flushing** and then clears all drafts on success (`useStoryboardEditor.ts:1543`). An existing test demonstrates an edit typed while proposal generation is pending being discarded without any `updateScene` (`useStoryboardEditor.dom.test.ts:2279`). The epoch check makes the queued save resolve harmlessly after `clearAllDrafts` rather than persisting the text (`useStoryboardEditor.ts:818`, `:441`).

Rev 1 also over-credited the existing guard. `useStudioModels` does call `beforeMutation` and refuses when drafts stay dirty (`useStudioModels.ts:173`, wired at `StudioPage.tsx:169`) — but that protects **model-selection mutations only**. It is not a general acceptance guard.

**Required:** one **acceptance coordinator** that both conversational acceptance and the retained one-shot flow route through, which flushes pending drafts and rechecks dirty state before CAS acceptance, and refuses rather than discarding. The phase-transition code's bounded retry is the closest existing precedent (`StudioPage.tsx:613`).

Fixing the existing bug is in scope for this work. Shipping a second path into a known draft-loss hazard is not acceptable.

**[rev 2]** Proposal schemas, merge rules and draft-loss tests must include `onScreenText`, or acceptance can silently drop an editable field.

## 4. Supporting images

Two distinct targets, which must not be conflated: a **reference / first-frame image** conditioning the shot's own generation (`referenceAssetId` on the scene; `supportsFirstFrame` on route constraints, enforced at `jobManager.ts:501`), and a **take**, which is the shot's own rendered media.

### 4.1 The rule, and how it is actually enforced

**The assistant may propose what to generate. It may never cause a paid call.**

**[rev 2]** Enforcing this needs the curated MCP snapshot from the Brief design §4.1, because an ordinary conversation force-attaches the image-generation builtin and that path bypasses Studio's review modal and job manager entirely. Write is where this matters most — "just make me a reference for this shot" is one sentence from an unconfirmed charge — and a job-manager-only test cannot detect the violation.

Flow: the assistant proposes an image prompt and a target; the proposal renders in the surface; the user confirms through the existing `GenerationReviewModal` charge path; existing generation machinery runs.

### 4.2 [rev 2] P0: the job model cannot represent a generated reference

Rev 1 described this as "a main-process path parallel to `chooseAndImportReference`". That badly understates it. The current provider job model has **no output purpose**:

- The job manager derives media kind and route from `scene.mediaKind` (`jobManager.ts:526`), so a **video scene cannot request an image route** for its first-frame reference.
- Provider output must match the scene's media kind (`mediaStore.ts:964`), so an image generated for a video scene is **rejected**.
- Successful output is *always* appended as a take, selected, and marks the scene complete (`mediaStore.ts:1134`).
- Collections distinguish generated assets from imports but not generated *references* from takes.
- The reference preview currently assumes references come from `imports` (`ScriptRow.tsx:125`).

**Required:** an explicit paid-generation purpose — `take | reference` — threaded through the review confirmation, the submit request, the durable job, and the completion path. A reference job must always use the image route; attach its result as `referenceAssetId` atomically **without** changing `selectedAssetId` or marking a take complete; retain job lineage identifying it as generated; and pass through the same confirmation and capacity controls as any other paid generation. Reference preview handling needs updating too.

### 4.3 [rev 2] The per-project cap does not exist

Rev 1 said generated references consume "the global FIFO semaphores plus the per-project cap" — present tense. **Only the global limits exist** (`jobManager.ts:132`, `:346`: image 2, video 1). Submission enforces a 24-scene batch maximum and prevents duplicate active jobs per scene (`jobManager.ts:1140`, `:1186`), but there is **no project-wide active-job cap.**

The cap is *proposed* in the landing plan, not built. Until it exists, this spec must promise only per-scene exclusion plus global FIFO capacity. If the cap is built, its accounting must cover reference jobs — and note the landing plan's accounting is itself not yet representable: `submission_unknown` is an error code rather than a job status, other possibly-charged jobs land in `needs_attention`, and a download retry sets the same durable job to `running`, which state alone cannot distinguish from paid generation. Durable generation-purpose and execution-phase state are needed to reconstruct permits after a restart.

## 5. Copy honesty

`assistantDescription` describes a capability that does not exist, in all 12 locales. Either it becomes true when this ships, or it is corrected in the meantime. Do not ship a conversation surface whose description still promises more than the tools provide — the entire point of propose-and-accept is that the user can trust what the assistant says it is doing.

## 6. Verification

- **Single mount enforced** — two simultaneous conversation bodies are prevented, not merely discouraged (§2.1).
- **Unsaved drafts survive.** Type into a row, accept a proposal touching that row, assert the typed content is flushed or the accept is refused — never dropped. Cover `onScreenText`. **Include the retained one-shot flow**, which fails this today.
- **No paid call reachable** — assert the persisted MCP snapshot excludes paid-generation builtins, and instrument the image-generation client as well as the Studio job manager.
- **Reference jobs**: use the image route regardless of scene media kind; attach `referenceAssetId` without touching `selectedAssetId` or take review state; retain generated lineage; are distinguishable from imports; and pass the same confirmation and capacity controls.
- **Capacity claims match reality** — do not assert a per-project cap that is not implemented.
- **Stale proposal fails closed**, as in the Brief design.
- **The one-shot draft still works** when no tool-capable model is configured.
- **i18n** across 12 locales, with ru/uk plural forms where counts appear.

A suite that mocks the proposal channel can pass while proposing nothing and writing nothing. Prefer observable store state, the persisted MCP snapshot, and the generation-client boundary.

## 7. Open questions

1. **Does "supporting image" include takes, or only references?** §4.2 is materially cheaper if references only.
2. **Proposal granularity** — one shot per turn, or several? Multi-shot means fewer confirmations and a coarser undo.
3. **Selection changing mid-turn** — retarget, or bind the proposal to the shot focused when the turn started? Binding is safer and is the assumed default.
4. Whether Produce's "Write the visual" deep link should also pre-fill a turn.
5. **[rev 2]** Whether to extract a mountable conversation body from `ChatConversation` or accept a full-width surface in Write (§2.1).

## 8. Non-goals

- The Brief conversation itself (its own spec)
- The Review editor and the cut model
- Any video capability
- Replacing `fitStoryboard` — the assistant may propose re-pacing; the deterministic fit stays authoritative
- Removing the one-shot storyboard draft (§2.3)
- **[rev 2]** Building the per-project concurrency cap — that belongs to the landing plan's guardrail work (§4.3)
