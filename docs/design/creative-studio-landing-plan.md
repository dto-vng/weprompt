# Creative Studio — landing plan

**Status:** SETTLED — target confirmed 2026-08-06 · **Date:** 2026-08-05, header revised 2026-08-06 · **Target branch:** `creative-suite-sprint2`, branched from `sprint2`
**Source:** `codex/studio-integration` — archived immutably at `refs/archive/studio-integration-2026-08-05` = `20735e392`

> ## ✅ TARGET SETTLED 2026-08-06 — `creative-suite-sprint2`, off `sprint2`
>
> Creative Studio is developed on a long-lived branch **`creative-suite-sprint2`, branched from `sprint2`** — not on `origin/creative-suite`, and not directly on `sprint2`. That branch is the Creative **Suite** line and carries:
>
> ```text
> sprint2
>   └── creative-suite-sprint2
>         ├── Creative Studio runtime
>         ├── UI redesign
>         └── later Creative Suite features
> ```
>
> **Working shape:** develop on `creative-suite-sprint2`; back-merge `sprint2` periodically to stay current; land into `sprint2` when the epic's acceptance bar is met. As of 2026-08-06 the branch is 141 ahead of `origin/sprint2` and 0 behind, with the full suite green (7,286 passed).
>
> **What is stale in this document:** §3, §4 and §9 describe a five-MR sequence landing _directly_ into `sprint2`. That is not the shape — substitute the working shape above. `TASKS.md` EPIC-005 should have its "plan-of-record conflict — merge hold" note retired, since the conflict it records is resolved.
>
> **What still holds:** the defect findings and the acceptance bar. §6 (concurrency premise, the false audio claim, the cost-estimate contract) and §7 (visual acceptance, poster frames) are properties of the code, not of the target branch.
>
> **Historical — why not `origin/creative-suite`.** Retained because the measurement was expensive and explains the choice, not because it is a live option. That branch carries 50 commits and 79 Creative Studio paths — a parallel line of the same feature, tip `c5b879c3e` by khoapnt-vng dated 2026-08-05. **Correction 2026-08-07: this is not khoapnt's work on the Creative Studio, and the line is to be ignored — no reconciliation, no merge, no growing-cost argument.** A naive merge of `codex/studio-integration` into it produces **98 conflicts**, including `add/add` on `jobManager.ts`, `creativeStudioService.ts`, `mediaStore.ts`, `store.ts`, `providerResolver.ts`, `runtime.ts`, `creativeStudioTypes.ts` and every adapter.
>
> **Measured line similarity says these are one lineage, not two designs:** `openRouterVideoAdapter.ts` 99.7% (380 lines both sides), `providerResolver.ts` 93.1%, `creativeStudioTypes.ts` 91.4%, `jobManager.ts` 89.1%, `creativeStudioService.ts` 86.6%. Both almost certainly descend from the `creative-studio-mvp` work; git reports `add/add` only because they share no commit ancestry beyond the `sprint1` tip `54cfef7a7`.
>
> **Therefore:** do not treat those 98 conflicts as evidence the branches are incompatible. Recovering or synthesising the common ancestor and supplying it as a merge base should collapse most of them into an ordinary 3-way merge. Reconciliation strategy is being reviewed separately.

> **Rev 2** incorporates an execution review that found four blocking defects in rev 1, two of them factual errors in the plan itself. Corrections are marked **[rev 2]** and the superseded claims are stated rather than quietly deleted, so nobody acts on a remembered version of this document.

## 1. Problem

Creative Studio is the largest body of work in the repository and it exists nowhere except one local clone. It is not in the plan of record, has no merge request, and no agreed acceptance definition. Its base is `sprint1`; the target is `sprint2`.

This document defines how it lands, what must be true before it becomes user-visible, and who — or what — actually reviews it.

**Clone topology.** `Projects/WePrompt` and `Documents/WePrompt` are separate clones, not worktrees of one repository. All landing work happens in **`/Users/lap16603/Documents/WePrompt`**, which holds the branch. This plan is reachable there as `refs/handoff/landing-plan`.

## 2. What is landing

Measured against the merge base (`54cfef7a7`), before reconstruction:

