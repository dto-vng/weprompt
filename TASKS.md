# Sprint 2 Tasks

> **Canonical work register. Last reconciled: 2026-08-07.**
>
> - Mark an item **Done** only when its accepted head is merged into `origin/sprint2`. Local branches, worktrees, plans, and green focused tests remain open until integration is accepted.
> - Every active epic records its current boundary and next admission gate. Do not infer whole-sprint progress from raw checkbox count: epics and bugs differ materially in size.
> - Update this file after every accepted merge, blocker decision, scope change, and code-freeze checkpoint. Preserve evidence links and move completed items to **Done** instead of deleting them.

## Active

- [ ] **[EPIC-002][P2][Design-blocked] Create reusable HTML/PPTX/DOCX template packs from chat**
  - Outcome: derive a template from a workspace artifact, or describe an HTML template, then review, add, or discard it in chat before anything reaches the Template Gallery.
  - Current boundary: Task 1 of 11 is independently accepted on the preserved candidate but is not merged into `origin/sprint2`. Task 2 is **blocked at the mandatory store-boundary redesign checkpoint** after two bounded hardening rounds; Tasks 3–11, runtime registration, IPC, gallery installation, enablement, packaging, and release are not admitted or started.
  - Open Task 2 invariants: failed/expired terminalization must atomically persist exact cleanup proof for every owned allocation, and every public path must fail closed after poison or root-identity uncertainty. Committed ownership and PPTX/DOCX reload-proof parity are now addressed.
  - Preserved candidate: `codex/epic002-template-creation-r-02ee3f8d6@86c966bda7644ae87c105532dcf47f282407add9`; focused Task 2 boundary passed 159/159, but independent exact-head review correctly returned BLOCK on the two remaining invariants.
  - Next gate: redesign the store boundary and obtain independent design approval before any further production edit. The revised design must allocate cleanup authority explicitly, make terminalization consume a complete durable receipt set, and centralize usable-root enforcement across all public operations. No third micro-patch round is admissible.
  - Dependencies: release waits for EPIC-001's accepted shared presentation seams and BUG-014 packaged-template acceptance. Preserve the EPIC-003 and Creative Studio ownership boundaries.
  - Evidence: the authoritative reconciled Task 2 contract and review package remain preserved at the candidate head above until accepted and merged. The tracked [original design spec](docs/design/template-creation-skill-plan.md) is historical background only; it targets an earlier base and must not be used as the current execution plan.

- [ ] **[EPIC-003][P2][Planning gate] Expose provider- and model-aware reasoning controls**
  - Outcome: show only reasoning controls a selected provider/model can actually honor, using capability evidence rather than provider-name special cases.
  - Current boundary: session-local, unmerged provider evidence, canonical fixtures, capability-revision design, and candidate AionCore migrations `038`/`039` have been prepared. Independent review blocked the three implementation plans because their steps, owners, exact paths, and RED assertions were not executable enough. No runtime, migration, IPC, renderer, or packaging implementation has started, and the evidence package is not yet present in the tracked Sprint 2 tree.
  - Current evidence: Moonshot `kimi-k2.6` and `kimi-k2.5` have documented toggle semantics but remain feature-disabled; unverified GreenNode gateway models and ACP remain unsupported.
  - Next gate: materialize the evidence package in an auditable branch, rewrite and independently approve the three repository-specific plans, refresh all immutable bases and migration occupancy, then admit the first AionRS DTO/private-mapping slice.
  - Scope rule: capability-based and provider-agnostic; do not hard-code Kimi, GreenNode, or Sol-style effort labels into the shared contract.

- [ ] **[SPRINT2-PLATFORM][P1][Scope gate] Complete SSO and the security/packaging workflow**
  - Outcome: employees can sign in through the approved SSO route and install or upgrade a package that starts securely without data loss or undocumented recovery steps.
  - Current boundary: local-backend authentication and pilot-hardening candidates exist on separate, substantially stale security branches; they are not integrated into Sprint 2. No accepted SSO provider/session/tenant contract is recorded in this register.
  - Next gate: approve the SSO contract and owner, reconcile the security branches against the current Sprint 2 tip, then define one clean-install/upgrade/recovery matrix for macOS ARM, macOS Intel, and Windows.
  - Scope rule: keep SSO identity, application security, packaging mechanics, and release acceptance visible as separate slices even when they share one program outcome.

