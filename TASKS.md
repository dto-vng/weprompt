# Tasks

## Active

- [ ] **[BUG-024][P2][Creative Studio] A shot whose media route is not ready loses its generate action with no explanation**
  - Reproduction: open a project containing both image and video shots while exactly one media role is ready — for example the image model configured and the video model still `setup_required`.
  - Actual: `ProducePhase.tsx` swaps the whole surface for `ConnectEngineCard` only when **zero** roles are ready, so partial readiness renders the normal shot grid. The engine strip lists only the ready role, and for every shot of the unready kind `buildSingleSceneReviewRequest` returns `null`, which `ShotGrid` passes as `reviewAvailable={false}` and `ShotCard` renders as `{reviewAvailable && …}` — the generate button is **absent**, not disabled. Nothing states that a model is missing or which one.
  - Reachability: main derives the three role statuses independently, once per role, so a workspace whose providers expose image models but no video models yields `image: 'ready'` with `video: 'setup_required'`. This is a normal reachable state, not a contrived one.
  - Expected: the shot keeps a disabled control carrying its reason, **and** the Produce models panel states the same fact once for the project. Design settled 2026-08-06 as "state 7" — both surfaces, not a choice between them; a disabled-control-only fix is the incomplete answer.
  - Verification: cover partial readiness in both directions and assert the affected shot exposes a stated reason; keep a control shot of the ready kind in the same project so an all-null result cannot pass vacuously. Note the four-value `StudioModelAvailability` union — `selection_required` and `setup_required` need different remedies.

- [ ] **[BUG-027][P3][Creative Studio] `jobManager.test.ts` capped-backoff test flakes in full-suite position**
  - Actual: `persists the remote identity before polling and uses the exact capped backoff schedule` failed once during a `just push` gate on a quiet machine (load 6.1): `waitFor` expired with the job still `running`. Passed 3×118/118 in isolation immediately after, and passed two other full-suite runs the same day.
  - Second member of the same family as BUG-025, in the node project rather than dom. Not one of the known shared-path node races.
  - Expected: the wait survives full-suite scheduling, or the backoff schedule is driven by fake timers so wall-clock contention cannot expire the assertion window. A timeout raise is the disallowed non-fix.

- [ ] **[BUG-028][P2][Creative Studio] A paid storyboard result is discarded after a concurrent revision change**
  - Actual: the service checks the expected revision, performs the **paid** planner request, and only then attempts the CAS write with the old revision. The CAS correctly fails closed, but the paid result has already been obtained and is thrown away. A test currently codifies that sequence.
  - Concrete failure: while storyboard drafting is in flight, another window edits the project or a running job bumps the revision. The provider charges for a completed draft, the app rejects it, and the user must pay again to regenerate.
  - Expected: a durable reservation or result path that does not discard completed provider work. This is a design change, not a patch.
  - Found by independent review of MR !71; accepted as a follow-up rather than a merge blocker because it cannot spend without consent or bypass the release gate.

- [ ] **[BUG-029][P2][Creative Studio] Runtime disposal does not cancel or await active FFmpeg renders**
  - Actual: runtime disposal owns the planner, job manager, protocol and fake bundle, but not the render runner. `StudioRenderRunner` exposes only per-project `renderCut`, `cancelRender` and `getState`, with no dispose/cancel-all boundary. Quit cleanup awaits runtime disposal and then lets main exit without cancelling active FFmpeg children.
  - Concrete failure: quit during a long render — the close handshake checks unsaved renderer edits, not active renders. The child can outlive its parent, and main exits before `executeRender()` can reliably run its `finally`, leaving `aionui-studio-render-*` files in the OS temp directory.
  - Found by independent review of MR !71; accepted as a follow-up for the same reason as BUG-028.

- [ ] **[EPIC-005-G1][P3][Creative Studio] Model-selection provenance for the `CHOSEN FOR YOU` disclosure**
  - Actual: automatic adoption of a sole route persists through the same CAS command a person's own choice uses, and the stored route ref carries no provenance. Once written, an auto-pick is indistinguishable from a deliberate one, so the panel cannot honestly disclose that the app chose the model.
  - Expected: durable per-role provenance the renderer can read but not author, surviving remount and restart, cleared when the user selects explicitly. Existing projects must read as **unknown**, never as `auto`, or every current project would claim the app picked its models.
  - Trap: `toRendererProject` projects routing field-by-field into a different renderer-side type, so a new project field is silently dropped at that boundary — main would store it correctly and the renderer would never see it. Cover that with a test.
  - Two sibling gaps are resolved and need no work: **G2** (appended-clip acknowledgement) was dissolved by the hold-outside design, which is derived and needs no persisted state; **G3** (undo) was closed by deletion — no undo, and explicitly no bounded order-only undo either.