|                                               |                                 |
| --------------------------------------------- | ------------------------------- |
| Files changed                                 | 241                             |
| Source, excluding locales and `.d.ts`         | 24,463 lines                    |
| Tests                                         | 34,500 lines across 78 files    |
| Locale JSON                                   | 5,574 lines across 12 languages |
| Commits (non-merge)                           | 102                             |
| Real merge conflicts against `origin/sprint2` | 1                               |

**[rev 2] Test volume is not coverage.** Rev 1 argued from a 1.41:1 test-to-source line ratio that the pinned coverage floor was low-risk. That is a proxy, not a measurement — line counts say nothing about which branches execute. The floor (`statements 54, branches 50, functions 50, lines 55`) must be verified by running `bun run test:coverage` on the reconstructed branch. Note `just push` runs `test`, not `test:coverage`, so this is a deliberate manual step, not something the push gate will catch.

Commit scopes: 97 of 102 are Studio. The remaining five are two structural refactors that are not Studio work and are handled separately in §4.

### Functional state

Both generation paths are verified end to end against OpenRouter with real paid calls: image via `google/gemini-3-pro-image`, video via `bytedance/seedance-2.0-fast` through the `openrouter-video-v1` adapter. The live Electron e2e journey passes. UI fidelity passes 1 and 2 have landed.

## 3. Merge mechanics and preconditions

Run in this order. Steps 1–4 are preconditions for any merge; skipping step 3 silently degrades locale merges.

1. **Fresh fetch.** `git fetch origin` over VPN. Every measurement in this document comes from a cached ref (`origin/sprint2` = `343b725c4`, 2026-08-03). Do not use the divergent local `sprint2` in either clone — the one in `Projects` is a docs-only branch 42 commits behind, merge-base `5bb330c57`.
2. **Fresh merge simulation.** Re-run `git merge-tree --write-tree --name-only <studio-tip> origin/sprint2` and compare against the single expected conflict below.
3. **[rev 2] Register the locale merge driver.** `sprint2` declares `packages/desktop/src/renderer/services/i18n/locales/**/*.json merge=locale-json` in `.gitattributes`, but the driver is registered **per clone** by `just git-setup`. It is **not currently registered in the Documents clone** — verified: `git check-attr merge -- <a locale file>` returns `merge: unspecified`. Until sprint2's `justfile` is in the working tree and `just git-setup` has run, every locale merge falls back to line-based and will hand-conflict, exactly as it did through eight sprint-1 merges. Prove it with `git check-attr` and `git config --get merge.locale-json.driver` before merging MR 3.
4. **Reserve the archive.** Already done: `refs/archive/studio-integration-2026-08-05` = `20735e392`.

**The one expected conflict.** `renderer/services/i18n/i18n-keys.d.ts` is modify/delete — `sprint2` stopped tracking it (`dd86d861d`), Studio kept committing it. Accept the deletion and regenerate with `bun run i18n:types`. No landing branch may reintroduce the tracked file.

**A latent rename hazard.** Studio moved `services/autoUpdaterService.ts` → `services/update/` and `services/appOperations/` → `services/app-operations/`. `sprint2` still carries the old paths, including `tests/unit/process/services/autoUpdaterService.test.ts`. This merges cleanly today, but any `sprint2` change at an old path becomes a modify/delete conflict — the reason MR 0 is urgent (§9).

> Rev 1 described the updater move as a security fix. It is not: `1c6bdfded` is a pure path move with no behavioural change.

## 4. MR sequence

**[rev 2] Commits are reconstructed, not preserved.** Rev 1 promised both path-partitioned MRs (§4) and that "the 102 commits land as they are" (§7). Those are mutually exclusive: sampling the first 40 commits, 14 span two or more of the proposed partitions and four span all of contract, engine, UI and locale. MR 0's commits are also non-contiguous. Reconstruct exact-path, independently-compiling commits for each MR from the archived tip. The archive ref is the record of what was actually built; the MRs are the reviewable presentation of it.

