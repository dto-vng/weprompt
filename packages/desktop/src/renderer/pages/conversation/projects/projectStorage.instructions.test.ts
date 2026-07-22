import { beforeEach, describe, expect, it } from 'vitest';
import { createProject, findProjectById, updateProject } from './projectStorage';

class MemStorage {
  private m = new Map<string, string>();
  getItem(key: string): string | null {
    return this.m.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.m.set(key, value);
  }
  removeItem(key: string): void {
    this.m.delete(key);
  }
}

describe('project instructions', () => {
  let storage: MemStorage;
  let seq: number;
  const deps = () => ({ storage, now: () => 1, createId: () => `p${++seq}` });

  beforeEach(() => {
    storage = new MemStorage();
    seq = 0;
  });

  it('persists instructions on create and finds by id', () => {
    const p = createProject({ name: 'HR', workspace: '/ws/hr', instructions: '  Be formal.  ' }, deps());
    expect(p.instructions).toBe('Be formal.');
    expect(findProjectById(p.id, [p])?.instructions).toBe('Be formal.');
  });

  it('updates instructions and clears when blank', () => {
    const p = createProject({ name: 'HR', workspace: '/ws/hr' }, deps());
    const u1 = updateProject({ id: p.id, instructions: 'Use Vietnamese.' }, { storage, now: () => 2 });
    expect(u1?.instructions).toBe('Use Vietnamese.');
    const u2 = updateProject({ id: p.id, instructions: '   ' }, { storage, now: () => 3 });
    expect(u2?.instructions).toBeUndefined();
  });
});
