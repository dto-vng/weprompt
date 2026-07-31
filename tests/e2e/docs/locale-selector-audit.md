# E2E Selector Audit — locale pinning and dead anchors

**Date**: 2026-07-31 (reconciled against `sprint1` @ 6b0d9ebc2)
**Purpose**: Record which e2e selectors cannot survive a non-English machine, which match nothing at all, and what to do about each.

---

## Executive Summary

**Two separate problems, and the second is the bigger one.**

1. **Locale pinning.** Nothing in the harness pins the app's language. `tests/e2e/fixtures.ts` sets no `LANG`, no `i18nextLng`, and gives each run a fresh `mkdtemp` userData dir, so no saved language exists and `initLanguage()` lands on `normalizeLanguageCode(navigator.language)`. On a de-DE machine **the whole suite runs in German**, and any selector pinned to an English literal matches nothing.

2. **Dead anchors.** A larger set of selectors matches nothing _in any locale_, including en-US, because the DOM they point at was refactored away — Arco Tabs removed from the workspace panel (`26a2e72e8`), `.workspace-tree` and `.preview-panel` surviving only as orphan CSS, a CSS-theme card grid deleted, labels renamed. These tests are failing right now on every machine, and no amount of i18n work fixes them.

The original audit conflated the two and consistently graded the second group too kindly ("1/12 — works on en-US"). Re-checking every finding against current `sprint1` moved thirteen of them.

### Status

| area                                                        | fixed  | still open | audit was wrong | (hard / soft-skip / vacuous) |
| ----------------------------------------------------------- | ------ | ---------- | --------------- | ---------------------------- |
| `cases/teams/**`                                            | 6      | 19         | 0               | (15 / 3 / 1)                 |
| `features/assistants/**` + `specs/assistant-*`              | 1      | 24         | 0               | (16 / 4 / 3)                 |
| `specs/*` (feedback & misc)                                 | 6      | 22         | 2               | (16 / 4 / 2)                 |
| `features/workspaces/**`, `previews/**`, `conversations/**` | 0      | 11         | 7               | (6 / 5 / 0)                  |
| `features/settings/**`                                      | 0      | 7          | 1               | (3 / 2 / 0)                  |
| `helpers/**` + vacuous negatives                            | 1      | 10         | 3               | (1 / 2 / 5)                  |
| **total**                                                   | **14** | **93**     | **13**          | **(57 / 20 / 11)**           |

Baseline: `npx playwright test --list` enumerates **409 tests in 105 files**.

## Three failure flavours — they need different fixes

- **hard (57)** — the locator resolves to nothing and the test times out. Loud, and it blames the UI rather than the selector.
- **soft-skip (20)** — the miss sits behind `test.skip`, `.catch(() => false)` or `if (await x.isVisible())`, so **the run stays green while the assertion never executes**. Fixing the selector is not enough; the silent skip has to go too, and doing so will surface whatever the test stopped checking.
- **vacuous-negative (11)** — `not.toContainText` / `expect(found).toBe(false)` against an English-only pattern passes for the wrong reason. These are the ones most likely to turn **red** when fixed, because the regression they were guarding may already have landed. That is the point of fixing them, but expect it.

## Already fixed (14)

