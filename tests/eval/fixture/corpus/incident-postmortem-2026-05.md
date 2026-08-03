# Postmortem — reporting pipeline stall, 19 May 2026

Status: closed. Author: Hà. Reviewers: Trang, Dũng. Severity: 2. Customer-visible: partially, for internal reporting consumers only.

## Summary

The nightly reconciliation job did not run for three consecutive nights between 17 and 19 May. Downstream reports were served from stale data without any indication that the data was stale. No customer data was lost or altered.

Total impact window was 61 hours, from the first missed run at 02:00 on 17 May to the manual backfill completing at 15:00 on 19 May.

## Timeline

All times are Indochina Time.

17 May 02:00 — the nightly reconciliation job is scheduled to start on the legacy scheduler. It does not start. No alert fires, because the alert is wired to job failure and not to job absence.

17 May 09:20 — a Finance Operations analyst notices that the Q2 figures have not moved and asks in the support channel. The question is read as a reporting question and not escalated.

18 May 02:00 — the job again does not start. Still no alert.

18 May 16:45 — a second question arrives, this time naming a specific invoice line that should have moved. Dũng picks it up and reproduces the stale read.

19 May 09:05 — Hà finds that the scheduler's job definition still exists but its next-run timestamp is in the past and never advanced. The scheduler process had been restarted on 16 May during unrelated host maintenance work.

19 May 09:40 — the job is started by hand. It completes in 26 minutes.

19 May 10:30 — a backfill is started for the two missed nights.

19 May 15:00 — backfill completes. Reports reconcile against the source system. Incident closed.

## Root cause

The legacy scheduler stores next-run timestamps in memory and rewrites them to disk only on a clean shutdown. The host maintenance on 16 May stopped the process with a signal the scheduler does not handle, so the on-disk timestamps were never refreshed. On restart the scheduler read timestamps that were already in the past and, by design, did not fire a run for a window it considered elapsed.

This behaviour is documented in the scheduler's own manual. Nobody on the team had read that section, and the maintenance runbook did not mention the scheduler at all.

## Contributing factors

Alerting covered job failure but not job absence. A job that never starts produced no signal of any kind, which is why two nights passed before anyone looked at the scheduler.

The reports themselves carried no freshness indicator. A consumer could not tell stale data from current data, so the first question was ambiguous and got the wrong triage.

Host maintenance was carried out by a different team using a runbook that predates the scheduler being placed on that host.

## What went well

Once the second question named a concrete invoice line, reproduction took under twenty minutes. The backfill tooling worked first time and needed no changes.

## Follow-up actions

| Owner | Action                                                                                               | Status       |
| ----- | ---------------------------------------------------------------------------------------------------- | ------------ |
| Hà    | Add an absence alert: page if the reconciliation job has not started within 30 minutes of its window | Done, 22 May |
| Hà    | Add a freshness stamp to every generated report                                                      | Done, 29 May |
| Dũng  | Add the scheduler to the host maintenance runbook, with the clean-shutdown requirement stated        | Done, 26 May |
| Trang | Record the decision on when the reconciliation job leaves the legacy scheduler                       | Open         |

## Note on the migration question

The obvious question is why the reconciliation job is still on the legacy scheduler at all. The migration target exists and is tested, and this postmortem does not settle the timing. The team took a recorded position on that at a later weekly meeting; the condition and the date are in those meeting notes, not here, and this postmortem does not reopen them.
