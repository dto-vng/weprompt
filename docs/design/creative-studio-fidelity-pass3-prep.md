# UI fidelity pass 3 — prep

**Status:** prep only, not a brief to execute yet · **Date:** 2026-08-06
**Prototype:** `~/Downloads/Creative Studio - Prototype with project list.html`

## 1. Half the original list already shipped

The pass-3 list carried from the fidelity round is stale. Two of its four items landed in Checkpoint 3 and need no further work — verified in `creative-suite-sprint2`:

| Original item | State |
| --- | --- |
| `Render another · n/a` should omit cost when no price data | **Done.** `en-US` now reads `"Render"` / `"Render another"`; the fabricated fragment is gone from all 12 locales, with a guard test asserting its absence |
| Video poster frames instead of "Video poster unavailable" | **Done.** `posterUnavailable` is deleted; `videoReady` replaces it, and real poster capture ships via the managed-video seam |
| Engine bar | **Specified.** Replaced by the Project models panel — see §2, and [the designer brief](creative-studio-designer-brief.md) §8 for the nine annotated states and the three data-model gaps that block three of them |
| Activity rows | **Closed, no work.** The designer's reliability map rates the Produce activity tray and batch confirm **TRUST** — build against the drawing; only wording needs to match what shipped. The measurement §3 asked for is no longer needed |

Anyone picking this up from the old list would have redone the first two.

## 2. The real delta: the prototype has no engine bar

Ours renders a single static strip:

> `RENDERING WITH — bytedance/seedance-2.0-fast · Video · up to 15s + google/gemini-3-pro-image · Image · up to 60s` · **Change engines**

The prototype has something structurally different — a **collapsible "Project models" panel** (find it in the prototype source by searching `isProduce`, then read forward ~2.6KB):

- A header row: `PROJECT MODELS` as an IBM Plex Mono eyebrow (10px, `0.12em`, uppercase, `#6E6553`), a 12.5px summary that truncates, and a chevron. The whole header is a button with `aria-expanded`, toggling the body.
- A sibling **`Open Model Settings`** action in rust `#B4380F` at 13px, weight 600.
- When expanded, a **three-column grid, one column per model role**, each with a mono 9.5px/`0.1em` uppercase role label above a button carrying a 7px status dot, the current value, and a `▾` — so a role can be cycled **inline** without opening Settings.

So the prototype treats model selection as *inspectable and adjustable in place*, defaulting to collapsed; ours treats it as a read-only summary with a link out.

## 3. Activity rows — closed, no measurement needed

~~The Produce right rail shows a "Generation activity" column with job rows, and I did not extract a comparable prototype spec for it.~~

**Resolved 2026-08-06 without measuring.** The designer's reliability map rates *Produce — activity tray, batch confirm* as **TRUST**: the cost copy that the confirm dialog was drawn around has shipped, so the drawing is current and only the wording needs to match what landed. Build against it.

Worth noting why this closed the cheap way: the answer came from asking the person who drew it which drawings they still trust, not from re-deriving it from markup. That question is §4 of [the designer brief](creative-studio-designer-brief.md) and it retired two items at once.

## 4. A decision to make before briefing this

**Do not assume the prototype wins here.** Since it was drawn, Produce gained things the prototype never had: auto-selection of an unambiguous route (verified — opening a project with no image route configured selected `gemini-3-pro-image` automatically and bumped the revision), a `ConnectEngineCard` for the unconfigured state, and honest per-route capability text (`up to 15s`, `up to 60s`).

An inline three-role cycler may now be redundant, or may actively conflict with auto-selection — cycling a role the app just chose for you is a confusing affordance. The genuine question is whether the *collapsible, inspectable* framing is worth adopting while keeping our current behaviour, rather than whether to reproduce the prototype's control.

That is a product call and should be settled before any agent is briefed, or the agent will simply reproduce the drawing.

## 5. What a pass-3 brief would need

**Items 1 and 2 are now closed** — see §3 and [the designer brief](creative-studio-designer-brief.md) §8. What remains blocking is not fidelity work: three drawn states depend on data the model cannot express (`EPIC-005-G1/G2/G3` in `TASKS.md`), and the per-shot treatment needs a reason vocabulary covering all nine causes of a missing generate button, not the single one the drawing addresses.

1. ~~The §4 decision.~~ **Made** — collapsible framing, no inline cycling; the designer's nine states specify it.
2. ~~A measured spec for activity rows (§3).~~ **Not needed** — rated TRUST.
3. The usual traps: Arco's `.arco-btn-text:not(.arco-btn-disabled)` beats a bare CSS-module class on background and colour, and no jsdom test can catch it; semantic tokens only; 12 locales for any new string; `i18n-keys.d.ts` is gitignored — regenerate, never stage.

## 6. Not in pass 3

Poster frames and cost copy (both shipped), the cut editor UI, and anything gated on the video-capability spike.
