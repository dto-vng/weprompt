# Designer Brief — Creative Studio: models panel, prototype drift, divergence UX

**Date:** 2026-08-06 · **Author:** engineering
**Prototype referenced:** `Creative Studio - Prototype with project list.html`
**Related:** [fidelity pass 3 prep](creative-studio-fidelity-pass3-prep.md), [cut model design](creative-studio-cut-model-design.md)

---

## 0. What we need from you

Three asks, in descending urgency. They are independent — take them in any order, or decline any one.

| # | Ask | Size | Blocking |
| --- | --- | --- | --- |
| **A** | One interaction decision on the Produce **Project models** panel (§3) | Small — one state to resolve | Blocks UI fidelity pass 3 |
| **B** | Confirm which prototype screens are still current (§4) | Small — a checklist reply | Blocks nothing, prevents waste |
| **C** | **Divergence UX** for the cut editor (§5) | Real design work — new surface | Blocks cut-editor implementation |

We are **not** asking for a redraw of Produce. The framing is settled (§3.1); one state inside it is not.

---

## 1. TL;DR

Produce has moved on since the prototype was drawn. It gained automatic route selection, an unconfigured "connect an engine" state, and honest per-model capability limits — none of which existed in the drawing. We want to adopt the prototype's **collapsible, inspectable "Project models" panel**, but *not* its inline model-cycling control, because cycling a model the app just chose for you is a confusing affordance.

That leaves exactly one state undesigned, and it turns out to be a real bug rather than a cosmetic gap: **partial readiness** — some model roles configured, others not. Today that renders a surface where certain shots silently have no action at all.

---

## 2. Context: what changed since the prototype

Three capabilities landed after the prototype was drawn.

**Automatic route selection.** Opening a project with no image model configured now selects one automatically, if the choice is unambiguous. Verified live: it selected `gemini-3-pro-image` on its own. The user did not pick it.

**An unconfigured state.** `ConnectEngineCard` — a full-surface takeover offering *Open Model Settings* and *Ask a teammate* (which copies a message to the clipboard). The prototype had no such state; it assumed models were always configured.

**Per-model capability limits.** The engine bar states real constraints — `up to 15s`, `up to 60s` — read from the model catalog. The prototype's buttons showed a model name only.

### What Produce looks like today

A single static strip above the shot grid:

> `RENDERING WITH` — `bytedance/seedance-2.0-fast · Video · up to 15s` · `google/gemini-3-pro-image · Image · up to 60s`   **[Change engines]**

Read-only, always expanded, one line, with a text button into Model Settings.

### What the prototype has instead

A **collapsible panel**, collapsed by default:

- Header is a button with `aria-expanded`: a `PROJECT MODELS` mono eyebrow, a truncating summary line, and a chevron.
- A sibling **`Open Model Settings`** action in rust.
- Expanded: a **three-column grid, one column per model role**, each with a role label above a button carrying a status dot, the current value, and a `▾` — cycling that role **inline**.

Measured type/colour specs are in the [pass 3 prep doc](creative-studio-fidelity-pass3-prep.md) §2 — please don't re-derive them.

---

## 3. Ask A — the Project models panel

### 3.1 Already decided — please don't redesign these

- **Adopt the collapsible framing.** Collapsed by default, expandable to a per-role view. Better than a permanent one-line strip.
- **Drop the inline cycling.** Model Settings stays the single place selection changes. Two controls that can disagree about who owns the choice is worse than one extra click.
- **Keep `Open Model Settings`** as the panel's action.

### 3.2 The question we need you to answer

**How should the panel and the unconfigured state coexist?**

Today they are mutually exclusive, and crudely so. `ConnectEngineCard` replaces the *entire* Produce surface — but only when **no** role is ready. There is no design for partial readiness, and the current behaviour is bad:

> **Measured, not theorised:** with the image model ready and the video model not, the shot grid renders normally, the engine bar names only the image model, and every **video** shot loses its generate button entirely — it is conditionally rendered, so it does not appear at all. No disabled state, no tooltip, no explanation. The shot simply has no action and nothing says why.
>
> Confirmed 2026-08-06 against the real renderer modules in a running build: an image shot in the same project kept its button, and flipping only the video role's status back to ready restored it — so role status is the sole cause. Recorded as **BUG-024**; it is a defect on its own and does not wait on this brief.

The per-role panel is the natural place to fix this, because it already shows one row per role. Three candidate shapes, for you to pick between or replace:

1. **Panel absorbs it.** No more full-surface takeover. A not-ready role shows its state in its own row with a repair action; when *no* role is ready the panel auto-expands and the shot grid shows an empty state.
2. **Panel above, card below.** Keep `ConnectEngineCard` for the zero-ready case; the panel handles partial readiness on its own.
3. **Panel plus per-shot messaging.** Panel reports role state; the affected shot cards carry their own "video model not configured" treatment where the button is today.

Our weak preference is **(1)** — one place that answers "what will render this, and can it?" — but this is your call, and the per-shot half of (3) may be needed regardless, since a user looking at a shot with no button will look at the *shot* first.

### 3.3 Constraints that shape the answer