- [ ] **[SPRINT2-CONNECTORS][P2][Acceptance gate] Make Outlook and FDL data connectors available**
  - Outcome: users can discover the two approved connectors, authenticate, reconnect, and use them from a supported assistant flow.
  - Current boundary: Sprint 2 already seeds the OAuth-backed `outlook-advanced` and `tse-datahub` HTTP MCP endpoints. Packaged login, permission, reconnect, and supported-flow acceptance is not recorded, and the exact FDL product name/endpoint still needs confirmation against the seeded data connector.
  - Next gate: confirm the FDL identity, run packaged authentication and least-privilege smokes for both connectors, record failure/recovery behavior, and decide whether they remain enabled by default in the hardened pilot package.
  - Scope rule: this is availability of two named connectors, not a generic MCP/data-platform expansion.

- [ ] **[BUG-013][P0][Packaging] Make installed upgrades schema-compatible on first startup**
  - Actual: a packaged application can fail to start against existing app data when the bundled AionCore migration set is older than migrations already recorded in the database.
  - Current boundary: a schema-lineage candidate branch exists, but native Windows and end-user upgrade acceptance are not merged or complete.
  - Expected: preserve user data, fail safely with an actionable recovery path, and prove the shipped migration set supports the declared data floor on every release platform.

- [ ] **[BUG-014][P1][Packaging] Ship and hand off all built-in PPTX/DOCX templates**
  - Actual: packaging and first-turn readiness can leave built-in templates absent or consume an initial templated message before the runtime is ready.
  - Current boundary: a template-inventory candidate branch exists; packaged gallery and first-send acceptance across macOS ARM, macOS Intel, and Windows remain open.
  - Expected: fail packaging when any required reference is absent, list all built-ins in the installed gallery, and remove a stored initial message only after execution succeeds.

- [ ] **[BUG-015][P1] Report authoritative context-window usage and local token totals**
  - Actual: real Kimi activity can leave context usage unavailable and Today/Week/Month totals at zero because authoritative usage is lost before conversation persistence and the local ledger.
  - Expected: propagate, deduplicate, persist, and restore authoritative provider usage across AionRS and ACP; distinguish current-context occupancy from cumulative consumption.

- [ ] **[BUG-016][P1] Show thinking activity when `thinking.subject` is missing**
  - Actual: completed thinking records with content but no subject disappear from the grouped work summary.
  - Expected: show a localized safe fallback with correct state while preserving the existing disclosure and redaction boundary.

- [ ] **[BUG-017][P1][Needs reproduction] Recover safely when AionCore loses SQLite access**
  - Actual: a real incident returned SQLite code 14 across providers, assistants, conversations, App Operations, and Health Check; integrity passed and restart restored service, but the durable cause is unconfirmed.
  - Expected: identify local-data access failure accurately, preserve the database, offer safe restart/retry and bounded diagnostics, and never delete or rebuild data without confirmed corruption and explicit consent.

- [ ] **[BUG-018][P1] Preserve provider overload, rate-limit, setup, and connectivity distinctions**
  - Actual: structured provider failures can collapse into misleading rate-limit or unconfigured states.
  - Expected: preserve the provider's structured failure type, use HTTP status only as fallback, respect bounded retry guidance, and expose accurate localized recovery actions.

- [ ] **[BUG-019][P1] Open Project Home after creating a project**
  - Actual: project creation succeeds and immediately navigates to `/guid`, bypassing the setup home.
  - Expected: refresh the list, close the modal, and navigate to `/project/:id`; explicit project **New chat** actions must continue to open `/guid`.
  - Verified root cause: the creation callback still calls `navigateToProjectChat(...)` instead of the existing project-home route builder.

