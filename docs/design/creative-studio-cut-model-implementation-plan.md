# Checkpoint 5 — cut model foundation: implementation plan

**Status:** ready to execute · **Date:** 2026-08-05 · **Branch:** off `creative-suite-sprint2`
**Design of record:** `creative-studio-cut-model-design.md` rev 5 — every decision there is settled; this plan does not re-open any of it.

**Scope:** schema, validation, persistence and the IPC seam. **No editor UI.** Nothing user-visible ships in this checkpoint, so the user-facing test is purely a regression: existing projects open unchanged and their revision does not bump.

## 0. Facts verified in the target branch

Read before writing; each one shapes a step below.

- `validateProject` (`store.ts:549`) validates known members and calls `containsForbiddenRendererField`, but **never enumerates root keys**. So an unvalidated `cuts` blob would pass. Cut validation is mandatory, not optional.
- `validateScene` (`store.ts:386`) is the pattern to copy: `Object.keys(value).length === SCENE_KEYS.size && every(key => SCENE_KEYS.has(key))` via the `hasExactKeys` helper (`store.ts:275`).
- `validateAsset` (`store.ts:438`) currently rejects fractional durations: `value.durationSeconds === undefined || isIntegerInRange(value.durationSeconds, 1, Number.MAX_SAFE_INTEGER)`.
- `mediaStore.ts:933` **throws** `invalid_media` on a non-integer `durationSeconds` — it does not round.
- `toRendererScene`, `toRendererAsset` and `toRendererProject` (`creativeStudioService.ts:531`, `:547`, `:562`) are **explicit field-by-field projections**. A new project field is silently dropped unless added there.
- `UPDATABLE_PROJECT_FIELDS` (`creativeStudioService.ts:72`) is a deliberate scalar whitelist. The cut must not go through it.
- `selectAsset` (`creativeStudioService.ts:1304`) checks project, scene and media kind but **not** `managedAsset.collection === 'assets'`, so an imported image can already become `selectedAssetId`.
- `isCanonicalStudioSelectedAsset` (`StagePreview.tsx:54`) is a **renderer** helper and must not be depended on for a store invariant.

## 1. Order of work

Each step compiles and its tests pass on its own, so `git bisect` stays meaningful and a step can be reviewed alone.

### Step 1 — widen the duration validators *(independent, ship first)*

This is a live trap unrelated to the cut: production adapters omit `durationSeconds`, which is the only reason the integer rejection has never fired. The moment one reports a true `5.085`, persisting a **successful paid render** throws.

- Add `isFiniteInRange(value, min, max)` beside `isIntegerInRange` in `store.ts`.
- `validateAsset`: `durationSeconds` becomes `isFiniteInRange(value, 0, Number.MAX_SAFE_INTEGER)` with a strictly positive lower bound.
- `mediaStore.ts:933`: replace `!Number.isSafeInteger(input.durationSeconds)` with a finite-positive check, keeping the upper bound.
- **Do not touch `StudioScene.durationSeconds`** (`store.ts:400`, integer 1–60). A *requested* duration is not an *actual* one; conflating them is the mistake this step exists to prevent.

Tests: an asset with `durationSeconds: 5.085` validates and persists; `0`, negative, `NaN` and `Infinity` are rejected; a scene duration of `5.5` is still rejected.

### Step 2 — the canonical-take predicate *(independent)*

One main-side predicate, used by both `selectAsset` and later cut validation. Ownership + `mediaKind` match + `managedAsset.collection === 'assets'` + reverse linkage through `scene.assetIds`.

Tightening `selectAsset` changes existing behaviour: an imported image can currently become a selected take. Treat that as the bug it is, but **check for existing projects in that state** — if any exist, cut derivation must cope (Step 5) rather than crash.

Tests: an import is rejected as a selected take; a thumbnail is rejected; a valid generated take is accepted; a take from another scene is rejected.

### Step 3 — types

In `creativeStudioTypes.ts`:

```
StudioNormalisedRect = { x: number; y: number; width: number; height: number }   // 0..1

StudioCutFilter =
  | { id: 'exposure';    amount: number }   // -1..1, default 0
  | { id: 'contrast';    amount: number }
  | { id: 'saturation';  amount: number }
  | { id: 'temperature'; amount: number }

StudioCutClip = {
  id: string; sceneId: string; assetId: string;
  sourceInSeconds: number | null; sourceOutSeconds: number | null;
  crop: StudioNormalisedRect | null; filters: StudioCutFilter[];
}

StudioCut = { id: string; name: string; orderMode: 'storyboard' | 'manual';
              clipOrder: string[]; clips: Record<string, StudioCutClip> }
```

On `StudioProject`, both optional and **paired**: `cuts?: Record<string, StudioCut>` and `activeCutId?: string | null`.

Add a renderer-supplyable subset mirroring `StudioEditableScene` — the renderer may set `crop`, `filters`, `sourceInSeconds`, `sourceOutSeconds`, `clipOrder` and `orderMode`, and nothing else. Never derived values.

### Step 4 — validation in the store

