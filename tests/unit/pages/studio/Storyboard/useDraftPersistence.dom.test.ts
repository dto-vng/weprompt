/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { draftKey, persistDrafts, takePersistedDrafts } from '@renderer/pages/studio/hooks/useDraftPersistence';

describe('Studio scene draft persistence', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('stores only the supplied dirty scene fields under the project key', () => {
    persistDrafts('project-1', 4, {
      'scene-1': { narration: 'Half-typed thought' },
    });

    expect(window.sessionStorage.getItem(draftKey('project-1'))).toBe(
      JSON.stringify({
        revision: 4,
        scenes: { 'scene-1': { narration: 'Half-typed thought' } },
      })
    );
  });

  it('removes the project key when no dirty scenes remain', () => {
    persistDrafts('project-1', 4, { 'scene-1': { narration: 'Draft' } });

    persistDrafts('project-1', 4, {});

    expect(window.sessionStorage.getItem(draftKey('project-1'))).toBeNull();
  });

  it('takes a matching snapshot exactly once', () => {
    persistDrafts('project-1', 4, { 'scene-1': { narration: 'Draft' } });

    expect(takePersistedDrafts('project-1', 4)).toEqual({
      'scene-1': { narration: 'Draft' },
    });
    expect(takePersistedDrafts('project-1', 4)).toBeNull();
  });

  it.each([
    ['a stale revision', JSON.stringify({ revision: 3, scenes: { 'scene-1': { narration: 'Old' } } })],
    ['malformed JSON', '{not-json'],
  ])('discards %s instead of applying it', (_case, storedValue) => {
    window.sessionStorage.setItem(draftKey('project-1'), storedValue);

    expect(takePersistedDrafts('project-1', 4)).toBeNull();
    expect(window.sessionStorage.getItem(draftKey('project-1'))).toBeNull();
  });
});
