# Commission — draw the Review screen

**Date:** 2026-08-06 · **For:** the Creative Studio designer
**Why now:** this is the only remaining blocker on the critical path that cannot be parallelised.
**Related:** [designer brief](creative-studio-designer-brief.md) · [cut model design](creative-studio-cut-model-design.md) · [v1 delivery plan](creative-studio-v1-delivery-plan.md)

## The ask

Draw **Review**, properly and in full. You rated it **STALE by omission** in your own reliability map — *"drawn as a player plus a read-only strip, before the cut existed as an editable projection… the rest of the surface — trim, crop, filters, per-clip selection — is undrawn and I would want to draw it before you build."* We agree, and we are not building it until you have.

Everything else in the remaining Creative Studio plan can proceed in parallel. This cannot, and it gates the largest single piece of unbuilt work.

## What changed under it since you last drew it

Review is no longer a passive screen. As of today it carries a **working render**:

- A **Render video** action, currently in the handoff aside — deliberately provisional placement, put there so as not to restructure the stage before you draw it.
- Live progress with a percentage, and a cancel affordance.
- A distinct message for each typed failure, including FFmpeg being absent.
- The finished video playing inline from the managed store.

That is live and verified: a real brief produced a real 10-second `.mp4`, correct scene order, audio in sync. **Please treat the current placement as a placeholder you are free to discard**, not as a constraint.

## What the screen has to hold

Beyond the player and the takes rail you already drew:

1. **The cut strip as an editor.** Clip order with drag *and* a keyboard path, per-clip selection, and the slate treatment for a shot with no take (hatched, dashed, occupying its intended duration — your cut state 1).
2. **Per-clip editing: trim, crop, and the four colour filters.** Exposure, contrast, saturation, temperature — each `−1…1`, default 0. This is the undrawn half. Trim in particular needs a real interaction model; the underlying seam supports frame-accurate seeking.
3. **The divergence states you already specified** — the order chip (`Follows the storyboard` → `Yours · edited by hand`), the one-time flip explanation with its revised line (*"Change above puts it back"*), and the previewed re-sync dialog quoting a clip count.
4. **The "Not in the cut yet" group** from your §2a — derived, manual-mode only, with `Place it…`, `Add to the end`, `Add all to the end`.
5. **The render affordance**, wherever you decide it belongs.
6. **The export line** — *"3 shots are not in the cut"* — non-blocking, at the moment of consequence.

## Constraints that are real

- **Arco components; no raw interactive HTML.** Semantic tokens only — if a state needs a colour we do not have, call it out so we add a token rather than inline a value.
- **Twelve locales.** Nothing time-dependent if avoidable; you already made that point and it was the right one. Truncation behaviour specified, not assumed.
- **Keyboard parity is not optional.** Clip reordering and `Place it…` both need non-drag paths — you specified this for the group and we want it for the strip too.
- **Both themes.**
- **No undo exists and none is planned** — your decision, and it holds here: recovery lives in copy and in the previewed dialog, not in a control.

## What we are NOT asking for

- The Project models panel (your §1a) — specified, unbuilt, and independent of this.
- Brief or Write.
- Anything about pricing. No amount is displayed anywhere and none is planned until a trustworthy estimate exists.

## The build

A walkthrough build accompanies this so you can measure the current Review against your drawing rather than against the code — see the walkthrough note. It is compiled with the release gate open specifically for you; please don't circulate it.

If the walkthrough changes what you would draw, the walkthrough wins. Seeing it running is the point.
