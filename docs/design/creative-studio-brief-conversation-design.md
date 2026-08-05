# Creative Studio — Brief as a conversation

**Status:** proposed design · **Date:** 2026-08-05 · **Branch family:** `creative-suite`
**Depends on:** nothing in the video-capability spike · **Blocks:** the Write assistant

## 1. Today, and the gap

Brief is a form: project name, a one-sentence intent, target duration, aspect ratio. No conversation, no model. That was a deliberate "keep it simple, improve later" decision.

Script generation happens once, later, from Write: `planning/storyboardPlanner.ts` sends a single strict-JSON request — *"Return exactly one JSON object, without Markdown fences or commentary"* — and the result populates the shot table. `StoryboardDraftModal` shows the draft for acceptance.

The goal is for Brief to be where a user lands, talks to an assistant, and builds a script section by section, with the assistant able to read attached material and reference images rather than only writing from one sentence.

Two properties of the current seam matter:

- **Multi-turn is already free at the transport level.** `StudioStoryboardClient.createChatCompletion` takes `{ model, messages: StudioStoryboardMessage[], max_tokens, temperature, response_format }` with `{ signal, timeout }`. It accepts an arbitrary message array; Studio simply never sends more than a synthesised one-shot pair.
- **Two things are genuinely missing:** `response_format` is pinned to `json_object`, which fights against prose replies; and there is no streaming, so a reply arrives as one silent lump.

## 2. Shape

**A Brief conversation is an ordinary app conversation bound to a Studio project, with a fifth builtin MCP server attached.**

The assistant replies in prose and affects the script by **calling tools**. This removes the prose-versus-JSON tension entirely: no `json_object` mode, no parsing structure out of chat text, and no bespoke chat stack.

Reusing the app's conversation machinery brings streaming, the work journal, context-budget accounting, model selection, and — because it is a real conversation — the project knowledge base and other MCP tools alongside the Studio ones.

### 2.1 The builtin server

`builtin-mcp-studio` joins the four that already exist (`imageGen`, `idp`, `vision`, `knowledge`): a stdio subprocess with an id, a name, transport-detection helpers in `builtinMcp/constants.ts`, and seeding through `initStorage.ts`.

Scoping copies `knowledgeServer` exactly. `projectKnowledgeService` builds a per-conversation env — `KB_ENV.projectId`, `storeDir`, embedding config — and the subprocess resolves it through `parseKnowledgeServerEnv`. Studio introduces `STUDIO_ENV.*` with the project id and store directory and resolves it the same way.

## 3. The writer problem, and the decision

**All four existing builtin MCP servers are strictly read-only against app state** — measured: `knowledgeServer` performs 2 reads and 0 writes; imageGen, vision and idp perform 0 writes each. Studio's script tools would be the first builtin server that changes app state.

That matters because the subprocess is a *separate process*, while the Studio store is CAS/revision-guarded and written by the main process on the renderer's behalf. Two writers with no shared lock is a read-modify-write race: the store's atomic temp-file-plus-rename gives atomicity, not mutual exclusion. `useStoryboardEditor` already carries conflict handling because a user can collide with themselves; a second autonomous writer makes that routine rather than exceptional.

**Decision: tools propose; the user accepts. The main process remains the only writer.**

Tools never touch the store for writing. They emit a **proposal**; the renderer presents it; accepting invokes the existing main-process mutation path, which performs the CAS write. This extends a pattern that already ships — `StoryboardDraftModal` is exactly propose-then-accept — and it keeps the single-writer invariant that the whole store design rests on.

The cost is a confirmation step during rapid refinement. Mitigations that do **not** compromise the invariant: batch a multi-shot revision into one proposal so a conversational turn yields one decision rather than many; and make accept/reject reachable from the keyboard so the loop stays fast.

The rejected alternative was a local RPC channel from the subprocess back into main. It gives direct edits and a more fluid feel, but it is genuinely new surface no existing builtin server needs, and it must be authenticated or any local process could drive the user's project.

### 3.1 Proposals are durable records, not renderer state

Follow the pattern `TASKS.md` EPIC-002 T0 already mandates for template proposals: a durable record with an opaque proposal id and a status, so ordinary React re-renders and history reloads query state instead of repeating work, and a restart does not lose an unaccepted proposal.

Each proposal additionally carries the **project revision it was computed against**. Accepting a proposal whose `baseRevision` no longer matches the project **fails closed** and offers re-proposal — the same CAS discipline the store already enforces, extended to the agent as just another actor that can be out of date. Silently rebasing a stale proposal onto newer content is the one behaviour that must not happen: it would overwrite edits the user made while the assistant was drafting.

