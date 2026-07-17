import type { ManagedAgent } from '@/renderer/utils/model/agentTypes';

const isAgentAvailable = (agent: ManagedAgent): boolean => agent.status === 'online';

export const getAvailableAgents = (agents: ManagedAgent[]): ManagedAgent[] => agents.filter(isAgentAvailable);
