/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { getAvailableAgents } from '@/renderer/pages/settings/AgentSettings/agentFilters';
import type { ManagedAgent } from '@/renderer/utils/model/agentTypes';

const agent = (id: string, status: ManagedAgent['status']): ManagedAgent =>
  ({
    id,
    name: id,
    agent_type: 'acp',
    agent_source: 'builtin',
    enabled: true,
    installed: status !== 'missing',
    status,
  }) as ManagedAgent;

describe('getAvailableAgents', () => {
  const agents = [agent('a', 'offline'), agent('b', 'online'), agent('c', 'missing'), agent('d', 'online')];

  it('keeps only online agents without changing relative order', () => {
    expect(getAvailableAgents(agents).map((item) => item.id)).toEqual(['b', 'd']);
  });

  it('returns an empty list when no agent is online', () => {
    expect(getAvailableAgents([agent('a', 'offline'), agent('c', 'missing')])).toEqual([]);
  });
});
