# Main-verifiable consent for paid actions

**Date:** 2026-08-06 · **Status:** design, agreed to build · **Base:** `creative-suite-sprint2@b98c58252`
**Origin:** MR !71 review finding P1-C, re-adjudicated **PARTIALLY CLOSED** after the renderer fix. Decision taken: adopt the bar rather than record renderer-only confirmation as acceptable.

## The property we are buying — stated honestly

The reviewer's finding: *"sender authorization and schema validation establish which window sent a well-formed request; they do not establish user consent."* True. Three paid commands — `submitScenes`, `retryJob`, `proposeStoryboard` — accept a well-formed payload and reach a provider with no evidence a confirmation was ever shown.

**What is achievable, and what is not.** Main cannot prove a human's eyes saw a dialog without owning the pixels — which would mean replacing the designed review modal with a native `dialog.showMessageBox` and losing the scene list, provider, model, duration and timing advisory that make the confirmation worth showing. That trade is not worth it.

What *is* achievable, and is the real bar:

> **No paid action proceeds unless main previously issued a single-use consent token for that exact operation, and main — not the renderer — computed the facts the confirmation displayed.**

That closes: replay, stale-renderer submission, payload alteration between review and confirm, and a single stray IPC call causing spend. It does **not** prove a human looked. We will say so in exactly those words wherever we claim it, because overclaiming this property is what put us here.

## Why main must compute the review facts

Today `buildBatchGenerationReviewRequest` and `buildSingleSceneReviewRequest` live in the **renderer** (`GenerationControls.tsx:138,181`). So the renderer decides what the user is told about a charge, and then asks main to act on it. Even with a token, a renderer that computed the wrong facts would get consent for something the user never saw.

Moving that computation to main makes main the source of truth for **what the user was told**, and lets the token bind to it. This is the substantive half of the change; the token alone is ceremony.

## Shape

1. **`requestPaidActionConsent(descriptor)`** — a new main command. Main resolves the operation (scenes, routes, catalog version, project revision, media kinds, durations), computes the **review facts**, records a hash of the normalised operation, and returns `{ token, expiresAt, facts }`.
2. **The renderer displays `facts`** — it may format and translate them, but must not invent or substitute them.
3. **On confirm**, the renderer calls the paid command with the token.
4. **Main validates** — token exists, unexpired, unused, and the incoming payload matches the recorded operation hash. Anything else fails typed `consent_required` (or `consent_expired` / `consent_mismatch`) **before** provider resolution.
5. **Single use.** Consumed on the paid call, whether it succeeds or fails, so a failed submit cannot be silently retried on the same consent.

**Acquire the token when the confirmation opens, not when it is confirmed.** Acquiring at confirm time makes the token a rubber stamp issued at the same call site it authorises. Acquiring at open time means an unconsented paid call must first stage the operation, which is the behaviour we want to force.

**TTL:** short enough that a stale renderer's token is useless, long enough that a user reading a batch review is not timed out mid-decision. Start at **two minutes** and justify any change.

## Scope — all three, not just retry

Retry is where the review found it, but a mechanism that covers one entry point and not the others is worse than none: it implies a guarantee the system does not have.

| Entry point | Today | After |
| --- | --- | --- |
| `submitScenes` | Renderer-computed review, renderer-only confirmation | Main-computed facts, token required |
| `retryJob` (ordinary) | Renderer modal added in `9d30e7aa9`, renderer-only | Token required |
| `retryJob` (`submission_unknown`) | **Main already refuses without acknowledgement** — verified | Keep the existing main-side refusal **and** require a token. The acknowledgement boolean stays; it means something different (the user accepted a possible double charge) and must not be collapsed into the token |
| `proposeStoryboard` | Renderer modal, renderer-only | Token required |

`renderCut` is **local and free** and must not require consent — adding it would train users to click through a dialog that guards nothing.

## What must not regress

- **The release gate stays independent.** Consent is a second gate, not a replacement; `feature_disabled` still returns before anything else.
- **Duplicate-charge safety is untouched.** The `submission_unknown` refusal is the one main-side spend guarantee that already works. It keeps working, with its own distinct dialog and wording.
- **No amount is displayed.** Facts computed in main are scene counts, kinds, durations, providers and models — **never a price**. The honest-cost contract is unchanged.
- **The confirmation UX does not get worse.** Same modals, same copy, same 12 locales; the change is where the facts come from and what the confirm button carries.

## Verification

The tests that matter are the bypass attempts, and they must be main-side:

- Each paid command called **without** a token is refused before provider resolution. Assert the adapter was never reached, not merely that an error came back.
- A token for operation **A** cannot authorise operation **B** — mismatched payload is refused.
- A token is **single-use**: the second call with the same token is refused, including after the first call failed.
- An **expired** token is refused.
- The **release gate still precedes consent**: with the flag off, a paid command with a perfectly valid token still returns `feature_disabled`.
- `submission_unknown` retry still requires its acknowledgement **in addition to** a valid token.
- `renderCut` requires **no** token and still works.
- Happy paths for all three entry points, end to end, unchanged from the user's point of view.

## After it lands

Correct the MR description to state the property precisely — main-issued single-use tokens bound to main-computed facts — and say plainly that it does not prove a human read the dialog. Then P1-C can be adjudicated CLOSED on evidence rather than on argument.
