# Creative Studio v1.1 — the cut editor

**Date:** 2026-08-06 · **Base:** `creative-suite-sprint2@b98c58252` (pushed, MR !71 open)
**Design of record:** designer response §3a–3d, *Creative Studio — Review and Divergence States*
**Goal:** the cut a user edits is the cut that renders.

## 0. The sequencing decision, and why it is not negotiable

The designer's §3b is the spine of this plan:

> *"scene-derived segments also means clip order is not honoured either — a user who hand-orders the cut, renders, and gets the storyboard order back has not hit a missing feature, they have hit a lie… renderCut reading the cut is the first piece of this work, not the last."*

**Verified.** `renderService.ts:412` iterates `project.sceneOrder`; the file contains no reference to `cuts`, `activeCutId`, `clipOrder`, `sourceIn/Out`, `crop` or `filters`. It reads **one of the six things the cut holds**: the selected asset.

This is worse than a missing feature and it is **already reachable** — `updateCut` is a live IPC command (`creativeStudioService.ts:1210`), so a manually-ordered cut can exist today and render would silently discard the order while the divergence chip says *"Yours · edited by hand."*

So the renderer leads and the UI follows. The designer drew the honest-caveat alternative (ship the editor first, warn that edits are not in the render) and argued against it: *"it asks a marketer to hold two versions of their video in their head, and the first thing they will do is not believe either."* Agreed — **sequence it, do not caveat it.**

## 1. Slices

### R1 — `renderCut` honours clip order — **S**

The smallest change that removes a lie. Render resolves the active cut when one exists and iterates `clipOrder`; an absent cut still derives the implicit pristine cut from `sceneOrder` exactly as today.

- Scenes with no canonical take stay out and keep reporting through `missingSceneIds`.
- A cut in `storyboard` mode must render identically to today — this is the non-regression that protects v1.
- Verification: a manual-order cut written through `updateCut` renders in **clip** order, asserted by probing the output, not by reading intent.

**Ship this even if nothing else in v1.1 does.** It closes a reachable correctness bug on its own.

### R2 — `renderCut` honours trim, crop and colour — **L**

Completes the renderer so every control the editor will expose has a consequence before it exists.

- **Trim** — `sourceIn/sourceOut` per clip, with the frame-snapping contract already pinned in the cut-model design §5.1 (seconds as doubles, `sourceIn` inclusive, `sourceOut` exclusive, explicit forward step because ffmpeg rounds up where Chromium floors). **Audio is trimmed with the clip** — per the designer, and free by construction since each segment is encoded as one A/V pair.
- **Crop** — normalised 0–1 rect, aspect-locked to the project, applied before the existing scale-and-pad normalisation.
- **Colour** — the four scalars composed into the single 4×5 matrix in the fixed order, evaluated in sRGB. The cut-model design already specifies both conformance nets: **derived-matrix equality** across backends and the **golden-pixel table** seeded with measured Chromium values. Build those, they are the difference between "looks right" and "is right".
- **Identity is skipped** — all four at default must produce no render pass at all, asserted as absent.

Durations become derived: the header's played/untrimmed figures and the render line's actual output length are three different numbers (§3a) and all three must come from the same source of truth.

### R3 — the cut editor — **XL**

Only after R1 and R2. The designer's §3a, in one slice because it does not decompose — *"the half-built version is not a coherent screen."*

- Strip as a **timeline**: ruler, playhead, click-to-seek with the stage following, drag handles, per-clip selection, `TRIMMED`/`GRADED` neutral edit marks, clip width following trimmed duration, slate treatment for takeless shots.
- **One inspector**, four sections — takes, trim, frame, colour — scoped to the selected clip. No edit mode.
- **Render moves to the foot of the cut**, replacing the provisional handoff-aside placement.
- Hold-outside group with `Place it…` / `Add to the end` (§2a), now with a real destination.
- **Recovery without undo**: bipolar sliders with a visible zero tick, `Reset this clip` returning trim/crop/colour to defaults, and the no-undo statement in the panel footer.
- `Yours · edited by hand` widens from order to **order-plus-edits** rather than adding a second divergence state — which keeps the re-sync dialog's existing promise that trims, crops and filters survive, because re-sync only moves clips.

### R4 — render, failure and export states — **M**

§3c. Five states in the cut's footer, nothing moving position between them: progress in place with percentage **and clip count**; the busy guard stated on a disabled button with an accessible reason *before* it is hit; three typed failures each naming the failure in the user's vocabulary (a clip number, not an asset id) with exactly one action; and the export dialog carrying the consequence line plus `cut.mp4` with its render time so a stale render is visible before the folder picker.

### R5 — compact, dark, and three tokens — **M**

§3d, on **the app's own breakpoints** — the designer explicitly discarded their §16 numbers in favour of `useStudioLayoutMode`'s 820/1120.

- Inline above 1120; **drawer** 820–1120 at 322px, opened by selection and closed by Escape, stage and strip keeping full width; **compact** below 820 with the strip scrolling at a 96px minimum clip width.
- **Three tokens that do not exist and block dark theme**: `--cut-slate-hatch`, `--control-handle`, `--control-zero-tick`. Studio's CSS carries no dark rules today, so anything not coming from a token will be wrong the first time the theme flips.
- Keyboard parity throughout — **no drag-only affordance anywhere on this screen**. Trim handles are focusable sliders with `aria-valuetext`; `I`/`O` set in and out at the playhead; Space transports; crop nudges by arrow.

## 2. Two small items that are not slices

- **Unmute the stage.** `StagePreview.tsx:210` hardcodes `muted`. Audio is real and per-segment in the render, so the preview is currently lying about the product. Add the volume control from §3a; this can ride with R3 or land earlier.
- **No cost surface — already true here.** The designer retires the takes' `6 CR` line and the sidebar spend block. Those live in the prototype, not in our build: all 12 locales are verified free of currency symbols and price tokens. **No action; recorded so nobody goes looking for something to delete.**

## 3. Explicitly not in v1.1

Transitions, audio editing or mixing, text overlays, speed changes, multi-track, keyframes, NLE export — all unchanged cut-model non-goals. Alternate cuts stay schema-only. The Project models panel, `G1` provenance and Brief-as-conversation are separate tracks that do not interact with this one.

## 4. Running in parallel

- The two review P2s: the discarded paid storyboard result on a CAS race, and FFmpeg renders not cancelled on quit. Independent of this plan.
- MR !71 review and merge.

## 5. Execution notes

Same discipline as v1: one agent per slice in a provisioned worktree, independent revert-proof before merge, logged full suite at merge points in a quiet window, `just push` after each. Expect the R1/R2 renderer work to need real-FFmpeg tests with loud named skips when the binary is absent, and remember `h264_videotoolbox` fails inside the agent sandbox — the `libx264` fallback is what agents will exercise, so verify the hardware path yourself.

**Adding a gate breaks the suites that exercised the gated behaviour** — three test files needed opting in during v1. Expect the same when render starts honouring cuts: any suite asserting scene-order output will need updating, and each edit needs a comment saying why, or it reads as a test bent to pass.
