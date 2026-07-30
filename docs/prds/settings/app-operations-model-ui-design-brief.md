# UI Design Brief: App Operations Model

Status: Ready for design
Date: 2026-07-22
Product: WePrompt desktop
Feature branch: `feat/app-operations-model`
Source specification: [App Operations Model](./app-operations-model.md)

## One-Sentence Brief

Design a clear, compact section under **Settings > Models** where users can see and configure the one model WePrompt uses for background app work, without confusing it with the model selected in any chat.

## Background

WePrompt lets each conversation use its own provider and model. The product now also needs one app-wide model for internal intelligence such as context compaction and, later, Memory and Butler assistance.

This distinction is essential:

- **Chat model:** chosen per conversation and used to answer that chat.
- **App operations model:** chosen once for the application and used for background or app-owned work.

The first visible consumer is **Context compaction**. Memory and Butler are future consumers and should not appear as active capabilities in this design.

## Design Objective

Users should be able to answer these questions at a glance:

1. Is WePrompt choosing the model automatically or using my fixed selection?
2. Which provider and model will actually be used?
3. Is that model ready?
4. What part of the app currently uses it?
5. What can I do if it is not configured or unavailable?

The experience should feel like a trustworthy system setting, not another provider-management form.

## Product Principles

### Make the distinction obvious

The section must explicitly explain that this setting is independent of chat models. Changing it must not look like it will alter existing conversations.

### Show what Auto resolved

Auto must never feel opaque. Always display the resolved provider and model when one is available.

### Never hide a broken Fixed selection

If a Fixed provider or model becomes missing, disabled, unauthenticated, or unhealthy, keep that selection visible and mark it unavailable. Do not visually imply that WePrompt switched to something else.

### Make failure feel contained

A missing or unhealthy app operations model does not stop normal chats. Empty and error states should explain what is affected without presenting the entire application as broken.

### Prefer progressive disclosure

Show the current selection, effective model, health, and consumer in the main view. Detailed failure explanations can sit below the health row or inside a compact alert; provider configuration stays in the existing Models experience.

## Placement

Place the new section at the top of **Settings > Models**, below the existing page/modal header and above the provider list or provider empty state.

It must remain visible when no providers are configured. The existing provider cards, Add Model action, and provider configuration flows remain unchanged below it.

The same component appears in:

- the full Settings page; and
- the narrower Settings modal.

The design should use one responsive composition rather than separate experiences.

## Recommended Component Anatomy

Use a visually bounded section or card consistent with the current Settings surface.

1. **Section header**
   - Title: **App operations model**
   - Description: **Used for background context and future app-wide assistance, independently of chat models.**

2. **Selection**
   - Options: **Auto** and **Fixed**
   - A segmented control, radio group, or select is acceptable if it follows existing WePrompt patterns.
   - There is no separate Save button; a valid selection saves immediately.

3. **Model**
   - Enabled only in Fixed mode.
   - Options are grouped by provider.
   - Each option should make both provider and model identity legible.
   - Long provider or model names must truncate gracefully while remaining discoverable through tooltip or accessible text.

4. **Resolved model**
   - Read-only.
   - Shows provider name and model ID for the model WePrompt will use.
   - This is especially important in Auto mode and should have stronger visual emphasis than ordinary metadata.
   - Use an em dash when no model resolves.

5. **Health**
   - Status: **Ready**, **Checking**, **Setup required**, or **Unavailable**.
   - Include the localized reason below or beside the status when provided.
   - Status must not rely on color alone.

6. **Used by**
   - Show **Context compaction**.
   - Do not show Memory or Butler until those features are real consumers.

7. **Actions**
   - **Health check** when a model resolves.
   - Existing **Add Model** action when setup is required.
   - Health check is disabled while checking or when no model resolves.

## Interaction Rules

### Switching to Auto

- Save `{ mode: Auto }` immediately.
- Disable the Fixed model picker.
- Refresh and show the resolved provider/model and health.
- The resolved model may change later if provider configuration or health changes.

### Switching to Fixed

- Prefer the currently resolved Auto pair when it is still selectable.
- Otherwise preselect the first enabled provider/model in the existing backend order.
- If no model is selectable, do not save an incomplete Fixed setting; show the provider setup action.
- Selecting another model saves the exact provider/model pair immediately.

### Fixed selection becomes unavailable

- Preserve the saved provider/model identity in the control or a disabled synthetic option.
- Show **Unavailable** and the specific reason.
- Do not select another model automatically.
- If the provider has been deleted and its display name is unavailable, fall back to the stored provider ID and model ID.

### Health check

- On click, show **Checking** immediately and retain the current model identity.
- Prevent duplicate checks while one is running.
- Replace Checking with the returned status and resolved pair. In Auto mode, the returned pair may differ if the checked candidate became ineligible.
- Do not surface raw backend or provider error messages.

### Provider setup

- Reuse the existing Add Model/provider modal.
- Do not introduce a second provider setup workflow inside this section.

## Required UI States

