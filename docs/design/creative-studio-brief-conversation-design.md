# Creative Studio — Brief as a conversation

**Status:** rev 2 — revised after execution review · **Date:** 2026-08-05 · **Branch family:** `creative-suite`
**Depends on:** nothing in the video-capability spike · **Blocks:** the Write assistant

> **Rev 2** incorporates a verification review that found four P0 defects and corrected five factual claims. Superseded claims are stated rather than deleted, so nobody acts on a remembered version of rev 1. Corrections are marked **[rev 2]**.
>
> **The headline correction:** rev 1 asserted the assistant "may never cause a paid call" and prescribed a job-manager assertion to prove it. Both were wrong — see §4.1. A rule stated confidently alongside a test that cannot detect its violation is the most dangerous thing rev 1 contained.

## 1. Today, and the gap

Brief is a form: project name, a one-sentence intent, target duration, aspect ratio. No conversation, no model.

Script generation happens once, later, from Write: `planning/storyboardPlanner.ts` sends a single strict-JSON request — _"Return exactly one JSON object, without Markdown fences or commentary"_ — and the result populates the shot table.

The goal is for Brief to be where a user lands, talks to an assistant, and builds a script section by section, with the assistant able to read attached material and reference images rather than only writing from one sentence.

**Confirmed:** multi-turn is free at the transport level. `StudioStoryboardClient.createChatCompletion` accepts an arbitrary `messages[]`; `response_format` is pinned to `json_object` at `storyboardPlanner.ts:263`; there is no streaming variant. Those two gaps are real and are what a conversation must close.

## 2. Shape

**A Brief conversation is an ordinary app conversation bound to a Studio project, with a Studio MCP server attached.** The assistant replies in prose and affects the script by **calling tools**, which removes the prose-versus-JSON tension and brings streaming, the work journal, context-budget accounting and the knowledge base.

### 2.1 [rev 2] The binding does not exist yet — define it first

Rev 1 said "bound to a Studio project" throughout and never established that such a binding was possible. **It is not.** Conversations carry `extra.project_id`, but that identifies an ordinary `ForgeProject` and resolution searches the Forge project registry (`projectConversation.ts:13`). Studio has an optional `forgeProjectId` (`creativeStudioTypes.ts:170`) — not a conversation id — and the Studio composer never populates it (`Composer.tsx:41`). There is no `studio_project_id` conversation field and no `briefConversationId` Studio field.

This is **P0 and a prerequisite**, not an implementation detail:

- Add an immutable `extra.studio_project_id` on the conversation, plus a Studio-side authoritative lookup (`briefConversationId` or equivalent).
- Use ordinary `project_id` only where the Studio project is genuinely linked through `forgeProjectId`.
- Specify creation, deletion, recreation and stale-reference behaviour explicitly. A deleted Studio project must not leave a conversation pointing at nothing, and a deleted conversation must not leave the project unable to open Brief.

### 2.2 [rev 2] The server is a session descriptor, not a globally seeded builtin

Rev 1 said Studio would be "a fifth builtin MCP server … seeded through `initStorage.ts`". Wrong on the mechanism: `initStorage.ts:381` explicitly _skips_ MCP config initialisation. ImageGen, IDP and Vision are seeded through backend migrations (`runBackendMigrations.ts:356`), while **knowledge is constructed as a per-conversation session server** (`projectKnowledgeService.ts:921`).

Model Studio after **knowledge**, not after the globally seeded three: a session-only descriptor created during conversation creation. It also needs an explicit entry in the MCP bundle allow-list (`scripts/build-mcp-servers.js:28`) and packaged/unpacked entries — bundling is an allow-list, not automatic.

Scoping copies knowledge exactly: `KB_ENV` defines project/store/embedding keys (`envKeys.ts:11`), the service populates them (`projectKnowledgeService.ts:921`), the subprocess parses them (`knowledgeServer.ts:26`). Studio adds `STUDIO_ENV.*`.

## 3. The writer problem

