/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * @vitest-environment node
 */

import { describe, expect, it, vi } from 'vitest';

import {
  PresentationScopeResolver,
  type PresentationScopeResolverOptions,
} from '@/process/services/presentation-template/run/service';

const CONVERSATION_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_CONVERSATION_ID = '33333333-3333-4333-8333-333333333333';
// Ids the running app actually mints for conversations: 8-hex short ids, never RFC-4122 uuids.
const SHORT_CONVERSATION_ID = 'f90e8348';
const OTHER_SHORT_CONVERSATION_ID = 'df17cd9c';
const PRINCIPAL_ID = 'desktop-local-principal';
const TEAM_USER_ID = 'system_default_user';

const conversation = (type: string = 'aionrs', workspace: unknown = '/workspace') => ({
  id: CONVERSATION_ID,
  type,
  extra: { workspace },
});

const team = (conversationIds: readonly string[], userId: string = TEAM_USER_ID) => ({
  id: 'team-1',
  user_id: userId,
  assistants: conversationIds.map((conversation_id, index) => ({
    slot_id: `slot-${index}`,
    conversation_id,
  })),
});

/**
 * Key sets captured verbatim from a live `GET /api/teams?user_id=system_default_user` 200 response
 * on 2026-08-18. Values are neutralized; the KEY SET is the point. The wire carries no `user_id`
 * and no `workspace_mode` on a team, even though `TTeam` declares both as required — so do not
 * "complete" this fixture from the type. Every bug this feature shipped was hidden by a fixture
 * built from a type or a schema instead of a real response.
 */
const WIRE_TEAM_KEYS = [
  'assistants',
  'created_at',
  'id',
  'leader_assistant_id',
  'name',
  'updated_at',
  'workspace',
] as const;
const WIRE_ASSISTANT_KEYS = [
  'assistant_backend',
  'assistant_id',
  'assistant_name',
  'backend',
  'conversation_id',
  'model',
  'name',
  'pending_confirmations',
  'role',
  'slot_id',
] as const;

const wireTeam = (conversationIds: readonly string[]) => ({
  assistants: conversationIds.map((conversation_id, index) => ({
    assistant_backend: 'aionrs',
    assistant_id: `assistant-${index}`,
    assistant_name: `Assistant ${index}`,
    backend: 'aionrs',
    conversation_id,
    model: 'default',
    name: `Assistant ${index}`,
    pending_confirmations: 0,
    role: index === 0 ? 'leader' : 'teammate',
    slot_id: `slot-${index}`,
  })),
  created_at: 1_755_000_000,
  id: 'team-1',
  leader_assistant_id: 'assistant-0',
  name: 'Wire Team',
  updated_at: 1_755_000_000,
  workspace: '/workspace',
});

function createHarness(overrides: Partial<PresentationScopeResolverOptions> = {}) {
  const getConversation = vi.fn(async () => conversation());
  const listTeams = vi.fn(async () => []);
  const classifyLookupError = vi.fn((error: unknown) => {
    if (error === 'forbidden') return 'RUN_FORBIDDEN' as const;
    if (error === 'missing') return 'RUN_NOT_FOUND' as const;
    return null;
  });
  const resolver = new PresentationScopeResolver({
    getConversation,
    listTeams,
    classifyLookupError,
    teamUserId: TEAM_USER_ID,
    ...overrides,
  });
  return { resolver, getConversation, listTeams, classifyLookupError };
}