MR !37 (feedback specs' locale coverage, dead Create-Team title and confirm selectors, assistant defaults card), MR !41 (deleted `team-workspace-migration.e2e.ts`, whose feature `773be05b2` removed), and the earlier sidebar/titlebar helper migration. Verified in the current tree, not assumed.

## Structural hazards

- **The suite's health depends on file order.** The Electron app is a per-worker singleton kept alive across spec files, and `features/settings/system/preferences.e2e.ts` and `preferences-extra.e2e.ts` both _end_ by selecting 简体中文. Every spec that runs after them sees the app in Chinese regardless of the machine locale. That is why some Chinese-only literals appear to "work" locally and some English-only ones do too. Any fix here should restore the language in an `afterEach`, or the results stay order-dependent.
- **`tsc` never sees `tests/`.** The root `tsconfig.json` includes only `packages/desktop/src` plus a few configs, and Playwright's transform is transpile-only, so nothing in the gate typechecks these files. Drift guards must be runtime throws, not types.

## Implementation notes for whoever picks this up

- The helper API in `sprint1` is `tests/e2e/helpers/localizedLabels.ts`: the per-module collectors (`commonLabels`, `conversationLabels`, `settingsLabels`, `teamLabels`) are **module-private**. There is no generic `labelsFor(module, key)`. To add a label set, extend that module's `*LabelBundle` interface with the optional key and export a new constant via its collector — the collector throws if no locale defines the key, which is the drift guard.
- `labelPattern(labels)` for substring text matches, `exactLabelPattern(labels)` when the match must be the whole string.
- `selectors.ts` exposes `modalCloseButton`, `collapseSidebarButton`, `expandSidebarButton`, `titlebarFeedbackButton`, `buttonWithText`, `BTN_ADD_CUSTOM_AGENT`, `BTN_ADD_CUSTOM_AGENT_MANUAL`.
- **Prefer a `data-testid` or a structural class over any label set.** Ten of twelve locales ship the untranslated "Confirm Create", so a label set there would go dead the day someone translates one. `TeamCreateModal` carries `className='team-create-modal'` on the `.arco-modal` root; `TalkToButlerButton` forwards `data-testid` and derives `${testId}-manual`.
- **Trace the label to its `t()` call. Never grep the en-US JSON.** Four distinct keys read "Report Issue" in en-US and diverge in de-DE; `addCustomAgentTitle` and `agentManagement.addCustomAgent` are both "Add Custom Agent" but differ in zh-CN. A guessed key produces a bug visible in exactly one language.
- Verify without a display: `npx playwright test --list <files>` proves the specs compile and imports resolve; for selector semantics, probe a synthetic DOM with `chromium.launch({ channel: 'chrome' })` (the `ms-playwright` cache is older than the pinned Playwright).

## Suggested order

1. **Dead anchors** (below) — they are red today on every machine, and several are one-line fixes.
2. **The zh-CN contamination in `preferences*.e2e.ts`** — until that is fixed, locale results are order-dependent and any verification is suspect.
3. **Vacuous negatives** — cheap to fix, and they are the ones currently lying about coverage.
4. **hard misses**, per area, using the table below.
5. **soft-skips last**, removing the silent guard along with the selector, since each will surface an assertion that has not run in a while.

---

> **Reading the `fix` column**: where it says `labelsFor('module','key')`, that is shorthand for
> "derive a label set for that key" — there is no such function. Add the key to the module's
> `*LabelBundle` interface in `localizedLabels.ts` and export a constant through that module's
> private collector, as `TEAM_CREATE_TITLE_LABELS` does. See the implementation notes above.

### Fails in every locale (dead anchor or dead literal)

These do not need a label set. The thing they point at does not exist.

| file:line                                                   | selector                                                       | flavour   | fix                                                                                                            |
| ----------------------------------------------------------- | -------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------- |
| `tests/e2e/cases/teams/team-name-validation.e2e.ts:17`      | page.locator('.h-20px.w-20px.rd-4px') — dead create-butto…     | hard      | page.locator('[data-testid="team-create-btn"]').first() — the app pins that testid with an [E2E SYNC] comment… |
| `tests/e2e/cases/teams/team-ui-details.e2e.ts:103`          | page.locator('text=Workspace').or(page.locator('text=工作区'…  | hard      | labelPattern(labelsFor('conversation','workspace.title')) — add WORKSPACE_PANEL_TITLE_LABELS to localizedLabe… |
| `tests/e2e/features/previews/preview-history-ui.e2e.ts:141` | dropdown.getByText(/no history\|暂无\|没有/i)                  | soft-skip | Delete with the surrounding dead test.                                                                         |
| `tests/e2e/features/assistants/core-interactions.e2e.ts:66` | .filter({ hasText: /官方\|Official/i }) on [data-testid^="a…   | hard      | Click the Official tab (label settings.assistantTabOfficial) then filter `[data-testid^="official-card-"]`; o… |
| `tests/e2e/features/assistants/ui-states.e2e.ts:36`         | .filter({ hasText: /官方\|Official/i }) on [data-testid^="a…   | hard      | Same as core-interactions:66 — Official tab + `[data-testid^="official-card-"]`, or source from the catalog.   |
| `tests/e2e/features/assistants/ui-states.e2e.ts:49`         | customCard.locator('.arco-tag')).toContainText(/自定义\|Cust…  | hard      | There is no source tag to assert any more. Either assert the absence of `menu-duplicate-<id>` in the row's mo… |
| `tests/e2e/features/assistants/ui-states.e2e.ts:58`         | .filter({ hasText: /官方\|Official/i }) (P1-3)                 | hard      | Official tab + `[data-testid^="official-card-"]`, and assert `menu-settings-<id>` / `menu-duplicate-<id>` (Of… |
| `tests/e2e/features/assistants/ui-states.e2e.ts:131`        | .filter({ hasText: /官方\|Official/i }) (P1-6)                 | hard      | Official tab + `official-card-<id>`, duplicate via `btn-assistant-more-<id>` → `menu-duplicate-<id>`.          |
| `tests/e2e/features/assistants/edge-cases.e2e.ts:81`        | page.locator('div[role="tab"]').filter({ hasText: /Disabl…     | soft-skip | Click `[data-testid="assistant-enabled-filter"]` then `[data-testid="filter-option-disabled"]`, and drop the … |
| `tests/e2e/specs/assistant-settings-skills.e2e.ts:80`       | cardText?.match(/Official\|官方/) inside the builtin-lookup…   | soft-skip | Replace the loop with the catalog: `(await fetchAssistantCatalog(page)).find(a => a.source === 'builtin')` (a… |
| `tests/e2e/specs/assistant-settings-defaults.e2e.ts:36`     | cardText?.match(/Official\|官方/) in findBuiltinAssistantId    | soft-skip | Use fetchAssistantCatalog(page).find(a => a.source === 'builtin').                                             |
| `tests/e2e/helpers/assistantSettings.ts:151`                | TAB_TEXT_MAP (/^(All\|全部)$/i, /^(System\|系统)$/i, /^(Custo… | n/a       | Delete TAB_TEXT_MAP/selectFilterTab/searchAssistants/clearSearch and their helpers/index.ts re-exports; if se… |
| `tests/e2e/specs/installation-integrity.e2e.ts:51`          | toContainText(/AionUi/) on installation-integrity-descrip…     | hard      | Assert on the live token: /AionCore/ (present in all 12) or /WePrompt/ (also all 12). Better still, derive it… |
| `tests/e2e/helpers/assistantSettings.ts:151`                | TAB_TEXT_MAP { All: /^(All\|全部)$/i, System: /^(System\|系统… | n/a       | Delete TAB_TEXT_MAP, selectFilterTab, and the index.ts:99 re-export. If a filter-tab helper is ever needed ag… |

### Locale-pinned, per area

#### cases-teams

| file:line                                         | selector                                                  | locales | flavour          | fix                                                                                                  |
| ------------------------------------------------- | --------------------------------------------------------- | ------- | ---------------- | ---------------------------------------------------------------------------------------------------- |
| `tests/e2e/cases/teams/team-rename-pin.e2e.ts:32` | filter({ hasText: new RegExp(menuKey, 'i') }) with …      | 1/12    | hard             | Pass a label set instead of a bare key: TEAM_RENAME_LABELS = labelsFor('team','sider.rename') and T… |
| `tests/e2e/cases/teams/team-ui-details.e2e.ts:88` | menu.locator('text=Choose a different folder').or(m…      | 1/12    | hard             | buttonWithText-style label list from labelsFor('team','create.chooseDifferentFolder'), or a data-te… |
| `tests/e2e/cases/teams/team-create.e2e.ts:63`     | getByText(/No supported assistants available\|没有支持的… | 1/12    | soft-skip        | labelPattern(labelsFor('team','create.noSupportedAgents'))                                           |
| `tests/e2e/cases/teams/team-stale-url.e2e.ts:56`  | body filter({ hasText: /not found\|找不到\|empty\|没有\|… | 1/12    | soft-skip        | Low priority: no team-not-found key exists, so either anchor on the real fallback element or drop t… |
| `tests/e2e/cases/teams/team-delete.e2e.ts:28`     | filter({ hasText: /删除\|Delete/i }) on the sider dro…    | 2/12    | hard             | exactLabelPattern(labelsFor('team','sider.delete')) — one new TEAM_DELETE_LABELS set also serves th… |
| `tests/e2e/cases/teams/team-delete.e2e.ts:35`     | filter({ hasText: /确定\|OK\|Delete\|删除/i }) on .arco…  | 2/12    | hard             | exactLabelPattern(labelsFor('team','sider.deleteOk'))                                                |
| `tests/e2e/cases/teams/team-delete-ui.e2e.ts:53`  | filter({ hasText: /删除\|Delete/i }) on the dropdown …    | 2/12    | hard             | exactLabelPattern(labelsFor('team','sider.delete'))                                                  |
| `tests/e2e/cases/teams/team-delete-ui.e2e.ts:67`  | filter({ hasText: /确定\|OK\|Delete\|删除/i }) on .arco…  | 2/12    | hard             | exactLabelPattern(labelsFor('team','sider.deleteOk'))                                                |
| `tests/e2e/cases/teams/team-whitelist.e2e.ts:58`  | modal.getByText(/No supported assistants available\…      | 2/12    | hard             | labelPattern(labelsFor('team','create.noSupportedAgents'))                                           |
| `tests/e2e/cases/teams/team-stale-url.e2e.ts:61`  | page.locator('.arco-modal').filter({ hasText: /erro…      | 2/12    | vacuous-negative | Assert on structure instead of words — e.g. expect(page.locator('.arco-modal-simple, .arco-modal'))… |
| `tests/e2e/cases/teams/team-ui-details.e2e.ts:68` | filter({ hasText: /Cancel\|取消/i }) on modal .arco-b…    | 3/12    | hard             | exactLabelPattern(labelsFor('common','cancel'))                                                      |
| `tests/e2e/cases/teams/team-create-ui.e2e.ts:54`  | filter({ hasText: /Cancel\|取消/i }) on modal .arco-b…    | 3/12    | soft-skip        | exactLabelPattern(labelsFor('common','cancel'))                                                      |
| `tests/e2e/cases/teams/team-whitelist.e2e.ts:59`  | modal.getByText(/No results found\|未找到结果/i)          | 4/12    | hard             | labelPattern(labelsFor('team','create.noSearchResults'))                                             |
| `tests/e2e/cases/teams/team-create.e2e.ts:28`     | page.locator('text=Teams').or(page.locator('text=团队…    | 7/12    | hard             | labelPattern(labelsFor('team','sider.title')) — add TEAM_SIDER_TITLE_LABELS; or have TeamSiderSecti… |
| `tests/e2e/cases/teams/team-create-ui.e2e.ts:21`  | page.locator('text=Teams').or(page.locator('text=团队…    | 7/12    | hard             | labelPattern(labelsFor('team','sider.title'))                                                        |
| `tests/e2e/cases/teams/team-rename-pin.e2e.ts:43` | page.locator('text=Teams').or(page.locator('text=团队…    | 7/12    | hard             | labelPattern(labelsFor('team','sider.title'))                                                        |
| `tests/e2e/cases/teams/team-stale-url.e2e.ts:76`  | page.locator('text=Teams').or(page.locator('text=团队…    | 7/12    | hard             | labelPattern(labelsFor('team','sider.title'))                                                        |

#### features-workspaces-previews

| file:line                                                          | selector                                                 | locales | flavour   | fix                                                                                                  |
| ------------------------------------------------------------------ | -------------------------------------------------------- | ------- | --------- | ---------------------------------------------------------------------------------------------------- |
| `tests/e2e/features/conversations/acp/empty-turn-warning.e2e.ts:9` | const EMPTY_TURN_TEXT = '这次请求没有产生任何可见回复。' | 1/12    | hard      | Add `workspace`-style fields for agentTip to ConversationLabelBundle in tests/e2e/helpers/localized… |
| `tests/e2e/features/workspaces/workspace-file-ops.e2e.ts:133`      | ctxMenu.getByText(/Add to Chat\|添加到对话/i)            | 1/12    | hard      | Add workspace.contextMenu.addToChat/open to ConversationLabelBundle and export CONTEXT*MENU_ADD_TO*… |
| `tests/e2e/features/workspaces/workspace-files.e2e.ts:74`          | menu.locator('text=/Choose a different folder\|选择其他… | 1/12    | soft-skip | Add create.chooseDifferentFolder to TeamLabelBundle and export CHOOSE_DIFFERENT_FOLDER_LABELS; or a… |
| `tests/e2e/features/workspaces/workspace-snapshot.e2e.ts:71`       | menu.locator('text=/Choose a different folder\|选择其他… | 1/12    | soft-skip | Same CHOOSE_DIFFERENT_FOLDER_LABELS set / chooseDifferentTestId.                                     |
| `tests/e2e/features/conversations/acp/cron-busy.e2e.ts:317`        | .filter({ hasText: /立即执行\|Run Now\|Run now/i })      | 2/12    | hard      | cron.json is not yet a bundle family in localizedLabels.ts — add CRON_BUNDLES + `export const RUN_N… |
| `tests/e2e/features/workspaces/workspace-file-ops.e2e.ts:134`      | ctxMenu.getByText(/^Open$\|^打开$/i)                     | 2/12    | hard      | exactLabelPattern(CONTEXT_MENU_OPEN_LABELS) built from conversation.workspace.contextMenu.open.      |
| `tests/e2e/features/previews/preview-history-ui.e2e.ts:80`         | panel.getByText(/^Preview$\|^预览$/)                     | 2/12    | soft-skip | Segment lookup inside [data-testid="preview-view-segmented-control"], or PREVIEW_LABELS = previewLa… |
| `tests/e2e/features/previews/preview-conversation.e2e.ts:99`       | [title*="download"], [title*="Download"], [title\*="…    | 2/12    | hard      | Assert on the toolbar's stable hooks instead — the download control is the only `.toolbarBtn` with … |
| `tests/e2e/features/previews/preview-conversation.e2e.ts:100`      | [title*="open"], [title*="Open"], [title*="打开"]        | 2/12    | hard      | Same: a data-testid on the open-in-system control (preview-toolbar-open-in-system), or a preview-bu… |
| `tests/e2e/features/previews/preview-history-ui.e2e.ts:79`         | panel.getByText(/^Editor$\|^编辑器$/)                    | 5/12    | soft-skip | Target `[data-testid="preview-view-segmented-control"]` (already a testid) and pick segments by ind… |

#### features-assistants

| file:line                                                             | selector                                                 | locales | flavour          | fix                                                                                                  |
| --------------------------------------------------------------------- | -------------------------------------------------------- | ------- | ---------------- | ---------------------------------------------------------------------------------------------------- |
| `tests/e2e/features/assistants/core-interactions.e2e.ts:71`           | toContainText(/Create\|创建/i) on btn-save-assistant     | 2/12    | hard             | Add `CREATE_LABELS = commonLabels('create', b => b.create)` and `SAVE_LABELS` to tests/e2e/helpers/… |
| `tests/e2e/features/assistants/ui-states.e2e.ts:139`                  | toContainText(/Create\|创建/i) on btn-save-assistant     | 2/12    | hard             | labelPattern(CREATE_LABELS) from a new commonLabels('create') collector in helpers/localizedLabels.… |
| `tests/e2e/features/assistants/edge-cases.e2e.ts:90`                  | page.locator('text=/No assistants match\|没有匹配/i') (… | 2/12    | hard             | Fill `[data-testid="input-search-assistants"]` directly (no toggle), and assert with `labelPattern(… |
| `tests/e2e/features/assistants/edge-cases.e2e.ts:137`                 | .arco-modal filter /Add Skills\|添加技能/i (also :214, … | 2/12    | hard             | The Add-Skills modal no longer exists; skills are configured through `select-assistant-default-skil… |
| `tests/e2e/features/assistants/edge-cases.e2e.ts:143`                 | buttons filter /Add\|添加/i with hasNotText /Added\|已…  | 2/12    | soft-skip        | Dead branch — rewrite P2-3/4/5 against the current editor or delete them. If kept, the Add button n… |
| `tests/e2e/specs/assistant-settings-skills.e2e.ts:68`                 | getByRole('button', { name: /Remember last used aut…     | 2/12    | hard             | Add `AUTO_REMEMBER_LAST_USED_LABELS = settingsLabels('assistantSelectAutoRememberLastUsed', b => b.… |
| `tests/e2e/specs/assistant-settings-skills.e2e.ts:131`                | expect(selectedSummary).not.toMatch(/Not configured…     | 2/12    | vacuous-negative | `expect(selectedSummary).not.toMatch(labelPattern(settingsLabels('assistantSelectDefaultUnset', b =… |
| `tests/e2e/specs/assistant-settings-defaults.e2e.ts:54`               | toContainText(/Remember last used automatically\|自动…   | 2/12    | hard             | labelPattern(AUTO_REMEMBER_LAST_USED_LABELS) for the toContainText calls and exactLabelPattern(...)… |
| `tests/e2e/specs/assistant-settings-defaults.e2e.ts:130`              | not.toContainText(/Remember last used automatically…     | 2/12    | vacuous-negative | Same label set as :54; once fixed these will start doing real work.                                  |
| `tests/e2e/specs/assistant-settings-crud.e2e.ts:487`                  | expect(bodyText).not.toMatch(/Enabled\|已启用/) and :4…  | 2/12    | vacuous-negative | Point :482 at `[data-testid="assistant-home-shell"]` (AssistantHomeTabs.tsx:91), then assert agains… |
| `tests/e2e/specs/assistant-settings-crud.e2e.ts:500`                  | toContainText(/Create\|创建/i) on BTN_SAVE_ASSISTANT;…   | 2/12    | hard             | labelPattern(CREATE_LABELS) / labelPattern(SAVE_LABELS) from new commonLabels collectors, and repoi… |
| `tests/e2e/specs/assistant-settings-prompts.e2e.ts:46`                | getByRole('button', { name: /Add\|添加/i }) — also :5…   | 2/12    | hard             | Add `ADD_LABELS = commonLabels('add', b => b.add)` to helpers/localizedLabels.ts and use `getByRole… |
| `tests/e2e/specs/assistant-settings-prompts.e2e.ts:102`               | promptsCard.getByRole('button', { name: /Save\|保存/i…   | 3/12    | hard             | exactLabelPattern(commonLabels('save', b => b.save)), or add a testid at PromptsSection.tsx:102.     |
| `tests/e2e/specs/assistant-settings-prompts.e2e.ts:97`                | getByRole('button', { name: /Edit\|编辑/i })             | 4/12    | hard             | exactLabelPattern(commonLabels('edit', b => b.edit)) — anchoring also removes the accidental 'Edita… |
| `tests/e2e/specs/assistant-settings-conversation-defaults.e2e.ts:382` | getByText(/Skills \(\d+\/\d+\)\|技能 \(\d+\/\d+\)/).f…   | 4/12    | hard             | Build the label set from settings.capabilitiesTab.skills and interpolate the counter: `new RegExp('… |

#### specs-feedback-and-misc

| file:line                                             | selector                                                    | locales | flavour          | fix                                                                                                  |
| ----------------------------------------------------- | ----------------------------------------------------------- | ------- | ---------------- | ---------------------------------------------------------------------------------------------------- |
| `tests/e2e/specs/feedback-butler-diagnose.e2e.ts:81`  | button:has-text("反馈问题"), button:has-text("Report Is…    | 2/12    | hard             | buttonWithText(FEEDBACK_PILL_LABELS) — the label set already exists (localizedLabels.ts:287) and he… |
| `tests/e2e/specs/installation-integrity.e2e.ts:59`    | /Diagnostics sent\|诊断报告已发送/                          | 2/12    | hard             | labelPattern over common.backendStartup.incompleteInstallation.diagnosticsSent across the 12 bundle… |
| `tests/e2e/specs/hub-backend-install.e2e.ts:21`       | LEGACY_TEXT = /Install from Market\|从市场安装\|Discover…   | 2/12    | vacuous-negative | Build the pattern from settings.agentManagement.installFromMarket / discoverMoreAgents / goToChat a… |
| `tests/e2e/specs/team-empty-state.e2e.ts:49`          | /Describe your goal.\*team working\|描述你的目标/ on team-… | 2/12    | hard             | labelPattern over team.emptyState.subtitle × 12 (TEAM_BUNDLES already exists in localizedLabels.ts;… |
| `tests/e2e/specs/team-empty-state.e2e.ts:68`          | textarea[placeholder^="Send message"], textarea[pla…        | 2/12    | hard             | Scope to the sendbox structurally ('.sendbox-panel textarea', as cron-crud.e2e.ts:74 does) instead … |
| `tests/e2e/specs/team-empty-state.e2e.ts:17`          | EXPECTED_DEBATE_VALUE = /Organize a debate\|组织.\*辩论/…   | 2/12    | hard             | labelPattern over team.emptyState.suggestions.debate × 12.                                           |
| `tests/e2e/specs/dropdown-search.e2e.ts:90`           | /No matching skills\|没有匹配的技能/                        | 2/12    | hard             | labelPattern over settings.skillsHub.noSearchResults × 12.                                           |
| `tests/e2e/specs/dropdown-search.e2e.ts:115`          | /No servers found\|未找到符合条件的服务器/                  | 2/12    | hard             | labelPattern over mcp.noServersFound × 12 (needs an mcp bundle family in localizedLabels.ts).        |
| `tests/e2e/specs/agent-settings-detection.e2e.ts:26`  | customAgents ['Custom Agents','自定义 Agents'] — asser…     | 2/12    | hard             | labelPattern over settings.agentManagement.customAgents × 12, or drop the text check entirely — [da… |
| `tests/e2e/specs/agent-settings-detection.e2e.ts:27`  | setupGuide ['Setup guide','查看安装指南'] — audit named a…  | 2/12    | hard             | labelPattern over settings.agentManagement.localAgentsSetupLink × 12. (There is no settings.agentMa… |
| `tests/e2e/specs/agent-settings-detection.e2e.ts:34`  | installFromMarket / discoverMoreAgents / startChat …        | 2/12    | vacuous-negative | Derive from settings.agentManagement.installFromMarket / discoverMoreAgents / goToChat × 12 — note … |
| `tests/e2e/specs/conversation-full-cycle.e2e.ts:1450` | /Run now\|立即执行/ (also :1161, which is guarded)          | 2/12    | hard             | labelPattern over cron.detail.runNow × 12.                                                           |
| `tests/e2e/specs/cron-crud.e2e.ts:157`                | inherited /Delete\|删除/ via deleteConversation (help…      | 2/12    | soft-skip        | Fix the helper: labelPattern over conversation.history.deleteTitle × 12, or add a data-testid to th… |
| `tests/e2e/specs/feedback-butler-diagnose.e2e.ts:79`  | button:has-text("找管家排查"), button:has-text("Ask the …   | 3/12    | hard             | Add BUTLER_DIAGNOSE_LABELS = settingsLabels('talkToButler.solveWithButler', b => b.talkToButler?.so… |
| `tests/e2e/specs/agent-settings-detection.e2e.ts:32`  | commandLabel ['Command','命令'] and commandPlaceholde…      | 3/12    | hard             | Derive from settings.commandLabel / settings.commandPlaceholder × 12, or better, add testids to the… |
| `tests/e2e/specs/agent-settings-detection.e2e.ts:99`  | getByRole('button',{name:/Cancel\|取消/})                   | 3/12    | hard             | labelPattern over common.cancel × 12.                                                                |
| `tests/e2e/specs/conversation-full-cycle.e2e.ts:877`  | /New task\|新建任务\|新建/ (also :981, :1115, :1400) — th…  | 3/12    | soft-skip        | labelPattern over cron.page.newTask × 12, and delete the `if (!isVisible) test.skip(true, …)` guard… |
| `tests/e2e/specs/conversation-full-cycle.e2e.ts:870`  | /Scheduled Tasks\|定时任务/ (also :974, :1107, :1393)       | 3/12    | soft-skip        | labelPattern over cron.scheduledTasks × 12.                                                          |
| `tests/e2e/specs/conversation-full-cycle.e2e.ts:886`  | /Create manually\|手动创建/ (also :990, :1124, :1410)       | 3/12    | hard             | labelPattern over cron.page.createManually × 12.                                                     |
| `tests/e2e/specs/dropdown-search.e2e.ts:66`           | /Skills \(\d+\/\d+\)\|技能 \(\d+\/\d+\)/ submenu title      | 4/12    | soft-skip        | labelPattern over settings.capabilitiesTab.skills × 12, interpolated into the (n/m) pattern.         |
| `tests/e2e/specs/feedback-scenarios.e2e.ts:138`       | input[placeholder*="my-agent"] (also at :142)               | 10/12   | hard             | Give the command input a data-testid in InlineAgentEditor, or derive the placeholder from settings.… |

#### features-settings

| file:line                                                         | selector                                                | locales | flavour   | fix                                                                                                  |
| ----------------------------------------------------------------- | ------------------------------------------------------- | ------- | --------- | ---------------------------------------------------------------------------------------------------- |
| `tests/e2e/features/settings/system/preferences-extra.e2e.ts:125` | TC-PREF-08 ends on `.arco-select-option:has-text("简…   | n/a     | n/a       | Two parts, both mechanical. (1) Make the run deterministic instead of accidental: seed the language… |
| `tests/e2e/features/settings/display/display-persist.e2e.ts:127`  | '.grid > div.cursor-pointer' (also at :48 inside ac…    | n/a     | hard      | Re-anchor on the current Radio.Group ([role="radio"] rows in CssThemeSettings, or a new data-testid… |
| `tests/e2e/features/settings/display/css-theme-crud.e2e.ts:112`   | .arco-btn-outline filter({ hasText: /Add\|手动添加/i }) | 1/12    | hard      | Moot unless the file is rewritten (see the line-11 finding). If it is: derive from the bundles with… |
| `tests/e2e/features/settings/display/css-theme-crud.e2e.ts:21`    | same /Add\|手动添加/i regex inside createCustomTheme()  | 1/12    | soft-skip | Moot unless the file is rewritten; then use labelPattern('settings','cssTheme.addManually') and dro… |
| `tests/e2e/features/settings/skills/boards-rendering.e2e.ts:47`   | filter({ has: page.locator('text=/Extension/i') }) …    | 1/12    | n/a       | Either delete the two dead filter+console.log blocks, or assert something real: check `skill.source… |
| `tests/e2e/features/settings/display/css-theme-crud.e2e.ts:150`   | .arco-btn-text filter({ hasText: /Delete\|删除/i })     | 2/12    | hard      | labelPattern('common','delete') from the bundles instead of the literal pair; better, a data-testid… |
| `tests/e2e/features/settings/display/css-theme-crud.e2e.ts:48`    | afterEach cleanup: /Delete\|删除/i at :48 and /Cancel…  | 2/12    | soft-skip | labelPattern('common','delete') / labelPattern('common','cancel') if the file survives a rewrite.    |

#### helpers-and-vacuous

| file:line                                              | selector                                                | locales | flavour          | fix                                                                                                   |
| ------------------------------------------------------ | ------------------------------------------------------- | ------- | ---------------- | ----------------------------------------------------------------------------------------------------- |
| `tests/e2e/helpers/skillsHub.ts:338`                   | page.click('button:has-text("Confirm")') in addCust…    | 1/12    | n/a              | Delete addCustomPathViaUI and drop the import at core-ui.e2e.ts:44. HTTP equivalents already exist …  |
| `tests/e2e/helpers/conversation.ts:309`                | page.locator('.arco-dropdown-menu-item').filter({ h…    | 2/12    | hard             | Add `export const CONVERSATION_DELETE_LABELS = conversationLabels('history.deleteTitle', b => b.his…  |
| `tests/e2e/helpers/conversation.ts:282`                | page.locator(AGENT_STATUS_MESSAGE).filter({ hasText…    | 2/12    | soft-skip        | Do NOT feed this key straight into labelPattern: it interpolates, and labelPattern escapes the whol…  |
| `tests/e2e/specs/hub-backend-install.e2e.ts:39`        | await expect(page.locator('body')).not.toContainTex…    | 2/12    | vacuous-negative | Add the three label sets to localizedLabels.ts from settings.agentManagement.installFromMarket / .d…  |
| `tests/e2e/specs/agent-settings-detection.e2e.ts:84`   | expectNoText(page, TEXT.installFromMarket / .discov…    | 2/12    | vacuous-negative | Replace the TEXT entries with label sets collected from settings.agentManagement.\* and keep expectN… |
| `tests/e2e/specs/assistant-settings-crud.e2e.ts:487`   | expect(bodyText).not.toMatch(/Enabled\|已启用/) and :4… | 2/12    | vacuous-negative | Two substring traps if this is done naively with an unanchored labelPattern: fa-IR's Disabled 'غیرف…  |
| `tests/e2e/specs/assistant-settings-skills.e2e.ts:131` | expect(selectedSummary).not.toMatch(/Not configured…    | 2/12    | vacuous-negative | Add `export const ASSISTANT_DEFAULT_UNSET_LABELS = settingsLabels('assistantSelectDefaultUnset', b …  |
| `tests/e2e/cases/teams/team-stale-url.e2e.ts:63`       | const errorModal = page.locator('.arco-modal').filt…    | 2/12    | vacuous-negative | Drop the text filter and assert the surface instead: `await expect(page.locator('.arco-message-erro…  |
| `tests/e2e/helpers/teamHelpers.ts:98`                  | modal.locator('.arco-btn').filter({ hasText: /Cance…    | 3/12    | soft-skip        | Use the already-locale-safe header close instead of the footer Cancel: `modal.locator(modalCloseBut…  |

### Where the original audit was wrong

It was one unreviewed pass. Thirteen findings did not survive re-checking, and the errors lean one way: it graded several selectors _optimistically_ ("works on en-US") when the DOM anchor had been deleted and they match nothing anywhere.

- `tests/e2e/features/workspaces/workspace-snapshot.e2e.ts:91` — The audit called this '1/12 HARD' (en-US works). It is 0/12: the workspace panel contains no Arco Tabs at all. `grep -rn Tabs packages/desktop/src/renderer/pages/conversation/Workspace/` returns nothing; since 26a2e72e8 'project-scoped Explorer replacing workspace tree', Files/Changes are menu rows…
- `tests/e2e/features/workspaces/workspace-snapshot.e2e.ts:107` — The audit said 3/12 (en, zh-CN, pt-BR keeps 'Stage'). Verified 0/12 instead: FileChangeList.tsx renders both stage actions through `ActionBtn` (:180-188) = `<Tooltip content={tooltip}><Button icon={...} /></Tooltip>` with tooltip={t('conversation.workspace.changes.stageAll')} (:305) and changes.sta…
- `tests/e2e/features/workspaces/workspace-single-chat.e2e.ts:94` — Same dead anchor as workspace-snapshot:91 — no Arco Tabs in `.chat-workspace`. Audit said 1/12; it is 0/12. Wrapped in `if (await changesTab.isVisible({timeout:3_000}).catch(()=>false))` at :96, so the Changes-tab step silently never runs on any machine, en-US included, and the run stays green.
- `tests/e2e/features/workspaces/workspace-single-chat.e2e.ts:103` — Audit said 2/12 (en 'Files' + zh-CN 文件, which do match conversation.workspace.changes.filesTab). But the container `.arco-tabs-header-title` no longer exists in the workspace panel, so the count is 0/12 and the `if (isVisible)` at :105 makes the tab-switch-back assertion at :107 unreachable in ever…
- `tests/e2e/features/previews/preview-history-ui.e2e.ts:122` — The audit graded this '2/12, guarded by test.skip'. It is 0/12 and belongs in the audit's §2 dead-selector list: the preview bundle has no history/version key at all (walked en-US/preview.json — zero keys or values containing 'histor'/'version'), and no title= in the whole Preview component tree me…
- `tests/e2e/features/workspaces/workspace-files.e2e.ts:98` — Not a locale bug, but it invalidates the audit's per-file verdicts across my whole area, so it outranks the label findings. `.workspace-tree` survives only as orphan CSS (arco-override.css:363-385, discourse-horizon.css) — `grep -rn workspace-tree packages/desktop/src/renderer` matches no TSX; comm…
- `tests/e2e/features/previews/preview-auto-open.e2e.ts:262` — Also not locale, also verdict-changing. `.preview-panel` exists only in preview.css:4,10 (animation rules); nothing in packages/desktop/src applies the class — PreviewPanel.tsx's roots use data-testid='preview-panel-surface' (:494, :818). So preview-auto-open.e2e.ts:262-265 hard-fails on every loca…
- `tests/e2e/specs/agent-settings-detection.e2e.ts:30` — There is no plain 'Add' button on the page. LocalAgents.tsx:242-251 renders a TalkToButlerButton whose label is t('settings.agentManagement.addCustomAgent') = 'Add Custom Agent'/'添加自定义 Agent'/de 'Benutzerdefinierten Agenten hinzufügen', so the anchored /^(Add\|添加)$/ matches nothing in any locale, e…
- `tests/e2e/specs/ext-channels.e2e.ts:91` — It IS asserted, at :93: `expect(disabledCount > 0 \|\| hasComingSoonBadge).toBeTruthy()`. The literal covers 5/12 — settings['channels.comingSoon'] is the untranslated 'Coming Soon' in en-US, ja-JP, zh-TW and ko-KR, and '即将上线' in zh-CN; de is 'Demnächst verfügbar', tr 'Çok Yakında'. The test stays …
- `tests/e2e/features/settings/display/css-theme-crud.e2e.ts:11` — ZERO of the 4 tests can pass on ANY locale, including en-US and zh-CN, and no theme can ever leak. Every test starts with navigateToCssThemes(), which hard-waits 15s for `.grid > div.cursor-pointer` (line 11). That card grid was deleted on 2026-07-10 by 8618d223c (`git show 8618d223c -- .../CssThem…
- `tests/e2e/helpers/navigation.ts:217` — The audit attributed this to settings.channels (de 'Kanäle') and scored it 2/12. It is not i18n at all: WebuiModalContent.tsx:706 renders the tab title as a hardcoded `<span>Channels</span>` (its sibling is a hardcoded `<span>WebUI</span>`), and grep shows the flat `settings.channels` key at en-US/…
- `tests/e2e/helpers/permissions.ts:18` — Two independent reasons the audit's '2/12 locale-pinned' framing is wrong. (1) For the ACP card the visible option text is `option?.name` straight off the ACP message (MessageAcpPermission.tsx:125) — agent-supplied English, never passed through t(), so no locale bundle governs it. (2) For the app's…
- `tests/e2e/helpers/skillsHub.ts:308` — `targetSource` is a caller-supplied source name (the specs create names like 'E2E Target Source'), i.e. test data — the audit's own §6 excludes exactly this class, so listing it as a locale-pinned selector is inconsistent. It is however dead code, and again more thoroughly than stated: `btn-export-…
