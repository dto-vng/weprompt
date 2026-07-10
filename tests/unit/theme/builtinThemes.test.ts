/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { DARK_THEME_ID, LIGHT_THEME_ID } from '@/common/theme/constants';
import { BUILTIN_THEMES, OFFICIAL_THEME_IDS } from '@renderer/theme/builtinThemes';

describe('built-in themes', () => {
  it('labels the official Forge themes clearly', () => {
    expect(BUILTIN_THEMES.find((theme) => theme.id === LIGHT_THEME_ID)?.name).toBe('Forge Light');
    expect(BUILTIN_THEMES.find((theme) => theme.id === DARK_THEME_ID)?.name).toBe('Forge Dark');
  });

  it('exposes only the official Forge themes for the normal theme screen', () => {
    expect([...OFFICIAL_THEME_IDS]).toEqual([LIGHT_THEME_ID, DARK_THEME_ID]);
  });

  it('uses generated previews instead of thumbnail covers for official themes', () => {
    const officialThemes = BUILTIN_THEMES.filter((theme) => OFFICIAL_THEME_IDS.has(theme.id));

    expect(officialThemes.map((theme) => theme.cover)).toEqual([undefined, undefined]);
  });
});
