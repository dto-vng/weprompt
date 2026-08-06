# B3 — honest-cost contract: end-to-end evidence

**Date:** 2026-08-06 · **Tree:** `creative-suite-sprint2@d2b2e70ec` (pushed) · **Blocker:** EPIC-005 _"the honest cost contract still needs end-to-end evidence for every route and locale"_
**Contract:** [landing plan](creative-studio-landing-plan.md) §6.3

## The contract being evidenced

§6.3 does **not** require a price to be displayed. Its operative clause:

> Until a trustworthy estimate exists, **omit the amount entirely** — remove `· n/a` from all 12 locales. The concurrency cap and the existing batch confirmation deliver the safety property on their own, so this work does not gate on pricing being available.

So the properties to evidence are: **(a) no fabricated or implied amount anywhere, in any locale; (b) every paid action is confirmed before it happens; (c) the confirmation names what will be spent, in non-committal wording.**

## Verdict: PASS on (a) and (b). (c) partially — see the gap.

## (a) No fabricated amount — all 12 locales

Scanned every locale's `conversation.json` under the `creativeStudio` subtree:

| Check                                                        | Result                      |
| ------------------------------------------------------------ | --------------------------- |
| `n/a` / `N/A` fragments (the original defect)                | **0 across all 12 locales** |
| Currency symbols (`$ € £ ¥ ₫`), `USD`/`EUR`, `price`, `cost` | **0 across all 12 locales** |
| `creativeStudio.review.chargeNotice` present and amount-free | **12/12**                   |
| `creativeStudio.draft.chargeNotice` present and amount-free  | **12/12**                   |

The `Render · n/a` / `Render another · n/a` defect is gone — confirmed statically here and **observed live** in A3, where the production button read plain `Render another`.

en-US wording, both non-committal (no guarantee, no figure):

- review: _"Generation uses your selected provider account and may incur provider charges."_
- draft: _"Drafting uses the project-selected Storyboard model and may incur provider charges."_

## (b) Every paid action is confirmed — traced to source

Paid-capable commands on the Studio bridge are `submitScenes`, `retryJob`, and `proposeStoryboard`. (`renderCut` is **local ffmpeg work — free**, and correctly carries no charge notice.) Each renderer path:

| Command                   | Sole caller            | Gate                                                                                                                                                                                                |
| ------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `submitScenes`            | `StudioPage.tsx:401`   | Only reachable from the confirmed `generationReview` state — the `GenerationReviewModal`. The submitted payload _is_ the reviewed object (mode, sceneIds, routes, catalogVersion, expectedRevision) |
| `proposeStoryboard`       | `StoryboardDraftModal` | Modal carries `draft.chargeNotice`                                                                                                                                                                  |
| `retryJob` (acknowledged) | `StudioPage.tsx:869`   | A **dedicated duplicate-charge dialog** with its own `retryChargeConfirm` action                                                                                                                    |

**The strongest finding is main-side.** `retryJob` is also passed straight to `ProducePhase` (`:117`), so the renderer _can_ call it unacknowledged — and that is safe, because the refusal does not live in the UI. When a scene has an unresolved `submission_unknown` job, `jobManager.ts:1195` throws `duplicate_charge_acknowledgement_required` **before** `resolveProvider` is reached. A renderer bug cannot cause a duplicate charge; the user must pass through the acknowledgement dialog, and the acknowledgement is persisted (`duplicateChargeAcknowledged` / `…At`).

Live corroboration (A3, 2026-08-06): the batch modal appeared before any spend, named both scenes with provider and model, showed 5 requested video seconds, 16:9/720p, watermark state, audio inclusion, and the timing advisory as **non-blocking** — then charged only after _Confirm and generate_.

## (c) The gap — what this evidence does NOT establish

**No amount is shown, so no route was evidenced as quoting a correct amount.** That is compliant with §6.3 as written, but the blocker's phrase "for every route" is only satisfiable in the weaker sense: _every route displays no amount, and none fabricates one._ If a future decision requires a real estimate, §6.3's six open definitions (currency/decimal representation, units, quote freshness and expiry, mixed-batch wording, identity rules, and "estimated, never guaranteed") are all still undefined, and this evidence would not carry over.

Recorded so the blocker is closed for the reason that is actually true, rather than by implying pricing exists.

## Method note

The first locale probe searched for the English words "charge"/"incur" and reported 11 of 12 locales as MISSING — a false alarm caused by searching translated files for untranslated text. Re-run against the **key paths** (`creativeStudio.review.chargeNotice`, `creativeStudio.draft.chargeNotice`), all 12 resolve. Probe by key, never by rendered English.
