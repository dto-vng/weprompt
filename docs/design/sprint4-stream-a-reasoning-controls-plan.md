# Sprint 4 Stream A — Reasoning Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a reasoning ("Thinking level") control reachable for the runtime our users actually use — AionRS on Moonshot Kimi — by adding the missing backend advertisement and the missing pre-chat client surfaces.

**Architecture:** WePrompt already derives a Thinking level from whatever the runtime advertises in `config_options`, and already renders it **in conversation** for AionRS. Two things are missing: AionRS never advertises a reasoning option, and the **pre-chat** surfaces (Guid, scheduled tasks) do not render one even when it exists. This plan establishes whether the provider path can carry the parameter at all (Task 1), puts AionRS on a host we own (Task 2), then closes the two client gaps (Tasks 3–5) — which are testable from fixtures and need no backend. The backend advertise/honour slices are deliberately **not** planned here; they are re-planned from Task 1's findings.

**Tech Stack:** Rust 2024 / Cargo (aionrs, aioncore), strict TypeScript, React, Arco Design, i18next, Vitest 4, `@testing-library/react`, Bun 1.3.14.

**Spec:** `docs/readme/sprint4-plan.md`

---

## Immutable base

- Branch `sprint4`, base commit `15c5fafcb` (cut from `sprint3` @ `ee265dba4`).
- WePrompt worktree: `/Users/lap16603/Projects/WePrompt/.worktrees/sprint4`.
- Record the base and head commit in every acceptance report. If `sprint4` moves under you, stop and re-confirm rather than rebasing silently.

## Global constraints

- **No release or packaging work.** Verification is in dev. AionRS compiles into the aioncore binary, so nothing in this plan reaches a user until the parked release resumes (spec DR-A5). Do not describe Stream A as shipped.
- **No new migration.** Migration `019` already carries the thought-level columns; `028` is taken by the Sprint 3 v0.1.55 candidate. If you believe you need a migration, stop — that means the design changed.
- **The advertised option is `category: "thought_level"`, `id: "reasoning_effort"`** (spec DR-A7). Pin the pair in a test.
- **Absent means unsupported, never permissive.** A model with no capability evidence advertises nothing and renders no control. Do not reintroduce the fail-open that `06cd65bed` and `b972d3be2` closed.
- **Every SHA, tag, run id, or checksum you introduce is verified out of band** before it lands in a document or a constant. This rule exists because BUG-040 put a fabricated commit into a production constant and self-referential tests greened it.
- i18n keys ship in all 12 locales **in the same task** that references them, then `bun run i18n:types` and `node scripts/check-i18n.js`. A repo test fails on any key missing from any locale.
- Creative Studio 2 runs in parallel on this machine. Test durations inflate several-fold under concurrent sessions; a slow run is not a failing run. Treat a timeout failure as a load artifact until proven otherwise.

## File structure

| File                                                                               | Responsibility                                                                                                                                   | Task |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| `docs/design/sprint4-aionrs-reasoning-findings.md`                                 | **Create.** The Task 1 spike's written answer: can the Moonshot path carry a reasoning parameter, under what field, with what values, per model. | 1    |
| `<aioncore>/Cargo.toml`                                                            | **Modify.** Re-pin the six `aion-*` crates to the owned fork.                                                                                    | 2    |
| `packages/desktop/src/renderer/pages/guid/components/GuidModelSelector.tsx`        | **Modify.** Render the Thinking level in the `isGeminiMode` branch, which today returns without it.                                              | 3    |
| `tests/unit/renderer/GuidModelSelector.dom.test.tsx`                               | **Create.** Covers both branches: control present when advertised, absent when not.                                                              | 3    |
| `packages/desktop/src/renderer/pages/guid/GuidPage.tsx`                            | **Modify.** Stop nulling `thoughtLevelOption` for `isGeminiMode`.                                                                                | 3    |
| `packages/desktop/src/renderer/pages/cron/ScheduledTasksPage/CreateTaskDialog.tsx` | **Modify.** Derive the option from the managed agent catalog, render it, and write the choice into `config_options`.                             | 4    |
| `tests/unit/renderer/cron/CreateTaskDialog.dom.test.tsx`                           | **Modify.** Assert the level is carried into `agent_config.config_options`.                                                                      | 4    |
| `packages/desktop/src/renderer/pages/cron/ScheduledTasksPage/TaskDetailPage.tsx`   | **Modify.** Show the effective level when none was chosen, instead of hiding the row.                                                            | 5    |
| `tests/unit/renderer/cron/TaskDetailPage.dom.test.tsx`                             | **Modify.** Assert both the chosen and default cases.                                                                                            | 5    |
| `packages/desktop/src/renderer/services/i18n/locales/*/cron.json`                  | **Modify (12 files).** The default-level copy.                                                                                                   | 5    |
| `TASKS.md`, `docs/design/epic003-backend-decision-record.md`                       | **Modify.** Correct EPIC-003's charter and close BUG-045's live items.                                                                           | 6    |

---

## Task 1: Establish whether the provider path can carry a reasoning parameter

This is the one genuine unknown in Stream A, and **everything backend-side depends on it**. It is a
read-only investigation producing a tracked document. Do not modify aionrs or aioncore in this task.

**Files:**