- [ ] **[BUG-024][P2][Creative Studio] A shot whose media route is not ready loses its generate action with no explanation**
  - Reproduction: open a project containing both image and video shots while exactly one media role is ready — for example the image model configured and the video model still `setup_required`.
  - Actual: `ProducePhase.tsx` swaps the whole surface for `ConnectEngineCard` only when **zero** roles are ready, so partial readiness renders the normal shot grid. The engine strip lists only the ready role, and for every shot of the unready kind `buildSingleSceneReviewRequest` returns `null`, which `ShotGrid` passes as `reviewAvailable={false}` and `ShotCard` renders as `{reviewAvailable && …}` — the generate button is **absent**, not disabled. Nothing states that a model is missing or which one.
  - Reachability: main derives the three role statuses independently, once per role, so a workspace whose providers expose image models but no video models yields `image: 'ready'` with `video: 'setup_required'`. This is a normal reachable state, not a contrived one.
  - Expected: the shot keeps a disabled control carrying its reason, **and** the Produce models panel states the same fact once for the project. Design settled 2026-08-06 as "state 7" — both surfaces, not a choice between them; a disabled-control-only fix is the incomplete answer.
  - Verification: cover partial readiness in both directions and assert the affected shot exposes a stated reason; keep a control shot of the ready kind in the same project so an all-null result cannot pass vacuously. Note the four-value `StudioModelAvailability` union — `selection_required` and `setup_required` need different remedies.
  - **Scope corrected 2026-08-07 — it is eight facts, not one.** The causes were derived from the code rather than estimated: **13 paths, 10 real causes, 8 distinct sentences**. Full table with triggers and remedies in the [generate-reason derivation](docs/design/creative-studio-generate-reason-derivation.md). The earlier "nine causes" figure in the design docs was an estimate and wrong in both directions.
  - **Two of the eight must offer no action at all** — the model not answering, and the catalogue not loaded. Neither is the user's to fix. The naive implementation offers _Open Model settings_ on all eight and sends a user to a screen that cannot help them in two cases; that is the specific way this bug gets "fixed" wrongly.
  - Two code paths are **unreachable** on this call path and must not get copy: the kind check (the route is already filtered by media kind) and the scene check (the per-shot call passes no scene id). Writing copy for either would imply a state no user can reach.
  - Blocked on the designer for the copy itself — Ask B of the [open asks commission](docs/design/creative-studio-open-asks-commission.md), sent with the derivation. They estimated a day's turnaround.

- [ ] **[BUG-027][P3][Creative Studio] `jobManager.test.ts` capped-backoff test flakes in full-suite position**
  - Actual: `persists the remote identity before polling and uses the exact capped backoff schedule` failed once during a `just push` gate on a quiet machine (load 6.1): `waitFor` expired with the job still `running`. Passed 3×118/118 in isolation immediately after, and passed two other full-suite runs the same day.
  - Second member of the same family as BUG-025, in the node project rather than dom. Not one of the known shared-path node races.
  - Expected: the wait survives full-suite scheduling, or the backoff schedule is driven by fake timers so wall-clock contention cannot expire the assertion window. A timeout raise is the disallowed non-fix.
  - **Investigated 2026-08-07 after BUG-025 was solved — the same trick does NOT work here.** BUG-025 reproduced under `--coverage`; the analogous command for this one, `bunx vitest run --project node --coverage tests/unit/process/creative-studio`, passes **3/3 (744 tests)**. Coverage overhead is not the ingredient, so do not spend time there.
  - Mechanism analysis (plausible, **unconfirmed** — no reproduction, so nothing was changed): the suite's local `waitFor` (`jobManager.test.ts:141`) budgets **100 attempts × 5ms**, i.e. a fixed poll count rather than a time budget, while the work underneath performs real filesystem I/O through `fsWithoutDiskBarriers`. The injected `sleep` is instant (`epochMs += delayMs`), so provider backoff is not the wait — real I/O is. A fixed poll budget against variable real I/O is fragile by construction.
  - Remaining suspect: whole-suite multi-project concurrency, which is how both sightings occurred (inside `just push`), rather than any single-project run. Reproducing likely needs repeated full-suite runs, which is expensive — weigh that against this being **P3 with two sightings** while BUG-024/028/029 are P2 and actionable.
  - **Do not "fix" the `waitFor` budget without a reproduction.** It is a reasonable suspect and an unreasonable thing to change blind; that judgement is what kept BUG-025 honest until the reproduction arrived.