describe('PresentationScopeResolver', () => {
  it('is exported from the main-process presentation service boundary', async () => {
    const serviceModule = await import('@/process/services/presentation-template/run/service');

    expect(Reflect.get(serviceModule, 'PresentationScopeResolver')).toBeTypeOf('function');
  });

  it.each(['aionrs', 'acp'] as const)('resolves an authoritative individual %s conversation', async (runtime) => {
    const harness = createHarness({ getConversation: async () => conversation(runtime) });

    await expect(
      harness.resolver.resolve({ conversationId: CONVERSATION_ID, principalId: PRINCIPAL_ID })
    ).resolves.toEqual({
      ok: true,
      conversationId: CONVERSATION_ID,
      principalId: PRINCIPAL_ID,
      scope: 'individual',
      runtime,
      workspace: '/workspace',
    });
    expect(harness.listTeams).toHaveBeenCalledWith({ userId: TEAM_USER_ID });
  });

  it('resolves an individual conversation whose id is a short id rather than a uuid', async () => {
    const harness = createHarness({
      getConversation: async () => ({ id: SHORT_CONVERSATION_ID, type: 'aionrs', extra: { workspace: '/workspace' } }),
    });

    await expect(
      harness.resolver.resolve({ conversationId: SHORT_CONVERSATION_ID, principalId: PRINCIPAL_ID })
    ).resolves.toEqual({
      ok: true,
      conversationId: SHORT_CONVERSATION_ID,
      principalId: PRINCIPAL_ID,
      scope: 'individual',
      runtime: 'aionrs',
      workspace: '/workspace',
    });
  });

  it('keeps individual scope when enumerated teams bind short-id conversations', async () => {
    const harness = createHarness({
      getConversation: async () => ({ id: SHORT_CONVERSATION_ID, type: 'aionrs', extra: { workspace: '/workspace' } }),
      listTeams: async () => [team([OTHER_SHORT_CONVERSATION_ID])],
    });

    await expect(
      harness.resolver.resolve({ conversationId: SHORT_CONVERSATION_ID, principalId: PRINCIPAL_ID })
    ).resolves.toMatchObject({
      ok: true,
      scope: 'individual',
    });
  });

  it('proves team membership from a short-id assistant conversation', async () => {
    const harness = createHarness({
      getConversation: async () => ({ id: SHORT_CONVERSATION_ID, type: 'aionrs', extra: { workspace: '/workspace' } }),
      listTeams: async () => [team([SHORT_CONVERSATION_ID])],
    });

    await expect(
      harness.resolver.resolve({ conversationId: SHORT_CONVERSATION_ID, principalId: PRINCIPAL_ID })
    ).resolves.toMatchObject({
      ok: true,
      scope: 'team',
    });
  });

  it('pins the team fixture to the captured wire key set', () => {
    const wire = wireTeam([SHORT_CONVERSATION_ID]);

    expect(Object.keys(wire).toSorted()).toEqual([...WIRE_TEAM_KEYS]);
    expect(Object.keys(wire.assistants[0]).toSorted()).toEqual([...WIRE_ASSISTANT_KEYS]);
  });

  it('resolves an individual conversation against the real /api/teams payload shape', async () => {
    const harness = createHarness({
      getConversation: async () => ({ id: SHORT_CONVERSATION_ID, type: 'aionrs', extra: { workspace: '/workspace' } }),
      listTeams: async () => [wireTeam([OTHER_SHORT_CONVERSATION_ID])],
    });

    await expect(
      harness.resolver.resolve({ conversationId: SHORT_CONVERSATION_ID, principalId: PRINCIPAL_ID })
    ).resolves.toMatchObject({
      ok: true,
      scope: 'individual',
    });
  });

  it('proves team membership from the real /api/teams payload shape', async () => {
    const harness = createHarness({
      getConversation: async () => ({ id: SHORT_CONVERSATION_ID, type: 'aionrs', extra: { workspace: '/workspace' } }),
      listTeams: async () => [wireTeam([SHORT_CONVERSATION_ID])],
    });

    await expect(
      harness.resolver.resolve({ conversationId: SHORT_CONVERSATION_ID, principalId: PRINCIPAL_ID })
    ).resolves.toMatchObject({
      ok: true,
      scope: 'team',
    });
  });

  it('classifies team ownership only from authoritative assistants membership', async () => {
    const harness = createHarness({
      getConversation: async () => ({ ...conversation(), isTeamSend: false, team_id: null }),
      listTeams: async () => [team([CONVERSATION_ID])],
    });

    await expect(
      harness.resolver.resolve({ conversationId: CONVERSATION_ID, principalId: PRINCIPAL_ID })
    ).resolves.toMatchObject({
      ok: true,
      scope: 'team',
    });
  });

  it('accepts the unambiguous legacy agents transport alias as authoritative membership', async () => {
    const authoritativeTeam = team([CONVERSATION_ID]);
    const { assistants, ...rawTeam } = authoritativeTeam;
    const harness = createHarness({
      listTeams: async () => [{ ...rawTeam, agents: assistants }],
    });

    await expect(
      harness.resolver.resolve({ conversationId: CONVERSATION_ID, principalId: PRINCIPAL_ID })
    ).resolves.toMatchObject({
      ok: true,
      scope: 'team',
    });
  });

  it('preserves an unsupported runtime for the service policy to reject', async () => {
    const harness = createHarness({ getConversation: async () => conversation('codex') });

    await expect(
      harness.resolver.resolve({ conversationId: CONVERSATION_ID, principalId: PRINCIPAL_ID })
    ).resolves.toMatchObject({
      ok: true,
      runtime: 'codex',
    });
  });

  it('withholds a missing or non-absolute workspace without weakening conversation scope', async () => {
    const harness = createHarness({ getConversation: async () => conversation('acp', '../foreign') });

    await expect(
      harness.resolver.resolve({ conversationId: CONVERSATION_ID, principalId: PRINCIPAL_ID })
    ).resolves.toMatchObject({
      ok: true,
      workspace: null,
    });
  });

  it.each([
    ['enumeration rejection', async () => Promise.reject(new Error('offline'))],
    ['non-array enumeration', async () => ({})],
    // A 'foreign principal enumeration' row lived here. It asserted the `team.user_id` equality
    // check, which is deliberately gone: the field is absent from the wire, so the check rejected
    // every real payload. Ownership of the enumeration is the server's, via the `?user_id=` filter.
    ['missing assistants enumeration', async () => [{ id: 'team-1', user_id: TEAM_USER_ID }]],
    [
      'ambiguous assistants and agents aliases',
      async () => [{ ...team([CONVERSATION_ID]), agents: team([CONVERSATION_ID]).assistants }],
    ],
    // Hostile shape kept visible: bounded-identifier validation still rejects it, on the NUL.
    ['traversal-shaped assistant conversation id', async () => [team(['../foreign\0'])]],
    [
      'ambiguous duplicate membership',
      async () => [team([CONVERSATION_ID]), { ...team([CONVERSATION_ID]), id: 'team-2' }],
    ],
  ] as const)('fails closed when %s cannot prove owner-to-team scope', async (_reason, listTeams) => {
    const harness = createHarness({ listTeams });

    await expect(
      harness.resolver.resolve({ conversationId: CONVERSATION_ID, principalId: PRINCIPAL_ID })
    ).resolves.toEqual({
      ok: false,
      code: 'SCOPE_UNAVAILABLE',
    });
  });

  it.each([
    ['forbidden', 'RUN_FORBIDDEN'],
    ['missing', 'RUN_NOT_FOUND'],
    ['offline', 'SCOPE_UNAVAILABLE'],
  ] as const)('maps an authoritative conversation lookup %s before team enumeration', async (error, code) => {
    const harness = createHarness({ getConversation: async () => Promise.reject(error) });

    await expect(
      harness.resolver.resolve({ conversationId: CONVERSATION_ID, principalId: PRINCIPAL_ID })
    ).resolves.toEqual({
      ok: false,
      code,
    });
    expect(harness.listTeams).not.toHaveBeenCalled();
  });

  // Replaces a 'path-shaped request id' row that the bounded-identifier guard no longer rejects on
  // shape: it had become an exact duplicate of the foreign-response row below. The guard itself is
  // covered directly, including its fail-fast ordering, by the request-id test that follows.
  it.each([
    ['foreign conversation response', CONVERSATION_ID, { ...conversation(), id: OTHER_CONVERSATION_ID }],
    ['missing conversation runtime', CONVERSATION_ID, { id: CONVERSATION_ID, extra: { workspace: '/workspace' } }],
    ['non-object conversation extra', CONVERSATION_ID, { id: CONVERSATION_ID, type: 'aionrs', extra: null }],
  ] as const)('fails closed for %s before accepting scope', async (_reason, conversationId, response) => {
    const harness = createHarness({ getConversation: async () => response });

    await expect(harness.resolver.resolve({ conversationId, principalId: PRINCIPAL_ID })).resolves.toEqual({
      ok: false,
      code: 'SCOPE_UNAVAILABLE',
    });
  });

  it.each([
    ['blank', ''],
    ['NUL-bearing', 'f90e8348\0forged'],
    ['over-length', 'f'.repeat(257)],
  ] as const)('rejects a %s request id before any authoritative lookup', async (_reason, conversationId) => {
    const harness = createHarness();

    await expect(harness.resolver.resolve({ conversationId, principalId: PRINCIPAL_ID })).resolves.toEqual({
      ok: false,
      code: 'SCOPE_UNAVAILABLE',
    });
    expect(harness.getConversation).not.toHaveBeenCalled();
    expect(harness.listTeams).not.toHaveBeenCalled();
  });
});
