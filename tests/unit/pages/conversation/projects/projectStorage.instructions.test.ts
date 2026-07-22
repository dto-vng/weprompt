/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { ProjectStorageLike } from '@renderer/pages/conversation/projects/projectStorage';
import {
  PROJECT_STORAGE_KEY,
  createProject,
  readProjects,
  updateProject,
} from '@renderer/pages/conversation/projects/projectStorage';

const makeStorage = (initial?: string): ProjectStorageLike => {
  const map = new Map<string, string>();
  if (initial !== undefined) map.set(PROJECT_STORAGE_KEY, initial);
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
};

const deps = (storage: ProjectStorageLike, id = 'p1') => ({ storage, now: () => 1, createId: () => id });

describe('project storage instructions field', () => {
  it('persists instructions on create', () => {
    const storage = makeStorage();
    createProject({ name: 'Alpha', workspace: '/w/alpha', instructions: 'Be concise.' }, deps(storage));
    expect(readProjects(storage)[0].instructions).toBe('Be concise.');
  });

  it('sets instructions via updateProject on an existing project', () => {
    const storage = makeStorage();
    createProject({ name: 'Alpha', workspace: '/w/alpha' }, deps(storage));
    updateProject({ id: 'p1', instructions: 'Answer in English.' }, { storage, now: () => 2 });
    expect(readProjects(storage)[0].instructions).toBe('Answer in English.');
  });

  it('leaves instructions untouched when updateProject omits the field', () => {
    const storage = makeStorage();
    createProject({ name: 'Alpha', workspace: '/w/alpha', instructions: 'Keep it.' }, deps(storage));
    updateProject({ id: 'p1', name: 'Alpha 2' }, { storage, now: () => 2 });
    expect(readProjects(storage)[0].instructions).toBe('Keep it.');
  });

  it('rejects a stored project whose instructions is not a string', () => {
    const badRaw = JSON.stringify([
      { id: 'p1', name: 'A', workspace: '/w/a', created_at: 1, updated_at: 1, instructions: 123 },
    ]);
    expect(readProjects(makeStorage(badRaw))).toEqual([]);
  });
});
