# Outbound — two messages to send, 2026-08-07

Prepared for relay. Two different recipients; send separately.

---

## 1 → the designer: the sprint-4 audio commission

**Attach:** [audio lane brief](creative-studio-audio-lane-brief.md) — the scope is already agreed; §6 is the ask.

> The Review redraw is landed — §3a–§3d are built and in review as MR !73, so the cut editor, the render/failure/export states, and compact/dark are all done. Thank you; the §3d spec in particular was detailed enough to build from directly, and the reasoning you attached to each number (why the strip keeps full width, why the colour values sit on their own line) survived contact with the implementation in a way bare numbers would not have.
>
> Next lane is **audio**, targeted at sprint 4, and we are sending this now rather than at sprint-4 planning **because your redraw latency gated R3 once already**. We would rather sprint 4 is not born blocked.
>
> Scope is settled and needs no input from you: voiceover generated per scene from the `narration` field, **one imported music bed** per project, and a deliberately primitive film-wide mix — three gains and one auto-duck. Generated music is explicitly out. The brief has the full reasoning.
>
> **Four questions, §6 of the brief:**
>
> 1. **Where does audio live in Review** — a track lane under the timeline, a fifth inspector section after takes/trim/frame/colour, or both? And what a scene looks like on the strip in each state: with VO, without VO, VO stale, VO overrun.
> 2. **Overrun** — when narration runs longer than its clip, does it spill into the next clip, suggest a re-time, or offer both? One constraint from us: timing stays advisory and never truncates. That principle is settled, so an answer that silently cuts audio is out.
> 3. **The mix surface** — three gains and one duck as a compact panel. Where it sits, and the zero state before any audio exists.
> 4. **The VO generate moment** — batch from Write beside `Draft storyboard`, or from Review? And how a **stale VO** announces itself when narration is edited after generation. There is prior art worth reusing rather than inventing: the divergence chip's `Yours · edited by hand` wording.
>
> One piece of context that may shape your answer to 1 and 4: `narration` is already authored everywhere — users type it, the storyboard planner generates it, the scene assist revises it — and today it goes **nowhere**. It is `visualPrompt` before it became real. So the field already has a full authoring story; what it lacks is a consequence.

---

## 2 → khoapnt-vng: two questions, unrelated to each other

> **A. Who operates the two seeded MCP endpoints?**
>
> You added both in `f257a31c4` ("feat(mcp): seed TSE Datahub and Outlook Advanced MCP servers by default"). The _catalog entries_ are clearly ours, but who **operates** the endpoints is not determinable from outside: `aigw.vng.vn` is corporate infrastructure behind Azure AD App Proxy, and the Outlook endpoint is a public-internet Azure Container Apps deployment under an auto-generated name (`thankfulhill-292d9583`) that exposes no ownership metadata.
>
> We need this for the **support and escalation story** in the connector catalog — not for feasibility, which is already proven. Specifically: when a user's connector stops working, who do they escalate to, and is either endpoint's availability something we should be monitoring rather than discovering from a bug report?
>
> **B. What happens to `codex/creative-suite-studio-refresh`?**
>
> This one is time-sensitive and it is our doing as much as yours. Your parallel Creative Studio line (tip `c5b879c3e`, 2026-08-05) is **still 50 commits unmerged**, and as of today our line is **293 commits ahead of it**. The two touch the same core files — `ipcBridge.ts`, the native bridge manifest and payload schemas, `creativeStudioTypes.ts`, `creativeStudioBridge.ts`, `creativeStudioService.ts` — and a naive merge was measured at **98 conflicts**, including `add/add` on most of the studio service layer.
>
> With MR !73 landing the v1.1 Review redraw, that gap only grows. Three options as we see them, and the choice is yours because it is your work:
>
> 1. **Retire the branch** — if its content is superseded, say so and we will close it rather than leave a 50-commit line looking live.
> 2. **Name what must survive** — if specific commits carry work ours does not, point at them and we will port those individually, which is far cheaper than a merge.
> 3. **A real reconciliation** — possible, but it should be scoped as its own piece of work with someone owning it, not attempted incidentally.
>
> What we would like to avoid is a fourth outcome where it simply stays open and the reconciliation cost keeps compounding.