- [ ] **[P3][Creative Studio] Suite exits non-zero after a fully green run**
  - Observed once: a full DOM-project run passed all 2,484 tests and still exited 1 via an `EnvironmentTeardownError` from `tests/unit/renderer/team/TeamSiderSection.dom.test.tsx`. A teardown error after a green run fails `just push` with zero failing tests — a third gate-poisoner class alongside BUG-025 and BUG-027. Not yet reproduced in the mixed full suite.

## Waiting On

- [ ] **[Creative Studio] Review screen redraw — commissioned, delivered, awaiting build capacity**
  - The designer delivered the full Review redraw (cut editor, inspector, render/failure/export states, compact and dark, three new tokens). It supersedes the provisional render placement. Sequencing is settled in `docs/design/creative-studio-v11-cut-editor-plan.md`: `renderCut` must read the cut **before** any editor UI ships, because scene-derived segments mean clip order is not honoured today.

- [ ] **[Creative Studio] FFmpeg licensing — two legal-desk items before release**
  - Rendering is validated and shipping default-off with FFmpeg resolved from `PATH`, never bundled. Bundling is a packaging decision with two open legal questions; release-blocking, not merge-blocking.

## Someday

## Done

- [x] **[BUG-025][P2][Creative Studio] `StudioPage.dom.test.tsx` phase-navigation flake** - verified fixed
  - Actual: `fits 18 seconds to 15 with one atomic command…` failed intermittently in full-suite and coverage runs, unable to find the batch-generation button on Produce. Five sightings across both `creative-suite-sprint2` and `sprint2`, at machine loads from 6.1 to 15.2, never reproducible in isolation (40+ clean runs).
  - Reproduction, found 2026-08-07 after 35 failed targeted attempts: `bunx vitest run --project dom --coverage tests/unit/pages/studio` — **coverage instrumentation was the missing ingredient**, and it came from another team's sighting on `sprint2`.
  - Root cause, in the **test harness, not production**: `fireEvent.click` supplies only a _synchronous_ React `act` boundary, while Studio's phase handler returns `void`, starts an async draft-flush chain, and calls `navigate()` from an effect several hops later. Tests queried across that unsettled boundary. The decisive trace showed the memory router already settled on `/produce` while `RouterProvider` still rendered Write — which is why a transition trace saying "navigated" and a DOM showing Write were **both correct**.
  - Fix: two helpers. `selectStudioPhase` clicks, waits for the router to publish the expected path, flushes the pending commit with `act`, then asserts the nav rail shows that phase as the current step. `fitStoryboardToGoal` waits for the fit command to start and flushes before observing. No production change, no timeout raised, no assertion weakened — the phase helper _adds_ a check the file did not have.
  - Verification: 8 failures in 9 runs before; 13/13 green after including 10 consecutive; independently re-confirmed 3/3. Isolation 93/93. The sibling flake `hides unreachable fit feedback after a canonical routing update refreshes the catalog` is the same defect and is settled by the same helpers.
  - Eliminated along the way, recorded so nobody retries them: a swallowed click on a disabled nav entry; a stale `getProject` fixture returning the pre-fit project; and `clearWriteFocusIntent` navigating back to a stale pathname. Also learned that `console.error` instrumentation _masks_ this race entirely — use cheap `globalThis` array pushes, reset per test, dumped from the assertion's catch.

- [x] **[BUG-026][P2][Creative Studio] `createManagedVideo.open()` leaked its body-root `<video>` when cancelled before open resolved** - verified fixed
  - Actual: `open()` appended a hidden `<video>` to `document.body`, then waited for `loadedmetadata`/`error`. If the consumer unmounted first, `useManagedVideo` marked the request cancelled but its `opened` handle was still `null`, so `close()` could not run — the element and its listeners leaked. Deterministic under jsdom (`HTMLMediaElement.load()` is unimplemented, so open never resolves); reachable in production by unmounting during a stalled load.
  - Root cause: cancellation had no path that could clean up an open that had not yet resolved.
  - Fix: thread an `AbortSignal` through `open()`; abort removes the appended element, detaches listeners and rejects the pending promise. Happy-path open/close, poster capture and preview are unchanged.
  - Verification: a new test mounts, unmounts before open resolves, and asserts no body-root `<video>` survives — it fails on the unfixed code and passes after. Independent revert-proof: 101/101 with the fix, exactly one failure without it. `StudioPage.dom.test.tsx` still passes 93/93, and `--detectAsyncLeaks` no longer reports the pending microtask.
  - Split out of the BUG-025 investigation; it removes a fellow symptom and does **not** close BUG-025.

