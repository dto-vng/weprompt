# Creative Studio — landing plan

**Status:** agreed (`TASKS.md` EPIC-005) · **Date:** 2026-08-05 · **Target branch:** `sprint2`
**Source:** `codex/studio-integration` (local, unpushed)

## 1. Problem

Creative Studio is the largest body of work in the repository and it exists nowhere except one local worktree. It is not in `TASKS.md`, has no epic entry, no merge request, and no agreed acceptance definition. Its base is `sprint1`; the target is `sprint2`.

This document defines how it lands, what must be true before it becomes user-visible, and who — or what — actually reviews it.

## 2. What is landing

Measured against the merge base (`54cfef7a7`):

| | |
| --- | --- |
| Files changed | 241 |
| Source, excluding locales and `.d.ts` | 24,463 lines |
| Tests | 34,500 lines across 78 files |
| Locale JSON | 5,574 lines across 12 languages |
| Commits (non-merge) | 102 |
| Real merge conflicts against `origin/sprint2` | **1** |

Test-to-source is 1.41:1. The coverage floor pinned on `sprint2` (statements 54, branches 50, functions 50, lines 55) is therefore low-risk, and `just push` runs `test`, not `test:coverage` — coverage is a manual guard, not a gate.

Commit scopes: 97 of 102 are Studio (`studio`, `creative-studio`, `remote-media`). The remaining five are two structural refactors that are **not** Studio work and are treated separately in §4.

### Functional state

Both generation paths are verified working end-to-end against OpenRouter with real paid calls: image via `google/gemini-3-pro-image`, video via `bytedance/seedance-2.0-fast` through a dedicated `openrouter-video-v1` adapter. The live Electron e2e journey passes. UI fidelity passes 1 and 2 (typography, slate placeholders, library structure) have landed on the branch.

## 3. Merge mechanics

**The one conflict.** `packages/desktop/src/renderer/services/i18n/i18n-keys.d.ts` is modify/delete: `sprint2` stopped tracking it (`dd86d861d`), Studio kept committing it. Resolution is to accept the deletion and regenerate with `bun run i18n:types`. No Studio branch may reintroduce the tracked file.

**Locale merges.** `sprint2` added a key-level locale JSON merge driver (`6f914b969`). Confirm it is active locally (`git config --get merge.locale-json.driver`) before merging MR 3, which touches all 12 locale files.

**A latent rename hazard.** Studio moved `services/autoUpdaterService.ts` → `services/update/`, and `services/appOperations/` → `services/app-operations/`. `sprint2` still carries the old paths, including `tests/unit/process/services/autoUpdaterService.test.ts`. Today this merges cleanly, but any `sprint2` change to a file at an old path becomes a modify/delete conflict. This is the single strongest argument for landing MR 0 first and immediately.

> Note for anyone who read an earlier characterisation of this as an "updater security fix": it is not. `1c6bdfded` is a pure path move with no behavioural change.

## 4. MR sequence

Ordered so that **no user-reachable surface exists until the final MR**. Every MR must pass `bunx tsc --noEmit`, `bun run test`, and `node scripts/check-i18n.js` independently, so `git bisect` remains meaningful.

### MR 0 — structural refactors

`1c6bdfded refactor(process): group update and native modules`
`c62a2a0e4 refactor(settings): split model settings content`

14 renamed paths, no behavioural change. Lands alone and first. Verified by rename detection (`git diff -M --stat` should show renames, not add/delete pairs) plus green gates. Collapses the conflict surface described in §3 before it can bite.

### MR 1 — contract

`common/types/project/creativeStudioTypes.ts`, `common/adapter/ipcBridge.ts` bindings, `process/bridge/native/**` payload schemas, and their tests. **21 files, +3,170.**

Compiles standalone with no behaviour. This is the seam every later MR depends on, so it carries the highest review value per line. Reviewers should confirm every `fs/*`-style binding has a snake_case response mapper — a recurring silent-bug class in this codebase, since AionCore DTOs are snake_case and the renderer expects camelCase.

### MR 2 — engine

`process/services/creative-studio/**`, `process/services/remote-media/**`, and their tests. **49 files, +26,119.**

Includes main-process registration of the privileged `weprompt-studio` scheme from `packages/desktop/src/index.ts`. Registering the scheme without any UI is inert — nothing requests those URLs until MR 3 ships and MR 4 routes it.

The security-critical surface lives here:

