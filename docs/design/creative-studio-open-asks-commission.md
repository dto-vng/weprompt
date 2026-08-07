# Commission — four open asks after the Review build

**Date:** 2026-08-07 · **For:** the Creative Studio designer
**Why now:** Review §3a–§3c are built and merged; §3d is the last slice. These four are what remains that only you can answer.
**Related:** [review screen commission](creative-studio-review-screen-commission.md) · [designer brief](creative-studio-designer-brief.md) · [cut model design](creative-studio-cut-model-design.md) · [v1.1 cut editor plan](creative-studio-v11-cut-editor-plan.md)

Four asks, in the order we would take them. They are independent — answer in any order, or decline any one. Two are small, one is copy, one is a drawing.

| #     | Ask                                                      | Size                 | Blocking                            |
| ----- | -------------------------------------------------------- | -------------------- | ----------------------------------- |
| **A** | Does a slate say _why_ it is a slate?                    | Small — one decision | Nothing, but §3d closes Review      |
| **B** | The reason vocabulary — eight causes still have no words | Copy — eight lines   | **BUG-024**, P2 and otherwise ready |
| **C** | **Model Settings** has never been drawn                  | Real drawing         | Two repair paths depend on it       |
| **D** | What does _unknown_ model provenance say?                | Copy — one line      | `EPIC-005-G1`, P3                   |

---

## Ask A — does a slate say why it is a slate?

You drew the slate as one thing: a shot with no selected take, hatched, dashed, occupying its intended duration. The cut model records it that way too — _"a scene with no selected take renders as a hatched `SLATE`."_ One state, one treatment.

The screen it replaced was more talkative. The old Review rail labelled four states, deriving them from readiness: a selected take, a shot still generating, a shot that failed, and a shot never started. When the cut editor landed, that distinction disappeared and all three takeless cases became the same plate. We caught it in review and restored the distinction, deliberately as **parity with what existed** rather than as a new design, so the decision would stay yours.

So the built behaviour currently carries more information than your drawing describes, and we would rather you settle it than let an accident stand:

- **If one slate is right**, we will collapse it back and the screen matches your spec exactly.
- **If the distinction is right**, tell us how it should read. The argument for it is that the three cases have three different next actions — wait, retry, generate — and a user looking at an undifferentiated plate cannot tell which applies.

Whatever you choose, the state must be legible without colour; that is how it is built today, via assistive-technology text rather than a colour cue alone.

## Ask B — eight of the nine reasons still have no words

This is the one most likely to unblock engineering immediately.

You settled the **shape** on 2026-08-06, and we are not reopening it: partial readiness shows a disabled control carrying its reason **and** the models panel stating the same fact once for the project — your state 7, both surfaces, not a choice between them.

What is missing is the copy. A shot's generate action can be absent for **nine** distinct reasons; the drawing addresses one. The other eight need words in the user's vocabulary, and we do not want to invent them — the whole point of the disabled-control-with-a-reason is that the reason is true and specific.

One caveat in the interest of not wasting your time: **the nine are a count, not yet a written list.** The number came from reading the code paths that can suppress the action; nobody has enumerated them with their triggering conditions. Ask for them and we will derive that list from the code and send it — a day's work at most, and it is ours to do, not yours. There is no point drafting copy against causes nobody has written down.

## Ask C — Model Settings has never been drawn

This one is your own finding, not ours. It came out of your reliability map: Model Settings has never been drawn, and it is **load-bearing for two repair paths** — the routes a user takes when a model is missing or misconfigured. Ask B's disabled control points at it, which is what makes it structural rather than cosmetic.

It has been open since 2026-08-06. If those repair paths are still the intended destination, this needs a drawing. If you would rather re-route them somewhere already drawn, that answer works too and is cheaper for everyone.

## Ask D — what does _unknown_ provenance say?

Smallest ask, lowest priority, but it has a trap worth stating.

For the `CHOSEN FOR YOU` disclosure, the app must distinguish a model **you** picked from one **it** picked. Projects that already exist predate any provenance record, so they can only honestly read as **unknown** — never as _auto_, because that would have every current project falsely claim the app chose its models.

So: one line of copy for the unknown case. It should not imply the user chose, and it should not imply the app chose.

---

## Constraints that are still real

Unchanged from the Review commission, restated so nothing is assumed:

- **Arco components; no raw interactive HTML.** Semantic tokens only — if a state needs a colour we do not have, call it out and we will add a token rather than inline a value.
- **Twelve locales**, with truncation behaviour specified rather than assumed. Your German truncation spec for the models panel was exactly the right level of detail.
- **Keyboard parity is not optional.** Every affordance needs a non-drag, non-pointer path.
- **Both themes.**
- **No undo exists and none is planned** — your decision, and it still holds. Recovery lives in copy and in previewed dialogs, not in a control.

## What is already built — please do not redraw it

So you can spend the time where it counts:

- **§3a–§3c are merged.** Clip order with a keyboard path, trim/crop/colour with keyboard control and a visible zero tick, the divergence chip widening to order-plus-edits, the five footer states, the three typed failures each with exactly one action, and the export dialog carrying the consequence line and the render time before the folder picker.
- **The three tokens you specified** for dark theme — `--cut-slate-hatch`, `--control-handle`, `--control-zero-tick` — landed early and are defined in both themes.
- **Your §16 breakpoint numbers were discarded** in favour of the app's own 820/1120, as you asked.
- **§3d is the last slice** — compact, dark, and the 322px drawer. It is specified and needs nothing further from you.

## What we are NOT asking for

- A Review redraw. §3a–§3d stand; Ask A is one state inside it, not a reopening.
- Anything on Produce beyond Ask B's copy. The panel shape is settled.
- Brief-as-conversation, alternate cuts, transitions, audio mixing, text overlays, or NLE export — all out of scope and unchanged.
