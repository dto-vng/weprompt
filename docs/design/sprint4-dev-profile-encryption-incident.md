# Incident — dev profile database became unreadable, 2026-08-18

**Status: RESOLVED 2026-08-18 10:25.** No data was lost. Restored from the verified plaintext backup with
the owner's approval; all 41 conversations and all three keyed providers are back and the app boots clean.

**Scope: the development profile only.** `~/.aionui-dev`. The packaged app's data (`~/.aionui`) and the
second dev profile (`~/.aionui-dev-2`, in use by another session) are unaffected.

## What is on disk

| File                                               | Size      | Time  | State                                                                                                               |
| -------------------------------------------------- | --------- | ----- | ------------------------------------------------------------------------------------------------------------------- |
| `aionui-backend.db`                                | 708,608   | 10:10 | **unreadable** — `(code 26) file is not a database`                                                                 |
| `aionui-backend.db.plaintext-backup.1787022393207` | 4,526,080 | 09:54 | **good** — 41 conversations, 2,122 messages, `pragma integrity_check` → `ok` (verified twice, read-only, on copies) |
| `aionui-backend.db.instance.lock`                  | 0         | Aug 7 | stale                                                                                                               |
| `aionui-backend.db.migrate.lock`                   | 0         | Aug 4 | stale — worth weighing before any migration, a stale migrate lock can make one behave oddly                         |

## Sequence

1. **~06:26–10:05** — dev ran from `.worktrees/sprint4` with the **bundled aioncore 0.1.53** on PATH.
2. **09:54** — the plaintext → encrypted at-rest migration ran and correctly wrote
   `aionui-backend.db.plaintext-backup.…` before re-encrypting. This is the expected, designed behaviour.
3. **10:06** — that instance was stopped and dev was relaunched with a **locally built aioncore 0.1.51**
   (branch `feat/aionrs-thinking`, debug profile) on PATH, to verify the new thinking control.
   It booted with **no migration error** and the API returned **0 conversations**.
4. **10:10** — stopped on suspicion; the DB checkpointed its WAL and settled at 708,608 bytes.
5. **10:18** — relaunched with the **bundled 0.1.53** to test whether the original binary could still read
   it. It could not: `BOOTSTRAP_DATA_INIT_FAILED stage="database.open"`, `(code 26) file is not a database`.
   The app never mounts past the bootstrap-failure dialog.

## Hypothesis (not proven)

The 0.1.51 build could not decrypt the 0.1.53-encrypted database and re-initialised a fresh encrypted one
with its own key, leaving a file 0.1.53 can no longer open. Consistent with the observations — booted
clean, saw zero rows, produced a small DB — but not directly confirmed, and it should not be asserted as
fact without evidence from the encryption key path.

## Root cause of the exposure, regardless of mechanism

**A locally built backend was pointed at the real dev profile.** The verification could have run against a
scratch `--data-dir` and did not need the user's conversations at all. That was an avoidable choice, and
it is the actual lesson here.

## Rules taken from this

1. **Never point a locally built aioncore at `~/.aionui-dev`.** Use a scratch data dir. The only reason
   the real profile was attractive is that it holds a keyed provider — solve that by configuring a
   throwaway profile, not by borrowing the user's.
2. **At-rest encryption makes the data directory version-sensitive in a way the migration lineage does
   not describe.** The lineage check passed (0.1.51 and 0.1.53 share migrations 001–027) while the
   database was still unopenable. **A green migration check is not evidence that a different binary can
   read the data.**
3. **Binary swaps against a shared profile are a two-way hazard.** Two sessions plus two binaries touched
   one profile in a single morning.
4. Preserve, never repair in place: the unreadable file should be kept, not deleted, so any swap is
   reversible.

## Recovery, pending owner approval

Blocked on the user — the action mutates their data and was correctly refused by the permission
classifier. Proposed, fully reversible because nothing is deleted:

```bash
cd ~/.aionui-dev
mv aionui-backend.db "aionui-backend.db.unreadable-encrypted-$(date +%Y%m%d-%H%M%S)"
cp aionui-backend.db.plaintext-backup.1787022393207 aionui-backend.db
```

Then relaunch with the bundled 0.1.53 and confirm the 41 conversations return. Expect the at-rest
encryption migration to run again on that boot and write a fresh backup.

## Consequence for Stream A

The Task 3 live acceptance gate — proving the thinking control materially changes Kimi's
`reasoning_tokens` — **cannot run until this is resolved**, and when it does it must run against an
isolated profile. Tasks 1, 1b and 2 are unaffected: they are committed on `feat/aionrs-thinking` with all
suites green, and nothing about this incident touches their correctness.

## Resolution — 2026-08-18 10:25

The owner approved the swap; it was executed exactly as proposed, deleting nothing:

- `aionui-backend.db` (unreadable, 708,608 B) preserved as
  `aionui-backend.db.unreadable-encrypted-20260818-102447`
- `aionui-backend.db.plaintext-backup.1787022393207` copied into place as `aionui-backend.db`
- the original backup left untouched

Relaunched with the bundled 0.1.53. Verified against the running backend:

| Check         | Result                                                        |
| ------------- | ------------------------------------------------------------- |
| Bootstrap     | clean — no `BOOTSTRAP_DATA_INIT_FAILED`                       |
| Conversations | **41 / 41**, including today's smoke conversations            |
| Providers     | Moonshot (Global), OpenRouter, Custom — all enabled and keyed |

Both the unreadable database and the original backup remain on disk, so the recovery is still reversible.

**One state change to be aware of:** the at-rest encryption migration did **not** re-run on this boot —
the profile is currently the 4.5 MB plaintext database with a WAL, and no new
`plaintext-backup.*` was written. That matches how the profile looked before 09:54 today and the app works
normally, but it differs from the encrypted state it had reached, and it is a difference someone should
notice deliberately rather than discover later.