- Create: `docs/design/sprint4-aionrs-reasoning-findings.md`

- [ ] **Step 1: Locate the checkouts and record exactly what you are reading**

```bash
ls -d /Users/lap16603/Projects/aionrs /Users/lap16603/Projects/aioncore
git -C /Users/lap16603/Projects/aionrs rev-parse --abbrev-ref HEAD
git -C /Users/lap16603/Projects/aionrs rev-parse HEAD
git -C /Users/lap16603/Projects/aioncore rev-parse HEAD
git -C /Users/lap16603/Projects/aioncore describe --tags --always
```

Expected: both paths exist. The aioncore checkout is known to be stale (v0.1.45, 20 migrations), so
**do not read the working tree for release-line facts** — use `git show <ref>:<path>` against the
shipped ref, or fetch it first.

- [ ] **Step 2: Find the shipped aionrs pin**

```bash
grep -n 'aionrs' /Users/lap16603/Projects/aioncore/Cargo.toml
```

Expected: six `aion-*` entries pointing at `https://github.com/iOfficeAI/aionrs.git` with a `tag`.
Record that tag verbatim — it is the fork point for Task 2, and it is **not** the `v0.2.10` that
EPIC-003's plans assumed.

- [ ] **Step 3: Fetch the shipped aionrs tag so you read what we ship**

```bash
cd /Users/lap16603/Projects/aionrs
git fetch --no-tags https://github.com/iOfficeAI/aionrs.git refs/tags/<TAG>:refs/tags/shipped-<TAG>
git rev-parse shipped-<TAG>^{commit}
```

Expected: a 40-character commit SHA. If the fetch fails for lack of network, **stop and report** —
do not answer this task from the stale working tree.

- [ ] **Step 4: Search the shipped tree for an existing reasoning path**

```bash
cd /Users/lap16603/Projects/aionrs
git grep -n -iE 'reasoning|thinking|thought' shipped-<TAG> -- '*.rs' | head -40
git grep -n -iE 'moonshot|kimi' shipped-<TAG> -- '*.rs' | head -30
```

Expected: the Moonshot/Kimi provider adapter's path, and whether any reasoning field already exists.
The `fix/compact-reasoning-empty-response` branch name in this repo suggests reasoning handling
exists somewhere — establish whether it is a request parameter or only response handling.

- [ ] **Step 5: Read the adapter's request construction and answer the question**

Read the Moonshot adapter's request builder found in Step 4. Answer, with `file:line` citations
against `shipped-<TAG>`:

1. Can a reasoning/effort parameter be added to the outbound request without changing a shared
   provider-neutral type? (If it requires a shared type change, say so — that widens the blast radius.)
2. What is the exact wire field name Moonshot expects, and its accepted values?
3. Do `kimi-k2.6` and `kimi-k2.5` differ?
4. Is there an existing per-model settings lookup the adapter can read, or would the value have to be
   threaded from the caller?

- [ ] **Step 6: Confirm the per-model settings carrier actually exists**

The spec's DR-A4 assumes `027_provider_model_settings.sql` is the per-exact-model carrier, sourced
from Sprint 3's T5.1 re-charter. It is **not verified** — the local checkout has only 20 migrations.

```bash
cd /Users/lap16603/Projects/aioncore
git fetch --no-tags https://github.com/khoapnt-vng/aioncore.git refs/tags/v0.1.51:refs/tags/shipped-v0.1.51
git ls-tree --name-only shipped-v0.1.51 crates/aionui-db/migrations/ | tail -8
git show shipped-v0.1.51:crates/aionui-db/migrations/027_provider_model_settings.sql | head -40
```

Expected: `027_provider_model_settings.sql` exists and defines a per-model settings store. If it does
not exist or does not carry per-model rows, **the design premise is wrong — stop and re-plan.**

- [ ] **Step 7: Write the findings document**

Write `docs/design/sprint4-aionrs-reasoning-findings.md` containing: the recorded checkout SHAs, the
shipped aionrs tag and its peeled commit, the answers to Step 5's four questions with `file:line`
citations, the Step 6 verdict on migration `027`, and an explicit **GO** or **STOP** recommendation
for the backend advertise/honour slices.

Mark anything you could not determine as undetermined. Do not fill a gap with a plausible field name —
a wrong wire field will fail silently at the provider and look like a product bug.

- [ ] **Step 8: Commit**

```bash
cd /Users/lap16603/Projects/WePrompt/.worktrees/sprint4
git add docs/design/sprint4-aionrs-reasoning-findings.md
git diff --cached --check
git commit -m "docs(epic003): record whether the AionRS Moonshot path can carry reasoning"
```

**Expected:** a document that lets someone else decide GO/STOP without re-reading the Rust.

### Gate after Task 1

If Task 1 says **STOP**, Stream A's backend half is dead for this sprint. Tasks 3–5 still deliver
(they are fixture-tested and backend-independent), but the control stays invisible until a runtime
advertises — say that plainly in the sprint review rather than shipping a hidden feature quietly.

**The backend advertise (A3), honour (A4), and live-verify (A5) slices are intentionally not planned
in this document.** Planning them now would mean inventing Rust against a tree nobody has read.
Author them as a second plan from Task 1's findings.

---

## Task 2: Fork AionRS to an owned host and re-pin

