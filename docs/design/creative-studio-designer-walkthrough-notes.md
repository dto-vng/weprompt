# Walkthrough notes — what the running app actually does

**Date:** 2026-08-06 · **For:** the designer, in place of the 30-minute pass
**Source:** first-hand, driving the running build end to end today (the v1 acceptance run). Everything below was **observed**, not read off the code. Where I did not look, I say so.

You offered a screen-by-screen pass because _"I can only compare the drawing to the brief and the code, not to the running app."_ These notes are that comparison, done for you. If they leave questions a build would answer, say so and we'll get you one.

## Landing — project library

- A single brief field: placeholder _"A one-sentence idea for the story…"_, with **Read my brief →**.
- Three starter templates, each stating shape rather than theme: **Product story · 4 shots · 15s**, **Feature teaser · 3 shots · 10s**, **Recap reel · 6 shots · 30s**.
- Existing projects as cards; each carries **Delete project**.
- Submitting the brief creates the project and lands on its Brief phase immediately — no intermediate step.

**Against your map:** you rated Project list and Brief **TRUST**. Both still hold.

## Brief

Essentially one screen with the brief text as its heading and a single **Start writing** action. Your "least exposed surface in the app" reading is accurate.

**Worth knowing:** the brief does **not** draft a storyboard. It creates the project and hands you an empty Write. Assistant-drafted storyboards are the Brief-as-conversation feature, which is not built. So today the user writes every shot by hand.

## Write — shot list

Per-row fields, in order: a duration chip (`5s`, labelled _Scene duration in seconds_), a title input (placeholders _Opening shot_, _Closing shot_), a **Narration** textarea, a _"Describe what we see…"_ textarea for the visual, and an **Output type** select (Image / Video).

Actions: **Add shot**, **Fit to goal**, **Ask assistant**.

**Against your map (REVISIT):** structure holds. Two things the drawing does not know:

- **Ask assistant opens a dock that has no assistant behind it yet.** The shell is wired; the tools are not. It is scaffolding, not a working surface — please don't measure it as one.
- Your concern about a storyboard _text_ model having its own availability failure is still live and still unaddressed. Nothing in Write reports it.

## Produce

The engine strip reads, verbatim:

> **RENDERING WITH** — `bytedance/seedance-2.0-fast · Video · up to 15s` · `google/gemini-3-pro-image · Image · up to 60s` · **Change engines**

**This is the old strip. None of your §1a Project models panel is built.** Measure it as not-yet-started, not as a deviation.

Shot cards carry **Write the visual**, a **Render** action, and a preview. The right rail is a **Generation activity** column listing jobs with provider and model, moving through _Queued by provider_ → _Completed_. Batch action reads **Generate 2 ready scenes** and, when nothing is eligible, **Generate 0 ready scenes** — which is a slightly odd thing to render, and yours to judge.

After a take exists the per-card action becomes plain **Render another** — **the `· n/a` cost fragment is gone**, confirmed live.

**Against your map (REVISIT — shot cards):** layout is current. The action column is the part your drawing predates.

## The paid-generation confirmation

Full text, captured before confirming:

> Review generation · 2 selected scenes · 5 requested video seconds · Selected duration: 10 seconds · Target duration: 18 seconds · Aspect ratio 16:9 · Resolution 720p · [per scene: title, Image/Video, seconds, Provider, Model] · **Storyboard timing does not match the project target.** · Watermark disabled · This render includes generated audio; silent routes, if present, remain silent. · **Generation uses your selected provider account and may incur provider charges.** · Cancel / Confirm and generate

Note the timing mismatch is stated and **does not block** — consistent with the advisory-timing decision. And there is **no monetary figure anywhere**, by contract.

**Against your map:** you rated the batch confirm **TRUST**. Confirmed.

## Review — the screen you're being asked to draw

Currently: a stage, a takes rail, scene selectors (_Select scene 1: …, 5 seconds_), a version selector (_Select version 1_), **Prepare handoff**, and now **Render video**.

Rendering shows **Rendering video… 38%** with **Cancel render** beside it, then plays the finished video inline. On a two-shot, ten-second cut it took about four seconds.

**Prepare handoff** opens: _"Export assets — Export the storyboard manifest and each scene's selected asset."_ with an **Include imported reference images** toggle, then a native folder picker. The exported folder contained `cut.mp4`, `scene-01-…png`, `scene-02-….mp4`, `storyboard.json`.

**Against your map:** you rated this **STALE by omission** and you were right — it has grown a whole render affordance since. The commission note covers what the redraw needs to hold.

## Two things that would change what you draw

1. **The cut is real in the data model and entirely absent from the screen.** Trims, crops, the four colour filters, clip order — all implemented, validated, and unreachable. v1 renders the _pristine_ cut (scene order + selected takes) because that needs no editor. Your redraw is what unlocks the rest.
2. **Nothing in your §1a or §2a work is built yet** — no Project models panel, no hold-outside group, no divergence chip. All specified, all sequenced after v1. Where the app disagrees with those specs, the app is simply behind.

## What I did not check

Accessibility beyond the paid-action surfaces, translation quality in any of the 12 locales, dark theme in Produce and Review, narrow-width behaviour anywhere, and the Settings model section beyond confirming it exists. If any of those matter to the redraw, they're the strongest argument for getting you a real build.