- [ ] **[BUG-028][P2][Creative Studio] A paid storyboard result is discarded after a concurrent revision change**
  - Actual: the service checks the expected revision, performs the **paid** planner request, and only then attempts the CAS write with the old revision. The CAS correctly fails closed, but the paid result has already been obtained and is thrown away. A test currently codifies that sequence.
  - Concrete failure: while storyboard drafting is in flight, another window edits the project or a running job bumps the revision. The provider charges for a completed draft, the app rejects it, and the user must pay again to regenerate.
  - Expected: a durable reservation or result path that does not discard completed provider work. This is a design change, not a patch.
  - Found by independent review of MR !71; accepted as a follow-up rather than a merge blocker because it cannot spend without consent or bypass the release gate.
  - **Design settled 2026-08-07** (`docs/design/creative-studio-bug028-durable-drafts.md`): region-guarded merge inside the serialised update fn (authored script + planner inputs compared, operational fields excluded, active-jobs overlap treated as conflict), with a true conflict recording the paid draft as a pending proposal instead of discarding it. Sequence the implementation after EPIC-006 Slice A3 — the fallback needs the proposal card UI.

- [ ] **[BUG-029][P2][Creative Studio] Runtime disposal does not cancel or await active FFmpeg renders**
  - Actual: runtime disposal owns the planner, job manager, protocol and fake bundle, but not the render runner. `StudioRenderRunner` exposes only per-project `renderCut`, `cancelRender` and `getState`, with no dispose/cancel-all boundary. Quit cleanup awaits runtime disposal and then lets main exit without cancelling active FFmpeg children.
  - Concrete failure: quit during a long render — the close handshake checks unsaved renderer edits, not active renders. The child can outlive its parent, and main exits before `executeRender()` can reliably run its `finally`, leaving `aionui-studio-render-*` files in the OS temp directory.
  - Found by independent review of MR !71; accepted as a follow-up for the same reason as BUG-028.

- [ ] **[EPIC-005-G1][P3][Creative Studio] Model-selection provenance for the `CHOSEN FOR YOU` disclosure**
  - Actual: automatic adoption of a sole route persists through the same CAS command a person's own choice uses, and the stored route ref carries no provenance. Once written, an auto-pick is indistinguishable from a deliberate one, so the panel cannot honestly disclose that the app chose the model.
  - Expected: durable per-role provenance the renderer can read but not author, surviving remount and restart, cleared when the user selects explicitly. Existing projects must read as **unknown**, never as `auto`, or every current project would claim the app picked its models.
  - Trap: `toRendererProject` projects routing field-by-field into a different renderer-side type, so a new project field is silently dropped at that boundary — main would store it correctly and the renderer would never see it. Cover that with a test.
  - Two sibling gaps are resolved and need no work: **G2** (appended-clip acknowledgement) was dissolved by the hold-outside design, which is derived and needs no persisted state; **G3** (undo) was closed by deletion — no undo, and explicitly no bounded order-only undo either.

- [ ] **[BUG-030][P3][Test infrastructure] Suite exits non-zero after a fully green run**
  - Actual: a full DOM-project run (`vitest run --project dom`) passed all 2,484 tests and still **exited 1**, via an `EnvironmentTeardownError` from `tests/unit/renderer/team/TeamSiderSection.dom.test.tsx`. A teardown error after a green run fails `just push` with **zero failing tests**, which reads as an inexplicable gate failure.
  - **Not Creative Studio code**, despite being found during Studio work — `TeamSiderSection` is the team sidebar. It was previously filed unnumbered under Creative Studio, which was misleading on both counts; ownership belongs with whoever owns that suite or the shared test setup.
  - Third member of the gate-poisoner family, alongside BUG-025 (now fixed) and BUG-027. Distinct from both: those fail a test, this one fails the process while every test passes.
  - Observed once, in a single-project run. **Not yet reproduced in the mixed full suite**, so it may need that context — the same thing turned out to be true of BUG-025, where coverage instrumentation was the missing ingredient.
  - Expected: a green run exits 0. Fix the teardown, or establish why the environment is torn down while work is outstanding.

