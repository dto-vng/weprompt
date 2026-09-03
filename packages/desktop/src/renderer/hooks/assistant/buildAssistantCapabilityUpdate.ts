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
 * A scalar default (model / permission / thought_level) whose write-mode the
 * `PUT /api/assistants/:id` validator only accepts as `auto | fixed`. A GET can
 * return other markers (e.g. `default`), so re-sending it verbatim is rejected —
 * the save then throws and surfaces "Could not save to preset" (WP24179).
 */
const normalizeScalarDefault = (
  scalar: AssistantDetail['defaults']['model']
): { mode: 'auto' | 'fixed'; value?: string } =>
  scalar.mode === 'fixed' ? { mode: 'fixed', value: scalar.value } : { mode: 'auto' };

/**
 * Build an `UpdateAssistantRequest` that rewrites only the skill/MCP capability of
 * an assistant while re-sending every other editable field from `detail`.
 *
 * `PUT /api/assistants/:id` is the only assistant-mutation endpoint and its
 * merge-vs-replace semantics are owned by the external aioncore backend. We mirror
 * the *proven* canonical editor (`useAssistantEditor`) so the payload the backend
 * already accepts is the one we send (WP24179):
 *  - scalar defaults are normalized to `auto | fixed` (never a raw GET marker like
 *    `default`, which the PUT validator rejects);
 *  - `generated` presets omit `name` / `avatar` / `agent_id`, which the backend
 *    does not accept for that source (the canonical editor omits them too).
 *
 * Skills/MCP are pinned to `fixed` mode: the user explicitly saved this selection
 * to reuse it, so new chats must take exactly these values rather than an `auto`
 * mode that re-derives from the last-used selection.
 */
export const buildAssistantCapabilityUpdate = (
  detail: AssistantDetail,
  edits: AssistantCapabilityEdits
): UpdateAssistantRequest => {
  const base: UpdateAssistantRequest = {
    id: detail.id,
    description: detail.profile.description,
    enabled_skills: edits.enabledSkillNames,
    custom_skill_names: detail.capabilities.custom_skill_names,
    disabled_builtin_skills: edits.disabledBuiltinNames.length > 0 ? edits.disabledBuiltinNames : undefined,
    recommended_prompts: detail.prompts.recommended,
    defaults: {
      model: normalizeScalarDefault(detail.defaults.model),
      permission: normalizeScalarDefault(detail.defaults.permission),
      thought_level: normalizeScalarDefault(detail.defaults.thought_level),
      skills: { mode: 'fixed', value: edits.enabledSkillNames },
      mcps: { mode: 'fixed', value: edits.selectedMcpIds },
    },
  };

  // Generated presets reject name/avatar/agent_id; user presets carry them.
  if (detail.source === 'generated') {
    return base;
  }
  return {
    ...base,
    name: detail.profile.name,
    avatar: detail.profile.avatar,
    agent_id: detail.engine.agent_id,
  };
};