**[rev 2] A default-off feature flag is required.** Rev 1 claimed reverting MR 4 would disable Studio. That is false as written: `StudioMediaModelsSection` is mounted unconditionally at `ModelModalContent/index.tsx:716`, so MR 3 alone exposes Studio's model configuration in Settings, and MR 2 starts services, registers IPC and protocol behaviour, and resumes jobs. One shared flag, default off, enforced independently in **both** the main and renderer processes — main gates service start, job resumption, IPC registration and the protocol handler; renderer gates the route, the navigation entry, and the Settings section. Only MR 4 flips it. Enforcement in one process only is not sufficient: a renderer-only flag leaves jobs resuming in the background, and a main-only flag leaves dead UI reachable.

Every MR must pass `bunx tsc --noEmit`, `bun run test`, and `node scripts/check-i18n.js` independently, so `git bisect` stays meaningful.

### MR 0 — structural refactors

The two non-Studio refactors: `group update and native modules` and `split model settings content`. 14 renamed paths, no behavioural change. Verified by rename detection (`git diff -M --stat` shows renames, not add/delete pairs) plus green gates.

### MR 1 — contract

`common/types/project/creativeStudioTypes.ts`, `common/adapter/ipcBridge.ts` bindings, `process/bridge/native/**` payload schemas, and their tests. Compiles standalone with no behaviour. Reviewers confirm every `fs/*`-style binding has a snake_case response mapper — a recurring silent-bug class, since AionCore DTOs are snake_case.

### MR 2 — engine (flag-gated)

`process/services/creative-studio/**`, `process/services/remote-media/**`, and their tests, with service start, job resumption, IPC registration and the privileged `weprompt-studio` scheme all behind the flag.

Security-critical surface: `remoteMediaDownloader.ts` (DNS pinning, host lock, private-IP blocklist, host-scoped `Authorization` re-evaluated per redirect hop); `mediaProtocol.ts` (path containment); `providerResolver.ts` and `creativeStudioService.ts` (the mirrored `silentOutput` gate and its single `openrouter-video-v1` exception); `jobManager.ts` (lifecycle, poll backoff, retry lineage, `submission_unknown` duplicate-charge protection); `store.ts` / `mediaStore.ts` (CAS/revision-guarded mutation).

### MR 3 — UI, settings, and locales (flag-gated, unrouted)

`renderer/pages/studio/**`, the settings media-models section, all 12 locale files, and unit tests. Excludes `Router.tsx` and `Sider/**`. The Settings section must be flag-gated here, not left mounted.

Counts in this section are approximate: the partitions come from path globs that overlap slightly at the MR 3 / MR 4 boundary, and the exact split is fixed when the MRs are cut.

### MR 4 — guardrails and activation

`Router.tsx`, `Sider/**`, the e2e specs, the §6 guardrail work, and the flag flip. Small relative to the rest, and the one reviewable change that makes Studio live. With the flag in place, reverting it fully disables the feature without unwinding the rest — the property that makes this sequence worth its overhead.

## 5. Review gate

**[rev 2] Review runs twice, not once.** Rev 1 put the whole gate before the first push, reasoning that MR boundaries gate nothing here because merge requests are merged within minutes and a Draft flag does not hold them. That reasoning stands, but it is insufficient: a review conducted before MR 0 cannot assess guardrails, pricing or activation code that does not exist yet. So:

- **Pre-push, on the archived tip:** the five lenses below, over the whole body of work.
- **Per MR, on the final diff:** a focused review of what that MR actually contains — mandatory for MR 4, which carries every guardrail.

| Lens                           | Scope                                                                                                                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Process boundary & contract | No DOM APIs in `process/`, no Node APIs in `renderer/`, cross-process traffic only through the IPC bridge, snake_case mappers on every binding                                      |
| 2. Security                    | Downloader SSRF defences, protocol-handler path containment, provider secret handling, the `silentOutput` gate and its single exception, **both halves of the feature flag**        |
| 3. State & concurrency         | CAS/revision guards, job lifecycle transitions, duplicate-charge protection, poll backoff, cancellation, semaphore accounting                                                       |
| 4. i18n & accessibility        | 12-locale completeness, **real i18next plural behaviour at counts 1, 2 and 5** (not key presence), no hardcoded user-facing strings, keyboard reachability, no raw interactive HTML |
| 5. Test-assertion strength     | Do the tests assert behaviour, or shape?                                                                                                                                            |

