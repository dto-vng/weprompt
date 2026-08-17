/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AssistantDetail, UpdateAssistantRequest } from '@/common/types/agent/assistantTypes';

/**
 * The skill/MCP selection a user edits from an existing chat's `+` menu, ready to
 * be persisted back onto the conversation's bound assistant (preset).
 */
export interface AssistantCapabilityEdits {
  /** Opt-in (non auto-inject) skill names that are checked. */
  enabledSkillNames: string[];
  /** Auto-inject builtin skill names the user has unchecked. */
  disabledBuiltinNames: string[];
  /** Selected MCP server ids. */
  selectedMcpIds: string[];
}

/**
 * Build a loss-free `UpdateAssistantRequest` that rewrites only the skill/MCP
 * capability of an assistant while re-sending every other editable field verbatim
 * from `detail`.
 *
 * `PUT /api/assistants/:id` is the only assistant-mutation endpoint and its
 * merge-vs-replace semantics are owned by the external aioncore backend (not
 * verifiable here). To be safe regardless, we mirror the canonical editor's full
 * payload: re-send `name`/`description`/`avatar`/`agent_id`/`recommended_prompts`
 * and the complete `defaults` (all five sub-fields) from `detail`, so a wholesale
 * replace loses nothing. Only `skills`/`mcps` carry the edited selection.
 *
 * Skills/MCP are pinned to `fixed` mode: the user explicitly saved this selection
 * to reuse it, so new chats must take exactly these values rather than an `auto`
 * mode that re-derives from the last-used selection.
 */
export const buildAssistantCapabilityUpdate = (
  detail: AssistantDetail,
  edits: AssistantCapabilityEdits
): UpdateAssistantRequest => ({
  id: detail.id,
  name: detail.profile.name,
  description: detail.profile.description,
  avatar: detail.profile.avatar,
  agent_id: detail.engine.agent_id,
  enabled_skills: edits.enabledSkillNames,
  custom_skill_names: detail.capabilities.custom_skill_names,
  disabled_builtin_skills: edits.disabledBuiltinNames.length > 0 ? edits.disabledBuiltinNames : undefined,
  recommended_prompts: detail.prompts.recommended,
  defaults: {
    model: detail.defaults.model,
    permission: detail.defaults.permission,
    thought_level: detail.defaults.thought_level,
    skills: { mode: 'fixed', value: edits.enabledSkillNames },
    mcps: { mode: 'fixed', value: edits.selectedMcpIds },
  },
});
