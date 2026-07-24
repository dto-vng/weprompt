import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { PROJECT_STORAGE_KEY } from '@renderer/pages/conversation/projects/projectStorage';
import { useProjectHome } from '@renderer/pages/project/hooks/useProjectHome';

const seed = (projects: unknown[]) => window.localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(projects));
const project = { id: 'p1', name: 'Alpha', workspace: '/w/alpha', created_at: 1, updated_at: 1 };

describe('useProjectHome', () => {
  beforeEach(() => window.localStorage.clear());

  it('returns the project matching the id', () => {
    seed([project]);
    const { result } = renderHook(() => useProjectHome('p1'));
    expect(result.current.project?.name).toBe('Alpha');
    expect(result.current.notFound).toBe(false);
  });

  it('flags notFound for an unknown id', () => {
    seed([]);
    const { result } = renderHook(() => useProjectHome('missing'));
    expect(result.current.project).toBeNull();
    expect(result.current.notFound).toBe(true);
  });

  it('stamps last_opened_at when the project opens', () => {
    seed([project]);
    renderHook(() => useProjectHome('p1'));
    const stored = JSON.parse(window.localStorage.getItem(PROJECT_STORAGE_KEY) as string);
    expect(typeof stored[0].last_opened_at).toBe('number');
  });
});
