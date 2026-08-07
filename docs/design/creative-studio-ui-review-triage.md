# Triage — designer UI review, 2026-08-07

**Source:** the designer's UI review notes covering the project library, the Write step and the Review step, plus three cross-cutting themes.
**Why triage first:** the twenty findings do not share an owner. Some are defects in code merged today, some ask us to change the designer's own §3d spec, and half of them are on surfaces this epic never touched. Acting on them as one list would silently rewrite settled design and expand the epic.
**Related:** [open asks commission](creative-studio-open-asks-commission.md) · [v1.1 cut editor plan](creative-studio-v11-cut-editor-plan.md)

## Ownership, established from the diff

Verified rather than assumed:

- **R1–R5 touched zero Library and zero Write files.** Everything in the notes' sections 1 and 2 predates this epic.
- `Reset this clip` came from **R3** (`d8e0bf1ff`).
- All three duration strings — `Played`, `Source`, `Renders` — live under `phase.review.cut.duration.*`, so the vocabulary split is ours.
- `--control-handle` and the zero tick are tokens **the designer specified** in §3d.

## A — real defects in code we merged (ours to fix)

| Item    | Finding                                      | Status                                                                                                                                                                                              |
| ------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **3.1** | Trim In/Out render as `0.00000000000000`     | **Fixed** — `dc3e9e2d3`. Arco derives displayed decimals from `step`, and the one-frame step is `1/30`, so `precision={3}` was silently overridden. Now formatted to 2 decimals with an `s` suffix. |
| **3.3** | Clip label and `5s` sublabel contrast        | Open. Confirmed visually in both selected and unselected states. A gap in my own R5 review — I measured the zero tick and knob but never the clip labels.                                           |
| **3.4** | Duration stated in three vocabularies        | **Moved to B** — the three do not share a subject. See below.                                                                                                                                       |
| **3.7** | `Reset this clip` plus its warning dominates | Open, but see below — the _weight_ is ours, the no-undo warning is load-bearing design.                                                                                                             |

**On 3.7, one caution.** Demoting the control to a small text link is straightforward. Demoting the **warning** is not: the cut model states there is no undo and never will be, and recovery was deliberately placed in copy rather than in a control. Shrink the button; keep the sentence discoverable.

## B — changes to the designer's own §3d (needs a reply, not a fix)

These are not deviations. We built what was specified, and the notes now ask for something different.

- **3.2 — "indigo, the only indigo in the product, palette drift."** That is `--control-handle`, which §3d introduced as _"reusing the navy selection colour, which is correct semantically — it is selection."_ We added it as one of the three tokens §3d said were missing. If it now reads as drift, the token needs a new value, and that is their call.
- **3.6 — "show the default marker consistently on all sliders, or not at all."** The zero tick is the other of those tokens, and §3d called it _"the only thing telling a user where neutral is."_ The current behaviour shows it when a slider is away from default, which is defensible; showing it always is a reasonable refinement, but it is a change.
- **3.4 — "consolidate the three duration vocabularies into one line above the timeline."** The duplication is real, but the three numbers **do not describe the same thing**, and merging them into one line would imply they do. Read from `ReviewCut.tsx`: `renderDuration` sums every clip, so it is **cut-scoped**; `untrimmedDuration` and `localPlayhead` both derive from the **selected clip**. The review screenshot shows this exactly — a 5s clip inside a 10s cut, both numbers correct, different subjects. Consolidating without distinguishing scope would replace a duplication with an inaccuracy. What the line needs is either two subjects stated plainly, or a decision to drop the clip-scoped pair from this surface. Their call; we did not guess.
- **3.5 — re-sync does not say what it destroys.** The finding is fair; the proposed label is not. Re-sync **only moves clips** — the v1.1 plan §R3 records that `Yours · edited by hand` widening to order-plus-edits _"keeps the re-sync dialog's existing promise that trims, crops and filters survive, because re-sync only moves clips"_ ([v1.1 cut editor plan](creative-studio-v11-cut-editor-plan.md), line 51). So `Re-sync (discards manual edits)` would be **actively wrong**: it promises a loss that does not occur, and would deter users from an operation that is safe for their edits. What re-sync discards is the **order**. The honest label is narrower, and only they should write it.

## C — outside this epic (pre-existing surfaces)

All of **section 1 (Library, 1.1–1.6)** and all of **section 2 (Write, 2.1–2.7)**. R1–R5 touched none of these files. They are real findings and should be recorded, but as their own piece of scope rather than absorbed into the cut editor's tail.

Two are worth pulling forward regardless of scope, because they misinform rather than merely annoy:

- **1.1** — project titles falling back to the shape name or the metrics string. **Confirmed against live data, not a screenshot:** the store currently holds `Product story` ×3, `3 shots · 15s` ×3 and `5 shots · 30s` ×2 as actual project names.
- **2.1** — `Storyboard drafting is currently unavailable` sitting above an apparently enabled `Draft storyboard` button. A direct contradiction, and adjacent to `BUG-032`, which is already open against the same dock's copy.

## Cross-cutting

- **Monospace overuse** is a real observation and is pre-existing — it arrived with the typography pass, not with this epic. Reserving mono for numbers and identifiers is a system-level change and should be decided once, centrally, rather than per screen.
- **Disclaimer density** and **status duplication** overlap with A/3.4 on Review and with section 2 on Write. Fix the Review instance under 3.4; leave the Write instances with section C.

## Recommendation

1. Fix **3.3** and **3.4** with 3.1, which is already done — a single small Review pass, all three ours, none of them design questions.
2. Send **B** back as three questions with the §3d quotes attached, and flag the 3.5 correction before they write copy that promises a loss that does not occur.
3. File **C** as its own item. Do not fold Library and Write into the cut editor's completion.
