/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { parseKnowledgeServerEnv } from '@/process/resources/builtinMcp/knowledgeServer';

describe('parseKnowledgeServerEnv', () => {
  it('returns null without a store dir', () => {
    expect(parseKnowledgeServerEnv({})).toBeNull();
  });

  it('parses store config without embed config', () => {
    const parsed = parseKnowledgeServerEnv({ AIONUI_KB_PROJECT_ID: 'p1', AIONUI_KB_STORE_DIR: '/tmp/kb/p1' });
    expect(parsed).toEqual({ projectId: 'p1', storeDir: '/tmp/kb/p1', embed: null });
  });

  it('includes embed config only when all three embed vars are set', () => {
    const base = {
      AIONUI_KB_PROJECT_ID: 'p1',
      AIONUI_KB_STORE_DIR: '/tmp/kb/p1',
      AIONUI_KB_EMBED_BASE_URL: 'https://x/v1',
      AIONUI_KB_EMBED_API_KEY: 'k',
    };
    expect(parseKnowledgeServerEnv(base)!.embed).toBeNull();
    expect(parseKnowledgeServerEnv({ ...base, AIONUI_KB_EMBED_MODEL: 'm' })!.embed).toEqual({
      baseUrl: 'https://x/v1',
      apiKey: 'k',
      model: 'm',
    });
  });
});
