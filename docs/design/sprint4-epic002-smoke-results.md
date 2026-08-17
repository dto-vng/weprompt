# EPIC-002 creation smoke — results

Live evidence for the one open gate on EPIC-002 Epic A: the create → review card → hash-bound confirm
→ gallery path has been merged since 2026-08-08 (`!87`, `!90`, `!94`, plus `!84` and `!99`) and has
never been executed end to end.

Plan: [sprint4-stream-b-epic002-smoke-plan.md](sprint4-stream-b-epic002-smoke-plan.md)

## Environment

| Fact           | Value                                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date           | 2026-08-17                                                                                                                                        |
| Branch / head  | `sprint4` @ `916524490`                                                                                                                           |
| Working tree   | clean at launch                                                                                                                                   |
| Worktree       | `/Users/lap16603/Projects/WePrompt/.worktrees/sprint4`                                                                                            |
| Dependencies   | `bun install` — 3172 packages, exit 0 (the worktree was fresh; `node_modules` was empty)                                                          |
| Backend binary | `resources/bundled-aioncore/darwin-arm64/aioncore` — **0.1.53** (from the main checkout; the path is gitignored so it is absent in this worktree) |
| Backend port   | `AIONCORE_LISTENING` → `127.0.0.1:59263`                                                                                                          |
| CDP port       | 9230                                                                                                                                              |
| Renderer       | `did-finish-load` at 21:43:30                                                                                                                     |
| Database       | `/Users/lap16603/.aionui-dev/aionui-backend.db` — initialized with no migration failure                                                           |
| Dev log        | `scratchpad/sprint4-dev.log` (session-local)                                                                                                      |

`~/.cargo/bin/aioncore` is 0.1.44 and would fail the migration check against this DB; the bundled 0.1.53
was prepended to PATH exactly to avoid that.

## Baseline gallery

`~/Library/Application Support/Forge-Dev/presentation-templates` — **12 entries**, all builtin packs,
recorded to `/tmp/gallery-before.txt`:

```text
business-report      business-review    connected-ops    decision-memo
editorial-field-report  market-trends-report  monthly-steerco  operations-guide
project-kickoff      proposal-sow       simple-dark      simple-light
```

Every install claim below is measured by `diff` against this listing, so "it appeared" cannot be
confused with "it was already there".

## Results

| #   | Case                                   | Backend              | Language                | Outcome                  | Evidence                                                                                |
| --- | -------------------------------------- | -------------------- | ----------------------- | ------------------------ | --------------------------------------------------------------------------------------- |
| 1   | Creation happy path                    | aionrs (`kimi-k2.6`) | English                 | **PASS** (after 5 fixes) | conversation `f90e8348`; see "Case 1 — end to end" below                                |
| 2   | Creation happy path                    | aionrs               | Vietnamese (accented)   | **PASS**                 | conv `1ecc4cf0`; installed `html-report-template-specification-navy-cream`              |
| 3   | Intent match                           | aionrs               | Vietnamese (unaccented) | **PASS**                 | conv `0e915f21`; 47 chars, directive appended via BUG-041's unaccented branch           |
| 4   | Deliberate non-trigger (`mau nay dep`) | aionrs               | Vietnamese              | **PASS**                 | conv `ed98fc76`; `directiveAppended: false` — no false positive                         |
| 5   | Creation happy path                    | ACP (OpenCode)       | English                 | **PASS**                 | conv `22d07ba8`, `type: acp`; installed `minimal-editorial-html-template-specification` |
| 6   | Creation happy path                    | ACP (OpenCode)       | Vietnamese              | **PASS**                 | conv `96d2a67c`, `type: acp`; installed `warm-gray-minimalist-template-specification`   |
| 7   | Hash-binding refusal after tamper      | aionrs               | —                       | **PASS**                 | stale digest → `CANDIDATE_CHANGED`, gallery byte-identical                              |

Outcome vocabulary: **pass**, **fail**, **blocked**. Blocked is a valid outcome; silent omission is
not.

**All seven cases pass, and the gallery accounting is exact.** The final listing holds **16** entries
against a **12**-entry baseline — precisely four installs, one per creation case (1, 2, 5, 6), with
nothing added by the intent-only case (3), the deliberate non-trigger (4), or the tamper refusal (7):

