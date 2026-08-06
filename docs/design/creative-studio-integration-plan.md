# Creative Studio — integration plan for `creative-suite-sprint2`

**Status:** proposed, awaiting Checkpoint 0 decision · **Date:** 2026-08-05

## 1. Branch topology as it actually is

| Ref                                   | Base    | Ahead | Studio UI files | Contents                                                        |
| ------------------------------------- | ------- | ----- | --------------- | --------------------------------------------------------------- |
| `origin/sprint2`                      | —       | —     | 0               | tip `343b725c4` (2026-08-03)                                    |
| `origin/creative-suite-sprint2`       | sprint2 | **0** | 0               | **empty — a bare fork point**                                   |
| `creative-suite-sprint2` (local)      | sprint2 | 2     | 32              | khoapnt's line ported: `c11e53354` + `a40df852d`. **Unpushed.** |
| `codex/studio-integration`            | sprint1 | 121   | **69**          | the redesign + fidelity work + hardening                        |
| `codex/creative-suite-studio-refresh` | sprint1 | 50    | 32              | khoapnt's line, tip `c5b879c3e`                                 |

The agreed model is right: one long-lived isolated branch off `sprint2`, regular merges _from_ `sprint2` to avoid late conflicts, one merge request into `sprint2` when stable. Nothing below changes that.

## 2. The finding that gates everything

**`creative-suite-sprint2` currently carries the pre-redesign Studio, not the redesigned one.**

Evidence: `jobManager.ts` on that branch is **100% identical** to `codex/creative-suite-studio-refresh` and 89.1% to ours. It contains `StudioNavigationLock.tsx` — which our branch deliberately deleted — and lacks `StudioPhaseShell.tsx` and `StudioTypography.module.css` entirely. 32 studio UI files against our 69.

So the phase model (brief → write → produce → review) that matches the approved prototype, and all three UI fidelity passes, are **absent** from the branch now designated as the integration base.

Two consequences:

1. Continuing development there orphans the redesign.
2. **All three next-phase design specs are written and code-verified against `codex/studio-integration`.** They cite `AssistantDock` (204 lines), `WritePhase.tsx`, `PhaseShell`, `ShotCard.tsx:75`, `BriefPhase.tsx` — none of which exist on `creative-suite-sprint2`. Those specs would need re-verification, and in places redesign, if the pre-redesign UI becomes the base.

**This is cheap to change right now.** `origin/creative-suite-sprint2` is empty; the two commits carrying the pre-redesign port are local and unpushed. Nothing is locked in.

## 3. What each line uniquely contributes

Measured by file-set difference against `creative-suite-sprint2`:

- **Ours-only: 61 studio files** — the whole `PhaseShell/` architecture, all four phase components, `produce/{ShotCard, ShotGrid, EngineBar, ConnectEngineCard}`, `Library/{Composer, ProjectCard, ShapeTemplates}`, `AssistantDock`, `StudioTypography.module.css`, `fitStoryboardDurations.ts`. Plus 47 studio test files against their 30.
- **Theirs-only: 4 studio files** — `StudioHeader.tsx`, `StudioNavigationLock.tsx` and its test, and a colocated `routeSupport.test.ts` we moved under `tests/`. All four are pre-redesign pieces our branch deliberately superseded.

All five provider adapters — `bytePlusSeedance`, `mediaGateway`, `image`, `openRouterVideo`, `e2eFake` — exist on **both**.

> Correction: an earlier note claimed their line had adapters ours lacked. It does not. That was inferred from listing their files without checking ours.

**Therefore our branch is effectively a superset**, and the donor relationship currently runs backwards.

## 3.1 Verified: their line contributes nothing ours lacks

A corrective path proposed keeping the pre-redesign commits as a backup, treating `codex/studio-integration` as the UI source of truth, and _"bringing across only the newer runtime/OpenRouter/media improvements that the redesign actually lacks."_ The first two are right. **The third describes an empty set**, verified:

