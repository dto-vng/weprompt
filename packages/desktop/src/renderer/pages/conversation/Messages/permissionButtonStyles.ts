/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Border for the refusing option on a permission prompt.
 *
 * Arco's `type='secondary'` paints a pale fill (`rgb(242,243,245)`) with a *transparent*
 * border, which on the cream message card left the deny button reading as disabled while
 * both granting options were solid orange — the safe choice was the one that disappeared.
 *
 * Colour only, no width: Arco already supplies the 1px, so the numeric border utility
 * (which sets colour and never width in this repo) is enough. `!` is required because
 * Arco's own selector is more specific than a bare utility class.
 *
 * Shared by the AionRS and ACP permission components deliberately — they render the same
 * decision for two backends, and letting their styling drift is how one of them ends up
 * looking broken again.
 */
export const PERMISSION_DENY_BORDER = '!border-4';