- [ ] **[BUG-032][P3][Creative Studio] The Write assistant dock overpromises its capability in all 12 locales**
  - Actual: `AssistantDock.tsx:149` renders `conversation.creativeStudio.phase.write.assistantDescription` — _"Use the assistant to develop story structure, shot ideas, and prompts"_ — while the dock's only capability is the one-shot **Draft storyboard** button. All 12 locales make the equivalent promise. Recorded in the Write-assistant design §1 as a defect of the same class as the closed false-audio claim.
  - Became standalone 2026-08-07: the Write-assistant design that would have made the copy true is **parked** (`docs/design/creative-studio-write-assistant-design.md`, parking banner — its capabilities were absorbed by EPIC-006 Slices A/P and the scene assist), so the spec's own rule "this design fixes it or the copy must change" now resolves to changing the copy.
  - Expected: the description states what the dock does today — drafts a storyboard from the brief — with the provider/model labels and charge disclosure unchanged. Copy change ×12 locales, `bun run i18n:types` + `node scripts/check-i18n.js`; no behavior change.
  - Scope note: when the scene assist ships, the copy may additionally point at it for per-scene help; do not pre-write that promise before it lands.

- [ ] **[BUG-033][P1][Creative Studio] A render whose ffmpeg child dies never releases the busy lock**
  - Actual: when the render child terminates without completing, the project's render slot is never reclaimed. `renderCut` then returns `busy` for the rest of the app process, so the project **can never be rendered again without restarting the app**, and nothing in the UI explains why.
  - Found live 2026-08-07, not by tests: after killing a wedged ffmpeg (see `BUG-034`), `getLatestRender` stayed `null`, no failure state surfaced, the `aionui-studio-render-*` temp directory was left behind, and a fresh `renderCut` was rejected with `{ code: 'busy' }`.
  - **Two problems stacked, and fixing one is not enough.** The lock is not released on abnormal child exit; and **ffmpeg ignored `SIGTERM`** here — it kept running at ~99% CPU and only died on `SIGKILL`. A cancel path that sends TERM and assumes the child is gone will neither kill the process nor reclaim the slot.
  - This is R4's "state 2" busy guard stuck permanently on. The guard itself is correct; nothing releases it.
  - Expected: an abnormal child exit finalizes the render as failed, releases the slot, cleans the temp directory, and surfaces one of the three typed failures. Cancellation must escalate to `SIGKILL` after a bounded wait.
  - Related: `BUG-029` covers disposal not cancelling active renders at quit. Same subsystem, different trigger — that one leaks a process at exit, this one wedges the feature during a session.

- [ ] **[BUG-034][P2][Creative Studio] An unreadable asset wedges the render forever with no timeout or validation**
  - Actual: a segment whose input image cannot be decoded makes ffmpeg spin indefinitely instead of failing. Observed **3h 20m at ~99% CPU on the first of four segments** before being killed manually. Nothing bounds a segment's duration and nothing checks the asset before it is handed to ffmpeg.
  - Mechanism: the render invokes `-loop 1 -t 3 -i <asset>`. With a zero-dimension input, `-loop 1` never yields a frame, so ffmpeg neither errors nor exits. `ffprobe` on the same file reports `width=0` with `chunk too big`.
  - Expected: validate that an asset decodes to non-zero dimensions before rendering it, and bound each segment with a timeout. A take that cannot be decoded is `render_failed` naming the clip, not an infinite spin.
  - Cheap partial fix worth considering on its own: dropping `-loop 1` for still images in favour of a bounded frame count removes the infinite-loop shape entirely.

- [ ] **[BUG-035][P3][Test infrastructure] The Studio e2e fake provider emits assets that cannot be rendered**
  - Actual: with `AIONUI_E2E_STUDIO_FAKE=1`, a generated take is a **39-byte stub** — the 8-byte PNG magic header followed by the ASCII string `STUDIO_RAW_OUTPUT_BODY_SENTINEL`. It passes a magic-byte check and is not an image; `file` reports `data`.
  - Consequence: the generate → render journey **cannot be exercised end to end** with the fake provider, which is why the Studio e2e spec asserts state transitions and never a real render. It is also what triggered `BUG-034` in practice.
  - Expected: the fake emits a genuine minimal PNG (a 1×1 or small solid frame) so a fake-provider run can render. That would have caught `BUG-034` and `BUG-033` automatically.
  - Not a production defect — the stub is deliberate for state tests. Filed so nobody concludes from a green e2e run that rendering works.