Lens 5 is required, not optional. Two vacuous-test classes were found in this branch on 2026-08-05 alone: assertions on `element.style.*` for styling that lives in a CSS module, which pass while the rendered pixel is wrong because jsdom applies no stylesheet; and `vi.spyOn(window.localStorage, …)`, which silently no-ops because `Storage` is a Proxy, so injected-failure tests pass without exercising the failure. Lens 5 samples the highest-value suites — job lifecycle, downloader, store guards — and reports which assertions would survive deliberately breaking the implementation.

### Verification checklist

Every item is explicit because each has been skipped or assumed at least once:

- [ ] `git fetch origin` over VPN; record the fresh `origin/sprint2` SHA
- [ ] `git merge-tree` simulation re-run; only the `i18n-keys.d.ts` conflict appears
- [ ] `just git-setup` run in this clone; `git check-attr merge` on a locale file returns `merge: locale-json`
- [ ] `bun run i18n:types` after accepting the `i18n-keys.d.ts` deletion
- [ ] `bunx tsc --noEmit` clean
- [ ] `node scripts/check-i18n.js` passes
- [ ] `bun run test` green
- [ ] `bun run test:coverage` meets the pinned floor — the gate, not the line ratio
- [ ] Live Studio e2e on the `sprint2` base: `AIONUI_E2E_TEST=1 AIONUI_E2E_STUDIO_FAKE=1 E2E_DEV=1 bunx playwright test tests/e2e/features/workspaces/creative-studio.e2e.ts`
- [ ] Visual acceptance (§7) captured and reviewed

## 6. Acceptance bar for visible-on-merge

Studio is user-visible the moment MR 4 merges, so these are merge blockers.

### 6.1 Concurrency — correct the premise, then layer

**[rev 2] Rev 1 was factually wrong here.** It claimed there was no cap on simultaneous jobs and that `Generate N ready scenes` fires N paid calls at once. Neither is true. `jobManager.ts:355` already holds global FIFO limits — `{ image: new FifoSemaphore(2), video: new FifoSemaphore(1) }` — and `GenerationReviewModal` is already a batch confirmation carrying an explicit charge notice. Rev 1 missed both because its search used `MAX_`/`concurren`/`limit` and the implementation uses semaphore vocabulary.

Keep the existing global limits. The per-project cap of 2 is layered on top, and needs explicit state accounting or it will either deadlock or leak capacity:

- `queued_local` does **not** consume capacity
- `submitting`, `queued_remote` and `running` **do**
- `submission_unknown` — potentially charged — counts **conservatively** until the user reconciles or abandons it
- download retries are **not** paid generation and do not count

Enforced in `jobManager` in the main process. The renderer may reflect the cap; it must never be what enforces it.

### 6.2 Audio — fix the claim, keep the capability

The catalog is correct: `providerResolver.ts:131` sets `silentOutput: !spec.supportsAudio`, every OpenRouter video spec declares `supportsAudio: true`, and the gate admits those routes through its documented `openrouter-video-v1` exception. The adapter then sends `generate_audio: true`.

The defect is the copy. `conversation.creativeStudio.review.audioOff` — _"Silent output; audio generation disabled"_ — renders **unconditionally** at `GenerationReviewModal.tsx:237`. A paid-action confirmation dialog asserts silence while the app requests and pays for audio.

**Decision: keep audio, fix the claim.** Gate the alert on `route.constraints.silentOutput` and state that audio is included when it is not. Disabling audio was considered and rejected: it would remove a capability just verified working in order to fix a copy bug. Consequence: the cost estimate in §6.3 must account for audio where a route generates it.

### 6.3 Cost — an estimate contract, not a number

Studio shows no cost today, and the copy fabricates the slot: `en-US` reads literally `"render": "Render · n/a"` and `"renderAnother": "Render another · n/a"`. That hardcoded `· n/a` presents an absent price as a broken one, in all 12 locales.

Provider, route and result types currently carry no currency, price unit, freshness, usage or actual charge. OpenRouter exposes video pricing SKUs through its video-model API, but discovery does not preserve that information. Before any amount is displayed, define:

