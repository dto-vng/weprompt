# R4 — Render, failure, and export states

## Outcome

R4 is implemented on `codex/studio-r4-render-states` in the commit titled
`feat(studio): add render and export states`.

- The render engine now reports monotonic percentage plus one-based clip index and
  total through the existing main-to-renderer IPC path. Invalid or absent clip
  metadata is normalized at the renderer boundary to the existing percentage-only
  presentation.
- The footer owns one stable two-column state slot. The primary control always
  occupies the first column while its ready, running, busy, or failure content is
  swapped in place.
- An externally observed running render is shown as a disabled busy control with a
  visible, `aria-describedby` reason before it can be clicked.
- The three specified failures each expose exactly one recovery:

  | Failure                | User-facing identity                                | Only recovery    |
  | ---------------------- | --------------------------------------------------- | ---------------- |
  | `ffmpeg_unavailable`   | FFmpeg is unavailable                               | Install FFmpeg   |
  | `render_failed`        | Clip N of M failed, when clip metadata is available | Try render again |
  | `no_renderable_scenes` | Missing shot numbers, never scene or asset IDs      | Go to Produce    |

- The export review queries the newest verified project render before the native
  folder picker can open. It shows `cut.mp4`, its persisted render timestamp, and a
  stale warning when the render predates `project.updatedAt`.
- BUG-031 is fixed by restoring the pre-R3 selected-take, missing-slate, running,
  and failed derivation in the active `CutTimeline`. Each state has text available
  without relying on color.

## SceneTimeline decision

I chose the brief's **carry the four-state logic into `CutTimeline`** option.
`CutTimeline` is the production timeline after R3, so it now owns the state labels
and accessibility descriptions. I did not retire `SceneTimeline.tsx`: it remains an
unconsumed, exported compatibility component with its existing keyboard,
duration, empty-state, and accessible-copy tests intact. Keeping it avoided
silently deleting protections unrelated to the R4 production path.

## Process and storage boundaries

- Main-process FFmpeg work remains in `renderService.ts`; no renderer or DOM API
  was introduced there.
- Renderer code receives only typed progress events and a typed latest-render
  result. It receives `cut.mp4` and `renderedAt`, not a managed-storage path.
- `creative-studio.get-latest-render` is registered through the typed bridge and
  has a native payload allowlist/schema entry. The media store verifies render
  sidecars and bytes before reporting the newest render.
- The real FFmpeg integration uses `libx264`, stays in process, and does not bind a
  server or require VideoToolbox.

## Test-first evidence

Before production implementation, the focused red runs were:

- Review/footer and BUG-031 DOM tests: 6 failed / 30 passed.
- Render runner clip-progress relay: 1 failed / 36 skipped.
- Export pre-picker metadata: 1 failed / 8 skipped.
- Media-store latest-render lookup: 1 failed / 52 skipped.

After implementation, the final R4 bundle passes 460 / 460 across eight files.
The native payload tests specific to `get-latest-render` also pass 2 / 2.

## Revert proof

I committed the implementation, reversed only the commit's `packages/**`
production changes, kept all tests, and ran the same eight-file R4 bundle.

- Under production revert: **17 failed / 443 passed**.
- After restoring production: **460 passed / 0 failed**.

All 17 revert failures were R4-specific:

- 8 footer, failure-action, BUG-031, stable-slot, and light/dark token failures.
- 2 render progress integration failures, including the real two-clip FFmpeg path.
- 3 typed bridge registration/feature-guard failures.
- 1 export pre-picker timestamp/staleness failure.
- 1 media-store newest verified render failure.
- 1 service timestamp projection failure.
- 1 all-12-locales R4 key-contract failure.

Every behavior that required new R4 production code has a revert-failing test.
One preservation rule is intentionally not revert-discriminating: the focused
`degrades a legacy running event with no clip fields to percentage only` test also
passes against the pre-R4 production code because percentage-only display was the
old behavior. It still protects the upgrade boundary, but the literal answer is
that this one requirement does not add a failure to the production-revert count.
Baseline constraints such as Arco-only controls and directory limits likewise do
not become failures when R4 is reverted; they were checked statically.