- [ ] **[BUG-036][P2][Creative Studio][Blocks flag-enablement] The v1.1 Review editor has four accessibility and localization defects**
  - Found by an independent four-lens review of MR !73 (2026-08-07). None is reachable today — `CREATIVE_STUDIO_ENABLED` is opt-in via `AIONUI_ENABLE_CREATIVE_STUDIO=1` (`common/config/constants.ts:66`) — which is why they were filed rather than held. **They must close before the flag is ever defaulted on**, not merely "someday".
  - **(a) The four clip states reach screen readers only as data attributes.** The `aria-describedby` → `sr-only` span hardcodes `phase.review.selectedTake` regardless of the `reviewState` prop (`CutTimeline.tsx:231-233`), and on slate items the running/failed/slate label sits inside a button whose `aria-label` (`:468`) suppresses inner content from the accessible name, with no `describedby` (`:491`). BUG-031's stated guarantee — state surviving _without colour_ — does hold, because the labels are visible text; the screen-reader half is narrower than the entry implies. Independently flagged by two lenses.
  - **(b) Escape closes the R5 drawer but drops focus to `<body>`.** Arco's Drawer renders react-focus-lock without `returnFocus`, `onCancel` only flips state, and `unmountOnExit` discards the node (`ReviewCut.tsx:357-386`). Escape-close itself is tested; focus return is neither implemented nor asserted. The dialog is also unnamed (`title={null}` + `closable={false}`).
  - **(c) `render.errors.noRenderableShots` has no plural forms in any of the 12 locales and passes no `count`** (`ReviewPhase.tsx:73-79` joins shot numbers into a string). One missing shot renders plural phrasing everywhere. Its sibling `export.gapWarning` does this correctly. It was also omitted from `pluralLogicalKeys` in `tests/unit/pages/studio/studioI18n.test.ts`, so the repo's 0/1/2/5 convention test never exercised it — fix the key and the test list together.
  - **(d) A raw ISO timestamp is shown to users** — `StudioExportModal.tsx:116` renders `latestRender.renderedAt` verbatim ("Rendered 2026-07-29T08:15:00.000Z"), and `StudioExport.dom.test.tsx` asserts that raw string, codifying it. Needs locale-aware formatting, and the assertion updated rather than preserved.
  - Verification: for (a) assert each of the four states through the accessibility tree, not `data-review-state`; for (b) assert focus returns to the opener; for (c) real i18next plural tests at counts 1/2/5 in ru-RU and uk-UA; for (d) assert a formatted, locale-aware string.
  - P3 tail from the same review, deliberately not expanded here: SR seconds plurals (`cut.secondsValue`), hardcoded `s` unit and decimal parsing in trim fields, unrounded playhead float in `duration.played`, zh-TW `common.close` untranslated, two failing contrast pairings on the export modal that repeat pre-existing pairings (ratchet-neutral), selected slates having no visual selected state.

- [ ] **[BUG-037][P3][Creative Studio] Three renderer-side render-state surface gaps**
  - Also from the MR !73 review; all three leave the store correct and are renderer-only.
  - **(a) After a ReviewPhase remount, the user's own in-flight render reads as "busy" with no Cancel.** The runner's `getState` is never exposed over IPC, so `useStudioRender` resets to `idle` on mount and labels any `running` event it did not start as another surface's render (`useStudioRender.ts:130-143`). Leave Review mid-render and return: the UI claims someone else is rendering and offers no way out until the next progress event.
  - **(b) A cancel landing after the output is persisted yields status `cancelled` for a render that exists.** `renderService.ts:826` persists, then `:836` checks cancellation and throws, so `:840` reports `cancelled` while the file is committed — and `getLatestRender` (`creativeStudioService.ts:1897`) does not filter by status, so the export modal then offers a `cut.mp4` the user believes was never produced. The file itself is a valid complete render.
  - **(c) The export modal's latest-render line is a snapshot** taken at modal open while the export re-reads at export time, so a render finishing while the modal is open exports a newer file than the modal described.
  - Related but separate: `BUG-033` covers the busy lock never releasing when the ffmpeg child dies.

