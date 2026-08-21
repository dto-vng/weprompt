# Creative Studio — the scene assist

**Status:** agreed design, ready for planning · **Date:** 2026-08-07 · **Code branch:** `creative-suite-sprint2`
**Sibling of:** [script-level assistant v1](creative-studio-script-level-v1-design.md) — this is the deferred scene tier of its §0 two-tier model, now designed. Where that document's principles and this one overlap, both say the same thing on purpose.

## 0. Position in the operating model

Script level is the conversation: whole context, durable CAS-guarded proposals, big changes. **Scene level is this** — small adjustments, stateless one-shots, bounded context, results under the user's cursor. Durability matches stakes: a whole-script proposal survives a restart; a scene tweak lives as an unsaved draft the user saves or discards within the minute.

Decided in this design round (2026-08-07): **whole scene, one revision** per call (not per-field, not N alternatives); **both surfaces** from day one — a script-row affordance in Write and a section in `SceneInspector` — as two triggers on **one shared popover component**.

## 1. Shape

The user opens the assist on a scene, types an instruction or taps a canned chip (**Punchier · Shorter · More visual detail** — chips only prefill the instruction text), and one call returns one revised scene. Fields the instruction touched come back changed; changed fields land in the **unsaved draft** through the existing `updateSceneDraftById(sceneId, patch)` seam (`useStoryboardEditor.ts:89`). The editor's existing dirty-state mechanics mark them; save applies through the existing guarded path; discard restores the saved value. The user is the accept step — no proposal machinery, and **main never writes the project on this path at all**.

## 2. Transport and context

One new IPC, `creativeStudio.reviseScene`. Main resolves the project's existing **text-model route** — the same route the storyboard planner resolves — sends **one strict-JSON completion** through the `StudioStoryboardClient` seam (`planning/storyboardPlanner.ts`; `response_format: json_object` is the established pattern), validates the reply, and returns a `Partial<StudioEditableScene>` patch restricted to the **five text fields**: `title`, `purpose`, `visualPrompt`, `narration`, `onScreenText`. Structural fields — `mediaKind`, `durationSeconds`, `referenceAssetId` — are read-only context, and are **stripped** if the model returns them.

**The bounded context recipe, fixed:**

- the project brief sentence, aspect ratio, and target duration vs. the current total;
- this scene's full editable **draft** (all five text fields plus `mediaKind` and `durationSeconds` as read-only facts);
- the **titles and purposes of the previous and next scene only**.

Not the whole script, not takes, not the knowledge base. Bounded, not blind — a scene agent that cannot see the brief will happily write narration that clashes with the film's tone; one that sees the whole script is paying for context it does not need.

## 3. Draft semantics — the one subtle rule

The assist operates on the **current draft**, not the saved value: "make _this_ punchier" means what is in the row now. Because the user asked for the revision, replacement is not silent loss — and discard still restores the saved value underneath.

The race that needs a rule: the user keeps typing while a request is in flight. **Apply-if-unchanged** — each field's value is captured when the request leaves; the returned patch applies only to fields whose current value still matches the capture; skipped fields are reported in the popover ("narration changed while I was thinking — kept yours"). The editor is never locked, and a late response can never clobber newer typing. This is the same never-silently-drop-typed-content discipline the script-level accept path enforces, expressed for a surface with no accept button.

## 4. Cost stance

**No per-call confirmation modal** — a confirm per click kills the iteration loop this feature exists for. Instead, an ambient disclosure sits in the popover footer: _"Uses your text model · may incur provider charges"_ — the same honesty register as the sidebar's "No media credits here" note and the batch modal's charge line. The path is text-only **by construction**: it never touches the job manager, the media routes, or the store, so there is no media spend to guard. Consistent with the deferred paid-action-consent scope decision (`creative-studio-paid-action-consent.md`) — its revisit triggers do not fire here.

## 5. Failure handling

Typed and boring. No text model configured → the affordance renders in the existing `StudioModelAvailability` vocabulary (`setup_required` / `selection_required`, `creativeStudioTypes.ts:419`) rather than inventing a new state. Provider failure, timeout, or malformed JSON → an error line in the popover with a retry button; **single attempt per click**, bounded timeout, no auto-retry. A failed call changes nothing — drafts untouched.

## 6. Verification

- **Boundedness is the test that matters most:** the context builder's unit test asserts scene 5's context contains scene 4's and scene 6's titles and **does not contain** scene 1's — a test that fails if someone "helpfully" widens the context.
- The patch validator rejects structural fields and unknown keys; length caps enforced.
- **Apply-if-unchanged** has a test that fails on naive apply: edit a field mid-flight, assert the patch skips it and the report names it.
- Both surfaces mount the one shared component; setup-required and failure states render; i18n ×12 with ru/uk plurals where counts appear.
- Live acceptance: one real text-model call revising a scene; typed content survives a mid-flight edit; save persists exactly the accepted fields.

## 7. Non-goals

Per-field assist affordances; N-alternative compare-and-pick (a v2 on top of this shape); streaming; conversation memory of past instructions; any storyboard-structure operation (add/remove/reorder scenes — that is script level); touching `mediaKind`, durations, or references; KB access; any change to the one-shot storyboard planner beyond reusing its client seam.

## 8. Sequencing

Independent of EPIC-006's slices — its only shared file is `useStoryboardEditor.ts`, where it _reads_ existing seams (`updateSceneDraftById`) and adds nothing Slice A's Task 11 touches. Slots as **sprint-3 stretch** after the two EPIC-006 slices, or wherever capacity allows.
