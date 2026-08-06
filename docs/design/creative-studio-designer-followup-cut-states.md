# Follow-up to the designer — three cut/panel states, one real question

**Date:** 2026-08-06 · **Re:** `Creative Studio - Model & Divergence States.dc.html`
**Related:** [designer brief](creative-studio-designer-brief.md) §8

We implemented against your states and hit one constraint you had no way to see from the drawing. It
affects three of them. Two we can resolve ourselves and are telling you about; **one is a genuine
question we would rather you answer.**

The constraint: the cut is stored as `{ id, name, orderMode, clipOrder, clips }`, and a clip is
`{ id, sceneId, assetId, trim, crop, filters }`. There is **no per-clip state for "new" or "seen"**,
and no undo history anywhere in the Studio. Anything that has to survive a restart needs a new
persisted field, main-owned.

---

## The question — cut state 3, the appended shot

Your spec: a shot that gains its first take after the cut went manual is **appended to the end**,
marked `NEW · WAS 04`, with a counted line and `Jump to it` that persists until seen. Explicitly not
a toast, because the take may finish rendering hours after the user last looked.

**We agree with that reasoning.** A toast would be exactly wrong here. But "persists until seen" is
durable per-clip state plus a mark-seen mutation, and building it prompted a question about whether
the append itself is the right behaviour.

### The alternative: don't append — hold it outside the cut

A shot that gains its first take while the cut is manual **does not join the cut at all**. It appears
in a "not in the cut yet" group, and the user places it.

What makes this interesting is that it needs **no new stored state**. "Has a canonical take, has no
clip in the cut" is already derivable from what we store. There is no marker to persist, nothing to
mark seen, and no question about when the notice expires — the group *is* the notice, and it is still
there tomorrow, and the day after.

It also means a hand-ordered cut is never modified without the user, which sits well with the
ownership framing you chose for `Yours · edited by hand`.

### Why we are asking rather than just doing it

Three honest reasons it is not obviously better:

1. **It reverses a decision already taken on our side.** Append was chosen deliberately as the
   least-surprising default — a manual order is user intent, and inserting into the middle of it
   would overwrite that intent. "Hold it outside" is a third option nobody weighed at the time.
2. **It changes the contract.** Today the cut eventually contains every renderable shot on its own.
   Under the alternative it only contains what the user placed, so a shot can sit unplaced
   indefinitely and the exported video is short without anything being wrong.
3. **Your emphasis may already cover it.** You said the appended clip is emphatic about **location,
   not fault** — it answers "why is shot 4 last". A "not in the cut yet" group answers the same
   question differently, but we are not confident it answers it as well at a glance.

### What we need

- Which would you have drawn, knowing the `NEW · WAS 04` marker costs a new persisted field and a
  mark-seen mutation, and the alternative costs nothing?
- **If you keep the append** (entirely reasonable — the cost is real but small): should the marker
  clear on *any* cut edit, or only on explicit acknowledgement via `Jump to it`? Your spec says "when
  the user next touches the cut, or on `Jump to it`", and we want to be sure "touches" includes
  editing an unrelated clip's trim.

---

## Two we are handling — flagging so nothing changes silently

### Panel state 4 — `CHOSEN FOR YOU`: we are building it

Auto-selection currently persists through the same write a person's own choice uses, so the store
cannot tell them apart. We are adding per-role provenance so the chip can be honest. No design change
— we mention it only because the chip was unbuildable as-drawn and now will not be.

### Cut state 2 — `Undo the move`: we are dropping it, and would welcome an objection

There is no undo anywhere in the Studio, and a partial one — restoring clip order but not trims,
crops or filters — seemed worse than none, since an undo that restores *some* of your work is a trap.

So we plan to drop the `Undo the move` action and the re-sync line that leans on undo catching a
mistake "for the length of the session". Our reasoning: a mis-drag is recovered by dragging back,
immediately and obviously; and the case where undo would really matter — re-sync discarding a
hand-ordering — is already covered better by your previewed confirm dialog quoting "4 clips move".

If you think the one-time explanation at the flip needs a recovery action attached to feel safe, say
so and we will scope a bounded order-only undo instead. **This is your control we are removing, so we
would rather you push back now than discover it missing.**