- [ ] **[BUG-038][P3][Process] A slice merged into the v1.1 branch with a red gate, undetected until review**
  - Actual: R3 (`d8e0bf1ff`) added the `place-cut-scenes` provider to `ipcBridge.ts` without a manifest entry. The manifest-completeness test (`tests/unit/process/bridge/nativePayloadSchemas.test.ts:1675`) predates that commit on `sprint2`, so it was **red on `creative-suite-sprint2` from `d8e0bf1ff` until the fix `7bd5a1561`** — verified by inspecting both files at that commit.
  - The fix's commit message states "every unit test passed by bypassing the bridge". That is false, and the false version is the one a future reader will find. The real lesson is stronger: the machine-enforced parity net worked exactly as designed and **nobody ran it between slices**.
  - Expected: slice merges into an integration branch run the gate before merge, not only at the epic's end. No production change needed.

## Waiting On

- [ ] **[EPIC-004][P2][Dependency-gated] Make Excel workbook changes reviewable, deterministic, and fail-closed**
  - Outcome: users request workbook changes in plain language, receive one bounded pre-change audit and approval point, and get a verified result without silent damage to formulas, formatting, charts, or unsupported workbook features.
  - Current boundary: the problem statement, solution contract, and implementation plan were approved in planning sessions, but the evidence package is session-local and not present in the tracked Sprint 2 tree. No runtime implementation has started or been merged.
  - Waiting on: the shared Office artifact/mutation boundary and EPIC-002's OfficeCLI ownership contract must settle before Excel introduces another publication or cleanup path.
  - Next gate: materialize the approved design in an auditable branch, close the X0 contracts for workbook identity, supported-change classification, immutable source/snapshot handling, audit evidence, publication, rollback, and report transaction, then obtain independent plan acceptance before admitting implementation.
  - Scope rule: request-led controlled changes with one bounded audit. Packaging and release remain outside this epic.

- [ ] **[Creative Studio] FFmpeg licensing — two legal-desk items before release**
  - Rendering is validated and shipping default-off with FFmpeg resolved from `PATH`, never bundled. Bundling is a packaging decision with two open legal questions; release-blocking, not merge-blocking.

## Someday

## Done

