/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IMcpServer } from '@/common/config/storage';
import type { AssistantDetail } from '@/common/types/agent/assistantTypes';
import { ensureBackendMcpCatalog } from '@/renderer/hooks/mcp/catalog';
import { resolveGuidAssistantDefaults } from '@/renderer/pages/guid/utils/assistantDefaults';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { buildAssistantCapabilityUpdate } from './buildAssistantCapabilityUpdate';

/** A skill row for the editable checkbox list. */
export interface CapabilitySkill {
  name: string;
  description: string;
  /** Auto-inject builtin skills are opt-out; the rest are opt-in. */
  isAuto: boolean;
}

const sameSet = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((item) => set.has(item));
};

const toggle = (list: string[], value: string): string[] =>
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

export interface AssistantCapabilityEditor {
  /** All installed skills (opt-in + auto builtin), for the checkbox list. */
  allSkills: CapabilitySkill[];
  /** All available MCP servers (user + builtin), for the checkbox list. */
  mcpServers: IMcpServer[];
  isSkillChecked: (skill: CapabilitySkill) => boolean;
  isMcpChecked: (serverId: string) => boolean;
  toggleSkill: (name: string, isAuto: boolean) => void;
  toggleMcp: (serverId: string) => void;
  activeSkillCount: number;
  activeMcpCount: number;
  /** True when this chat is bound to an editable (non-builtin) preset. */
  canEdit: boolean;
  /** True when the local selection differs from the persisted preset. */
  dirty: boolean;
  saving: boolean;
  /** Persist the current selection onto the bound assistant. Returns success. */
  save: () => Promise<boolean>;
}

/**
 * Backs the editable skill/MCP menu of an existing chat's `+` popover. The
 * selection edits the *bound assistant/preset* (so new chats of that preset reuse
 * it) — the running session stays frozen, matching backend semantics.
 */
export const useAssistantCapabilityEditor = (assistantId?: string): AssistantCapabilityEditor => {
  const { data: skillCatalog } = useSWR('capability-editor-skills', () => ipcBridge.fs.listAvailableSkills.invoke());
  const { data: mcpCatalog } = useSWR('capability-editor-mcp', () =>
    ensureBackendMcpCatalog().then(({ allServers }) => allServers)
  );
  const { data: detail, mutate: mutateDetail } = useSWR<AssistantDetail | null>(
    assistantId ? ['capability-editor-assistant', assistantId] : null,
    () => ipcBridge.assistants.get.invoke({ id: assistantId as string })
  );

  const allSkills = useMemo<CapabilitySkill[]>(
    () =>
      (skillCatalog ?? []).map((s) => ({
        name: s.name,
        description: s.description,
        isAuto: s.source === 'builtin' && s.is_auto_inject,
      })),
    [skillCatalog]
  );
  const mcpServers = useMemo<IMcpServer[]>(() => mcpCatalog ?? [], [mcpCatalog]);

  const [enabledSkillNames, setEnabledSkillNames] = useState<string[]>([]);
  const [disabledBuiltinNames, setDisabledBuiltinNames] = useState<string[]>([]);
  const [selectedMcpIds, setSelectedMcpIds] = useState<string[]>([]);
  const [baseline, setBaseline] = useState<{ enabled: string[]; disabled: string[]; mcp: string[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const seededForRef = useRef<string | undefined>(undefined);

  // Seed the local selection from the bound preset the first time detail lands for
  // a given assistant. Reuse the canonical (mode-aware) resolver so the checkbox
  // state matches exactly what a new chat of this preset would start with. Seeding
  // once per assistantId keeps an incidental SWR revalidation from wiping toggles
  // the user has not saved yet.
  useEffect(() => {
    if (!detail) return;
    if (seededForRef.current === assistantId) return;
    seededForRef.current = assistantId;
    const resolved = resolveGuidAssistantDefaults(detail);
    const enabled = resolved.skillIds;
    const disabled = resolved.disabledBuiltinSkillIds;
    const mcp = resolved.mcpIds;
    setEnabledSkillNames(enabled);
    setDisabledBuiltinNames(disabled);
    setSelectedMcpIds(mcp);
    setBaseline({ enabled, disabled, mcp });
  }, [detail, assistantId]);

  const canEdit = Boolean(assistantId && detail && detail.source !== 'builtin');

  const isSkillChecked = useCallback(
    (skill: CapabilitySkill) =>
      skill.isAuto ? !disabledBuiltinNames.includes(skill.name) : enabledSkillNames.includes(skill.name),
    [disabledBuiltinNames, enabledSkillNames]
  );

  const isMcpChecked = useCallback((serverId: string) => selectedMcpIds.includes(serverId), [selectedMcpIds]);

  const toggleSkill = useCallback((name: string, isAuto: boolean) => {
    if (isAuto) {
      setDisabledBuiltinNames((prev) => toggle(prev, name));
    } else {
      setEnabledSkillNames((prev) => toggle(prev, name));
    }
  }, []);

  const toggleMcp = useCallback((serverId: string) => {
    setSelectedMcpIds((prev) => toggle(prev, serverId));
  }, []);

  const activeSkillCount = useMemo(() => allSkills.filter(isSkillChecked).length, [allSkills, isSkillChecked]);
  const activeMcpCount = selectedMcpIds.length;

  const dirty = Boolean(
    baseline &&
    (!sameSet(baseline.enabled, enabledSkillNames) ||
      !sameSet(baseline.disabled, disabledBuiltinNames) ||
      !sameSet(baseline.mcp, selectedMcpIds))
  );

  const save = useCallback(async () => {
    if (!detail || detail.source === 'builtin') return false;
    setSaving(true);
    try {
      const update = buildAssistantCapabilityUpdate(detail, {
        enabledSkillNames,
        disabledBuiltinNames,
        selectedMcpIds,
      });
      await ipcBridge.assistants.update.invoke(update);
      setBaseline({ enabled: enabledSkillNames, disabled: disabledBuiltinNames, mcp: selectedMcpIds });
      await mutateDetail();
      return true;
    } finally {
      setSaving(false);
    }
  }, [detail, disabledBuiltinNames, enabledSkillNames, mutateDetail, selectedMcpIds]);

  return {
    allSkills,
    mcpServers,
    isSkillChecked,
    isMcpChecked,
    toggleSkill,
    toggleMcp,
    activeSkillCount,
    activeMcpCount,
    canEdit,
    dirty,
    saving,
    save,
  };
};