- [x] **[BUG-007][P1] Clean artifact scratch files after successful delivery** - verified fixed
  - Actual: Office artifact runs placed QA renders, repair scripts, command payloads, backups, and intermediate presentations in the visible conversation workspace with no ownership or lifecycle boundary.
  - Root cause: template directives asked the agent to manage scratch ad hoc, while the product had no exact run manifest, delivery-ready gate, terminal association, or safe cleanup API.
  - Fix: allocate a mode-`0700`, app-owned run directory under the system temp root with an immutable UUID manifest; pass its exact directory and delivery-ready marker into PPTX/DOCX directives; associate it with the accepted turn across immediate and queued sends; remove only that manifested directory after a successful terminal and regular-file marker. Failed/interrupted runs are retained outside the workspace and expose a localized **Clean up** action. Removed or edited queued runs discard only their own unused allocation. The root rejects symlinks and foreign ownership, and cleanup never uses workspace paths, filenames, extensions, patterns, or wildcards.
  - Verification: service regressions cover successful, failed, interrupted, retried, malicious-ID, symlink-root, temporary, and custom-workspace cases while preserving source/final/recovery files. Directive, queue, lifecycle-hook, AionRS/ACP terminal, send-box, native IPC schema, and recovery-action coverage passes within the 703-test focused suite. A live Electron bridge smoke retained an unmarked run, then returned `cleaned` and removed the exact owned directory only after its delivery marker was added. Strict TypeScript, formatting, focused lint, i18n generation/all-locale validation, and the real OfficeCLI PPTX integration pass.

- [x] **[BUG-009][P2] Show a completed result after App Operations Health Check** - verified fixed
  - Actual: a successful health probe returned a new `checked_at`, but the card reverted to the unchanged **Ready** tag and looked like a no-op.
  - Root cause: `AppOperationsModelCard` stored the response but never rendered the completion timestamp or a durable check outcome; the button also inherited a full-width layout.
  - Fix: render localized ready/setup-required/unavailable completion text with relative or absolute check time and the resolved provider/model inside the existing polite live region. Preserve actionable unhealthy reasons and transport-error toasts, and constrain **Health Check** to a content-width secondary button with a 36-pixel minimum hit target.
  - Verification: 33 focused component regressions cover changed timestamps, unhealthy reasons, rejected requests, repeated checks, restored responses, accessibility, and compact layout. In the isolated desktop, a page-local mock of the already-recorded backend contract produced **Healthy · checked just now** in the live region with `minimax/minimax-m2.5`; the button measured 113×36 pixels, and leaving/reopening Model settings restored the saved absolute timestamp. The installed backend still lacks this endpoint, so this final smoke validates the renderer contract rather than claiming a real backend E2E.

- [x] **[BUG-012][P2] Remove the redundant Profile context preview** - verified fixed
  - Actual: the read-only **What gets added to your chats** block duplicated the editable instructions textarea and exposed its model-facing wrapper.
  - Fix: remove only the preview title/content block and its two unused keys from every locale. Keep the enable switch, instructions editor, scope note, config persistence, runtime `buildInjectedContext`, and `GLOBAL_CONTEXT_LABEL` unchanged.
  - Verification: focused DOM coverage confirms the preview and wrapper are absent while edits and enable/disable still persist; existing injection coverage confirms disabled, global-only, and layered new-chat behavior (43 combined settings/injection tests). Strict TypeScript, formatting, focused lint, i18n type generation, and all-locale validation pass. A read-only live Profile smoke confirmed the preview is absent while **Your instructions**, the enabled editor, and the scope note remain visible; no profile data was changed.

