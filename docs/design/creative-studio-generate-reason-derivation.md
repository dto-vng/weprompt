# Derivation — why a shot has no generate action

**Date:** 2026-08-07 · **For:** the Creative Studio designer, answering Ask B
**Method:** read from the code paths that suppress the control, not from memory or from the existing copy.
**Related:** [open asks commission](creative-studio-open-asks-commission.md) · `BUG-024` in `TASKS.md`

This is the list you asked for: for each cause, the trigger and what the user could actually do about it. **No copy is drafted here** — the fix column states the available remedy as a fact, and the sentence is yours to write.

## Headline: it is thirteen paths, ten causes, and about eight sentences

The "nine" in our earlier docs was an estimate and it was wrong in both directions. Enumerated properly:

- **13 code paths** can suppress the control.
- **2 are unreachable** in this call path and should never be written.
- **1 is not a per-shot reason at all** — it replaces the whole surface.
- The remaining **10 causes collapse to 8 sentences** under your DISTINCT rule, or **7** if you merge the two frame-shape cases.

Your prediction that two would be outside the user's control is **exactly right** — S3 and S8 below. One more, S2, depends on who holds the credential in that workspace.

## The sentences

Grouped as you asked: where two causes would produce the same sentence, they are one row.

| #      | The fact                                     | Triggered by                                                                                             | What the user can do                                          | Whose fault     |
| ------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------- |
| **S1** | No model is set for this kind of shot        | Role status `selection_required`, **or** no stored route for the role (`project.routing[kind] === null`) | Set one for this role in Model settings                       | User            |
| **S2** | The model for this kind of shot needs setup  | Role status `setup_required` — no usable credential for the provider                                     | Add the credential, **if they hold it**                       | User _or_ admin |
| **S3** | The model is not answering                   | Role status `unavailable`, **or** the specific route reports `health: 'unavailable'`                     | Nothing. Wait, or set a different model                       | **Neither**     |
| **S4** | The model set for this shot no longer exists | The stored route is absent from the current catalogue — retired, renamed, or withdrawn                   | Choose a replacement (your **Model retired** state in 4a)     | User            |
| **S5** | The model cannot make this frame             | The route's constraints exclude the project's aspect ratio, **or** its resolution                        | Change the project's frame settings, or set a different model | User            |
| **S6** | The model cannot make a shot this long       | The shot's duration falls outside the route's `minDurationSeconds…maxDurationSeconds`                    | Shorten the shot, or set a different model                    | User            |
| **S7** | The model cannot start from a reference      | The shot has a reference image and the route does not support a first frame                              | Remove the reference, or set a different model                | User            |
| **S8** | The model list has not loaded                | No catalogue at all, or a catalogue with an empty version string                                         | Nothing. It resolves itself or it is a fault                  | **Neither**     |

**S5 is the merge decision.** Aspect ratio and resolution are separate constraints and separate project settings, but they fail identically from the user's side — this model cannot make the picture this project is set to. One sentence covers both; two lets you name which setting to change. Your call, and it is the only place in this list where I think the grouping is genuinely arguable.

## Two paths that exist in code but can never fire here

Please do not write copy for these — writing them would imply a state a user cannot reach:

- **Kind mismatch.** The route is already filtered by the shot's media kind before the support check runs, so the check inside can never fail on kind.
- **Scene mismatch.** The per-shot call does not pass a scene id, so that clause is inert. It exists for the batch path.

## One that is not a per-shot reason

- **No role is ready at all.** When zero roles are ready, Produce replaces the entire shot grid with `ConnectEngineCard` — so there is no card, no control, and nowhere to put a reason. This is the state your 1a grid-empty case covers. It is listed here only so the count reconciles; it needs no per-shot sentence.

## What this changes about BUG-024

The register describes the bug as the shot losing its action "with no explanation", covering **one** of the causes. The derivation says the disabled control needs to carry **eight** distinct facts, two of which must not offer an action at all — which is your WHOSE FAULT rule doing real work, because the naive implementation would offer _Open Model settings_ on all eight and send a user to a screen that cannot help them in two of the cases.

## The constraint we should flag before you write

Your ONE LINE rule caps these at about twelve words because each string serves three surfaces: the visible reason, the accessible description on the disabled control, and the project-level summary in the models panel. **German runs roughly 30% longer than English** in this product and has already forced a truncation spec once, in your 1a panel. If twelve words in English becomes sixteen in German, we would rather know now whether you want a shorter German variant or a truncation rule than discover it when the strings land in twelve locales.
