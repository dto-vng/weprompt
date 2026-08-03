import { describe, expect, it } from 'vitest';
import { GLOBAL_CONTEXT_LABEL } from '@/common/chat/buildInjectedContext';
import { resolveInjectedContext } from './resolveInjectedContext';

describe('GLOBAL_CONTEXT_LABEL', () => {
  // The Profile field invites first-person text about the user ("I work in HR at
  // VNG…"), so a label addressed TO the model makes it adopt that text as its own
  // identity. Observed live: a profile reading "I am a Head of AI Product at VNG"
  // produced an assistant that introduced itself as the Head of AI Product.
  it('names the user as the subject rather than addressing the assistant', () => {
    expect(GLOBAL_CONTEXT_LABEL).toMatch(/user/i);
    expect(GLOBAL_CONTEXT_LABEL).not.toMatch(/^your\b/i);
  });
});

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
    expect(out).toBe(`[${GLOBAL_CONTEXT_LABEL}]\nBe concise.`);
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
    expect(out).toBe(`[${GLOBAL_CONTEXT_LABEL}]\nBe concise.\n\n[Project: HR]\nUse formal Vietnamese.`);
  });
});
