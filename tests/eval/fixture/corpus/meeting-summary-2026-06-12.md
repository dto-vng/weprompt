# Platform weekly — 12 June 2026

Attendees: Trang (chair), Minh, Dũng, Hà, Peter (remote). Apologies: Linh.

## Status round

Reporting pipeline migration sits at 60 percent. Hà owns the migration of the reporting pipeline end to end and expects the cutover in the second week of July.

The search indexer rollout finished on Tuesday. No incidents in the first 48 hours, and query latency at the 95th percentile improved from 410 ms to 240 ms.

Mobile client crash rate is flat week on week. Minh will pull a fresh symbol map before drawing any conclusion.

## Decisions

Decision 1: the nightly reconciliation job stays on the legacy scheduler until the external audit closes in September. Engineering will not touch the cron definitions before that date, even for unrelated fixes.

Decision 2: the vendor evaluation for object storage passes to Dũng. Trang keeps the budget conversation.

Decision 3: this meeting moves to 09:30 from 1 July so the Hanoi office can attend without an early start.

## Action items

| Owner | Item                                                   | Due     |
| ----- | ------------------------------------------------------ | ------- |
| Hà    | Publish the cutover runbook for the reporting pipeline | 26 June |
| Minh  | Fresh symbol map plus a crash-rate note                | 19 June |
| Dũng  | Shortlist two object-storage vendors                   | 03 July |
| Trang | Confirm the audit window with Finance Operations       | 19 June |

## Parking lot

Whether to keep the on-call rotation at one week or move to four days. Nobody has data yet, so it stays on this list.