| State                     | Selection                       | Resolved model                             | Health treatment                               | Primary action                           |
| ------------------------- | ------------------------------- | ------------------------------------------ | ---------------------------------------------- | ---------------------------------------- |
| Initial loading           | Skeleton or disabled control    | Skeleton                                   | Neutral loading                                | None                                     |
| Auto ready                | Auto                            | Provider + model                           | Ready                                          | Health check                             |
| Auto checking             | Auto                            | Retain provider + model                    | Checking with progress                         | Disabled Health check                    |
| Auto with no candidate    | Auto                            | Em dash                                    | Setup required + no eligible model explanation | Add Model                                |
| Fixed ready               | Fixed + selected pair           | Same pair                                  | Ready                                          | Health check                             |
| Fixed unavailable         | Fixed + preserved disabled pair | Stored pair or IDs                         | Unavailable + exact reason                     | Use the existing provider controls below |
| Saving selection          | New choice visible              | Retain last confirmed value until response | Inline saving feedback                         | Controls temporarily disabled            |
| Save failed               | Restore last confirmed setting  | Last confirmed value                       | Existing health retained                       | Retry by choosing again; localized toast |
| Fixed health check failed | Fixed setting unchanged         | Current pair retained                      | Unavailable + health-check reason              | Health check                             |
| Backend update required   | Last known or empty state       | Em dash if unknown                         | Compact warning alert                          | None in this section                     |

## Health and Reason Copy

Health labels:

- **Ready** — the setting resolves and no hard failure is currently known.
- **Checking** — a user-requested probe is running.
- **Setup required** — Auto cannot resolve an eligible model.
- **Unavailable** — a Fixed selection exists but cannot currently be used.

Reason messages:

| Backend reason          | English copy                                   |
| ----------------------- | ---------------------------------------------- |
| No eligible model       | No eligible model is configured.               |
| Provider missing        | The selected provider no longer exists.        |
| Provider disabled       | The selected provider is disabled.             |
| Model missing           | The selected model no longer exists.           |
| Model disabled          | The selected model is disabled.                |
| Authentication required | The selected provider requires authentication. |
| Health check failed     | The latest health check failed.                |

Compatibility message for an older backend:

> Update WePrompt to configure the app operations model.

All visible copy will be localized into WePrompt's 12 configured languages. The design should tolerate text expansion and right-to-left Persian without relying on fixed label widths.

## Visual Direction

- Follow the existing WePrompt Settings visual language and Arco component behavior.
- Use semantic design tokens; do not introduce feature-specific colors.
- Suggested status hierarchy:
  - Ready: positive semantic treatment.
  - Checking: neutral or informational treatment with progress.
  - Setup required: warning treatment.
  - Unavailable: error treatment.
- Keep the card compact enough that the provider list remains visible on common desktop sizes.
- Avoid a large dashboard treatment, model performance metrics, token/cost estimates, or provider logos that overpower the setting.
- Icons may support status recognition but must not replace text labels.

## Responsive and Edge Cases

The design must cover:

- full Settings page and narrower modal widths;
- light and dark themes;
- long provider names and long model IDs;
- one provider with many models;
- no providers;
- a saved Fixed model that is no longer present in current options;
- loading, checking, disabled, hover, focus, saving, and error states;
- localized strings that expand substantially; and
- Persian right-to-left layout.

At narrow widths, rows may stack. Preserve this reading order: label, control/value, status explanation, action.

## Accessibility

- Every control needs a persistent text label.
- Auto and Fixed must be keyboard selectable with a visible focus state.
- Provider groups and model options need meaningful accessible names.
- Status changes after save or health check should be announced through an appropriate live region.
- Color cannot be the only indicator of Ready, Checking, Setup required, or Unavailable.
- Tooltips cannot be the only place where essential information appears.
- Touch/click targets should follow the existing Settings component sizing.

## Out of Scope

- Memory management or Memory UI.
- User Context/profile settings.
- Butler configuration or onboarding UI.
- Redesigning provider cards or the Add Model flow.
- Per-task model selection.
- Cost, quality, speed, or benchmark comparisons.
- A history of background operations or health checks.
- Changing models in existing conversations.

## Requested Designer Deliverables

1. A primary full-page frame showing Auto + Ready.
2. A primary modal-width frame showing Fixed + Ready.
3. State variants for Checking, Setup required, Fixed Unavailable, and Backend update required.
4. The model-picker open state with provider grouping, long-name behavior, and a disabled preserved Fixed selection.
5. Light and dark theme treatment.
6. Responsive behavior or annotations for narrow modal width.
7. Component annotations covering spacing, typography, status tokens, disabled/loading behavior, truncation, and tooltips.
8. A short interaction prototype for Auto → Fixed → model selection → health check.

Reuse existing WePrompt components and tokens wherever possible. Flag any proposed new component or token explicitly in the handoff.

## Design Acceptance Checklist

- A first-time user can explain the difference between this model and a chat model.
- Auto always reveals its effective provider/model when one resolves.
- Fixed never appears to switch silently after becoming unavailable.
- Setup required gives a clear route into the existing provider setup flow.
- Health and its reason are understandable without exposing technical errors.
- The section works when there are no providers and remains above the provider empty state.
- The section fits both Settings page and modal presentations.
- The design handles long and localized text, keyboard use, and status announcements.
- Memory and Butler are not presented as available consumers in this release.