**[rev 2] The read-only claim was wrong.** Rev 1 said all four existing builtin servers are strictly read-only with zero writes. **imageGen writes** — its tool calls `executeImageGeneration` in `imageGenCore`, which persists generated files. Rev 1 measured the _server files_ with a grep instead of following the call graph, which is why it missed this.

The narrower claim that is actually true, and which still motivates the design: **no builtin MCP server mutates a CAS/revision-guarded project store.** That is the invariant worth protecting, because the Studio store is written by the main process on the renderer's behalf and two writers with no shared lock is a read-modify-write race — atomic temp-file-plus-rename gives atomicity, not mutual exclusion.

**Decision, unchanged: tools propose; the user accepts; the main process is the only writer of project state.**

**[rev 2] `StoryboardDraftModal` is not the precedent rev 1 claimed.** Rev 1 cited it twice as "exactly propose-then-accept". It is **confirm-then-generate-and-commit**: its confirmation calls `proposeStoryboard` immediately (`StoryboardDraftModal.tsx:91`) and the service CAS-writes the generated scenes straight into the project (`creativeStudioService.ts:891`). No generated draft is ever held for later acceptance. The modal is a useful pattern for _preflight confirmation and styling_; durable proposal cards and post-generation acceptance are **new behaviour** with no existing precedent in this codebase. Plan accordingly.

### 3.1 [rev 2] Proposal storage is feasible; observation is entirely new plumbing

The invariant: **no tool writes the project.** Tools write **proposal records** in a separate namespace that only the main-process accept path can promote. An MCP tool's return value flows to the _model_, not the renderer, so a proposal existing only as tool output is invisible to the app and must be durably recorded to be presentable.

A subprocess can mechanically write files — imageGen already does — but the surrounding lifecycle does not exist. The store exposes only projects and connections (`store.ts:180`), and the renderer observes only `projectUpdated` (`useStudioProject.ts:113`), emitted by main-process mutations (`runtime.ts:273`). **A proposal written by the subprocess emits nothing.** Required:

- An append-only inbox at `<studio-root>/<projectId>/proposals/pending/`. **Not** a root-level directory that project enumeration could mistake for a project.
- `STUDIO_ENV` passes only the verified project/proposal directory. The tool creates one validated, bounded record atomically and never rewrites it.
- New main-process IPC: `listProposals`, `acceptProposal`, `rejectProposal`.
- A main-process watcher that validates new records and emits `creativeStudio.proposalUpdated`; the ledger is queried on mount and after restart.
- `conversation.turnCompleted` (`ipcBridge.ts:367`) may trigger an extra refetch, but it is not sufficient alone — it misses a proposal recorded during a turn that later crashes.

Each proposal carries the **project revision it was computed against**. Accepting one whose `baseRevision` no longer matches **fails closed** and offers re-proposal. This is directly expressible: `updateProject` compares `expectedRevision` inside its serialised main-process mutation before writing (`store.ts:1028`), so accept passes `proposal.baseRevision` unchanged. A crash between the project write and the proposal-status update leaves a stale pending record, and retry then fails closed because the revision has advanced — acceptable, but the stale record must be reapable.

Silently rebasing a stale proposal onto newer content is the one forbidden behaviour: it would overwrite edits made while the assistant was drafting.

Two further consequences:

- Proposal writes need their own guarded, append-only path with its own validation.
- **The model must not be told a proposal was accepted.** It learns only that one was recorded. Whether the user accepted is a later turn's context, or the model will assert changes that never landed.

## 4. Tool surface

Read tools may act directly. Write tools only ever produce proposals.

**Read:** current script, project settings, which shots have rendered takes.
**Propose:** a whole script; a revision to a named set of shots; a re-pacing; a visual prompt for a shot.

Every proposal is a complete replacement for the region it names, never a diff — the store is CAS-guarded on whole-object revisions.

### 4.1 [rev 2] P0: the assistant CAN currently reach a paid call