```text
5a6  > html-report-template-specification-navy-cream        (case 2, aionrs / Vietnamese)
6a8  > minimal-editorial-html-template-specification         (case 5, ACP / English)
10a13 > reusable-html-template-specification-clean-repor     (case 1, aionrs / English)
12a16 > warm-gray-minimalist-template-specification          (case 6, ACP / Vietnamese)
```

That accounting is the point of measuring by `diff` rather than by eye: four creation cases produced
exactly four packs, and the three cases that must install nothing installed nothing.

## Case 1 — end to end, after five fixes

Verified 2026-08-18 on a build carrying BUG-046, BUG-049 and BUG-050 (`177b35f40`), with the bundle
timestamp confirmed newer than every fixed source file before the walk. **This is the first time the
path has ever completed.**

| Step                               | Evidence                                                                                                                                 |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Intent fires on the real send path | the persisted user message carries the appended `Template creation instructions:` directive                                              |
| Assistant obeys the directive      | wrote `THEME.md` (12,517 B) into the conversation workspace; emitted exactly one marker, final line, outside any fence, nothing after it |
| Parser + card                      | `data-testid="template-review-card"` mounted; the raw marker is stripped from the visible body                                           |
| Card reaches the actionable state  | renders the theme name, the retention disclosure, and an **Install in Template Gallery** button                                          |
| One click installs                 | card advances to `Installed in Template Gallery` — the exact en-US string for `messages.templateReview.installed`                        |
| Gallery gains exactly one entry    | `diff` against the 12-entry baseline: `10a11 > reusable-html-template-specification-clean-repor`                                         |
| The installed pack is real         | `THEME.md` 12,517 B (matching the source byte count), `preview.svg` 1,165 B, `template.json` 385 B                                       |

**Five separate defects stood between "merged" and "works":** BUG-046 (three UUID layers), BUG-049
(`team.user_id` absent from the wire), BUG-050 (lexical containment vs a symlinked data directory).
None was reachable from the test suite; every one needed the running app.

## Findings

### F1 — P1: the hash-bound template install path is unreachable in production

**The review card hangs in "Reviewing the theme…" forever. The user can never install a template.**
EPIC-002 Epic A's user-facing outcome does not work at all, on any real conversation.

Observed live on `sprint4` @ `916524490`, conversation `f90e8348`, reproduced on a fresh mount after a
full renderer reload.

**Root cause chain, each link evidenced:**

1. `payloadSchemas.ts:538` requires `conversation_id: presentationUuidSchema` for
   `presentation-templates.describe-spec`, and `:541` does the same for `import-spec-bound`.
   `presentationUuidSchema` (`:170-172`) is a strict RFC-4122 UUID regex.
2. Real WePrompt conversation ids are **8-hex short ids** — `f90e8348`, `f9e26b84`, `fb5ff0cc`,
   `558497e0` (observed across 35 conversations via `GET /api/conversations`). They can never match a
   UUID. The sibling channel `presentation-templates.scratch.allocate` (`:548-550`) correctly uses
   `identifierSchema` for the same field.
3. `parseNativeBridgePayload` therefore throws inside the `ipcMain.handle` for the adapter bridge
   (`main.ts:91`, handler at `:168-173`).
4. **`bridge.invoke` has no rejection path at all** (`common/platform/bridge.ts:186-197`): its Promise
   executor takes only `resolve`, and `emit` is fire-and-forget with no `catch`. A main-side throw can
   therefore never settle the promise. Contrast `invokeWithTimeout` (`:199-227`), used by
   `buildRendererQuery`, which has a timeout, a reject, and a try/catch.
5. `TemplateReviewCard`'s effect (`TemplateMessageCard.tsx:48-68`) stays at `status: 'loading'`
   forever — no error branch is reachable, so the UI shows neither a failure nor a retry.
6. Independently, `PresentationScopeResolver.resolve` (`run/service/PresentationScopeResolver.ts:105-112`)
   enforces the same UUID assumption via `UUID_RE` and returns `SCOPE_UNAVAILABLE`. **So even if the
   payload were delivered, the feature would still fail.**