- **"Estimated cost", never guaranteed cost** — the wording must never imply a commitment
- **Currency and decimal representation** — explicit, no float accumulation for money
- **Units** — per image, per second, by resolution, and whether audio is included
- **Quote freshness and expiry** — a stale quote must not be presented as current
- **Mixed batches** — wording when some scenes have a price and others do not
- **Identity rules** — price metadata is excluded from stable route identity but included in the catalog-version calculation, so a price change invalidates a cached catalog without invalidating a user's selected route

Until a trustworthy estimate exists, **omit the amount entirely** — remove `· n/a` from all 12 locales. The concurrency cap and the existing batch confirmation deliver the safety property on their own, so this work does not gate on pricing being available.

Out of scope: any spend ledger, persisted spend history, per-project or global totals, or a user-configurable budget ceiling.

### 6.4 Also blocking

- Both halves of the feature flag verified: main-process gating of services, jobs, IPC and protocol; renderer gating of route, nav entry and Settings section
- The `i18n-keys.d.ts` deletion honoured and regenerated, never reintroduced
- Every confirmed review finding resolved, or accepted in writing in the relevant MR description with a reason
- Live Electron e2e passing on the `sprint2` base, not only on `sprint1`
- `Attach a brief doc` remains disabled with an explanatory tooltip, or is removed — it must not look actionable while doing nothing

## 7. Visual acceptance

**[rev 2] Rev 1 had no visual gate**, which is indefensible for work whose fidelity gap is what triggered this round. Behaviour tests prove Studio functions; they cannot prove it resembles the approved prototype.

**Blocking — video poster frames.** OpenRouter returns a video with no poster, so `ShotCard.tsx:75` renders "Video poster unavailable" for a render the user paid for. A successful paid result must not read as a failure.

**[rev 3] The method is settled and needs no new dependency.** The whole poster pipeline already exists: `jobManager.ts:637` filters provider `outputs` for `role === 'poster'`, `mediaStore` persists it into the `thumbnails` collection under `validateProviderPosterLineage`, and the renderer's `isCanonicalStudioPosterAsset` validates and displays it. The only reason none of it runs is that OpenRouter never returns a poster output, so `posters.length !== 1` short-circuits the branch. There is no `thumbnails` directory on disk for any project — confirmed.

Verified 2026-08-05 against the real paid render (1280×720, 5.085s): the renderer loads the video from `weprompt-studio://`, seeks, draws to a `<canvas>`, and `toDataURL('image/png')` returns 883,030 bytes **with no `SecurityError`** — the privileged scheme does not taint the canvas. So Studio can produce the frame locally and feed the existing ingestion path as though the provider had returned it.

**Use the shared managed-video seam** defined in `creative-studio-cut-model-design.md` §5.2 rather than hand-rolling a `<video>` per capture site — frame-accurate trim needs the same load, metadata, seek and capture primitives, and two implementations would diverge.

Three constraints this method carries, none of them blocking:

- Capture happens in the **renderer**, but ingestion is main-process and guarded by `validateProviderPosterLineage`, which exists to validate _provider_ posters. Renderer-supplied bytes inverts that trust direction and needs its own equally-strict path — **do not loosen the provider lineage check to accommodate it.**
- It needs a live renderer that can load and seek, so a poster appears when the UI first shows the shot rather than at render time. State the expectation in the UI rather than implying instant availability.
- It decoded this H.264 MP4; another provider or codec may not. The designed "video ready" fallback stays required for that case.

Bundling ffmpeg to solve posters was considered and rejected — see `docs/design/creative-studio-video-capability-spike.md` §5. Posters do not need it, and packaging changes belong in their own lane, which currently holds a P0 and a P1 defect.

**Blocking — structural parity.** Screenshot acceptance for Brief, Write, Produce, Review and the library, at named viewport sizes, in both themes. The blocking assertion is structural: the expected elements are present, in the expected hierarchy, with the expected type roles and tokens.

**Advisory — pixel parity.** Captured and reviewed, but exact-pixel diffs do not fail the gate. Exact-match baselines across five screens and multiple viewports churn on every legitimate change, and a gate that cries wolf gets disabled inside a month. Diffs are surfaced for human judgement instead.