- [x] **[BUG-002][P2] Surface the actionable project-removal failure reason** - verified fixed
  - Actual: failed chat detaches, changed local project state, storage failures, and unexpected failures all produced the same generic **Project could not be removed** toast.
  - Root cause: Project Home and the sidebar duplicated the detach/remove sequence, discarded structured failure detail, and removed local project metadata even when a chat reported an unsuccessful detach.
  - Fix: use one dependency-injected removal contract that detaches every chat before removing project metadata. Keep the project on any detach failure, reduce rejected backend errors to safe code/status diagnostics for logging, and show distinct localized retry, refresh, or app-data recovery messages. The unexpected fallback now also names a safe retry action and confirms folder files were not deleted.
  - Verification: regressions cover successful ordering, false detach results, structured backend rejection codes without raw-message disclosure, changed metadata, storage failure, Project Home behavior, and the sidebar flow. The focused project suite passes (53 tests), along with strict TypeScript, formatting, focused lint, i18n type generation, and all-locale validation. Live failure injection was intentionally skipped because it would require mutating real project/chat data.

- [x] **[BUG-010][P1] Always show the context-budget circle in the composer** - verified fixed
  - Actual: **Project > Context** could estimate a conversation while the composer removed its context-budget control whenever runtime usage or a context limit was absent.
  - Root cause: the composer and Context panel used different budget sources, and AionRS resolved only `current_model.use_model` instead of also supporting the backend `model.model` shape.
  - Fix: use one shared snapshot for runtime, restored, estimated, and unknown usage across AionRS, ACP, and Project Context. Prefer authoritative runtime usage, fall back to the existing estimator, resolve both model fields, label estimates visibly, and retain an accessible dashed unknown-state circle. The trigger exposes the percentage or unknown state and its polite live region announces budget-threshold changes.
  - Verification: focused regressions cover runtime/restored/estimated/unknown states, both platforms, raw backend model data, accessible labels and focus, threshold announcements, provider plumbing, and compact composer behavior (86 tests). Strict TypeScript, formatting, i18n type generation and all-locale validation pass. In the running desktop, the composer remained visible at **22%** and **Project > Context** independently displayed the same **22%**; the Project popover was then closed without modifying user data.

- [x] **[BUG-008][P1] Add a dedicated arrow to collapse each project's chat list** - verified fixed
  - Actual: a saved project's entire header opened Project Home, so users had no independent control for collapsing or expanding its chats.
  - Root cause: `WorkspaceCollapse.onToggle` was reused for project navigation and the row had no dedicated disclosure; an explicitly saved empty expansion list was also mistaken for an absent preference and auto-expanded after reload.
  - Fix: add an always-visible Arco chevron button to every project with chats, with independent propagation, right/down state, localized labels, `aria-expanded`, and a semantic keyboard-focus outline. Preserve a valid empty expansion preference while retaining automatic active-chat reveal.
  - Verification: focused DOM and hook regressions cover zero, one, and multiple chats; collapsed/expanded rendering; project-name navigation; independent new-chat/actions/disclosure clicks; Enter activation; focus styling; reload persistence; and active-chat reveal. The focused sidebar/navigation suite passes (27 tests), strict TypeScript, formatting, i18n type generation, and all-locale validation pass.

- [x] **[BUG-005][P1] Hide the verbose internal execution journal from users** - verified fixed
  - Reproduction: run a multi-step artifact task with many command and file-edit tool calls, then inspect the completed response.
  - Actual: every tool and plan event was rendered as a visible checklist row; alternating categories bypassed adjacent-only deduplication and produced a very long list.
  - Root cause: `MessageToolGroupSummary` rendered every settled journal row in the main timeline by default.
  - Fix: show at most the latest running or pending row while a turn is active, show no checklist after it settles, and keep the complete ordered history behind the existing **Technical Details** disclosure alongside raw tool inspection.
  - Verification: regressions cover alternating tool sequences, meaningful plan narration, active and fully settled transitions, partial failure, keyboard disclosure, and live-region behavior. The focused summary and message-list suites pass (119 tests), strict TypeScript, focused lint/format, and i18n validation pass; a live completed artifact conversation showed zero journal rows by default and all 74 rows only after expanding **Technical Details**.

- [x] **[BUG-001][P1] Fix project removal for chats with immutable runtime snapshots** - verified fixed
  - Reproduction: open a project whose chat contains `extra.skills` or MCP snapshot fields, choose **Remove project**, then confirm **Delete**.
  - Actual: the UI showed `Project could not be removed`; the project remained.
  - Root cause: `buildDetachedProjectExtra` resent the complete conversation `extra` object with `merge_extra: false`, including immutable fields, before local project metadata was removed.
  - Fix: detach with a minimal merged `extra` patch containing only `project_id: null` and `custom_workspace: false`, preserving immutable skill and MCP snapshots.
  - Verification: focused regression coverage uses a conversation with skill and MCP snapshots; live removal preserved the chat and workspace files, and the user confirmed the fix.

