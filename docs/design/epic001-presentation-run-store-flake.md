# EPIC-001 — `presentationRunStore` durability test is load-fragile

**Reported:** 2026-08-06 · **Owner:** EPIC-001 (artifacts / presentation runs)
**Found by:** the `creative-suite-sprint2` back-merge gate · **Not a Creative Studio defect**

## Summary

One test in `tests/unit/process/services/presentation-template/storage/presentationRunStore.test.ts` fails when the suite is large enough:

> `PresentationRunStore > recovers atomic run tombstones after every journal and two-manifest durability boundary`

It passes on `origin/sprint2` today and fails once `creative-suite-sprint2` is merged in — **not because that branch touches this code (it touches zero files under `presentation-template`), but because it adds ~1,600 tests and the extra parallel pressure pushes this test past its 10s budget.**

Any future branch that grows the suite by a similar amount will hit the same wall, so this is worth fixing rather than waiting out.

## Evidence

| Tree | Files / tests | Result |
| --- | --- | --- |
| `origin/sprint2` (pristine, `07424fdfe`) | 545 / 5,373 | **green** |
| `creative-suite-sprint2` back-merge | 601 / 6,959 | **1 failure** — this test |

Failure output:

```
Error: Test timed out in 10000ms.
Error: ENOTEMPTY: directory not empty, rmdir
  '/var/folders/.../T/presentation-run-store-X0BNj8/
   tombstone-before-manifest-directory-fsync-1/system-temp'
```

Reproduced twice on the merged branch. Passes in isolation on that same branch, and passes under a *smaller* suite — which is what identifies it as budget-related rather than a logic conflict with the incoming changes.

## Diagnosis

The test is a **single `it()` that loops over every durability boundary**, and each iteration does real filesystem work:

```ts
for (const boundary of [...preparationBoundaries, ...promotionBoundaries]) {
  const boundaryRoot = path.join(fixtureRoot, `candidate-${boundary}`);
  await Promise.all([mkdir(boundaryUserData, …), mkdir(boundaryTemp, …)]);
  // construct store, inject a simulated process crash at `boundary`, recover, assert
}
```

`preparationBoundaries` and `promotionBoundaries` together cover the full write path — temp write, temp fsync, temp directory fsync, promotion rename, promotion directory fsync, and the manifest/tombstone equivalents. Each iteration creates a directory tree, simulates a crash via `failureInjector` throwing `PresentationRunSimulatedProcessCrashError`, and recovers.

That is a lot of serial fsync work for one 10s default budget. Under a larger suite the worker gets less CPU, cumulative time crosses 10s, and vitest aborts the test mid-loop.

**The `ENOTEMPTY` is a consequence, not a second bug.** When the test is aborted mid-loop, `afterEach`'s `rm(fixtureRoot, { recursive: true, force: true })` races the aborted iteration's still-in-flight writes. It appears alongside the timeout, never on its own.

> An earlier read of this report treated the `ENOTEMPTY` as an independent cleanup race and concluded a longer timeout would not help. That was wrong: the timeout is primary and the cleanup error is downstream of it.

## Suggested fix — for the owner, not prescriptive

**Preferred: split the loop into one test per boundary**, via `it.each(boundaries)`. Each boundary then gets its own 10s budget instead of sharing one, and — more valuably — a failure names the boundary that broke instead of the whole matrix. The work per test drops to roughly a tenth.

**Adequate: give the test an explicit generous timeout.** Cheaper, but it keeps a single opaque test whose failure tells you nothing about which boundary regressed, and it will drift back into the same place as the suite grows.

Not recommended: raising the global `testTimeout`. That hides the next slow test too.

## What this blocks

`creative-suite-sprint2` currently holds **13 unpushed commits** — Checkpoint 5's cut-model foundation and the `sprint2` back-merge. `just push` aborts on the failing gate, correctly, so nothing has been forced through. That branch is otherwise green: of 6,959 tests, this is the only failure.

We are holding rather than working around it. Bypassing the gate or patching another epic's test from our branch both seemed worse than reporting it.