> **Correction, 2026-08-18.** An earlier version of this section said the assumption was encoded at
> "two independent layers". That was wrong — there are **three**, and the third was found only by an
> independent review of the first fix, not by this investigation:
>
> 7. `PresentationTemplateService.candidateRelativePath` (`PresentationTemplateService.ts:603`) applies
>    `UUID_RE` a third time. It is on a straight-line unconditional path from both channels —
>    `describeThemeSpec` (`:675`) → `readCandidate` (`:628`) → `candidateRelativePath` (`:603`), and
>    `importThemeSpecBound` (`:709`) takes the same route. Runtime proof against the real service, with
>    only the id varied: a UUID returns `OK name=Probe Theme`, while `f90e8348` throws
>    `CANDIDATE_OUTSIDE_WORKSPACE`.
>
> Consequence: fixing layers 1 and 2 alone converts the silent hang into a visible
> `CANDIDATE_OUTSIDE_WORKSPACE` error. That is progress — the promise settles — but the user still
> cannot install. **Do not describe the transport fix as resolving F1.**
>
> Its test fixture at `PresentationTemplateService.test.ts:238` is also a hand-written UUID, which is
> why this layer stayed green too. Three layers, three UUID fixtures, one dead feature.

### F4 — P1: scope resolution requires a team field the backend never sends

Found 2026-08-18 by re-walking case 1 against the fixed build. **The three UUID layers were real and are
fixed — the hang is gone and the promise now settles — but the install still fails**, now with the
honest error "This chat workspace is unavailable. Nothing was installed." (`SCOPE_UNAVAILABLE`).

`PresentationScopeResolver.resolveTeamScope:78` bails with
`if (!isRecord(team) || team.user_id !== teamUserId) return null;`

The live `GET /api/teams?user_id=system_default_user` returns **200 OK** with one team whose keys are
exactly `id, name, workspace, assistants, leader_assistant_id, created_at, updated_at` — **there is no
`user_id` field**. So the comparison is `undefined !== 'system_default_user'`, the function returns
`null`, and every scope resolution fails closed.

**This is a different defect class from F1** and is independent of id format: it breaks the feature for
**any user who has at least one team**. A user with zero teams skips the loop, reaches
`membershipCount === 0`, resolves `'individual'`, and would work. This dev profile has one team
("Video Crew"), which is why the smoke hits it.

**The codebase already knows the field is absent.** `teamMapper.ts:104` reads
`user_id: (r.user_id as string | undefined) ?? ''` — it defensively defaults it. `ipcBridge.ts:2334`
casts it (`raw.user_id as string`), which yields `undefined` at runtime. `PresentationScopeResolver.ts:78`
is the **only** consumer in the tree that treats the field as authoritative. That asymmetry is the
evidence: the resolver's expectation is wrong, not the backend.

Why types did not catch it: `teamTypes.ts:33-42` declares `TTeam.user_id: string` as **required**, and
`ipcBridge.ts:2431` types the endpoint as returning `TTeam[]`. The declared type is aspirational
relative to the wire — `workspace_mode` is likewise declared required and likewise absent. This is the
wire-contract-skew class: TypeScript cannot see it, and no test does either, because tests construct
team fixtures from the type rather than from a real response.

**Open decision.** Fixing this means dropping (or reworking) a fail-closed check that has never once
passed in production. The request is already server-filtered by `?user_id=`, so the client-side
equality test is defence-in-depth against a backend that ignores its own filter. Adding `user_id` to the
backend DTO instead would require an AionCore change and therefore a backend release, which is parked.

### F5 — P1: workspace containment is lexical, and the data directory is a symlink

Found 2026-08-18 by re-walking case 1 against the build carrying all four earlier fixes. Scope
resolution now succeeds; the install fails one step later with "The theme file is outside this chat
workspace. Nothing was installed." (`CANDIDATE_OUTSIDE_WORKSPACE`).

`PresentationTemplateService.candidateRelativePath:613-633` decides containment with
`path.relative(workspaceRoot, filePath)` and rejects anything starting with `..`. Both inputs are only
required to satisfy `path.resolve(x) === x`, which **normalises but does not follow symlinks**.

- workspace, from the conversation record: `/Users/lap16603/.aionui-dev/conversations/…/aionrs-temp-f90e8348`
- file, from the assistant's marker: `/Users/lap16603/Library/Application Support/Forge-Dev/aionui/conversations/…/aionrs-temp-f90e8348/THEME.md`

Computed both ways:

```text
lexical:              path.relative(ws, file) = "../../../../../../Library/Application Support/…/THEME.md"  -> rejected
after realpath(both): path.relative(ws, file) = "THEME.md"                                                  -> contained
```

**Not a dev-only artifact.** `~/.aionui-dev` is a symlink to `~/Library/Application Support/Forge-Dev/aionui`,
and **production's `~/.aionui` is equally a symlink** to `~/Library/Application Support/Forge/aionui`
(verified with `os.path.islink`). The layouts are identical, so real users hit the same rejection.