## 4. Tool surface

Read tools may act directly. Write tools only ever produce proposals.

**Read:** current script (shots with purpose, narration, visual prompt, duration), project settings (aspect ratio, target duration), and which shots have rendered takes.

**Propose:** a whole script from the brief; a revision to a named set of shots; a re-pacing that redistributes durations toward the target; a visual prompt for a shot.

Every proposal is a complete replacement for the region it names, never a diff or patch — the store is CAS-guarded on whole-object revisions, and a patch language would need its own conflict semantics for no benefit.

Generating media is **not** a tool. Renders cost money and belong behind the existing `GenerationReviewModal` charge confirmation. An assistant may propose *what* to render; it may never cause a paid call.

## 5. Conversation lifecycle

**The MCP set is immutable after conversation creation.** This is enforced by aioncore, not WePrompt: `TASKS.md` BUG-001 records an observed `PATCH /api/conversations/<id>` returning `400 BAD_REQUEST` — *"extra.skills and MCP snapshots are immutable post-creation"*.

Consequences:

- A Brief conversation must be **created with** `builtin-mcp-studio` attached and the project env bound. The tools cannot be retrofitted.
- A conversation created before the Studio tools existed can never gain them. That is precisely the situation the shipped KB stale-chat hint addresses, and Brief should reuse its approach: detect that the bound conversation predates the tool set and offer to start a fresh Brief conversation, rather than silently degrading to an assistant that cannot see the script.
- Creation timing is therefore a real decision, recorded in §9 as open: eagerly at project creation, or lazily on first entry into Brief. Lazy avoids a conversation for every abandoned project; eager avoids a first-message delay.

## 6. What Brief keeps from the form

The conversation replaces the *intent sentence*, not the whole form. Aspect ratio and target duration remain explicit controls, because they are constraints the user sets rather than things to negotiate in prose, and `aspectLocked` behaviour already depends on them. The assistant reads them and may propose a different duration; it does not silently change them.

## 7. Relationship to the existing planner

`storyboardPlanner.ts` is not deleted. Its strict-JSON one-shot path remains the mechanism behind "draft me a script from this sentence" for users who do not want a conversation, and it is the fallback when no conversation-capable model is configured. The conversational path is additive.

Whether the two should eventually converge on one prompt corpus is deliberately out of scope here.

## 8. Verification

- **Tool contract:** each write tool returns a proposal and performs no store write. Assert by giving the subprocess a store directory and proving no file changes — a behavioural assertion, not a mock expectation.
- **Stale proposal fails closed:** accepting a proposal whose `baseRevision` has moved is rejected and offers re-proposal; assert the project is unchanged afterwards.
- **Durability:** an unaccepted proposal survives a reload and a restart; re-render does not re-propose.
- **Freeze behaviour:** a conversation lacking the Studio server surfaces the stale-conversation path rather than a broken assistant.
- **No paid calls:** no tool path can reach a generation submit. Assert against the job manager, not by inspection.
- **i18n:** all new user-facing strings across 12 locales; ru/uk plural forms where counts appear.

Test-assertion strength matters here specifically: a mock-heavy suite around a proposal flow can pass while writing nothing and proposing nothing. Prefer assertions on observable store state and on the job manager over expectations on spies.

## 9. Open questions

1. **Conversation creation timing** — eager at project creation, or lazy on first Brief entry (§5).
2. **Section granularity.** "Section by section" needs a definition: is a section a shot, or a narrative beat that may span shots? The script model today has only shots. Introducing beats is a data-model change and should be decided before implementation, not during.
3. **Whether an accepted proposal is undoable** beyond the existing revision history.
4. **Which model** serves Brief by default, and what happens when the configured model cannot use tools at all — a real case, since tool support is not universal.

## 10. Non-goals

- The Write assistant (separate spec; it consumes this script model)
- The Review editor and the edit-decision model
- Any video capability — see `docs/design/creative-studio-video-capability-spike.md`
- Generating media from a conversational turn (§4)
- Replacing the one-shot planner (§7)

## 11. Accepted cost

Binding Brief to the app's conversation stack couples Creative Studio to aioncore conversations. Studio currently touches no conversation storage and adds no migrations, and that independence is what made it safe to develop in parallel. On a long-lived `creative-suite` branch, every mainline change to conversation creation, MCP snapshotting or the message pipeline becomes a potential merge conflict.

This was chosen knowingly in exchange for streaming, tools and the knowledge base. The mitigation is to keep Studio's *own* surface additive: a new builtin server, a new env namespace, and a proposal record inside the Studio store — touching shared conversation code as little as possible, and never changing its semantics.