Two separable commits. The host swap must be provably behaviour-neutral before any reasoning work
begins.

**Files:**

- Modify: `/Users/lap16603/Projects/aioncore/Cargo.toml` (the six `aion-*` entries)

- [ ] **Step 1: Create the fork and record its identity out of band**

Fork `iOfficeAI/aionrs` to `khoapnt-vng/aionrs` in the GitHub UI, then verify from the command line
rather than trusting the UI:

```bash
git ls-remote https://github.com/khoapnt-vng/aionrs.git "refs/tags/<TAG>"
```

Expected: the same object id you recorded in Task 1 Step 3. **If they differ, stop** — you are not
forking what we ship.

- [ ] **Step 2: Capture the baseline test result before touching anything**

```bash
cd /Users/lap16603/Projects/aioncore
cargo test --workspace 2>&1 | tail -20
```

Expected: record the exact pass/fail/skip counts. This is the number Step 5 must reproduce. If the
baseline is already red, record which tests and stop — you cannot prove neutrality against a red base.

- [ ] **Step 3: Re-pin the six crates to the owned host, same tag**

In `Cargo.toml`, change only the URL on each of the six `aion-*` entries:

```toml
aion-agent = { git = "https://github.com/khoapnt-vng/aionrs.git", tag = "<TAG>" }
aion-providers = { git = "https://github.com/khoapnt-vng/aionrs.git", tag = "<TAG>" }
aion-types = { git = "https://github.com/khoapnt-vng/aionrs.git", tag = "<TAG>" }
aion-protocol = { git = "https://github.com/khoapnt-vng/aionrs.git", tag = "<TAG>" }
aion-config = { git = "https://github.com/khoapnt-vng/aionrs.git", tag = "<TAG>" }
aion-mcp = { git = "https://github.com/khoapnt-vng/aionrs.git", tag = "<TAG>" }
```

Do **not** change `<TAG>` in this commit. Host and version never move together — if the build breaks
you must be able to tell which change did it.

- [ ] **Step 4: Confirm the lockfile resolves to the same commit**

```bash
cargo update -p aion-types --dry-run 2>&1 | head -20
grep -n -A3 'name = "aion-types"' Cargo.lock
```

Expected: the resolved source changes host; the resolved revision is the object id from Step 1.

- [ ] **Step 5: Prove behaviour is unchanged**

```bash
cargo test --workspace 2>&1 | tail -20
```

Expected: **identical** counts to Step 2. Any difference means the fork is not the same code — stop.

- [ ] **Step 6: Commit**

```bash
git add Cargo.toml Cargo.lock
git diff --cached --check
git commit -m "build(deps): re-pin the aion-* crates to the owned fork"
```

**Expected:** a diff containing only six URLs and their lock entries, with unchanged test counts.

---

## Task 3: Render the Thinking level on the pre-chat selector

`GuidModelSelector` has two returns. The `isGeminiMode` branch (opens line 115, returns line 143)
renders **no** Thinking level; the control exists only in the ACP return (line 206, label line 232).
`isGeminiMode` covers `gemini` **and** `aionrs`, so the runtime our users use has no pre-chat control.
`GuidPage.tsx:908,952` also passes `thoughtLevelOption={isGeminiMode ? null : …}`.

Removing that `null` is safe by construction: the option is built from what the agent actually
advertises (`buildAgentRuntimeThoughtLevelOption`), so a runtime that advertises nothing still renders
nothing.

**Files:**

- Modify: `packages/desktop/src/renderer/pages/guid/components/GuidModelSelector.tsx`
- Modify: `packages/desktop/src/renderer/pages/guid/GuidPage.tsx:908,952`
- Test: `tests/unit/renderer/GuidModelSelector.dom.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/unit/renderer/GuidModelSelector.dom.test.tsx`:

