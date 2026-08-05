# Creative Studio — the cut (edit-decision) model

**Status:** rev 2 — revised after execution review · **Date:** 2026-08-05 · **Branch family:** `creative-suite`
**Independent of:** the video-capability spike — this is why it can proceed now
**Blocks:** the Review editor UI and any render pipeline

> **Rev 2** incorporates a verification review that found two P0 defects, four P1s, and corrected two factual claims. Superseded claims are stated rather than deleted. Corrections are marked **[rev 2]**.

## 1. Why this exists before the renderer

The product decision is that a finished Studio project produces a playable video, which needs crop, trim, concat, filter and encode. *How* that render happens is unresolved: `docs/design/creative-studio-video-capability-spike.md` weighs a bundled ffmpeg against WebCodecs, gated on a licensing answer that can veto the leading candidate.

The edit decisions themselves are required by **every** candidate. Crop rectangles, filter parameters, clip order and in/out points have to be stored as non-destructive project metadata no matter who consumes them. So this model can be designed and built now, and it is the one part of the Review editor that cannot become wasted work.

**The single most important constraint follows from that:** this model must not encode any renderer's dialect. If a filter were stored as an ffmpeg filtergraph string, the data model would silently pre-decide the spike. §5 is where that principle bites.

## 2. Today

The project holds `sceneOrder: string[]` and `scenes: Record<string, StudioScene>`. A scene carries `durationSeconds` (intended, used for pacing and for the generation request), `selectedAssetId` (the chosen take) and `assetIds`. There is no crop, no trim, no filter, and no notion of a cut.

Review offers `StagePreview`, `AssetStrip` for choosing a take, and `SceneTimeline` for order and duration. Nothing is editable beyond take selection.

**[rev 2] Hand-off is richer than rev 1 claimed.** Rev 1 said it writes loose `{ assetId, fileName }` pairs with no ordering or timing. The renderer *result* is indeed those pairs (`creativeStudioTypes.ts:536`), but the exported folder is not bare: assets are traversed in `sceneOrder` with filenames encoding scene position (`mediaStore.ts:1296`), a `storyboard.json` carries `sceneOrder`, every scene's `durationSeconds`, aspect ratio, resolution and brief (`mediaStore.ts:1340`), and references are exported alongside. What it lacks is **non-destructive crop/trim/filter edit decisions** — which is still exactly the gap this model fills, but implementers should start from the correct baseline.

`StudioAsset` carries optional `width`, `height` and `durationSeconds` — populated from provider-reported metadata, so present sometimes and absent others.

## 3. Shape: a clip list, general in schema, one-to-one in v1

A **cut** is an ordered list of **clips**. Each clip is a non-destructive reference to a portion of one asset, with transforms applied at render time. Nothing ever mutates a stored asset.

```
cuts: Record<string, StudioCut>    // keyed by opaque cut id
activeCutId: string | null

StudioCut: {
  id: string
  name: string
  clipOrder: string[]              // explicit order, mirrors sceneOrder in v1
  clips: Record<string, StudioCutClip>
}

StudioCutClip: {
  id: string                       // opaque
  sceneId: string                  // provenance: which shot this came from
  assetId: string                  // which take; must be canonical for that scene
  sourceInSeconds: number | null   // null = from the start
  sourceOutSeconds: number | null  // null = to the end
  crop: StudioNormalisedRect | null
  filters: StudioCutFilter[]       // ordered, applied in sequence
}
```

**The schema permits N clips per scene from the first commit; the v1 UI creates exactly one.** This is deliberate. Splitting a shot, or using one take twice, is a plausible near-future request, and allowing it in the schema now costs nothing while retrofitting it later would be a migration. Constraining the *UI* to 1:1 keeps v1 honest and simple.

**The same principle applies one level up: the schema holds a map of cuts, and v1 creates exactly one.** Alternate versions of a cut are a plausible ask, and a singular `cut` field would foreclose them behind a migration. A map plus `activeCutId` costs one indirection now. The v1 UI never surfaces cut management — there is always one cut, named by default — but the shape does not have to change when it does.