- `2002defe9 fix(creative-studio): make OpenRouter video generation work end-to-end` — its three changes are all already on our branch: the `silentOutput` exception for `openrouter-video-v1` (with a near-verbatim comment), `openrouter-video-v1` added to `ADAPTER_IDS`, and the Happy-Eyeballs `lookupOptions.all` DNS-pin fix in `remoteMediaDownloader`. Both lines converged on identical solutions.
- Their commit subjects describe the _same_ features ours has — "add OpenRouter video generation adapter", "register weprompt-studio protocol and studio runtime lifecycle", "port creative studio process service and remote-media" — i.e. parallel duplicate work, not newer work.
- A directional diff over `creative-studio/`, `remote-media/` and `creativeStudioTypes.ts` yields 174 lines present in theirs and absent from ours, and they are **type shapes ours evolved past**, not improvements. Example: `cancellation`. Ours carries 7 cancellation-related declarations against their 2 — `cancellationPolicy`, `canCancel`, and an explicit reference to their `cancellation` flag — so ours is the superset.

**Do not run a cherry-pick pass looking for that set.** Beyond wasting effort, porting their older type shapes onto our newer ones would be a regression.

**Archive the pre-redesign port with a ref, not a branch.** A local branch is one `git reset --hard` from being reflog-only. Done: `refs/archive/creative-suite-sprint2-pre-redesign-2026-08-05` = `a40df852d`.

## 4. Recommendation

Rebuild `creative-suite-sprint2` on **our** UI and service layer, keeping their line as the donor for anything genuinely theirs. Rationale: it matches the approved prototype, carries three completed fidelity passes, has live-verified image _and_ video generation against real paid calls, brings 17 more test files, and is the codebase every next-phase spec has been verified against.

The service layers are 86–99% similar, so this is not discarding their engine work — the divergence is concentrated in the UI, where ours is the redesign.

## 5. Checkpoints

Each checkpoint ends with something you can run. Gates are `bunx tsc --noEmit`, `bun run test`, `node scripts/check-i18n.js` unless stated.

### Checkpoint 0 — decide the base _(no code)_

Confirm §4, or choose the pre-redesign base instead. If the latter, the three next-phase specs need re-verification before they can be planned from — say so and I will scope that separately.

**Blocks everything below.**

### Checkpoint 1 — the branch carries the redesign

Reset local `creative-suite-sprint2` to `origin/sprint2` and port our work onto it. One expected conflict, `i18n-keys.d.ts` (modify/delete — accept the deletion, regenerate). Run `just git-setup` first so the locale merge driver is registered; `git check-attr merge` on a locale file must report `locale-json`.

**You test:** launch and confirm the library, and each of brief / write / produce / review, render as the prototype does — mono eyebrows, warm slate plates, `TAKE n · SHOT nn` bottom-left, named shape chips. Open a pre-existing project and confirm it loads.

**Failure means:** the port lost UI work; compare against `refs/archive/studio-integration-2026-08-05`.

### Checkpoint 2 — generation still works on the new base

No new features. Verify the pipeline survived the rebase.

**You test:** one image render and one video render, real paid calls. Confirm the take appears and is selectable.

**Failure means:** an adapter or route-resolution regression from the sprint2 merge, not from our work.

### Checkpoint 3 — the honesty guardrails

The three defects the reviews confirmed, none of them new features: the unconditional "Silent output; audio generation disabled" claim on audio-capable routes; `"Render · n/a"` hardcoded in all 12 locales; and video posters via the managed-video seam.

**You test:** a video render's confirm dialog no longer claims silence; no button shows a fake `n/a` cost; a completed video shows a poster frame rather than "Video poster unavailable".

**Failure means:** the seam's seek/capture contract needs revisiting — expect Chromium to floor to the frame at or before the requested time.

### Checkpoint 4 — first `sprint2` back-merge

Merge `sprint2` into the branch early rather than waiting. Establishes the cadence and surfaces drift while it is small.

**You test:** nothing visual — app still launches, gates green.

### Checkpoint 5 — cut model foundation _(schema only)_

`cuts`/`activeCutId`, validation, the widened fractional-duration validators, and the main-side canonical-take predicate. No editor UI.

**You test:** nothing visible. Regression only: existing projects open unchanged and their revision does **not** bump on open.

**Failure means:** a cut is being materialised on open instead of derived in memory.

## 6. Deliberately not in this plan

- Brief conversation and Write assistant — both gated on the project↔conversation binding, which does not exist yet
- The Review editor UI and any render pipeline — gated on the video spike's licensing answer
- The merge request into `sprint2` — that is the end state, after the above are stable

## 7. Open

Divergence UX for a hand-ordered cut, the only remaining open item in the cut model, is a design question and does not block Checkpoints 1–5.