New `CUT_KEYS`, `CUT_CLIP_KEYS`, `NORMALISED_RECT_KEYS` and `CUT_FILTER_IDS`, validated with `hasExactKeys` exactly as `validateScene` does. Wire `validateCuts` into `validateProject` and enforce:

- `cuts` and `activeCutId` are **both present or both absent**; `activeCutId` must key into `cuts` when non-null.
- `clipOrder` is a permutation of `Object.keys(clips)` — no duplicates, no dangling ids.
- each clip's `sceneId` exists in `scenes`; `assetId` satisfies the Step 2 predicate for that scene.
- `crop` within 0–1 with strictly positive width and height.
- filter ids are in the closed union, one entry per id (**duplicates rejected**), `amount` finite in −1…1.
- trim: finite, non-negative, `sourceIn < sourceOut` when both are set. Validate against `asset.durationSeconds` **only when present** — absent duration must not be a hard failure, or trimming becomes impossible for providers that omit it.

Cut data arriving from the renderer must still pass `containsForbiddenRendererField`.

### Step 5 — derivation and persistence

**An absent cut is an implicit pristine cut, derived in memory.** Do not persist on open — that is a lazy migration and would bump the revision for merely viewing a screen.

Derivation: one clip per scene in `sceneOrder`, in order, for scenes whose `selectedAssetId` passes the Step 2 predicate. A scene with no selected take (or a non-canonical one, per Step 2) yields **no clip**. `orderMode: 'storyboard'`.

Persistence happens on the first real cut mutation, through a **dedicated guarded path** — not `updateProject`. Reuse the existing CAS discipline: `updateProject` in the store compares `expectedRevision` inside its serialised mutation, so pass the caller's expected revision unchanged and let a stale write fail closed.

Take-change behaviour (design §4): preserve `crop` and `filters`; **clamp** trim to the new asset's duration when known; if `sourceIn` alone exceeds the new duration, reset trim to the full clip rather than producing an empty one.

`orderMode` flips to `'manual'` the first time the user reorders the cut directly, and only the user can return it to `'storyboard'`.

### Step 6 — renderer projection and IPC

- Add `cuts` and `activeCutId` to `toRendererProject` with **deep clones**, following how `sceneOrder` and `routing` are already cloned. Omitting this is the silent-drop failure Step 0 flags.
- One new IPC binding for cut mutation, with a native payload schema in `payloadSchemas.ts` and a snake_case response mapper if the response crosses the AionCore boundary — a recurring silent-bug class in this codebase.

## 2. Tests that must bite

Beyond the per-step tests above, from design §9:

- A project with no `cuts` opens and derives a one-to-one cut; **its revision does not change**.
- Changing a scene's selected take preserves that clip's crop and filters.
- A take change to a **shorter** asset clamps trim rather than producing an invalid or empty clip.
- A scene without a selected take yields no clip and the cut stays valid.
- Storyboard reorder propagates when `orderMode === 'storyboard'` and does **not** when `'manual'`.
- Rejected writes: non-canonical `assetId`, out-of-range crop, unknown filter id, duplicate filter id, `clipOrder` not a permutation, `cuts` without `activeCutId`, malformed `cuts`.
- Trim with `asset.durationSeconds` absent is accepted; present and out-of-range is rejected.
- Cut mutation **cannot** be performed through `updateProject`.
- No stored value contains a backend-specific expression — assert against the filter union so an ffmpeg-shaped string fails the type.
- `toRendererProject` carries `cuts` through.

Assert on observable store state, not mocks. A suite that stubs the mutation path passes while writing nothing.

## 3. Not in this checkpoint

The Review editor UI, any render pipeline, transitions, audio, text overlays, speed changes, multi-track, LUTs, and export changes. Divergence **UX** is a design question still open; this plan only makes divergence *representable* via `orderMode`.

## 4. Execution notes

- Steps 1 and 2 are independent of the rest and of each other — parallelisable across agents. Steps 3–6 are sequential.
- Gates per step: `bunx tsc --noEmit`, `bun run test`, `node scripts/check-i18n.js`, `bun run lint:fix && bun run format`.
- **Provisioning agent worktrees — two distinct traps, both seen.** A `bun install` per worktree works but is slow and costs ~1.9GB each. Symlinking is fine *if done completely*:
  1. Link the **workspace-local** `node_modules` too — `packages/{desktop,web-host,web-cli,shared-scripts}` each have one. A root-only link leaves `serve-handler` unresolvable and `static-server.unit.test.ts` collects zero tests. That is a phantom failure.
  2. Link from a checkout on the **same base**. Linking the main checkout's root `node_modules` (on `sprint1`) into a sprint2-based worktree gives `builder-util-runtime` **9.5.1** where sprint2 pins **9.7.0**, and `releasePackagingConfig.test.ts` fails. That one is **not** phantom — the test is correctly catching a real version mismatch. Link from `.worktrees/creative-suite-sprint2/node_modules` instead.

  Verify provisioning before believing any red: `bun run test packages/web-host/src/static-server.unit.test.ts tests/unit/releasePackagingConfig.test.ts` must report 30 passing.
- `i18n-keys.d.ts` is gitignored on this branch. Regenerate with `bun run i18n:types`; never stage it.
