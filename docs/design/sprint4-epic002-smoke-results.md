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

| #   | Case                                   | Backend              | Language                | Outcome       | Evidence |
| --- | -------------------------------------- | -------------------- | ----------------------- | ------------- | -------- |
| 1   | Creation happy path                    | aionrs (`kimi-k2.6`) | English                 | _not yet run_ |          |
| 2   | Creation happy path                    | aionrs               | Vietnamese (accented)   | _not yet run_ |          |
| 3   | Intent match                           | aionrs               | Vietnamese (unaccented) | _not yet run_ |          |
| 4   | Deliberate non-trigger (`mau nay dep`) | aionrs               | Vietnamese              | _not yet run_ |          |
| 5   | Creation happy path                    | ACP (OpenCode)       | English                 | _not yet run_ |          |
| 6   | Creation happy path                    | ACP (OpenCode)       | Vietnamese              | _not yet run_ |          |
| 7   | Hash-binding refusal after tamper      | either               | —                       | _not yet run_ |          |

Outcome vocabulary: **pass**, **fail**, **blocked**. Blocked is a valid outcome; silent omission is
not.

## Findings

_None recorded yet._

## Notes on interpretation

- A model that does not follow the directive (no marker, marker inside a fence, prose after the marker)
  is a **prompt** problem, not a parser bug. Record which failure mode was hit rather than "it did not
  work".
- Test durations and app responsiveness inflate under concurrent sessions on this machine. Slowness is
  not failure.