- [x] **[BUG-004][P1] Render an existing PPT artifact immediately or surface its validation failure** - verified fixed
  - Reproduction: open a completed PPTX artifact after the agent has finished modifying it.
  - Actual: the legacy `/api/ppt-preview/start` path returned `200`, but its page waited for a future mutation event instead of rendering the saved deck.
  - Root cause: desktop PPT previews bypassed the authorized private-copy preview service and continued to use the legacy PPT bridge, unlike the main-process OfficeCLI watch path.
  - Fix: validate a version-matched private copy and start `officecli watch` against that existing copy; reject malformed presentations before starting a watcher while leaving the parent preview toolbar available.
  - Verification: a real OfficeCLI integration renders the saved Business Review deck immediately and rejects a malformed fixture without a mutation event; renderer coverage preserves **Open in system app** and **Download** on failure. The running desktop rendered the completed five-slide `VNG_Policies_Presentation.pptx` with no waiting state; focused tests, strict TypeScript, formatting, lint, and i18n validation pass.

- [x] **[BUG-003][P0] Block delivery of corrupted PPTX artifacts** - verified fixed
  - Reproduction: generate or edit a deck, allow the agent to post-process the PPTX with direct ZIP/XML scripts, then accept the reported final artifact.
  - Actual: the agent reports success and exposes the file even though `officecli validate` reports 12 errors.
  - Evidence: `slide3.xml` is malformed at line 1 position 6; `chart2.xml` contains an unescaped ampersand; chart data points are incomplete. The ZIP container itself is intact.
  - Root cause: generated Python repair scripts modify raw OOXML with greedy byte regexes and unescaped replacements. A valid `backup.pptx` exists from before those repairs, proving the post-processing introduced the corruption.
  - Fix: validate a version-matched private copy before preview or download, run PPT previews from that validated lease, reject malformed Office artifacts with a localized error, and never download the unvalidated workspace PPTX directly.
  - Verification: focused service and DOM regressions cover corrupt validation failure, valid PPT preview startup, private-copy download, failed-download blocking, and lease cleanup; strict TypeScript, i18n validation, and a real `officecli validate` smoke check passed.

- [x] **[BUG-006][P1] Guarantee Context.md creation when model compaction fails** - verified fixed
  - Reproduction: open **Project > Context** for a long artifact conversation, then create context while the `context.compact` provider request fails.
  - Actual: no `Context.md` is written, the panel remains **Not created**, and the UI exposes the internal invariant `Fallback context snapshot must always be valid.`
  - Evidence: the provider failed twice with `provider_request_failed`; the rules fallback then selected a hidden 1,441-character assistant message, truncated it to 900 characters, and rejected it against the snapshot item's 500-character maximum.
  - Root cause: fallback generation and snapshot validation used incompatible limits, and hidden execution text was eligible as the latest assistant message.
  - Fix: ignore hidden messages in fallback derivation and file extraction, bound every snapshot field to the schema limits, and retain deterministic rules persistence after model failure.
  - Verification: provider-failure regressions cover hidden and oversized assistant text, schema-valid item limits, visible-message selection, and successful `Context.md` persistence; the focused Context suite passes.

- [x] **[BUG-011][P2] Fix selected presentation-template visibility in dark mode** - verified fixed
  - Reproduction: enable dark mode, select the **Business Review** or **Connected Ops** PPTX template, then view its chip above the composer.
  - Actual: the template name was near-black on the dark card.
  - Root cause: `TemplateChipCard.tsx` gave the name typography and truncation classes but no semantic foreground token, so it inherited an unsuitable color. The format badge and remove action also relied on Arco defaults.
  - Fix: apply semantic primary/secondary foreground and fill tokens to the title, format badge, and remove action; constrain the text column for long-name truncation; add a primary-token keyboard-focus outline.
  - Verification: dark-theme DOM regressions cover a long name, badge/remove contrast, removal, and keyboard focus. A live Connected Ops smoke check confirmed the semantic computed colors against the dark card; focused tests, strict TypeScript, formatting, lint, and i18n validation pass.