```tsx
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import GuidModelSelector from '@/renderer/pages/guid/components/GuidModelSelector';
import type { IProvider, TProviderWithModel } from '@/common/config/storage';
import type { AgentRuntimeDerivedOption } from '@/renderer/utils/model/agentRuntimeCatalog';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

const provider: IProvider = {
  id: 'moonshot',
  name: 'Moonshot',
  platform: 'openai',
  use_model: 'kimi-k2.6',
  models: ['kimi-k2.6', 'kimi-k2.5'],
} as IProvider;

const thoughtLevel: AgentRuntimeDerivedOption = {
  id: 'reasoning_effort',
  category: 'thought_level',
  currentValue: 'high',
  options: [
    { value: 'low', label: 'Low' },
    { value: 'high', label: 'High' },
  ],
} as AgentRuntimeDerivedOption;

const renderSelector = (props: Partial<React.ComponentProps<typeof GuidModelSelector>> = {}) =>
  render(
    <GuidModelSelector
      isGeminiMode
      modelList={[provider]}
      current_model={{ ...provider, use_model: 'kimi-k2.6' } as TProviderWithModel}
      setCurrentModel={vi.fn().mockResolvedValue(undefined)}
      currentAcpCachedModelInfo={null}
      selectedAcpModel={null}
      setSelectedAcpModel={vi.fn()}
      {...props}
    />
  );

describe('GuidModelSelector thinking level on the provider-grouped branch', () => {
  it('offers the thinking level when the runtime advertises one', async () => {
    const onThoughtLevelSelect = vi.fn();
    renderSelector({ thoughtLevelOption: thoughtLevel, onThoughtLevelSelect });

    fireEvent.mouseEnter(screen.getByTestId('guid-model-selector'));

    await waitFor(() => expect(screen.getByText('Thinking Level')).toBeTruthy());

    fireEvent.mouseEnter(screen.getByText('Thinking Level'));
    await waitFor(() => expect(screen.getByText('Low')).toBeTruthy());
    fireEvent.click(screen.getByText('Low'));

    expect(onThoughtLevelSelect).toHaveBeenCalledWith('low');
  });

  it('renders no thinking level when the runtime advertises none', async () => {
    renderSelector({ thoughtLevelOption: null });

    fireEvent.mouseEnter(screen.getByTestId('guid-model-selector'));

    await waitFor(() => expect(screen.getByTestId('guid-model-selector')).toBeTruthy());
    expect(screen.queryByText('Thinking Level')).toBeNull();
  });

  it('renders no thinking level when the advertised option has no values', async () => {
    renderSelector({ thoughtLevelOption: { ...thoughtLevel, options: [] } });

    fireEvent.mouseEnter(screen.getByTestId('guid-model-selector'));

    await waitFor(() => expect(screen.getByTestId('guid-model-selector')).toBeTruthy());
    expect(screen.queryByText('Thinking Level')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm the first case fails**

```bash
cd /Users/lap16603/Projects/WePrompt/.worktrees/sprint4
bunx vitest run tests/unit/renderer/GuidModelSelector.dom.test.tsx
```

Expected: the first test FAILS (no "Thinking Level" text in the provider-grouped branch). The second
and third PASS already — they encode the fail-closed behaviour that must survive the change.

- [ ] **Step 3: Render the control in the `isGeminiMode` branch**

In `GuidModelSelector.tsx`, inside `if (isGeminiMode) { … }`, extract the existing droplist body into
a named node and wrap it in the same two-level layout the ACP branch uses. Replace the `return (` at
line 143 with:

```tsx
const providerMenuItems =
  providerModelGroups.length === 0
    ? [
        <Menu.Item
          key='no-models'
          className='px-12px py-12px text-t-secondary text-14px text-center flex justify-center items-center'
          disabled
        >
          {t('settings.noAvailableModels')}
        </Menu.Item>,
        addModelItem,
      ]
    : [
        <RuntimeSelectorModelList
          key='model-list'
          groups={providerModelGroups}
          currentModelId={currentProviderModelId}
          onSelect={(id) => {
            const entry = providerModelLookup.get(id);
            if (!entry) return;
            setCurrentModel({ ...entry.provider, use_model: entry.modelName } as TProviderWithModel).catch((error) => {
              console.error('Failed to set current model:', error);
            });
          }}
        />,
        addModelItem,
      ];

return (
  <Dropdown
    trigger='hover'
    droplist={
      <Menu selectedKeys={currentProviderModelId ? [currentProviderModelId] : []}>
        {normalizedThoughtLevelOption ? (
          <>
            <Menu.SubMenu
              key='model'
              triggerProps={RUNTIME_SUBMENU_TRIGGER_PROPS}
              title={
                <RuntimeSelectorSubMenuTitle
                  label={t('common.model', { defaultValue: 'Model' })}
                  value={geminiButtonLabel}
                />
              }
            >
              {providerMenuItems}
            </Menu.SubMenu>
            <Menu.SubMenu
              key='thought-level'
              triggerProps={RUNTIME_SUBMENU_TRIGGER_PROPS}
              title={
                <RuntimeSelectorSubMenuTitle
                  label={t('agent.thoughtLevel.label')}
                  value={getCurrentThoughtLevelLabel(normalizedThoughtLevelOption)}
                />
              }
            >
              {normalizedThoughtLevelOption.options.map((item) => (
                <Menu.Item
                  key={item.value}
                  className={item.value === normalizedThoughtLevelOption.currentValue ? '!bg-2' : ''}
                  onClick={() => onThoughtLevelSelect?.(item.value)}
                >
                  <RuntimeSelectorCheckedItem
                    selected={item.value === normalizedThoughtLevelOption.currentValue}
                    description={item.description}
                  >
                    {item.label}
                  </RuntimeSelectorCheckedItem>
                </Menu.Item>
              ))}
            </Menu.SubMenu>
          </>
        ) : (
          providerMenuItems
        )}
      </Menu>
    }
  >
    <Button
      className={'sendbox-model-btn guid-config-btn'}
      shape='round'
      size='small'
      data-testid='guid-model-selector'
    >
      <span className='flex items-center gap-6px min-w-0'>
        <Brain theme='outline' size='14' fill={iconColors.secondary} className='shrink-0' />
        <span className='guid-model-label'>
          {composeRuntimeSelectorLabel({
            modelLabel: geminiButtonLabel,
            thoughtLevel: normalizedThoughtLevelOption,
          })}
        </span>
        <Down theme='outline' size='12' fill={iconColors.secondary} className='shrink-0' />
      </span>
    </Button>
  </Dropdown>
);
```

`normalizedThoughtLevelOption`, `composeRuntimeSelectorLabel`, `getCurrentThoughtLevelLabel`,
`RUNTIME_SUBMENU_TRIGGER_PROPS`, `RuntimeSelectorSubMenuTitle` and `RuntimeSelectorCheckedItem` are
already in scope in this file — the ACP branch uses all six. Add no new imports.

- [ ] **Step 4: Run the test again**

```bash
bunx vitest run tests/unit/renderer/GuidModelSelector.dom.test.tsx
```

Expected: all three PASS. If the two fail-closed cases broke, `normalizedThoughtLevelOption` is not
guarding on `options.length > 0` — fix the guard, not the test.

- [ ] **Step 5: Stop nulling the option on the Guid page**

In `GuidPage.tsx`, at both line 908 and line 952, replace:

```tsx
      thoughtLevelOption={isGeminiMode ? null : agentSelection.currentThoughtLevelOption}
```

with:

```tsx
      thoughtLevelOption={agentSelection.currentThoughtLevelOption}
```

- [ ] **Step 6: Run the Guid suites and the full renderer project**

```bash
bunx vitest run tests/unit/renderer/GuidModelSelector.dom.test.tsx tests/unit/renderer/GuidActionRow.dom.test.tsx tests/unit/renderer/useGuidSend.dom.test.ts tests/unit/renderer/useGuidAgentSelection.dom.test.ts
bunx tsc --noEmit
```

Expected: all green. `GuidActionRow` already handles a non-null option (`GuidActionRow.tsx:282`), so
no change is expected there — if it regresses, that is a real finding, not a test to relax.

- [ ] **Step 7: Commit**

```bash
git add packages/desktop/src/renderer/pages/guid/components/GuidModelSelector.tsx packages/desktop/src/renderer/pages/guid/GuidPage.tsx tests/unit/renderer/GuidModelSelector.dom.test.tsx
git diff --cached --check
git commit -m "feat(agent): offer the thinking level on the provider-grouped selector"
```

**Expected:** the pre-chat selector offers a Thinking level exactly when the runtime advertises one.

---

## Task 4: Scheduled tasks carry the reasoning level

`CreateTaskDialog` already calls `useManagedAgentRuntimeCatalog()` (line 245) and already renders
`GuidModelSelector` (line ~967), but passes no `thoughtLevelOption`; its `config_options` state is
only ever hydrated from an edited job (line 295) or reset to `undefined` (lines 307, 514). Nothing
writes it. The carrier is `agent_config.config_options` — `ICronAgentConfigWrite` (`ipcBridge.ts:1855`)
has no `thought_level` field, and `resolveCronAgentConfig` already forwards `config_options`.

**Files:**

- Modify: `packages/desktop/src/renderer/pages/cron/ScheduledTasksPage/CreateTaskDialog.tsx`
- Test: `tests/unit/renderer/cron/CreateTaskDialog.dom.test.tsx`

- [ ] **Step 1: Read the existing test to reuse its harness**

```bash
sed -n '1,80p' tests/unit/renderer/cron/CreateTaskDialog.dom.test.tsx
```

Note how it mocks `useManagedAgentRuntimeCatalog`, `useConversationAssistants`, and `ipcBridge`, and
how it opens the Advanced section. Reuse that harness — do not invent a second one.

- [ ] **Step 2: Write the failing test**

Append to `tests/unit/renderer/cron/CreateTaskDialog.dom.test.tsx`, adapting the mock names to the
harness you just read:

```tsx
it('carries the chosen thinking level into agent_config.config_options', async () => {
  // The managed agent catalog advertises a reasoning option for this agent.
  // Mock shape must match useManagedAgentRuntimeCatalog()'s return: entries
  // keyed by agent id, carrying the runtime's advertised config_options.
  setManagedAgentCatalog([
    {
      id: 'agent-aionrs',
      yolo_id: 'yolo',
      config_options: {
        config_options: [
          {
            id: 'reasoning_effort',
            category: 'thought_level',
            name: 'Thinking Level',
            current_value: 'high',
            options: [
              { value: 'low', name: 'Low' },
              { value: 'high', name: 'High' },
            ],
          },
        ],
      },
    },
  ]);

  renderDialog();
  await selectAssistant('agent-aionrs');
  await openAdvanced();

  fireEvent.mouseEnter(screen.getByTestId('guid-model-selector'));
  await waitFor(() => expect(screen.getByText('Thinking Level')).toBeTruthy());
  fireEvent.mouseEnter(screen.getByText('Thinking Level'));
  await waitFor(() => expect(screen.getByText('Low')).toBeTruthy());
  fireEvent.click(screen.getByText('Low'));

  await submitDialog();

  await waitFor(() => expect(createCronJob).toHaveBeenCalled());
  const params = createCronJob.mock.calls[0][0];
  expect(params.agent_config.config_options).toEqual({ reasoning_effort: 'low' });
});
```

- [ ] **Step 3: Run it and confirm it fails**

```bash
bunx vitest run tests/unit/renderer/cron/CreateTaskDialog.dom.test.tsx
```

Expected: FAIL — "Thinking Level" is never rendered, because no `thoughtLevelOption` is passed.

- [ ] **Step 4: Derive the option and wire the handler**

In `CreateTaskDialog.tsx`, add the import alongside the existing catalog import (line 19):

```tsx
import { buildAgentRuntimeThoughtLevelOption } from '@/renderer/utils/model/agentRuntimeCatalog';
```

After the `resolveAutoApproveModeFromAgentMetadata` callback (which already looks agents up the same
way, around line 362), add:

```tsx
// Pre-chat surface: the level comes from what the selected agent advertises in
// its runtime catalog, never from a name heuristic. Absent => no control.
const selectedAgentRuntimeCatalog = useMemo(
  () =>
    selectedAssistant?.agent_id
      ? managedAgentRuntimeCatalog.find((item) => item.id === selectedAssistant.agent_id)
      : undefined,
  [managedAgentRuntimeCatalog, selectedAssistant]
);

const advertisedThoughtLevelOption = useMemo(
  () => buildAgentRuntimeThoughtLevelOption(selectedAgentRuntimeCatalog),
  [selectedAgentRuntimeCatalog]
);

// Overlay the user's pending choice so the menu shows what they picked.
const currentThoughtLevelOption = useMemo(() => {
  if (!advertisedThoughtLevelOption) return null;
  const chosen = config_options?.[advertisedThoughtLevelOption.id];
  return chosen ? { ...advertisedThoughtLevelOption, currentValue: chosen } : advertisedThoughtLevelOption;
}, [advertisedThoughtLevelOption, config_options]);

const handleThoughtLevelSelect = useCallback(
  (value: string) => {
    const optionId = advertisedThoughtLevelOption?.id;
    if (!optionId) return;
    setConfigOptions((prev) => ({ ...(prev ?? {}), [optionId]: value }));
  },
  [advertisedThoughtLevelOption]
);
```

- [ ] **Step 5: Pass both props to the selector**

At the `GuidModelSelector` usage (around line 967), add two props:

```tsx
<GuidModelSelector
  isGeminiMode={isGeminiMode}
  modelList={filteredProviders}
  current_model={geminiCurrentModel}
  setCurrentModel={handleGeminiModelSelect}
  currentAcpCachedModelInfo={acpCachedModelInfo}
  selectedAcpModel={model_id ?? null}
  setSelectedAcpModel={handleAcpModelSelect}
  thoughtLevelOption={currentThoughtLevelOption}
  onThoughtLevelSelect={handleThoughtLevelSelect}
/>
```

- [ ] **Step 6: Make the Advanced section reachable when only a level exists**

`showModelSelector` is `Boolean(resolvedBackend && (isGeminiMode || acpCachedModelInfo))` (line 492).
An ACP agent with a level but no cached model list would hide the selector and the level with it.
Widen it:

```tsx
const showModelSelector = Boolean(resolvedBackend && (isGeminiMode || acpCachedModelInfo || currentThoughtLevelOption));
```

- [ ] **Step 7: Run the test and the neighbouring suites**

```bash
bunx vitest run tests/unit/renderer/cron/
bunx tsc --noEmit
```

Expected: the new test PASSES and the existing cron tests stay green — in particular
`resolveCronAgentConfig.test.ts`, which must need no change, since the carrier already existed.

- [ ] **Step 8: Commit**

```bash
git add packages/desktop/src/renderer/pages/cron/ScheduledTasksPage/CreateTaskDialog.tsx tests/unit/renderer/cron/CreateTaskDialog.dom.test.tsx
git diff --cached --check
git commit -m "feat(cron): carry the chosen thinking level onto a scheduled task"
```

**Expected:** a scheduled task persists the chosen level in `agent_config.config_options`.

> **Not proven by this task:** that the backend _applies_ the level when the task fires. Persisting is
> not honouring. Task 4b settles it.

---

## Task 4b: Prove the backend honours the level when the task fires

A persisted `config_options` record that the runtime ignores is a control that lies to the user. The
spec requires this be settled, not assumed.

**Files:**

- Modify: `docs/design/sprint4-aionrs-reasoning-findings.md` (append a section)

- [ ] **Step 1: Create a scheduled task carrying a level, and fire it by hand**

With dev running, create a task through the dialog with a thinking level chosen, then use **Run now**
on its detail page so you do not wait for a schedule.

- [ ] **Step 2: Read what the job actually stored**

```bash
grep -o '"config_options":{[^}]*}' /tmp/sprint4-dev.log | tail -3
```

Expected: the chosen `{"reasoning_effort":"<value>"}`. If it is absent, Task 4 did not take effect —
go back rather than continuing.

- [ ] **Step 3: Determine whether the fired conversation received it**

Inspect the conversation the run created and check whether the selection reached the session:

```bash
grep -nE 'cron|thought_level|reasoning_effort|config_option' /tmp/sprint4-dev.log | tail -30
```

Expected: evidence that the value was applied when the conversation started — a `setConfigOption`-shaped
call, or the value present on the new conversation's session config options. **Absence of evidence here
is the finding**, so record exactly what you searched for and what you saw.

- [ ] **Step 4: Record the verdict**

Append to the findings document: honoured, ignored, or undetermined, with the commands and output. If
**ignored**, state plainly that A6 is a backend task, that the UI change alone does not deliver the
outcome, and that the control should not be described as working until the backend half lands.

- [ ] **Step 5: Commit**

```bash
git add docs/design/sprint4-aionrs-reasoning-findings.md
git commit -m "docs(cron): record whether a scheduled task honours its thinking level"
```

**Expected:** a written verdict. This task cannot "pass" by producing no evidence.

---

## Task 5: The task detail page states the effective level

`TaskDetailPage.tsx:578-583` renders the config-options row only when the record is non-empty, so a
task with no explicit choice shows nothing and the user cannot tell what it will run at. The spec's
decision is to show the effective level, marked as the default.

**Files:**

- Modify: `packages/desktop/src/renderer/pages/cron/ScheduledTasksPage/TaskDetailPage.tsx`
- Modify: `packages/desktop/src/renderer/services/i18n/locales/*/cron.json` (12 files)
- Test: `tests/unit/renderer/cron/TaskDetailPage.dom.test.tsx`

- [ ] **Step 1: Add the i18n key to en-US**

In `packages/desktop/src/renderer/services/i18n/locales/en-US/cron.json`, inside the `"detail"`
object (line 32):

```json
    "thoughtLevelDefault": "{{value}} (default)",
```

- [ ] **Step 2: Add the same key to the other 11 locales**

Add `"thoughtLevelDefault"` inside each `"detail"` object in: `de-DE`, `es-ES`, `fa-IR`, `ja-JP`,
`ko-KR`, `pt-BR`, `ru-RU`, `tr-TR`, `uk-UA`, `zh-CN`, `zh-TW`. Translate the parenthetical; keep the
`{{value}}` placeholder verbatim. **Only add keys — never reorder or rename** existing ones, or the
twelve locale files stop auto-merging and must be resolved by hand.

Then regenerate and check:

```bash
bun run i18n:types
node scripts/check-i18n.js
```

Expected: exit 0. A missing locale fails a repo test, which is why this is in the same task.

- [ ] **Step 3: Write the failing test**

Add to `tests/unit/renderer/cron/TaskDetailPage.dom.test.tsx`, reusing its existing job fixture
helper:

```tsx
it('states the effective thinking level when the task carries no explicit choice', async () => {
  renderDetail(
    makeJob({
      metadata: {
        agent_config: { name: 'Aion CLI', config_options: undefined },
      },
    })
  );

  await waitFor(() => expect(screen.getByText('High (default)')).toBeTruthy());
});

it('states the chosen thinking level when the task carries one', async () => {
  renderDetail(
    makeJob({
      metadata: {
        agent_config: { name: 'Aion CLI', config_options: { reasoning_effort: 'low' } },
      },
    })
  );

  await waitFor(() => expect(screen.getByText('low')).toBeTruthy());
  expect(screen.queryByText(/\(default\)/)).toBeNull();
});
```

The first test requires the page to know the runtime's advertised default. Supply it through the same
managed-agent catalog mock Task 4 used, with `current_value: 'high'`.

- [ ] **Step 4: Run it and confirm the first case fails**

```bash
bunx vitest run tests/unit/renderer/cron/TaskDetailPage.dom.test.tsx
```

Expected: the "(default)" case FAILS — the row is hidden when `config_options` is empty.

- [ ] **Step 5: Render the effective value**

Replace the guarded block at `TaskDetailPage.tsx:578-583` so the row renders whenever either an
explicit selection or an advertised default exists:

```tsx
{
  (() => {
    const chosen = job.metadata.agent_config?.config_options;
    const hasChoice = chosen && Object.keys(chosen).length > 0;
    if (hasChoice) {
      return (
        <div>
          <h2 className='m-0 text-13px font-medium text-t-secondary'>{t('acp.config.reasoning_effort')}</h2>
          <p className='m-0 text-14px text-t-primary'>{Object.values(chosen).join(', ')}</p>
        </div>
      );
    }
    if (!advertisedThoughtLevelLabel) return null;
    return (
      <div>
        <h2 className='m-0 text-13px font-medium text-t-secondary'>{t('acp.config.reasoning_effort')}</h2>
        <p className='m-0 text-14px text-t-primary'>
          {t('cron.detail.thoughtLevelDefault', { value: advertisedThoughtLevelLabel })}
        </p>
      </div>
    );
  })();
}
```

Derive `advertisedThoughtLevelLabel` near the top of the component, mirroring Task 4:

```tsx
const managedAgentRuntimeCatalog = useManagedAgentRuntimeCatalog();
const { presetAssistants } = useConversationAssistants();
const advertisedThoughtLevelLabel = useMemo(() => {
  // The job stores an ASSISTANT id; the runtime catalog is keyed by AGENT id.
  // Resolve assistant -> agent_id before the lookup, the same way
  // CreateTaskDialog's resolveAutoApproveModeFromAgentMetadata does. Comparing
  // an assistant id against catalog ids silently matches nothing and the row
  // just never renders.
  const assistantId = job?.metadata.agent_config?.assistant_id;
  const assistant = assistantId ? presetAssistants.find((item) => item.id === assistantId) : undefined;
  const agent = assistant?.agent_id
    ? managedAgentRuntimeCatalog.find((item) => item.id === assistant.agent_id)
    : undefined;
  const option = buildAgentRuntimeThoughtLevelOption(agent);
  if (!option || option.options.length === 0) return null;
  const current = option.currentValue || option.options[0]?.value;
  return option.options.find((item) => item.value === current)?.label ?? current ?? null;
}, [job, presetAssistants, managedAgentRuntimeCatalog]);
```

Add the imports if absent: `useManagedAgentRuntimeCatalog` from
`@/renderer/hooks/agent/useManagedAgents`, `buildAgentRuntimeThoughtLevelOption` from
`@/renderer/utils/model/agentRuntimeCatalog`, and `useConversationAssistants` from
`@renderer/pages/conversation/hooks/useConversationAssistants`.

**Verify the assumption before you rely on it.** Confirm `agent_config.assistant_id` really holds an
assistant id on this page — read `resolveCronAgentConfig.ts` and one real job record:

```bash
grep -n 'assistant_id' packages/desktop/src/renderer/pages/cron/ScheduledTasksPage/resolveCronAgentConfig.ts
```

If it holds an agent id instead, drop the `presetAssistants` indirection and look it up directly. Do
not keep both paths "just in case".

- [ ] **Step 6: Run the tests**

```bash
bunx vitest run tests/unit/renderer/cron/
bunx tsc --noEmit
node scripts/check-i18n.js
```

Expected: all green, including the pre-existing detail-page tests.

- [ ] **Step 7: Commit**

```bash
git add packages/desktop/src/renderer/pages/cron/ScheduledTasksPage/TaskDetailPage.tsx tests/unit/renderer/cron/TaskDetailPage.dom.test.tsx packages/desktop/src/renderer/services/i18n/locales
git diff --cached --check
git commit -m "feat(cron): state the effective thinking level on a scheduled task"
```

**Expected:** the detail page answers "what will this run at" in both cases.

---

## Task 6: Correct the record

EPIC-003's tracked charter is wrong in ways that will mislead the next reader. Fixing it is a task.

**Files:**

- Modify: `TASKS.md` (the EPIC-003 and BUG-045 entries)
- Modify: `docs/design/epic003-backend-decision-record.md`

- [ ] **Step 1: Correct EPIC-003's entry in `TASKS.md`**

State, with the evidence from `docs/readme/sprint4-plan.md` Findings 1–3a:

1. A reasoning control **already ships** and is evidence-based (`agentRuntimeCatalog.ts:238`), rendered
   in conversation on both ACP and AionRS. The "no reasoning control exists" framing is wrong.
2. Sprint 3 already landed the fail-closed half (`06cd65bed`, `b972d3be2`).
3. No runtime available to us advertises one — measured against the agent catalog, a live OpenCode ACP
   handshake, 34 conversations and 28 assistants on 2026-08-17.
4. Discovery rides `config_options`; the `/health` seam is superseded (DR-A1).
5. No new migration is needed (`019` carries the columns); `028` is taken by the v0.1.55 candidate, so
   EPIC-003's `028`/`029` steps are stale.
6. The pre-chat surfaces needed real client work (Finding 3a) — the epic is far smaller than
   "31 tasks across three repositories", but it is not zero.

- [ ] **Step 2: Correct the backend decision record**

Apply the same corrections to `docs/design/epic003-backend-decision-record.md`, and mark DR-2's
`/health` seam superseded rather than deleting it — the reasoning for the change is the useful part.

- [ ] **Step 3: Close BUG-045's live items**

Update the BUG-045 entry:

- The `ReadonlySet` item is **fixed** by `b972d3be2`.
- The `config_options` question is **answered yes** — it satisfies the discovery seam (DR-A1).
- Correct its two wrong citations, verified 2026-08-17: the idiom sites are
  `renderer/hooks/agent/useModelProviderList.ts:66` (the entry omits the `agent/` segment) and
  `renderer/pages/guid/utils/modelUtils.ts:39` (the entry says `:38`). Both read
  `(functionCalling === true || functionCalling === undefined) && excluded !== true`.
- Leave the explicit-negative item open with its reachability note: `hasModelCapability` has no
  production callers today, so it is latent, not live.

- [ ] **Step 4: Verify the formatting gate**

```bash
bunx oxfmt --check TASKS.md docs/design/epic003-backend-decision-record.md
```

Expected: "All matched files use the correct format."

- [ ] **Step 5: Commit**

```bash
git add TASKS.md docs/design/epic003-backend-decision-record.md
git diff --cached --check
git commit -m "docs(epic003): correct the charter against measured runtime evidence"
```

**Expected:** the next reader of EPIC-003 gets the true scope.

---

## Verification checklist

- [ ] Task 1's findings document exists, cites `file:line` against the shipped refs, and gives an
      explicit GO/STOP. Migration `027`'s existence is confirmed or the premise is retracted.
- [ ] The aionrs fork resolves to the same object id as the shipped tag, and the re-pin reproduces the
      baseline test counts exactly.
- [ ] The pre-chat selector offers a Thinking level when advertised and **nothing** when not — both
      asserted by test, with a control case so an all-absent result cannot pass vacuously.
- [ ] A scheduled task persists the chosen level; `resolveCronAgentConfig.test.ts` needed no change.
- [ ] The detail page states the level in the chosen and default cases.
- [ ] `bunx tsc --noEmit`, `bun run lint -- --quiet`, `bunx oxfmt --check`, `node scripts/check-i18n.js`
      and the full Vitest suite are green before any push.
- [ ] The sprint review says explicitly that Stream A is verified in dev and **not shipped**, because
      the backend release is parked.
