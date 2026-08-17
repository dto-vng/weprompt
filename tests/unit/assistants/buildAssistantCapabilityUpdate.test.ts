import { describe, expect, it } from 'vitest';
import { buildAssistantCapabilityUpdate } from '@/renderer/hooks/assistant/buildAssistantCapabilityUpdate';
import type { AssistantDetail } from '@/common/types/agent/assistantTypes';

const makeDetail = (overrides: Partial<AssistantDetail> = {}): AssistantDetail => ({
  id: 'assistant-1',
  source: 'user',
  agent_status: 'online',
  team_selectable: true,
  deletable: true,
  profile: { name: 'My Preset', name_i18n: {}, description_i18n: {} },
  state: { enabled: true, sort_order: 0 },
  engine: { agent_id: 'aionrs' },
  rules: { content: '', storage_mode: 'inline' },
  prompts: { recommended: ['keep me'], recommended_i18n: {} },
  defaults: {
    model: { mode: 'fixed', value: 'gpt-x' },
    permission: { mode: 'default' },
    thought_level: { mode: 'fixed', value: 'high' },
    skills: { mode: 'custom', value: ['old-skill'] },
    mcps: { mode: 'custom', value: ['old-mcp'] },
  },
  capabilities: {
    default_skill_ids: ['old-skill'],
    custom_skill_names: ['my-custom'],
    default_disabled_builtin_skill_ids: [],
  },
  preferences: { last_skill_ids: [], last_disabled_builtin_skill_ids: [], last_mcp_ids: [] },
  ...overrides,
});

describe('buildAssistantCapabilityUpdate', () => {
  it('overrides skills/mcps while preserving the other defaults', () => {
    const detail = makeDetail();
    const update = buildAssistantCapabilityUpdate(detail, {
      enabledSkillNames: ['skill-a', 'skill-b'],
      disabledBuiltinNames: [],
      selectedMcpIds: ['mcp-x', 'mcp-y'],
    });

    expect(update.id).toBe('assistant-1');
    expect(update.enabled_skills).toEqual(['skill-a', 'skill-b']);
    expect(update.custom_skill_names).toEqual(['my-custom']);
    // Preserve fields must be re-sent verbatim so a wholesale PUT replace loses nothing.
    expect(update.name).toBe('My Preset');
    expect(update.agent_id).toBe('aionrs');
    expect(update.recommended_prompts).toEqual(['keep me']);
    // model / permission / thought_level must survive untouched.
    expect(update.defaults?.model).toEqual({ mode: 'fixed', value: 'gpt-x' });
    expect(update.defaults?.permission).toEqual({ mode: 'default' });
    expect(update.defaults?.thought_level).toEqual({ mode: 'fixed', value: 'high' });
    // skills / mcps carry the edited values pinned to 'fixed' so new chats take them verbatim.
    expect(update.defaults?.skills).toEqual({ mode: 'fixed', value: ['skill-a', 'skill-b'] });
    expect(update.defaults?.mcps).toEqual({ mode: 'fixed', value: ['mcp-x', 'mcp-y'] });
  });

  it('omits disabled_builtin_skills when nothing is disabled', () => {
    const update = buildAssistantCapabilityUpdate(makeDetail(), {
      enabledSkillNames: [],
      disabledBuiltinNames: [],
      selectedMcpIds: [],
    });
    expect(update.disabled_builtin_skills).toBeUndefined();
  });

  it('forwards disabled builtin skills when present', () => {
    const update = buildAssistantCapabilityUpdate(makeDetail(), {
      enabledSkillNames: [],
      disabledBuiltinNames: ['builtin-auto'],
      selectedMcpIds: [],
    });
    expect(update.disabled_builtin_skills).toEqual(['builtin-auto']);
  });
});