Rev 1 stated that generating media is not a Studio tool and concluded the assistant therefore cannot cause a paid call. **That conclusion was false**, because the conversation does not only contain Studio's tools.

`useGuidSend.ts:160` force-attaches the enabled image-generation builtin to ordinary conversations — its own comment says _"Always attach the enabled hidden servers so the agent can invoke them without the user selecting them per conversation"_ — and this behaviour is explicitly tested (`useGuidSend.dom.test.ts:286`). That tool invokes `executeImageGeneration` (`imageGenServer.ts:101`), which reaches the Images API (`imageGenCore.ts:304`) and persists output (`imageGenCore.ts:127`), **bypassing Studio's `GenerationReviewModal` and job manager entirely.**

So omitting generation tools from the Studio server is **insufficient**, and rev 1's prescribed verification — assert against the Studio job manager — **would have passed while the hole was open.**

Required:

- Create Brief conversations with a **curated MCP snapshot** that excludes `builtin-image-gen` and any unreviewed MCP capable of paid generation. The snapshot is frozen at creation (§5), so this must be right at creation time.
- Assert on the **persisted MCP snapshot**, and instrument the **image-generation client** as well as the Studio job manager. A job-manager-only assertion is insufficient by construction.

#### [rev 3] The auto-attach surface is six servers, not one — so the rule must be an allow-list

Measured against the branch on 2026-08-06. Rev 2 named a single server to exclude; the code attaches six without user selection, by **two independent mechanisms**:

| Mechanism                                                   | Servers                                                                           | Notes                                                                                                              |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `hiddenAutoAttachServers` (`useGuidSend.ts:165-172`)        | `builtin-image-gen`, `builtin-idp` (GreenNode), `builtin-vision` (image analysis) | Force-attached whenever enabled, appended to both `assistantOverrideMcpIds` and the session server list if missing |
| `mergeCommodityMcpServerIds` (`builtinCapabilities.ts:228`) | `builtin-chrome-devtools`, `builtin-memory`, `builtin-tavily`                     | Auto-attached on the default (no explicit user selection) path                                                     |

At least two beyond image-gen reach keyed, metered APIs. **A deny-list naming `builtin-image-gen` would leave five other servers attached**, and rev 2's prescribed verification would have passed while that hole was open — the same failure mode rev 2 itself identified in rev 1.

**Decided 2026-08-06: the curated snapshot is an allow-list.** A Brief conversation's snapshot contains exactly the explicitly listed servers and nothing else; the auto-attach paths are never consulted rather than filtered after the fact. The surface has already drifted from one server to six between revisions, and an allow-list is the only form that does not need editing each time a builtin is added. It fails toward less capability; a deny-list fails toward an unreviewed paid call.

**v1 allow-list membership: the Studio proposal server only.** No web search, no memory, no knowledge search. Confirmed with the product owner 2026-08-06. Note the consequence, which follows from §5: because the snapshot is frozen at creation, Brief conversations created under this membership can **never** gain a capability added later — widening the list only affects new conversations.

**Assertion targets** are the four creation-frozen fields on the conversation record (`storage.ts:484-490`): `mcp_server_ids`, `mcp_servers`, `mcp_statuses`, `session_mcp_servers`. Assert the exact allow-list on each, and assert each of the six auto-attached ids is **absent** — an equality assertion alone can pass vacuously if the snapshot is empty for an unrelated reason.

The rule stands — an assistant may propose what to generate and never cause a paid call — but it now has a mechanism behind it instead of an assumption.

## 5. Conversation lifecycle

**The MCP set is immutable after conversation creation**, enforced by aioncore: `TASKS.md` BUG-001 records `PATCH /api/conversations/<id>` returning `400 BAD_REQUEST` — _"extra.skills and MCP snapshots are immutable post-creation"_ — and the types label MCP ids, names and session descriptors as creation snapshots (`storage.ts:479`). The observed response supports this lifecycle conclusion, though strictly it does not prove the absence of every hypothetical endpoint.

