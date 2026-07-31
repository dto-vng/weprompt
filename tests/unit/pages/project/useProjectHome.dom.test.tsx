import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { PROJECT_STORAGE_KEY } from '@renderer/pages/conversation/projects/projectStorage';

/**
 * Lets a single test make the `last_opened_at` stamp fail. Note that
 * `vi.spyOn(window.localStorage, ...)` cannot be used for this: jsdom exposes
 * localStorage through a Proxy, so the spy is stored as a key instead of
 * shadowing the method, and the injected failure never fires.
 */
const hoisted = vi.hoisted(() => ({ stampError: null as Error | null }));

vi.mock('@renderer/pages/conversation/projects/projectStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@renderer/pages/conversation/projects/projectStorage')>();
  return {
    ...actual,
    updateProject: (...args: Parameters<typeof actual.updateProject>) => {
      if (hoisted.stampError) {
        throw hoisted.stampError;
      }
      return actual.updateProject(...args);
    },
  };
});

import { useProjectHome } from '@renderer/pages/project/hooks/useProjectHome';

const seed = (projects: unknown[]) => window.localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(projects));
const project = { id: 'p1', name: 'Alpha', workspace: '/w/alpha', created_at: 1, updated_at: 1 };

describe('useProjectHome', () => {
  beforeEach(() => {
    window.localStorage.clear();
    hoisted.stampError = null;
  });
  afterEach(() => vi.restoreAllMocks());

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

  it('still resolves the project when the last_opened_at stamp fails to persist', () => {
    seed([project]);
    hoisted.stampError = new Error('PROJECT_WORKSPACE_DUPLICATE');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { result } = renderHook(() => useProjectHome('p1'));

    expect(result.current.project?.name).toBe('Alpha');
    expect(result.current.notFound).toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});