- `remoteMediaDownloader.ts` — DNS pinning, host lock, private-IP blocklist, host-scoped `Authorization` re-evaluated per redirect hop
- `mediaProtocol.ts` — the protocol handler's path containment
- `providerResolver.ts` and `creativeStudioService.ts` — the mirrored `silentOutput` gate, whose only sanctioned exception is `adapterId === 'openrouter-video-v1'`
- `jobManager.ts` — job lifecycle, poll backoff, retry lineage, and duplicate-charge protection via `submission_unknown`
- `store.ts` / `mediaStore.ts` — CAS/revision-guarded mutation

### MR 3 — UI, settings, and locales (not routed)

`renderer/pages/studio/**`, the settings media-models section, all 12 locale files, and unit tests. **~130 files, ~+34,900.**

Explicitly excludes `Router.tsx` and `Sider/**`, which move to MR 4. Counts in this section are approximate: they come from path globs that overlap slightly at the MR 3 / MR 4 boundary, and the exact partition is fixed when the MRs are cut.

Nothing in this MR is reachable by a user: no route, no navigation entry. Large but low-risk by construction.

### MR 4 — activation

`renderer/components/layout/Router.tsx` (the `/studio` route and its `DesktopStudioRoute` desktop guard), `Sider/index.tsx` + `SiderNav/**`, the four e2e specs, and the spend-safety work from §6. **Small.**

This is the reviewable commit that says "Creative Studio is now live", and it ships its guardrails in the same change, so visibility and safety are atomic. Reverting MR 4 disables the feature without unwinding 65k lines — the property that makes this sequence worth the overhead.

## 5. The review gate

MR boundaries will not gate anything here: merge requests in this repository are merged within minutes and a Draft flag does not hold them. Review therefore happens **before MR 0 is pushed**, using Codex agents with **distinct lenses** rather than several generic reviewers. Findings are adversarially verified before being acted on.

| Lens | Scope |
| --- | --- |
| 1. Process boundary & contract | No DOM APIs in `process/`, no Node APIs in `renderer/`, all cross-process traffic through the IPC bridge, snake_case mappers present on every binding |
| 2. Security | Downloader SSRF defences, protocol-handler path containment, provider secret handling, the `silentOutput` gate and its single exception |
| 3. State & concurrency | CAS/revision guards, job lifecycle transitions, duplicate-charge protection, poll backoff, cancellation |
| 4. i18n & accessibility | 12-locale completeness, ru/uk plural forms, no hardcoded user-facing strings, keyboard reachability, no raw interactive HTML |
| 5. **Test quality** | Do the 34,500 lines of tests assert *behaviour*, or merely *shape*? |

Lens 5 is not padding. Two vacuous-test classes were found in this branch on 2026-08-05 alone:

- assertions on `element.style.*` for styling that lives in a CSS module — jsdom applies no stylesheet, so the test passes while the rendered pixel is wrong
- `vi.spyOn(window.localStorage, …)`, which silently no-ops because `Storage` is a Proxy, making injected-failure tests pass without exercising the failure

At a 1.41:1 test-to-source ratio, tests that do not bite are the most expensive artefact in this branch. Lens 5 samples the highest-value suites (job lifecycle, downloader, store guards) and reports which assertions would survive deliberately breaking the implementation.

## 6. Acceptance bar for visible-on-merge

Studio is user-visible the moment MR 4 merges, so the following are merge blockers, not follow-ups.

### 6.1 Spend safety — "honest and bounded"

Studio makes real paid provider calls today with **no cost handling anywhere**: no price in the service, no price in the types, no estimate in the generation UI, and no cap on simultaneous jobs. `Generate N ready scenes` fires N paid calls at once.

Worse, the copy fabricates a cost slot. `en-US` reads literally:

```
"render": "Render · n/a"
"renderAnother": "Render another · n/a"
```

That is a hardcoded `· n/a` in the label — it reads as a broken price field rather than an absent one.

Required, in scope:

1. **Honest cost.** Show a real per-render cost when the provider reports a price. When it does not, show no cost fragment at all — remove the hardcoded `· n/a` from all 12 locales. If a price source proves unavailable (see the spike below), every render is priceless and the label simply omits cost.
2. **Concurrency cap.** A bounded number of in-flight generation jobs, enforced in `jobManager` (main process), not in the renderer. The renderer may reflect the cap; it must not be the thing that enforces it.
3. **Batch confirmation.** Generating more than one scene requires an explicit confirmation naming the number of renders — and the total cost when known.

Explicitly **out** of scope: any spend ledger, persisted spend history, per-project or global totals, or user-configurable budget ceiling. Those remain a later decision.

This is the only new *feature* code in the plan — everything else is landing mechanics — so it gets its own implementation plan once the spike below resolves. It is scoped here because it is a release boundary, not because it is designed here.

