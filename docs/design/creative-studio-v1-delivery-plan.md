# Creative Studio — v1 delivery plan

**Date:** 2026-08-06 · **Base:** `creative-suite-sprint2@068beb035` (pushed, gates green)
**Goal:** the first version where a user gets a **playable video** out of WePrompt.
**Supersedes for sequencing:** the stale §3/§4/§9 of the landing plan and the "what next" ordering implied by recent slices. Design decisions in the cut model (rev 7), divergence, and panel docs stay authoritative.

## 0. Definition of done — one sentence

> From a fresh project: write a brief, generate a storyboard, render at least one image scene and one
> video scene through real providers, select takes, press **Render video**, and get a single playable
> `.mp4` — correct scene order, images held for their scene duration, video audio intact and in sync —
> delivered into the export folder, verified live in the running app.

Anything not required by that sentence is explicitly out of v1 (§5).

## 1. What we are building on — landed and verified

This plan gathers, it does not restart. Already on the branch, gated and pushed:

- **Generation works live** — image and video through OpenRouter; batch paid-generation review; FIFO caps (2 image / 1 video, global); posters via renderer canvas-capture.
- **The cut model is complete in main** — types, service, store, validation; an absent cut is an implicit pristine cut derived from `sceneOrder` + selected takes. **v1 renders exactly that pristine cut**, which is why no cut-editor UI is on the critical path.
- **ffmpeg is validated as feasible** — prototype (outside the app): 12s of 720p in 1.02s on `h264_videotoolbox`, audio through the concat, A/V matching exactly; seek semantics measured (ffmpeg rounds up, Chromium floors); filter formulas pinned with golden pixels. Licensing reviewed green for a prototype; two legal-desk items remain **pre-release, not pre-demo**.
- **Foundations for later phases** — proposal ledger (fail-closed CAS acceptance), curated MCP snapshot (allow-list, no caller yet), project↔conversation binding, sprint2 back-merge with the flake fix.
- **Design settled** — cut model rev 7 (hold-outside, no undo), divergence UX, nine-state models panel, pass 3 closed. One drawing gap matters here: **Review is STALE by omission** and the designer wants to draw it before the cut editor is built.

## 2. The critical path — Track A: render pipeline

The only track that changes what the product can do. Main-process, behind the existing cut model.

### A1 — render service core (main) — **L**

New `renderService` in `process/services/creative-studio/`:

- Derive the pristine cut in memory (the rev-2 rule: derive on read, never persist on open).
- Per clip, build an ffmpeg invocation: video takes pass through; **image takes become segments**
  (`-loop 1 -t <scene.durationSeconds>`) — the spike validated the video path, stills are new and
  must be tested, not assumed. Normalise every segment to project `resolution`/`aspectRatio`
  (scale + pad) before concat, since takes can disagree.
- **Audio is the assigned risk, not a footnote.** The cut design flagged A/V ownership as unassigned;
  it lands here. Takes may carry audio (`openrouter-video-v1` is the non-silent exception) or be
  silent; image segments have none. Give every segment an audio track (`anullsrc` for silent ones)
  before concat, or the concat desyncs or drops audio. Acceptance asserts audio survives and stays
  in sync.
- Concat → one `.mp4` (`h264_videotoolbox`, `libx264` fallback) → ingest as a **managed asset** via
  `mediaStore` so hashing, verified reads and preview come free.
- Temp workspace with cleanup on success, failure and cancellation.
- **ffmpeg provisioning, v1 rule:** resolve a system binary (`FFMPEG_PATH` override → `PATH`); if
  absent, the feature reports a typed `ffmpeg_unavailable` error and everything else still works.
  Bundling a binary is a packaging/legal task, deferred with the legal items.
- No trims, no crops, no filters, no transitions — the pristine cut has none. The measured frame-snap
  contract is documented as deferred with them.

Testing: generate tiny fixtures with ffmpeg itself at test start; when the binary is absent, the
suite must report those tests as **skipped, loudly** — never green-by-vacancy. Revert-proof applies
as everywhere else.

### A2 — render as a job: IPC + progress + cancel — **M**

- A render is main-owned and **local** — do not force it through the provider `jobManager`; reuse its
  lifecycle vocabulary (queued/running/succeeded/failed/cancelled) in a small local runner. One render
  in flight per project; a second request while one runs fails `busy`.
- IPC: `renderCut` + `cancelRender` + a `renderProgress` event (ffmpeg `-progress` gives out_time —
  map to percent of total cut duration). snake_case mapper discipline at the bridge as usual.
