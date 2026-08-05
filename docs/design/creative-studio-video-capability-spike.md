# Creative Studio — video capability spike

**Status:** proposed spike · **Date:** 2026-08-05 · **Not a sprint-2 commitment**
**Blocks:** the Review editor phase · **Does not block:** EPIC-005 (see §5)

## 1. The question

The product decision is that a finished Creative Studio project produces a **playable video file** — not an assembly-ready package for another editor. Studio therefore needs crop, trim, concat, filter and encode. None of that capability exists in this application.

This spike answers **how**, and produces knowledge rather than shipped code. It is deliberately not an implementation plan: one of its outputs is a legal answer that can invalidate the leading candidate entirely.

## 2. What is already known

Measured 2026-08-05, so the spike does not have to rediscover it.

**There is no video processing anywhere.** No ffmpeg in `package.json`, none in `packages/desktop/src`. This is a missing capability layer, not a feature gap.

**The renderer can already decode and frame-capture Studio video.** Tested against a real paid OpenRouter render (`bytedance/seedance-2.0-fast`, 1280×720, 5.085s) through the live app:

- the file loaded from `weprompt-studio://asset/<project>/<asset>` into a `<video>` element
- it seeked and drew to a `<canvas>`
- `canvas.toDataURL('image/png')` returned **883,030 bytes with no `SecurityError`**

The canvas is **not tainted** by the privileged custom scheme. This is the finding that decoupled poster frames from this spike (§5).

**Byte access is asymmetric.** The scheme is registered `{ standard: true, secure: true, stream: true, supportFetchAPI: false, corsEnabled: false }`. `<video>`/`<img>` streaming works; `fetch()` does not. A WebCodecs pipeline therefore needs either `supportFetchAPI: true` — a deliberate widening of a surface that security review exists to guard — or byte transfer over IPC. **Any WebCodecs benchmark must use whichever access path it would really ship with**, or the numbers are meaningless.

**Bundling a native binary is a paved road.** The app already ships a per-platform binary with full supporting machinery: `prepare-aioncore.js`, `aioncore-checksums.js`, `aioncore-trust.js`, `verify-bundled-aioncore-resources.js` — staging, checksums, trust verification, and package completeness verification. A second bundled binary is a new consumer of existing infrastructure, not new infrastructure. **But the road has potholes:** BUG-014 exists because the packaged app reads the wrong resource path and ships no templates at all.

**Electron is 37.10.3**, so WebCodecs `VideoEncoder`/`VideoDecoder` are available.

## 3. What the spike must produce

### 3.1 A licensing answer — the binary gate

Can we ship an ffmpeg build that is LGPL-only, carries the decoders and encoders the verb set needs, and excludes GPL-only filters? And what is the codec-patent posture for a commercially distributed product?

This is a legal and product question, not an engineering one, and it is likely the long pole. **If the answer is no, ffmpeg is dead and WebCodecs becomes the path by default** — which is why no implementation work should start before it lands.

### 3.2 A measured minimal build size

Not an estimate. Build the minimal configuration for the actual verb set and weigh it, per platform. The working figure of 50–80MB per platform is an assumption, and a stripped build may be far smaller. Size matters here because it stacks on top of the aioncore binary already shipping.

### 3.3 A head-to-head against a real cut

Both candidates, same task, real Studio assets — not synthetic clips:

> Concatenate N shots, each with a crop rectangle and one filter applied, and encode to H.264 at the project's aspect ratio and resolution.

Report per candidate: wall-clock time, output quality, peak memory, and behaviour when the UI is active (WebCodecs competes with the interface; ffmpeg in main does not). Include codec breadth — the canvas test proved one H.264 MP4 decodes, which says nothing about the next provider's output.

### 3.4 A recommendation with packaging consequences stated

Including which lane the work lands in, what the after-pack gate must assert, and how a missing or mismatched binary fails.

## 4. Explicitly not decided here

- **The edit-decision data model.** Crop rectangles, filter parameters, clip order and in/out points must be stored as non-destructive project metadata regardless of who renders. This model is required by every candidate, so it can be specced and built **in parallel with the spike** — it is not gated on the outcome.
- The Review editor UX.
- The Brief and Write phases.

Each gets its own spec.

## 5. Why this is out of sprint 2, and what still ships there

**The poster-frame requirement does not need this spike.** EPIC-005 blocks its activation MR on video posters, because OpenRouter returns no poster and a paid render currently reads as "Video poster unavailable". The §2 canvas result shows the renderer can produce that frame today with no binary, no packaging change and no licensing answer. The poster fix therefore stays in EPIC-005 and ships in sprint 2.

> An earlier argument for bundling ffmpeg was that it would fix posters "for free". That argument is withdrawn: posters do not need ffmpeg, and using them to justify a packaging change was reasoning backwards.

**The capability itself must stay out of sprint 2**, on the project's own rules:

- `TASKS.md` requires packaging, installer and release changes to use their own explicitly approved lane and to never be swept into an ordinary feature merge. Bundling a binary is squarely a packaging change.
- **Both live packaging bugs are in that lane** — BUG-013 (P0, packaged upgrades fail against existing data) and BUG-014 (P1, no built-in templates ship). Adding a second bundled binary with new checksum, trust and after-pack gates while that lane is being stabilised would confound diagnosis of the exact defects being fixed.
- P2 foundations may land hidden only when they do not delay stabilisation, and a stabilisation freeze follows the final release slice.

## 6. Suggested shape

A time box is the user's call. As a starting point: §3.2 and §3.3 are roughly a week of engineering; §3.1 runs in parallel and on someone else's clock. The spike is done when a written recommendation exists with the licensing answer attached — not when the benchmarks finish.

**Decision criteria, in priority order:** licensing viability first (a veto), then output correctness across the codecs providers actually return, then performance under an active UI, then installed size.

## 7. Open

- Whether the Review editor's non-destructive model should be specced now, in parallel. It is required by both candidates, and speccing it early de-risks whichever wins.
- Whether a bundled ffmpeg, once it exists, should also serve non-Studio needs — which would change its owning seam from Studio to shared.