**Spike required before implementation.** OpenRouter exposes pricing on `/api/v1/models` for chat models; whether `/api/v1/videos/models` and the image routes expose comparable pricing is unverified. Resolve this first. If pricing is unavailable for the media routes, items 2 and 3 still deliver the safety property on their own and item 1 degrades to "omit cost everywhere" — the plan does not depend on the spike's outcome.

### 6.2 Also blocking

- The `i18n-keys.d.ts` deletion is honoured and regenerated, not reintroduced
- All five review lenses have run and every confirmed finding is either resolved, or accepted in writing in the relevant MR description with a reason
- The live Electron e2e journey passes on the `sprint2` base, not only on `sprint1`
- `Attach a brief doc` remains disabled with an explanatory tooltip, or is removed — it must not look actionable while doing nothing

## 7. Non-goals

- **Fidelity pass 3** (Produce/Review polish: video poster frames, engine-bar and activity-row refinement) lands after MR 4 as ordinary follow-up
- **No project-name migration.** Projects created before the shape-naming fix keep names like `3 shots · 15s`; only new projects are named correctly
- **No history rewrite.** The 102 commits land as they are. The branch already survived one full authorship rewrite, it is gated green, and rewriting for narrative gains nothing that the MR split does not already provide
- **No spend ledger** (§6.1)
- **No audio, brand kits, batch export, or sharing** — these are candidate next-phase features, not part of landing

## 8. Risks

| Risk | Mitigation |
| --- | --- |
| `sprint2` touches a pre-rename path before MR 0 lands | Land MR 0 first, immediately, as its own MR |
| A 65k-line branch merges without real review | Review gate runs *before* the first push (§5), not at MR boundaries |
| Vacuous tests give false confidence | Lens 5 explicitly probes assertion strength |
| Unbounded spend reaches users | §6.1 is a merge blocker, and the cap is enforced in the main process |
| `origin` is unreachable (VNG GitLab needs VPN) | Cached refs are for measurement only; re-verify the base and re-run the merge dry-run against a freshly fetched `origin/sprint2` before pushing MR 0 |
| Intermediate MRs leave dead code in `sprint2` | Acceptable and bounded: MRs 1–3 are unreachable, and MR 4 follows immediately |

## 9. Parallel execution with sprint-2 work

This epic is **EPIC-005** in `TASKS.md` and runs **in parallel** with the sprint-2 backlog.

Parallel is safe because Studio never touches the one serial resource in this repository: it adds **no database migrations and no SQL**, persisting as JSON with atomic temp-file plus rename. It therefore cannot contend with BUG-013's upgrade work or EPIC-003 G0's migration-number reservations. MRs 1–3 are almost entirely new paths no other stream edits.

Parallel means **parallel merging, not parallel priority**. Studio is P2; BUG-013 is P0. Landing effort must not take hands or review attention from the P0/P1 work.

The collision surface is small and known in advance:

| Shared path | Studio MR | Collides with | Nature |
| --- | --- | --- | --- |
| `appOperations/contextCompactTask.ts` | MR 0 (renames dir) | context/compaction work, EPIC-001 | modify/delete |
| `services/autoUpdaterService.ts` | MR 0 (renames) | BUG-013 packaging | modify/delete |
| `ModelModalContent` | MR 0 (splits) | EPIC-003 R2, BUG-018 | structural |
| `Sider/**` | MR 4 | BUG-019 | direct overlap |
| `ipcBridge.ts` | MR 1 | BUG-015 | additive; known hotspot |
| locale JSON ×12 | MR 3 | every stream | mitigated by the key-level merge driver |

**This is why MR 0 is urgent rather than merely first.** Renames are the only change in this plan that turns another stream's ordinary edit into a conflict, and two of the three renamed areas are ones sprint-2 work is likely to touch: `contextCompactTask.ts` sits inside the renamed directory, and EPIC-003 R2 explicitly instructs reuse of the model-selector components MR 0 splits.

MR 4 and BUG-019 both change the sidebar; whoever lands second rebases. Flag it to BUG-019's owner rather than discovering it at merge time.

## 10. Decisions

1. **Concurrency cap: 2 in-flight generation jobs per project**, enforced in `jobManager`. Revisit once real usage exists.
2. **Confirm every batch of 2 or more scenes.** Each render is a paid provider call, so there is no batch size cheap enough to fire unconfirmed.
3. **This document is tracked and committed**, matching its siblings in `docs/design/`, which are each committed as their own `docs(...)` commit.

Remaining unknown, tracked in §6.1 rather than here: whether the OpenRouter image and video endpoints expose pricing. The plan is built so the answer does not change its shape.