## 8. Non-goals

- **Fidelity pass 3** (Produce/Review polish beyond §7's blocking items) lands as ordinary follow-up
- **No project-name migration** — projects created before the shape-naming fix keep names like `3 shots · 15s`
- **No spend ledger** (§6.3)
- **No audio, brand kits, batch export, or sharing** — candidate next-phase features, not part of landing
- Rev 1's "no history rewrite" non-goal is **withdrawn**; see §4

## 9. Parallel execution with sprint-2 work

This epic is **EPIC-005** and runs in parallel with the sprint-2 backlog.

Parallel is safe because Studio never touches the one serial resource in this repository: it adds **no database migrations and no SQL**, persisting as JSON with atomic temp-file plus rename. It cannot contend with BUG-013's upgrade work or EPIC-003 G0's migration-number reservations. MRs 1–3 are almost entirely new paths no other stream edits.

Parallel means **parallel merging, not parallel priority**. Studio is P2; BUG-013 is P0.

| Shared path                           | Studio MR          | Collides with                     | Nature                                  |
| ------------------------------------- | ------------------ | --------------------------------- | --------------------------------------- |
| `appOperations/contextCompactTask.ts` | MR 0 (renames dir) | context/compaction work, EPIC-001 | modify/delete                           |
| `services/autoUpdaterService.ts`      | MR 0 (renames)     | BUG-013 packaging                 | modify/delete                           |
| `ModelModalContent`                   | MR 0 (splits)      | EPIC-003 R2, BUG-018              | structural                              |
| `Sider/**`                            | MR 4               | BUG-019                           | direct overlap                          |
| `ipcBridge.ts`                        | MR 1               | BUG-015                           | additive; known hotspot                 |
| locale JSON ×12                       | MR 3               | every stream                      | mitigated **only if** §3 step 3 has run |

**MR 0 is urgent rather than merely first.** Renames are the only change here that turns another stream's ordinary edit into a conflict, and two of the three renamed areas are ones sprint-2 work is likely to touch: `contextCompactTask.ts` sits inside a renamed directory, and EPIC-003 R2 explicitly instructs reuse of the model selectors MR 0 splits.

MR 4 and BUG-019 both change the sidebar; whoever lands second rebases. Flag it to BUG-019's owner rather than discovering it at merge time.

## 10. Risks

| Risk                                              | Mitigation                                                                                                                                      |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Reconstruction drops work                         | Archive ref is immutable; verify by comparing the reconstructed tree to `refs/archive/studio-integration-2026-08-05` — trees must match exactly |
| `sprint2` touches a pre-rename path before MR 0   | Land MR 0 first, immediately                                                                                                                    |
| Locale merges hand-conflict                       | §3 step 3, proven with `git check-attr`                                                                                                         |
| A 65k-line branch merges without real review      | Pre-push lenses plus per-MR final-diff review (§5)                                                                                              |
| Vacuous tests give false confidence               | Lens 5 probes assertion strength; coverage measured by the gate, not inferred from line counts                                                  |
| Flag enforced in one process only                 | Lens 2 explicitly checks both halves                                                                                                            |
| Users charged for audio they were told was absent | §6.2 blocks MR 4                                                                                                                                |
| Paid render looks broken                          | §7 poster frames block MR 4                                                                                                                     |

## 11. Decisions

1. **Concurrency:** keep the existing global FIFO limits (2 image, 1 video); layer a per-project cap of **2** with the state accounting in §6.1, enforced in `jobManager`.
2. **Batch confirmation:** already exists via `GenerationReviewModal` with a charge notice; extend it to carry estimated cost when available. Confirm every batch of two or more.
3. **This document is tracked and committed**, matching its siblings in `docs/design/`.
4. **[rev 2] Commits are reconstructed** into reviewable MRs, from an immutable archive ref.
5. **[rev 2] Structural prototype parity and video poster frames are blocking**; pixel-exact parity is advisory.
6. **[rev 2] Audio is kept**; the false "silent output" claim is fixed instead.

**Open:** whether OpenRouter's image routes expose pricing comparable to the video-model API. The plan is built so the answer does not change its shape — with no price source, the amount is simply never shown.
