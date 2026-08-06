# Creative Suite — planning and implementation review

**Date:** 2026-08-06 · **Branch:** `creative-suite-sprint2@068beb035` (pushed) · **Measured, not recalled**

## 1. The headline

**Creative Studio can generate shots. It cannot produce a video.**

Everything upstream of the edit works and is verified live — brief, script, shot generation through
real providers, take selection, review. Export delivers a **folder of asset files plus
`storyboard.json`** with a `missingSceneIds` list. That is an asset dump, not a film.

The cut model — trims, crops, filters, clip order — is **fully implemented in the main process** and
has **zero renderer files**. There is no cut editor. And there is **no render pipeline at all**: no
ffmpeg, no muxing, no encoding anywhere in `packages/desktop/src`. The ffmpeg validation was a
prototype run outside the app.

So the product's stated goal — a playable video out of WePrompt — is the least-built part of it.

## 2. What exists, measured

| Area | State |
| --- | --- |
| Main process | 19 files, 10,345 lines |
| Renderer | 64 files, 10,619 lines |
| Studio tests | 49 files |
| Phases | Brief, Write, Produce, Review — all four present |
| Generation | Image **and** video verified working live through OpenRouter |
| Concurrency | FIFO semaphores, 2 image / 1 video, **global not per-project** |
| Store | CAS/revision-guarded, JSON, main-owned |
| Spend safety | Batch paid-generation review modal |
| Export | Assets + `storyboard.json` + `missingSceneIds` |
| Write assistant | `AssistantDock` shell wired into `WritePhase` |
| Proposal ledger | Landed 2026-08-06, guarded, fail-closed on stale |
| Curated MCP snapshot | Landed 2026-08-06 — mechanism only, **no caller** |
| Cut model | Main: types + service (55 refs) + store (36 refs). Renderer: **0 files** |
| Render pipeline | **Does not exist** |

## 3. Designed but not built

Ordered by how much each blocks a shippable product.

1. **Render pipeline.** Nothing exists. Without it the cut model is a description with no renderer,
   and the product cannot deliver its core artifact. ffmpeg is validated as *feasible* (1.02s for 12s
   of 720p, audio in sync, on the shippable VideoToolbox encoder) but nothing is wired.
2. **Cut editor UI.** The data layer is complete and unreachable. Review is also the one screen the
   designer rates **STALE by omission** — drawn as a player plus a read-only strip before the cut
   existed — so trim, crop, filters and per-clip selection are undrawn as well as unbuilt.
3. **Brief as a conversation.** Two of three prerequisites landed today. The third — the Studio MCP
   server — does not exist; the builtin ids are image-gen, IDP and vision only. Until it does, the
   curated snapshot's allow-list is correctly empty and nothing calls
   `createStudioBriefConversation`.
4. **Project models panel** (nine designer states) and the **per-shot reason vocabulary** for BUG-024,
   which covers one of nine causes today.
5. **Hold-outside group** + the non-blocking export line (cut model §4 rev 7, decided today).
6. **`EPIC-005-G1` provenance** — brief written, not launched.

## 4. Activation blockers — verified, unchanged today

From `TASKS.md` EPIC-005, re-checked against the branch:

- **No default-off flag.** Confirmed by search — nothing resembling one exists in `common/`. `/studio`
  and the model-settings section are already reachable.
- **No verified per-project cap.** The semaphores are global by media kind, not two-in-flight per
  project.
- **Honest cost contract** still lacks end-to-end evidence per route and locale.

None of these moved today. They gate the MR into `sprint2`, not the branch itself.

## 5. Planning health

Nine design docs. The quality is high and the review discipline has been real — several documents
carry revisions that corrected measured errors rather than accumulating assertions.

**But the design surface has outrun the build**, and doc status lines have drifted from reality:

| Doc | Says | Actually |
| --- | --- | --- |
| `cut-model-implementation-plan` | "ready to execute" | Main executed, renderer untouched |
| `video-capability-spike` | "proposed spike (rev 3)" | Spike done; licensing cleared; nothing wired |
| `integration-plan` | "awaiting Checkpoint 0 decision" | Superseded by the settled landing target |
| `landing-plan` | SETTLED (fixed today) | §3/§4/§9 still describe a five-MR route not taken |

This is the main planning risk: a reader cannot tell from status lines what is real. Three of four
above would mislead someone picking up the work cold.

## 6. Honest assessment

**What is genuinely strong.** The main-process foundation is careful work — CAS guards, fail-closed
proposal acceptance, cross-process capacity CAS via `O_EXCL`, main-owned operational state, an
explicit renderer projection boundary. The spend-safety thinking is better than typical: the curated
snapshot closes a hole that omitting generation tools would have left open, and it was found by
questioning an assumption rather than by an incident.

**Where the risk actually is.** Not under-planning — over-planning relative to build. Six design
documents describe behaviour no user can reach. The gap is widest exactly where the product's value
is: an edit that renders. A reviewer opening this branch today can generate shots and cannot make a
video, which is a difficult story to tell about a video product.

**What I would do next, in order:**

1. **Wire a render pipeline behind the existing cut model.** It is the only item that converts the
   whole main-process investment into something a user experiences. Everything else is polish on a
   product that cannot yet do its job.
2. **Get the Review screen drawn** — the designer offered, flagged it stale, and it is the surface
   the cut editor lands on. Building before drawing here will be rework.
3. **Then the activation blockers**, since they gate the MR and none are hard.

`EPIC-005-G1`, the models panel and Brief are all worth doing and none of them change what the
product can do. They should follow, not lead.