- **Availability is four states, not two:** `ready`, `selection_required`, `setup_required`, `unavailable`. The status dot needs to express these, and `selection_required` ("several options, none chosen") differs meaningfully from `setup_required` ("no credentials"). Today all four collapse to a binary.
- **There are three roles, not two.** The catalog carries `storyboard` (a text model) alongside `image` and `video`; the current engine bar shows only the two media roles. Whether a text model belongs in a panel about *render engines* is an open question — we lean toward excluding it, but the data is there if you want it.
- **Capability text is real content.** `up to 15s` is a genuine limit that changes what a user can ask for. It should survive into the role rows; the prototype's value-only buttons had nowhere to put it.
- **Auto-selection is invisible today.** A user may never learn the app picked their model. Whether the panel should say so is worth a thought — we have not decided this either way.

### 3.4 Deliverable

Annotated states for the panel — collapsed and expanded, across all-ready / partial / none-ready — plus whatever per-shot treatment (3) implies if you go that way. Existing tokens and type scale; no new colours needed unless the four status states demand them.

---

## 4. Ask B — the prototype has drifted

This matters beyond Produce.

We deviated from the drawing here because the product moved. That drift almost certainly is not confined to one screen, and we do not want to discover it one screen at a time. **Review in particular we have never measured against the prototype at all** — and it is the screen most affected by recent work, since it now has to accommodate the cut editor (§5).

**The ask:** tell us which prototype screens you still consider current, which you know are stale, and which you would want to revisit before we build against them. A checklist reply is fine — we are not asking for redrawn screens, just a reliability map so we know which drawings to trust.

---

## 5. Ask C — divergence UX (cut editor)

This is genuine new design work, and it is the one open question left in an otherwise-settled model. It is recorded as open question #2 in the [cut model design](creative-studio-cut-model-design.md) §11.

### 5.1 The model, briefly

The **storyboard** is authoritative for structure — shots, their intent, their intended durations. The **cut** is a *projection* of it: initialised one-to-one from the storyboard's shot order and each shot's selected take, then independently editable (reorder, trim, crop, colour filters).

Because the cut is editable, it can **diverge** from the storyboard. The design requires that divergence be **a visible state, not an invisible one** — and it deliberately does not say what that looks like.

### 5.2 The specific rules that need a UI

- A cut carries **`orderMode: 'storyboard' | 'manual'`**. It flips to `manual` the first time the user reorders the cut directly, and **only the user can return it to `storyboard`**. Structural equality is not enough to infer intent: a hand-ordered cut that happens to match the storyboard is not the same as one that follows it.
- **While in `storyboard` mode**, reordering shots in the storyboard reorders the cut.
- **While in `manual` mode**, storyboard reordering does *not* touch the cut.
- **A shot that gains its first take after the cut went manual is appended to the end**, not inserted at its storyboard position — chosen so we never overwrite a hand-ordering to satisfy a storyboard the user has already departed from. This is defensible but will surprise people, and it is the moment where divergence most needs to be legible.
- A shot with no selected take produces **no clip** — it exists in the storyboard, is absent from the cut, and appears in Review's slate treatment.
- Deleting a shot removes its clips.

### 5.3 The questions

1. **How is divergence shown?** A persistent state on the cut, a per-clip marker, or something that only appears at the moment it happens?
2. **Can a user re-sync?** The model permits returning to `storyboard` mode, but that discards the hand-ordering. If we offer it, it needs to be clearly destructive — and possibly previewable.
3. **How does an appended shot announce itself?** It arrives at the end, away from where the user is looking, potentially long after they last touched the cut.
4. **Is divergence a warning or a neutral fact?** Our position: **neutral**. A user hand-ordering a cut is doing their job, not making a mistake — consistent with a decision already taken on this branch that timing is advisory and never blocks. Please do not design it as an error state unless you disagree and can say why.

### 5.4 Deliverable

Whatever expresses states 1–4 on the Review surface. Note that Review does not currently have a cut editor at all, so this may imply structure, not just a badge — which is part of why §4 matters.

---

## 6. Constraints for anything you hand back

These are hard, and they apply to all three asks.

- **Semantic tokens only.** Colours come from `uno.config.ts` or CSS variables. No hardcoded hex in implementation — if a state needs a colour we do not have, call it out explicitly so we can add a token rather than inline a value.
- **Arco Design components.** No raw interactive HTML. This constrains some interactions more than a drawing implies — Arco's text buttons in particular fight custom backgrounds, and one such override has already cost us a defect.
- **Twelve locales.** Every new string is translated twelve ways. Text that only works at English length is a problem; German and Ukrainian run long. Truncation behaviour needs to be specified, not assumed.
- **Keyboard and screen-reader parity.** The prototype's panel header is already a real button with `aria-expanded` — keep that. Status conveyed by a coloured dot alone is not sufficient; it needs an accessible text equivalent.
- **Both themes.** Light and dark.

---

## 7. What is explicitly not in scope

- Poster frames and generation-cost copy — both shipped; the old fidelity list is stale on these.
- Model Settings itself — unchanged, and it remains the only place selection changes.
- The render pipeline, transitions, audio editing, text overlays — all non-goals for this version.

---

## Assumptions in this brief

Stated so you can correct them rather than inherit them:

1. That the collapsible framing is worth adopting **without** the inline cycling. If you think the cycler was load-bearing to the panel's value, say so — the decision was made on engineering reasoning about ownership of model choice, not on a design argument.
2. That partial readiness is a design problem rather than purely an engineering fix. We could make the generate button appear-but-disabled with a tooltip and ship nothing new. We think that is the worse answer, but it is available.
3. That excluding the storyboard text model from a render-engine panel is right. Weakly held.
4. That divergence should read as neutral rather than as a warning. Held more firmly, for consistency with the advisory-timing decision — but it is a product position, not a fact.