Consequences:

- A Brief conversation must be **created with** the Studio server attached, the project env bound, and the curated snapshot applied (§4.1). None can be retrofitted.
- A conversation created before the Studio tools existed can never gain them.
- **[rev 2] The KB stale-chat hint is a pattern, not a drop-in.** Its predicate detects a project conversation with indexed knowledge but no knowledge server (`useKbStaleChatHint.ts:63`) and its UI offers a fresh project chat (`KbStaleChatHint.tsx:60`) — but the predicate, data fetch, dismissal key and route are all KB-specific. Reusing it means generalising it, which is work rev 1 did not account for.
- Creation timing remains open (§9).

## 6. What Brief keeps from the form

The conversation replaces the _intent sentence_, not the whole form. Aspect ratio and target duration stay explicit controls — constraints the user sets rather than things to negotiate in prose, and `aspectLocked` behaviour depends on them. The assistant reads them and may propose a different duration; it does not silently change them.

## 7. Relationship to the existing planner

`storyboardPlanner.ts` is not deleted. Its strict-JSON one-shot path remains the route for users who do not want a conversation, and the fallback when no tool-capable model is configured. The conversational path is additive.

**[rev 2]** Note that this retained path carries a live draft-loss bug — see the Write design §3.1 — so "retained unchanged" is not acceptable; it must route through the same acceptance coordinator.

## 8. Verification

- **Persisted MCP snapshot** excludes `builtin-image-gen` and every unreviewed paid-generation capability. Assert on the stored snapshot, not on intent.
- **No paid call reachable** — instrument the image-generation client _and_ the Studio job manager. A job-manager-only assertion is explicitly insufficient (§4.1).
- **Project↔conversation binding**: creation, deletion, recreation and stale references all behave as specified (§2.1).
- **Tool contract:** each write tool records a proposal and performs no project write. Assert by giving the subprocess a store directory and proving project state is unchanged.
- **Proposal observation:** a proposal written by the subprocess becomes visible to the renderer without a manual refresh, and survives a restart.
- **Stale proposal fails closed** and offers re-proposal; the project is unchanged afterwards.
- **Model is not told acceptance happened.**
- **Freeze behaviour:** a conversation lacking the Studio server surfaces the generalised stale-conversation path.
- **i18n** across 12 locales; ru/uk plural forms where counts appear.

Assertion strength matters specifically here: a mock-heavy suite around a proposal flow can pass while writing nothing and proposing nothing. Prefer observable store state, the persisted MCP snapshot, and the image-generation client boundary over spy expectations.

## 9. Open questions

1. **Conversation creation timing** — eager at project creation, or lazy on first Brief entry.
2. **Section granularity.** "Section by section" needs a definition: a shot, or a narrative beat spanning shots? The model has only shots today, so beats are a data-model change and must be decided before implementation.
3. Whether an accepted proposal is undoable beyond revision history.
4. Which model serves Brief by default, and behaviour when the configured model cannot use tools at all.
5. **[rev 2]** Who reaps abandoned pending proposals, and on what schedule.

## 10. Non-goals

- The Write assistant (its own spec; it consumes this)
- The Review editor and the cut model
- Any video capability
- Generating media from a conversational turn (§4.1)
- Replacing the one-shot planner (§7)

## 11. Accepted cost

Binding Brief to the app's conversation stack couples Creative Studio to aioncore conversations. Studio currently touches no conversation storage and adds no migrations, and that independence is what made it safe to develop in parallel. On a long-lived `creative-suite` branch, every mainline change to conversation creation, MCP snapshotting or the message pipeline becomes a potential merge conflict.

**[rev 2]** The review makes this cost larger than rev 1 assumed: the curated MCP snapshot (§4.1) means Studio now depends on the _details_ of how conversations assemble their tool set — `useGuidSend`'s force-attach behaviour in particular. A mainline change there could silently reopen the paid-call hole. That dependency needs a test that fails loudly on the mainline side, not only in Studio's own suite.
