/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import { resolveGuidModeDisplayLabel } from '@/renderer/pages/guid/utils/permissionModeLabel';

// Minimal fake t mirroring how i18next resolves in this app: a known key maps to
// its label, otherwise the provided defaultValue, otherwise the key itself.
const fakeT = ((key: string, opts?: { defaultValue?: string }) => {
  const table: Record<string, string> = {
    'agentMode.full-access': 'Full Access',
    'agentMode.default': 'Default',
    'agentMode.auto_edit': 'Auto Edit',
    'agentMode.yolo': 'YOLO',
  };
  return table[key] ?? opts?.defaultValue ?? key;
}) as unknown as TFunction;

describe('resolveGuidModeDisplayLabel (WP24180)', () => {
  it("shows 'Full Access' for the yolo mode instead of the legacy 'YOLO' label", () => {
    expect(resolveGuidModeDisplayLabel({ value: 'yolo', label: 'YOLO' }, fakeT)).toBe('Full Access');
  });

  it('leaves other known mode labels unchanged', () => {
    expect(resolveGuidModeDisplayLabel({ value: 'default', label: 'Default' }, fakeT)).toBe('Default');
    expect(resolveGuidModeDisplayLabel({ value: 'auto_edit', label: 'Auto Edit' }, fakeT)).toBe('Auto Edit');
  });

  it("falls back to the option's own label when the mode has no i18n key", () => {
    expect(resolveGuidModeDisplayLabel({ value: 'custom-x', label: 'Custom X' }, fakeT)).toBe('Custom X');
  });
});