- [x] **[Creative Studio] Review screen redraw — delivered** — completed 2026-08-07
  - The designer delivered the full Review redraw (cut editor, inspector, render/failure/export states, compact and dark, three new tokens). It supersedes the provisional render placement.
  - **Current boundary: all five slices are built, reviewed, and pushed as [MR !73](https://code.vng.vn/dto/weprompt/-/merge_requests/73) into `sprint2` (2026-08-07).** §3a–§3d are complete. The sequencing constraint recorded here is satisfied — `renderCut` reads the cut (R1/R2) and shipped before any editor UI (R3).
  - The slices, in order: **R1** clip order `646d5db7d` · **R2** render edits `a48cd5581`, `f7b6544c4` · **R3** cut editor `d8e0bf1ff` · **R4** render/failure/export states `850944843` · **R5** compact, drawer and dark `f0e75e86d`.
  - Each slice was independently reviewed before merge against a revert-proof run by the reviewer, not the implementer. That caught three defects worth recording as a class: a hardware-encoder-only pixel probe (R2), a dropped user-visible state with its covering accessibility test deleted (R3, now `BUG-031`), and an IPC provider registered in `ipcBridge` but absent from the native manifest, which shipped keyboard clip placement broken past a green suite (R3, fixed in `7bd5a1561`).
  - **Next gate:** review and merge of MR !73. The full suite is green on the merged tree — 7,921 passed, 0 failed — and every push gate passes. Nothing in the redraw is blocked on design.
  - Not part of this item, and open: the designer's four asks from 2026-08-07 — see [open asks commission](docs/design/creative-studio-open-asks-commission.md). **Ask A cannot ship as drawn** (its fourth slate state has an unreachable cause; we replied and are waiting), and **Ask C depends on `EPIC-005-G1`**, which is P3 and unstarted.
  - **Done 2026-08-07** — MR !73 merged to `origin/sprint2` as `29b4bee97`. §3a–§3d complete across R1–R5.

- [x] **[BUG-031][P2][Creative Studio] Review no longer distinguishes a generating shot from a failed one**
  - Actual: on the Review screen every shot without a selected take renders as the same hatched slate — title plus one `phase.review.slateLabel`. Three different situations collapse into one indistinguishable plate: still generating, failed and needing a retry, and never generated. Each has a different next action (wait, retry, generate), and the screen no longer says which applies.
  - Regression, not a missing feature. The previous Review rail labelled four states; `ReviewCut.tsx` derived them from `readiness.sceneStatuses` (`generating` → running, `needs_attention` → failed, otherwise → missing-slate). Introduced by the R3 cut editor (`d8e0bf1ff` on `creative-suite-sprint2`), which replaced `SceneTimeline` with `CutTimeline` and dropped the derivation.
  - **The data is still in scope.** `ReviewCut` still receives the prop; R3 renamed it to `_readiness`, the project's deliberately-unused-parameter convention. It was marked unused to satisfy lint rather than noticed as a dropped distinction, so the fix does not need new plumbing or new i18n keys — `scene.status.generating` and `jobs.status.failed` already exist.
  - **Its covering test was deleted, not replaced.** `labels selected, slate, running, and failed rail states without relying on color` is gone from `ReviewPhase.dom.test.tsx` along with all eight of its assertions; only a `slateLabel` count survives. That test carried the non-colour accessibility guarantee, so nothing now protects it. Restore an equivalent assertion with the fix.
  - Genuinely a design question, which is why it was filed rather than patched. The cut model defines a slate as simply "a scene with no selected take" (`docs/design/creative-studio-cut-model-design.md:74`), so a single undifferentiated slate is defensible against the written spec — but the old screen was strictly more informative.
  - Found by review of R3 before merge; accepted as a follow-up rather than a blocker because the slice matches its spec, is fully gated, and the loss is informational rather than a spend or correctness fault. The R3 agent reported "No §3a gaps were identified", so this was not disclosed.
  - **Current boundary — fixed and independently verified, not yet integrated.** Repaired in the R4 slice (`850944843` on `creative-suite-sprint2`), scoped to restoring the parity that existed rather than designing a richer slate model. `readiness` is consumed again, `CutTimelineReviewState` carries all four states to `CutTimeline`, and the state is exposed via `aria-describedby` onto an `sr-only` span, so it survives without colour. The deleted assertion is restored as `labels selected, slate, running, and failed cut states without relying on colour`; both it and the slate-position assertion fail under an independent production revert, so the guarantee is genuinely protected rather than merely present.
  - **Next gate:** [MR !73](https://code.vng.vn/dto/weprompt/-/merge_requests/73), opened 2026-08-07. Stays open until that merge is accepted, per this register's Done rule.
  - Residue, deliberately not expanded into this bug: R4 carried the four-state logic into `CutTimeline` and **retained** `SceneTimeline.tsx`, which still has no production consumer and survives only through the barrel export and two tests that render it directly. Retiring it is a tidy-up, not part of this defect — but it now reads as live code and will mislead the next reader.
  - Still open for the designer, unchanged by the fix: whether the cut timeline is the right surface for generation status at all, or whether a slate should say more than the old rail did. The fix restored parity; it did not settle the question.
  - **Done 2026-08-07** — merged to `origin/sprint2` in `29b4bee97` (MR !73). Fixed in R4 `850944843`; the restored non-colour assertion fails under an independent production revert.

- [x] **[EPIC-001][P1] Presentation artifact-quality foundation and synthetic stabilization** — completed 2026-08-06
  - All 14 accepted task heads are merged into `origin/sprint2`, including fail-closed grounding, canonical presentation routing, deterministic readiness checks, rendered QA foundations, bounded repair controls, and final synthetic stabilization.
  - Completion boundary: the foundation is integrated with `PRESENTATION_RUN_V2_ENABLED=false`. Live-provider activation, production containment, packaged-template acceptance, and release work remain deliberately tracked under the active packaging and bug gates rather than being hidden inside this completion.

- [x] **[EPIC-005][P1] Creative Studio v1 core workflow** — completed 2026-08-06
  - The accepted v1 process service, model configuration, IPC/native contracts, localized renderer workflow, and verification boundary are merged into `origin/sprint2` via `cd3896d13`.
  - Completion boundary: the merged v1 remains done; BUG-024, BUG-027, BUG-028, BUG-029, BUG-030, EPIC-005-G1, Review redraw, and FFmpeg licensing are explicit follow-ups and do not silently reopen the core epic.

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