## Required verification

- `bun run lint:fix`: exit 0, 1,180 existing warnings, 0 errors. The command also
  auto-edited unrelated presentation-template files; those out-of-scope edits were
  reversed. They caused TypeScript errors and are not in this commit.
- `bun run format`: exit 0; 2,397 files inspected by Oxfmt in the final run.
- `bunx tsc --noEmit`: exit 0 after the unrelated lint edits were removed.
- `bun run i18n:types`: exit 0; generated key types current.
- `node scripts/check-i18n.js`: exit 0 across all 12 configured locales. The
  validator retained its existing warnings about 15 reference-language plural
  variants in zh-CN, ja-JP, zh-TW, and ko-KR. The R4-specific locale test passes
  every new key in every locale.
- R4 unit/service bundle: 7 files, 423 tests passed after adding the semantic-token
  guard. Together with the render integration file: 460 / 460.
- Creative Studio render integration: 37 / 37 passed, including real FFmpeg and
  ffprobe coverage with `libx264`.
- Complete unit suite: 4 failed / 7,535 passed / 15 skipped in the final run. The
  four failures are listed below.
- Complete integration suite: 1 failed / 54 passed / 4 skipped. The only failure
  was `pptxArtifact.integration.test.ts` because OfficeCLI preview start returned
  `OFFICECLI_FAILED` in this sandbox. The Creative Studio render integration file
  passed in that run.

Complete-unit failures were outside R4:

1. `releasePackagingConfig.test.ts`: installed `electron-updater` is 9.5.1; the
   test expects 9.7.0.
2. `buildWithBuilder.test.ts`: this worktree has no `node_modules/.bun` directory.
3. `presentationRunPolicy.test.ts`: its temporary type fixture cannot resolve
   `zod` in this installation layout.
4. `nativePayloadSchemas.test.ts`: R3's existing
   `creative-studio.place-cut-scenes` provider is still missing from the native
   allowlist/schema. R4's `get-latest-render` provider is present and passes its
   focused payload tests. I did not absorb the R3 provider gap into this slice.

## Behavior and assertion disclosures

- No R4 behavior or specified failure state was dropped. Cancellation remains a
  status with the normal render action; it was not presented as a fourth failure.
- Export is deliberately narrower while latest-render metadata is unresolved: the
  Confirm control stays disabled, so the folder picker cannot open first. If the
  lookup fails, the dialog remains open with a typed visible error and export does
  not proceed without the required pre-picker evidence.
- The old assertion that all three takeless scenes display the generic Slate label
  changed from 3 to 1. The running and failed scenes now have their restored labels.
  Its replacement guarantee lives in
  `labels selected, slate, running, and failed cut states without relying on colour`.
- The generic failure table no longer carries its former `busy` and
  `no_renderable_scenes` rows. Their guarantees moved to the stronger named tests
  `states the busy reason visibly and accessibly before the disabled action is hit`
  and `names missing shots and offers only the Produce recovery for no renderable scenes`.
- The six existing export-flow tests now wait for the metadata preflight before
  activating Confirm. Their original chooser, cancellation, result, and error
  assertions remain.
- No existing assertion was deleted without a named replacement. The pre-existing
  `SceneTimeline` assertions were retained unchanged.
- R3's `_readiness` parameter was renamed back to `readiness` and is used again.
  This slice introduced no underscore-prefixed unused parameter and no related
  user-visible loss.
- No new files or directories were added under the Studio component tree, so the
  direct-child limit did not increase.

## Source-plan discrepancy

`docs/design/creative-studio-v11-cut-editor-plan.md` is absent from this worktree
and from the reachable repository objects inspected here. `TASKS.md` also has no
BUG-031 entry. Per the request, I treated the supplied R4 brief as authority and
used `f7b6544c4` for the historical four-state Review derivation and deleted-test
reference.