- Renderer: a **Render video** action on Review (placement can be provisional — one button does not
  preempt the Review redesign), progress display, and "open result" on completion. Scenes without
  takes are reported via the existing `missingSceneIds` vocabulary before rendering starts:
  non-blocking, same one-line pattern as the rev-7 export line.
- Result lands in the export folder alongside `storyboard.json`.

### A3 — live acceptance — **S**

The §0 sentence, executed in the running app via CDP, recorded with exact outputs in the epic entry.
This is the moment the epic's "honest cost" evidence for the render path gets captured too.

## 3. Track B — activation blockers (gate the MR, parallel to A)

All three verified still open today. None is large; none touches A's files.

- **B1 — default-off flag — M.** One shared flag, enforced **independently** in main (service refuses
  Studio commands when off) and renderer (routes and sidebar hidden). Tests prove both sides bite —
  a renderer-only flag is cosmetic.
- **B2 — per-project in-flight cap — S/M.** Two paid jobs in flight per project, enforced in main
  alongside the global media-kind semaphores; the epic's cap-2 decision, currently unimplemented.
- **B3 — honest-cost evidence — S, evidence not code.** Per-route, per-locale capture of the cost
  copy shown before payment; render-path evidence arrives with A3.

## 4. Track C — designer dependencies (parallel, non-blocking for v1)

- **Take the walkthrough offer now** — 30 minutes with the running app converts every `REVISIT` in the
  reliability map into a measured answer, and we can hand them a build immediately.
- **Commission the Review drawing** in the same session — player + cut editor + rev-7 hold-outside
  group + export line. It gates the **cut editor**, which is v1.1, not v1. Getting it drawn during
  Track A means no dead time after.

## 5. Explicitly not in v1

Deferred, not dropped — each has a settled design waiting:

| Item | Why deferred |
| --- | --- |
| Cut editor UI (trim/crop/filters/reorder) | Review must be drawn first; pristine-cut render doesn't need it |
| Hold-outside group + export line | Only meaningful once manual ordering exists |
| Project models panel, BUG-024 reason vocabulary, G1 provenance | Panel slice; brief for G1 already written |
| Brief-as-conversation + Studio MCP server | Prereqs landed; server is its own slice |
| ffmpeg bundling + the two legal-desk items | Pre-release, not pre-demo |
| Transitions, audio editing, speed, overlays | Cut-model non-goals, unchanged |

## 6. Execution shape

- **Track 0 — ran 2026-08-06, outcome: investigation, a split-out fix, and a gate policy.** BUG-025
  did **not** reproduce in 35 targeted executions (seeds, repetition, one-worker, full DOM project) —
  both observed failures were full cross-project runs, so targeted reproduction may be impossible by
  construction. Correctly, no speculative fix was made. The leaked body-root `<video>` was convicted
  as a **separate** production cleanup defect (BUG-026, deterministic reproduction, fix in flight) and
  exonerated as BUG-025's cause. **Gate policy** until BUG-025 reproduces under logging: an
  exactly-this-test gate failure → rerun the file in isolation; green → record the log against
  BUG-025 and proceed. Gates are no longer blocked on it.
- Worktrees off `creative-suite-sprint2`, one agent per slice, launched with the corrected sandbox
  notes (no socket-binding gates; provisioning verified from outside before launch).
- **Order: Track 0 → A1 → (A2 ∥ B1) → (A3 ∥ B2 ∥ B3).** A1 is the long pole and starts alone; B-track
  fills the review gaps between A-slices.
- Every slice: focused tests + independent revert-proof + `tsc` + lint/format; **full suite only at
  merge points, in a quiet window** (load < 8, zero competing vitest — today's measured threshold).
  `just push` after each merge; the branch stays pushed, never local-only again.
- Risk watch on A1, in order of expected surprise: ffmpeg spawn behaviour inside packaged Electron
  vs dev; still-image segments; mixed silent/audio concat. The prototype proved none of these —
  it ran outside the app.

## 7. After v1 — so the order is written down once

1. **v1.1 — cut editor** on the redrawn Review (trim/crop/filters, reorder, hold-outside, re-sync
   dialog), turning the render from pristine-cut into edited-cut.
2. **v1.2 — models panel** (nine states + BUG-024 vocabulary + G1, one slice, shared store round).
3. **v1.3 — Brief as conversation** (Studio MCP server, allow-list gains its first member).
4. **MR into sprint2** when B-track is closed and the acceptance record is complete.