`clipOrder` is explicit rather than derived from `sceneOrder`, because once clips can diverge from scenes, a derived order becomes ambiguous.

## 4. Relationship to the storyboard

**The storyboard stays authoritative for structure.** Shots, their intent, and their intended durations are what the user writes and what generation consumes. The cut is a *projection* of it: initialised one-to-one from `sceneOrder` and each scene's `selectedAssetId`, then independently editable.

Consequences that must be handled explicitly rather than discovered:

- A scene with no selected take produces **no clip**. It appears in the storyboard and in Review's slate treatment, and is simply absent from the cut — consistent with today's export behaviour, where unrendered scenes are reported as `missingSceneIds`.
- Changing a scene's selected take updates the corresponding clip's `assetId` and **preserves crop and filters**, because those express the user's framing intent rather than a property of the take.
- **[rev 2] Trim cannot simply be preserved.** Rev 1 required preserving trim across a take change *and* rejecting trim beyond a known asset duration — impossible when the replacement take is shorter. **Resolution: clamp.** When the new asset's `durationSeconds` is known, clamp `sourceOut` to it; if `sourceIn` itself exceeds the new duration, reset the trim to the full clip rather than producing an empty one. When duration is unknown, keep the trim and clamp at render time (§8).
- Reordering shots in the storyboard reorders the cut, **unless** the cut has diverged. Divergence must be a visible state, not an invisible one.
- **[rev 2] "Hand-ordered" needs an explicit flag.** Structural inequality detects a *current* mismatch, but not intent: a manually reordered cut that later happens to match the storyboard is indistinguishable from one that simply follows it. Since §4 promises to preserve user intent, add **`orderMode: 'storyboard' | 'manual'`** to `StudioCut`. Manual is set the first time a user reorders the cut directly, and only the user can return it to `storyboard`.
- Deleting a scene removes its clips.

## 5. Renderer neutrality: coordinates and filters

**Geometry is normalised.** `StudioNormalisedRect` is `{ x, y, width, height }` as fractions of the source frame in the range 0–1, not pixels. The project's `resolution` and `aspectRatio` are user-changeable, and pixel rectangles would silently misframe every clip when either changes. Both candidate renderers can scale a normalised rect trivially.

**Filters are named with typed parameters, never expressed as a backend string.**

**[rev 2] `params: Record<string, number>` is not typed enough.** Rev 1 claimed the closed id union made filters implementable; it does not. A string-keyed record permits unknown parameter names, missing required parameters, and different defaults per backend — so two renderers can diverge silently while both satisfying the type. Use a **discriminated union carrying each filter's own parameters**, with units, defaults and ranges fixed in the type:

```
StudioCutFilter =
  | { id: 'brightness'; amount: number }   // -1..1, default 0
  | { id: 'contrast';   amount: number }   // -1..1, default 0
  | { id: 'saturation'; amount: number }   // -1..1, default 0
```

The exact v1 set and its ranges remain a design decision (§11), but the *shape* must be a discriminated union before implementation, not a loose record. Each backend maps ids to its own mechanism: an ffmpeg filter chain, or a WebGL/canvas shader under WebCodecs. That mapping is **backend-private**, exactly as the adapter contract in EPIC-003 R1 keeps provider request mappings adapter-private.

This is the decision that keeps the model neutral. Storing `"eq=brightness=0.06:saturation=1.2"` would work today and would quietly make ffmpeg the only possible implementation. It also mirrors a rule the codebase already applies elsewhere: typed verbs compiled inside a seam, never a caller-supplied command string.

**Output spec is derived, not stored.** Resolution and aspect ratio come from project settings at render time. Storing them on the cut would let them drift out of agreement with the project.

