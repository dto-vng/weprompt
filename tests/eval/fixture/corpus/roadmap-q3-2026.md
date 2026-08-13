# Product roadmap — Q3 2026

Owner: Trang. Reviewed with the Platform team on 05 June 2026. Anything not on this page is not committed for the quarter.

## Mobile client

Offline drafts ship in Q3 for the mobile client: a message composed without connectivity is queued locally and sent when the device reconnects. Target release is 3.4, mid-August.

Push notification grouping slips to Q4. The design is done but the server-side fan-out work is not staffed.

## Web console

Bulk export lands in Q3, limited to 50.000 rows per request. Larger exports stay on the ticket-based process run by Finance Operations.

Nhóm Web console sẽ hỗ trợ giao diện tiếng Việt đầy đủ trong Q3, bao gồm cả định dạng ngày tháng và đơn vị tiền tệ.

## Platform

The reporting pipeline migration completes in July. After the cutover, the legacy warehouse becomes read-only and is kept for the audit trail only.

Object storage vendor selection closes in Q3 so procurement can run in Q4.

## Explicitly not in Q3

Single sign-on for partner tenants, the redesigned admin search, and any change to the on-call rotation.
