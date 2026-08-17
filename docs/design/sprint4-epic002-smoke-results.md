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

| #   | Case                                   | Backend              | Language                | Outcome       | Evidence                                                                                                                        |
| --- | -------------------------------------- | -------------------- | ----------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Creation happy path                    | aionrs (`kimi-k2.6`) | English                 | **fail — F1** | conversation `f90e8348`: directive fired, `THEME.md` written (12,517 B), marker correct, card rendered, **install unreachable** |
| 2   | Creation happy path                    | aionrs               | Vietnamese (accented)   | _not yet run_ |                                                                                                                                 |
| 3   | Intent match                           | aionrs               | Vietnamese (unaccented) | _not yet run_ |                                                                                                                                 |
| 4   | Deliberate non-trigger (`mau nay dep`) | aionrs               | Vietnamese              | _not yet run_ |                                                                                                                                 |
| 5   | Creation happy path                    | ACP (OpenCode)       | English                 | _not yet run_ |                                                                                                                                 |
| 6   | Creation happy path                    | ACP (OpenCode)       | Vietnamese              | _not yet run_ |                                                                                                                                 |
| 7   | Hash-binding refusal after tamper      | either               | —                       | _not yet run_ |                                                                                                                                 |

Outcome vocabulary: **pass**, **fail**, **blocked**. Blocked is a valid outcome; silent omission is
not.

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
   payload were delivered, the feature would still fail** — the wrong assumption is encoded at two
   independent layers.

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
