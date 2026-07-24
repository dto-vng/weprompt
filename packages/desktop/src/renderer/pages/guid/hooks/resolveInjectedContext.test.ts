import { describe, expect, it } from 'vitest';
import { resolveInjectedContext } from './resolveInjectedContext';

describe('resolveInjectedContext', () => {
  it('is empty when global disabled and no project text', () => {
    const out = resolveInjectedContext(undefined, {
      getUserContext: () => ({ enabled: false, instructions: 'ignored' }),
      findProject: () => null,
    });
    expect(out).toBe('');
  });

  it('includes only global when no project', () => {
    const out = resolveInjectedContext(undefined, {
      getUserContext: () => ({ enabled: true, instructions: 'Be concise.' }),
      findProject: () => null,
    });
    expect(out).toBe('[Your instructions]\nBe concise.');
  });

  it('layers global then project, using the project name in the label', () => {
    const out = resolveInjectedContext('p1', {
      getUserContext: () => ({ enabled: true, instructions: 'Be concise.' }),
      findProject: () => ({
        id: 'p1',
        name: 'HR',
        workspace: '/ws/hr',
        instructions: 'Use formal Vietnamese.',
        created_at: 0,
        updated_at: 0,
      }),
    });
    expect(out).toBe('[Your instructions]\nBe concise.\n\n[Project: HR]\nUse formal Vietnamese.');
  });
});