**[rev 2] Two gaps in that contract.** Rev 1 said frame rate comes from project settings — **`StudioProject` has no frame-rate field.** Either fix a v1 frame rate in the render contract or add a `frameRate` project setting; decide before the schema lands, because it also governs whether trim is expressible in frames (§11). And rev 1 never said what happens when a crop rectangle's aspect ratio differs from the output: stretch, fill, or pad. Add an explicit backend-neutral **fit policy**, or constrain crop rectangles to the output aspect ratio. Codec and container remain render-command concerns, not cut fields.

**[rev 2] Audio needs an owner.** The same render contract must state whether source audio is muxed through or muted. OpenRouter video routes request generated audio (`openRouterVideoAdapter.ts:317`), so a cut of those clips has audio whether or not this model mentions it. This document does not own the decision, but it must not leave it unassigned — see §10.

## 6. Where it lives, and how it is written

**An optional field on `StudioProject` at `schemaVersion: 1`.** The store does validate `schemaVersion === 1` in several places (`store.ts:493`, `:549`, `:678`, `:1050`).

**[rev 2] But there is no project-key allow-list, and rev 1's mechanism was wrong.** `validateProject` does not enumerate `Object.keys` at the project root — the exact-key sets apply to scenes, routing, assets, jobs and connections (`store.ts:216`, `:389`). Rev 1 mistook the **job** key set for a project one. Two consequences:

- Optional fields *can* avoid a version bump, but **not** because a list needs extending. Nothing currently rejects a malformed `cuts` structure at the top level, so **dedicated cut validation is mandatory, not optional**, along with paired-presence rules for `cuts`/`activeCutId`.
- The renderer projection is explicit (`creativeStudioService.ts:526`) and would **silently omit** a new optional field. `toRendererProject` needs explicit handling. Store mutations otherwise preserve extra fields by cloning (`store.ts:1046`).

**[rev 2] Do not materialise a cut on first open.** Rev 1 said older projects "derive one on first entry to the editor" — that is a lazy migration and would bump the project revision just for opening a screen. Instead treat an absent cut as an **implicit pristine cut**, derived in memory, and persist it only on the first real cut mutation.

**The cut must not be written through `updateProject`.** That path has a deliberate scalar whitelist — `UPDATABLE_PROJECT_FIELDS = ['name', 'brief', 'aspectRatio', 'targetDurationSeconds', 'resolution']` — added as hardening precisely to stop the renderer writing arbitrary project fields. The cut is structured data with referential invariants and needs its own guarded mutation with its own validation.

**The renderer supplies intent only.** Following the `StudioEditableScene` precedent, where operational state stays main-owned: the renderer may set crop, trim, filters and order. It may never supply derived values — resolved durations, output hashes, render state. Main computes those.

All cut mutations go through the existing CAS/revision guards. There is nothing special about the cut here; it is one more part of the project object.

## 7. Duration semantics: derived and advisory

Once a clip is trimmed, the cut's real duration diverges from the storyboard's intended durations, and from `targetDurationSeconds`.

**The cut's total duration is derived and advisory. It is never enforced, and it never blocks anything.** This is consistent with a decision already taken on this branch: timing became advisory-only, and a main-process `timing_mismatch` gate was deliberately removed. Reintroducing a hard duration gate here would reverse that, and the reasoning has not changed — a user trimming a cut to 14s against an 15s target is doing their job, not making an error.

`PacingBar` and `fitStoryboard` continue to operate on **scene** durations, which drive generation. They do not operate on the cut.

## 8. Validation

- Every clip's `assetId` must be canonical for its `sceneId`. A clip may not reference a thumbnail, an import, or another scene's take.
- **[rev 2] The predicate must be main-side, and existing selection is weaker than this rule.** `isCanonicalStudioSelectedAsset` is a **renderer** helper (`StagePreview.tsx:54`) and must not be depended on for a store invariant. Worse, main's `selectAsset` checks project, scene and media kind but **not** `managedAsset.collection === 'assets'` (`creativeStudioService.ts:1304`) — so a scene-owned *imported* image can already become `selectedAssetId`, which the cut rule forbids. Build **one main-safe canonical-take predicate** and use it for both `selectAsset` and cut validation, or the derived cut will be invalid for projects that exist today.
- `clipOrder` must be a permutation of the keys of `clips`, with no duplicates and no dangling ids.
- Crop rects must be within 0–1 with positive width and height.
- Filter ids must be in the closed union; unknown ids are rejected before storage, not tolerated and skipped.
- Trim bounds are validated against `asset.durationSeconds` **when it is present**. It is optional — populated from provider-reported metadata — so when absent, bounds are accepted and clamped at render time rather than rejected at write time. Do not make an absent optional field a hard failure; that would make trimming impossible for any provider that omits duration.

