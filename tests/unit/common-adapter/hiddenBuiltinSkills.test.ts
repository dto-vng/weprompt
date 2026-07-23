import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HIDDEN_BUILTIN_SKILLS } from '@/common/config/constants';

const mock = await vi.hoisted(async () => {
  const { createMockHttpBridge: create } = await import('./../_helpers/mockHttpBridge');
  return create();
});

// Mock the HTTP layer BEFORE importing the bridge under test
vi.mock('@/common/adapter/httpBridge', () => mock.asModule());

const { fs } = await import('@/common/adapter/ipcBridge');

const skill = (name: string, source: 'builtin' | 'custom') => ({
  name,
  description: `${name} description`,
  location: `/skills/${name}`,
  is_auto_inject: false,
  is_custom: source === 'custom',
  source,
});

describe('listAvailableSkills — hidden builtin skills filter', () => {
  beforeEach(() => {
    mock.reset();
  });

  it('filters blocklisted builtin skills out of the skills list', async () => {
    mock.onGet('/api/skills', () => [
      skill('officecli-docx', 'builtin'),
      ...HIDDEN_BUILTIN_SKILLS.map((name) => skill(name, 'builtin')),
      skill('my-custom-skill', 'custom'),
    ]);

    const result = await fs.listAvailableSkills.invoke();
    const names = result.map((s) => s.name);

    expect(names).toContain('officecli-docx');
    expect(names).toContain('my-custom-skill');
    for (const hidden of HIDDEN_BUILTIN_SKILLS) {
      expect(names).not.toContain(hidden);
    }
  });

  it('keeps custom skills even when they share a blocklisted name', async () => {
    mock.onGet('/api/skills', () => [skill('x-recruiter', 'custom')]);

    const result = await fs.listAvailableSkills.invoke();

    expect(result.map((s) => s.name)).toEqual(['x-recruiter']);
  });
});
