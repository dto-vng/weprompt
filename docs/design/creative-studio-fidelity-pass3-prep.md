# UI fidelity pass 3 — prep

**Status:** prep only, not a brief to execute yet · **Date:** 2026-08-06
**Prototype:** `~/Downloads/Creative Studio - Prototype with project list.html`

## 1. Half the original list already shipped

The pass-3 list carried from the fidelity round is stale. Two of its four items landed in Checkpoint 3 and need no further work — verified in `creative-suite-sprint2`:

| Original item | State |
| --- | --- |
| `Render another · n/a` should omit cost when no price data | **Done.** `en-US` now reads `"Render"` / `"Render another"`; the fabricated fragment is gone from all 12 locales, with a guard test asserting its absence |
| Video poster frames instead of "Video poster unavailable" | **Done.** `posterUnavailable` is deleted; `videoReady` replaces it, and real poster capture ships via the managed-video seam |
| Engine bar | **Open** — see §2 |
| Activity rows | **Open, needs measurement** — see §3 |

Anyone picking this up from the old list would have redone the first two.

## 2. The real delta: the prototype has no engine bar

Ours renders a single static strip:

> `RENDERING WITH — bytedance/seedance-2.0-fast · Video · up to 15s + google/gemini-3-pro-image · Image · up to 60s` · **Change engines**

The prototype has something structurally different — a **collapsible "Project models" panel** (find it in the prototype source by searching `isProduce`, then read forward ~2.6KB):

- A header row: `PROJECT MODELS` as an IBM Plex Mono eyebrow (10px, `0.12em`, uppercase, `#6E6553`), a 12.5px summary that truncates, and a chevron. The whole header is a button with `aria-expanded`, toggling the body.
- A sibling **`Open Model Settings`** action in rust `#B4380F` at 13px, weight 600.
- When expanded, a **three-column grid, one column per model role**, each with a mono 9.5px/`0.1em` uppercase role label above a button carrying a 7px status dot, the current value, and a `▾` — so a role can be cycled **inline** without opening Settings.

So the prototype treats model selection as *inspectable and adjustable in place*, defaulting to collapsed; ours treats it as a read-only summary with a link out.

## 3. Activity rows — unmeasured

The Produce right rail in our build shows a "Generation activity" column with job rows. I did not extract a comparable prototype spec for it, and I am not going to guess one from a screenshot. **Measure it before briefing any change**, the same way §2 was measured: read the prototype markup rather than eyeballing the rendered page.

## 4. A decision to make before briefing this

**Do not assume the prototype wins here.** Since it was drawn, Produce gained things the prototype never had: auto-selection of an unambiguous route (verified — opening a project with no image route configured selected `gemini-3-pro-image` automatically and bumped the revision), a `ConnectEngineCard` for the unconfigured state, and honest per-route capability text (`up to 15s`, `up to 60s`).

An inline three-role cycler may now be redundant, or may actively conflict with auto-selection — cycling a role the app just chose for you is a confusing affordance. The genuine question is whether the *collapsible, inspectable* framing is worth adopting while keeping our current behaviour, rather than whether to reproduce the prototype's control.

That is a product call and should be settled before any agent is briefed, or the agent will simply reproduce the drawing.

## 5. What a pass-3 brief would need

1. The §4 decision.
2. A measured spec for activity rows (§3).
3. The usual traps: Arco's `.arco-btn-text:not(.arco-btn-disabled)` beats a bare CSS-module class on background and colour, and no jsdom test can catch it; semantic tokens only; 12 locales for any new string; `i18n-keys.d.ts` is gitignored — regenerate, never stage.

## 6. Not in pass 3

Poster frames and cost copy (both shipped), the cut editor UI, and anything gated on the video-capability spike.
