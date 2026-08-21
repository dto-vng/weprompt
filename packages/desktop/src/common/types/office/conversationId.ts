/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * BUG-046, then BUG-048: the presentation features assumed a conversation id is
 * a UUID. The app does not mint UUIDs for conversations — it mints short ids
 * (measured live: the route `#/conversation/1af97a0d`, and `session_id:
 * '8f165203'` on the turn-completed wire payload). A UUID guard therefore
 * rejects every real conversation, and it does so before any feature logic
 * runs, so nothing downstream reports a reason.
 *
 * BUG-046 fixed three such guards. BUG-048 recorded that the same assumption
 * was still live across the runs and sources features and would fail the same
 * silent way. This is the single definition those guards now share, so the next
 * one cannot drift from the others.
 *
 * The NUL rejection is load-bearing rather than decorative: confirmation keys
 * join their segments with NUL, so a NUL-bearing id could forge another
 * candidate's key. The length bound matches `identifierSchema` at the wire
 * boundary (`common/adapter/native/payloadSchemas.ts`), so a value that clears
 * the transport cannot then be refused here for its size.
 */
export const MAX_CONVERSATION_ID_LENGTH = 256;

/**
 * Shape rather than format. `uuid(length = 8)` in `common/utils/utils.ts` mints
 * lowercase hex at the requested length, or a real `crypto.randomUUID()` once
 * the length reaches 36 — so both `1af97a0d` and a full UUID are legitimate,
 * and a format check for either alone is what BUG-046 and BUG-048 were.
 *
 * The charset stays restrictive on purpose. Loosening these guards to "any
 * bounded string" would have accepted `../foreign`, which an existing schema
 * test rejects by name: conversation ids reach a `sessionStorage` key
 * (`conversation-command-queue/${id}`) and, before BUG-052 escaped them, URL
 * path segments. `/` and `\` are what make those hostile, so the whitelist
 * admits only characters the generator and any plausible backend id can
 * produce.
 */
const CONVERSATION_ID_RE = /^[A-Za-z0-9_.:-]+$/;

export const isBoundedConversationId = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= MAX_CONVERSATION_ID_LENGTH &&
  CONVERSATION_ID_RE.test(value);