## 9. Verification

- A project with no `cuts` opens and derives a one-to-one cut from `sceneOrder` and selected takes.
- Changing a scene's selected take preserves that clip's crop, trim and filters.
- A scene without a selected take yields no clip, and the cut remains valid.
- Storyboard reorder propagates to an untouched cut, and surfaces divergence for a hand-ordered one.
- Rejected writes: non-canonical `assetId` (via the **main-side** predicate), out-of-range crop, unknown filter id, `clipOrder` not a permutation, `cuts` present without `activeCutId` or vice versa, and a structurally malformed `cuts` object.
- **[rev 2]** A take change to a **shorter** asset clamps trim rather than producing an invalid or empty clip, and preserves crop and filters.
- **[rev 2]** `toRendererProject` carries `cuts` and `activeCutId` through to the renderer.
- **[rev 2]** Opening a pre-existing project does **not** persist a cut and does **not** bump its revision; the first real cut mutation does both.
- **[rev 2]** A cut derived for a project whose `selectedAssetId` is an imported image is either rejected or repaired — not silently invalid.
- Trim with `asset.durationSeconds` absent is accepted; with it present, out-of-range is rejected.
- Cut mutation cannot be performed through `updateProject`.
- No stored value contains a backend-specific expression — assert against the filter union, so that adding an ffmpeg-shaped string fails the type.

Assertions should target stored project state, not mocks. A suite that stubs the mutation path can pass while writing nothing.

## 10. Non-goals for v1

Schema room is left where noted, but none of this is built:

- **Transitions.** Cuts only. A future transition would attach to a clip boundary — additive, no migration.
- **Audio editing.** No mixing, levels, or separate audio tracks. **[rev 2]** Source-audio pass-through, muxing and A/V sync are **render-contract** requirements that must be assigned explicitly — the video spike's benchmark currently tests crop/filter/concat/H.264 with no audio or sync acceptance, which would leave this unowned.
- **Text overlays and titles.** `onScreenText` exists on a scene as script content, not as a render instruction, and this design does not change that.
- **Speed changes, freeze frames, multi-track compositing, keyframed parameters.** Filters are constant over a clip in v1.
- **Export to an external editor.** The product decision is a playable video from WePrompt; an NLE interchange format is not a goal.
- The Review editor UI, and the render pipeline itself.

## 11. Open questions

1. **The v1 filter set.** Which named filters, with what parameter ranges? This needs a design answer, not an engineering one, and it should be small enough that both backends can implement all of it.
2. **Divergence UX.** §4 requires divergence between storyboard order and cut order to be visible. What that looks like, and whether a user can re-sync, is a UI decision.
3. **Trim timebase — seconds or frames.** Depends on whether a project gains a frame rate (§5). **[rev 2]** This must be resolved *before* the schema lands, not after: assets carry optional duration with no frame rate or timebase, and persisted duration metadata is currently restricted to integers (`mediaStore.ts:931`), so second-precision trim is not currently expressible end to end either.
4. **[rev 2] Who owns the shared managed-video seam.** Poster capture (landing plan §7) and frame-accurate trim both need renderer-side video load, metadata extraction, codec-failure handling, seek completion and frame selection. Today `StagePreview` only renders a raw managed `<video>` (`StagePreview.tsx:220`). Naming one seam serves both and avoids two half-implementations; poster capture can adopt it without waiting for the render-backend spike.
