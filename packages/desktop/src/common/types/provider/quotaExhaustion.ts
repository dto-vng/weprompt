/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * BUG-055: a provider account with no balance is not rate limited, but it
 * arrives looking exactly like one.
 *
 * Measured against a suspended Moonshot key: the provider said `"your account
 * ... is suspended due to insufficient balance, please recharge your account or
 * check your plan and billing details"` with `type: exceeded_current_quota_error`.
 * aioncore classified that as `Rate limited, retry after 5000ms` before the
 * desktop ever saw it, and the desktop then mapped `insufficient_quota` and
 * `rate_limited` onto one class — so the app advised waiting, which never
 * resolves a suspended account, and marked the failure retryable, so automatic
 * and human retries both burned attempts against an account that could not
 * serve any request.
 *
 * The provider's own words survive that flattening intact, so they are the one
 * signal available on this side of the boundary. Recognising them here lets the
 * desktop separate the two conditions without waiting on an aioncore change.
 */

/**
 * Structured `type` values providers use for an exhausted balance or quota.
 * Matched on the whole token, so `rate_limit_exceeded` cannot fall in here.
 */
const QUOTA_ERROR_TYPES = /\b(?:exceeded_current_quota|insufficient_quota|insufficient_balance|billing_)/;

/**
 * Prose the provider returns alongside it. Deliberately narrow: every phrase
 * here names money or an account state, never mere frequency, so a genuine
 * burst limit ("rate limit reached, please slow down") cannot match.
 */
const QUOTA_MESSAGE_PHRASES = [
  /insufficient\s+balance/i,
  /insufficient\s+quota/i,
  /exceeded\s+your\s+current\s+quota/i,
  /exceeded_current_quota/i,
  /\brecharge\b/i,
  /billing\s+details/i,
  /check\s+your\s+plan\s+and\s+billing/i,
  /account\s+.{0,40}\bsuspended\b/i,
  /out\s+of\s+credits?/i,
  /credit\s+balance\s+is\s+too\s+low/i,
];

/** True when a provider's structured error type names an exhausted quota or balance. */
export const isQuotaExhaustedErrorType = (value: string | undefined): boolean =>
  value !== undefined && QUOTA_ERROR_TYPES.test(value.trim().toLowerCase());

/**
 * True when provider-supplied text describes an exhausted quota or balance
 * rather than a temporary limit. Pass the provider's message or detail — not a
 * localized string the app produced, which carries no provider wording.
 */
export const isQuotaExhaustedMessage = (value: string | undefined): boolean => {
  if (value === undefined || value.trim().length === 0) return false;
  return QUOTA_MESSAGE_PHRASES.some((phrase) => phrase.test(value));
};
