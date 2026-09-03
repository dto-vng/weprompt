/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AgentModeOption } from '@/renderer/utils/model/agentTypes';
import type { TFunction } from 'i18next';

/**
 * Display-only label for a permission mode on the new-chat selector. The
 * bypass-permissions mode ('yolo') is shown as 'Full Access' so the new-chat
 * selector reads the same as the in-conversation selector, which already maps
 * it that way (WP24180). The underlying mode value is unchanged — this only
 * affects the visible text. Any other mode falls through to its i18n label,
 * defaulting to the option's own label when no key exists.
 */
export const resolveGuidModeDisplayLabel = (mode: AgentModeOption, t: TFunction): string =>
  mode.value === 'yolo' ? t('agentMode.full-access') : t(`agentMode.${mode.value}`, { defaultValue: mode.label });