**It is also model-dependent, which makes it intermittent by nature.** The directive instructs the
assistant to "Resolve the file's absolute path for the marker" — a model that resolves through the
symlink produces the failing form, while one that echoes the symlink path would pass. The same prompt
can therefore succeed or fail depending on the model's path handling, which is the worst kind of bug to
diagnose from a user report.

The fix is to compare canonical paths (`realpath` both sides) rather than lexical ones. That touches a
security boundary, so it needs deliberate handling of the TOCTOU window — mitigated here because A0+
already re-reads and re-hashes the file at install time.

### F3 — P2: the same wrong id assumption is live across the runs and sources features

Found while reviewing the F1 fix; **not** fixed, and deliberately out of that commit's scope. The same
UUID-shaped `conversation_id` assumption appears at `payloadSchemas.ts:228, 249-250, 562, 571, 595,
608-643`, `PresentationRunService.ts:205`, `PresentationSourceGrantService.ts:302`,
`presentation-template/bridge.ts:444`, and `preload/main.ts:46`. Each is a candidate for the same
class of silent failure. Whether each is reachable in production needs the same live check EPIC-002
just received — none of them should be assumed working on the strength of a green suite.

**Measured evidence (all via the app's own wired bridge, in the running renderer):**

| Probe                                                                        | Result                                                      |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `presentationTemplates.list.invoke()`                                        | settled in **13 ms**, returned the 12 real gallery packs    |
| `presentationTemplates.describeSpec.invoke({conversation_id:'f90e8348', …})` | **unsettled after 21 s**                                    |
| `presentationTemplates.importSpecBound.invoke({… wrong sha …})`              | **unsettled after 15 s**                                    |
| `conversation.get.invoke({id:'f90e8348'})`                                   | settled in **16 ms**                                        |
| 1000 ms `setTimeout`                                                         | fired in 1356 ms — page not timer-throttled                 |
| main-process httpBridge log during the invokes                               | **zero** requests — the handler never reached its HTTP call |

**Confounds eliminated:** hidden window (timers and IPC both fine, `list` and `conversation.get`
settle); detached DOM node (card `isConnected: true`, 445×45 px); unwired `/@fs` bridge instance
(`list` settled through the same import); missing provider registration
(`initPresentationTemplateBridge()` is called unconditionally at `process/bridge/index.ts:55`); missing
native manifest entry (both channels are present in `native/constants.ts:42-43`).

**Why the suite is green.** `tests/unit/process/bridge/nativePayloadSchemas.test.ts:91-93` supplies
`conversation_id: '2be7b8fc-6af5-42b8-aed5-03644735c730'` — a hand-written UUID — and `:1713` asserts
the schema does not reject it. The fixture was chosen to satisfy the schema, so the test proves the
schema accepts UUIDs while production only ever sends short ids. This is the fixture-echo pattern this
repository has been bitten by before.

### F2 — P2: any main-side throw hangs the renderer forever

Link 4 above is a defect in its own right and is **not specific to templates**. Because
`bridge.invoke` (`common/platform/bridge.ts:186-197`) exposes no reject and never catches `emit`, every
`buildProvider` channel turns a main-process exception — including every payload-validation rejection —
into a permanently pending promise. It converts loud, debuggable errors into silent hangs. F1 was
invisible for nine days because of this.

Fixing F2 changes shared IPC behaviour for every provider, so it is filed separately rather than folded
into the EPIC-002 fix.

### What passed

- **English intent matching fires on the real send path.** The persisted user message contains the
  appended `Template creation instructions:` directive.
- **The assistant complied with the directive exactly**: it wrote a real 12,517-byte `THEME.md` into the
  conversation workspace and emitted exactly one marker as the final line, outside any fence, with
  nothing after it.
- **The parser and card render correctly.** `data-testid="template-review-card"` mounted, and the raw
  marker is stripped from the visible message body.
- The marker's `file_path` pointed at `~/Library/Application Support/Forge-Dev/aionui/…` while the file
  was found under `~/.aionui-dev/…`; these are the **same inode** (`~/.aionui-dev` is a symlink). Not a
  defect.

## Notes on interpretation

- A model that does not follow the directive (no marker, marker inside a fence, prose after the marker)
  is a **prompt** problem, not a parser bug. Record which failure mode was hit rather than "it did not
  work".
- Test durations and app responsiveness inflate under concurrent sessions on this machine. Slowness is
  not failure.
