/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const loadCreativeStudioFlag = async (value?: string): Promise<boolean> => {
  vi.resetModules();
  vi.stubEnv('AIONUI_ENABLE_CREATIVE_STUDIO', value);
  const { CREATIVE_STUDIO_ENABLED } = await import('@/common/config/constants');
  return CREATIVE_STUDIO_ENABLED;
};

describe('Creative Studio feature flag', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('defaults to disabled when the development override is absent', async () => {
    await expect(loadCreativeStudioFlag()).resolves.toBe(false);
  });

  it('enables only for the explicit development override value', async () => {
    await expect(loadCreativeStudioFlag('1')).resolves.toBe(true);
    await expect(loadCreativeStudioFlag('true')).resolves.toBe(false);
  });
});
