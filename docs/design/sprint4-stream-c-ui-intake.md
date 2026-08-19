# Sprint 4 — Stream C: UI bugs and improvements (intake)

- **Opened:** 2026-08-18
- **Status:** **intake CLOSED at 14 items** 2026-08-18 — none triaged, none implemented
- **Branch:** `feat/sprint4-stream-c-ui`, worktree `.worktrees/sprint4-stream-c`
- **Base:** branched from `sprint4` @ `bc7decfc6` (the sprint4 worktree is owned by a concurrent
  session and its head moves; record base and head in every acceptance report, per the sprint's
  operating rules)
- **Scope boundary:** Creative Studio is **out** (its own programme on `feat/creative-studio-2`,
  per [sprint4-plan.md](../readme/sprint4-plan.md)).

## How this list is used

Capture first, implement later, by the user's instruction. Items are recorded in the order they
were reported, in the reporter's own terms. `unstated` means the reporter did not say — it is not a
gap I filled in. Open questions are batched at the bottom and asked once intake closes.

When Stream C is planned, each item still owes the sprint's standing rules: one bounded change per
PR, failing test first for changed behaviour, i18n keys in all 12 locales inside the same task, and
live verification in the running app.

## Items

### C-01 — Restore the original AionUI preview section

- **Surface:** the `Project` flyout in the chat header — currently `PROJECT` › `Files` (›),
  `Context` (– ›), `Changes`. Screenshot supplied 2026-08-18.
- **Actual:** WePrompt's Project menu, with the three entries above.
- **Expected:** revert to the **original AionUI preview section**.
- **Kind:** unstated — reads as a deliberate revert of a WePrompt divergence, not a defect.
- **Notes (verbatim):** "I want to revert to the original preview section of AionUI"
- **Lead (found 2026-08-18 during intake, NOT yet verified against upstream):** both presentations
  still exist in the tree. `ChatLayout` takes `workspacePresentation?: 'panel' | 'project-menu'`
  (`ChatLayout/index.tsx:38`) and still **defaults to `'panel'`** (`:66`); the flyout is gated at
  `:231`. The only caller, `ChatConversation.tsx`, hardcodes `'project-menu'` at **two** sites
  (`:245`, `:423`). So the WePrompt divergence may be those two literals, and the upstream panel may
  be live, reachable code rather than something to restore from history. **Unverified:** that the
  `'panel'` branch actually renders what the reporter means by "the original preview section".

- **Open:** which upstream surface is meant, and whether "revert" means remove the WePrompt Project
  menu entirely or restore the preview panel alongside it. See Open questions.

### C-02 — The inline highlight shade is too dark

- **Surface:** markdown rendering in an assistant reply — inline code / highlighted chips. Seen in a
  table cell (`3.1"`, `13.333"`, `auto_size = TEXT_TO_FIT_SHAPE`, `y=4.3"`) and on a file path.
  Screenshot supplied 2026-08-18, light theme.
- **Actual:** the chip background reads as a heavy warm fill against the cream page; on a dense table
  the chips dominate the cell rather than sitting inside the sentence.
- **Expected:** a **lighter** highlight shade. The reporter is definite about the direction.
- **Kind:** polish.
- **Notes (verbatim):** "i need another highligh shade. Lighter for sure."
- **Open:** light theme only, or dark too? And does this cover the table **header** fill (same warm
  family in the screenshot) or strictly the inline-code chips?

### C-03 — A clickable link is indistinguishable from a non-clickable highlight

- **Surface:** same markdown rendering. In the screenshot the file path
  `/Users/lap16603/Downloads/MedCAT_Flyer_landscape/MedCAT_Presentation.pptx` carries the **same**
  chip treatment as the non-clickable code spans in the table above it.
- **Actual:** nothing distinguishes a clickable target from inert highlighted text — same fill, same
  colour, no underline, no link affordance.
- **Expected:** clickable links are visually distinguishable as clickable.
- **Kind:** bug — this is an affordance failure, not taste. Pairs with C-02: whatever lighter shade
  C-02 lands on must still leave room for C-03's distinction.
- **Notes (verbatim):** "Also, I need to distinguish what is a clickable link"
- **Open:** which link kinds are in scope — file paths, http(s) URLs, KB citations, all of them? And
  is hover/focus feedback enough, or must it be distinguishable at rest?

### C-04 — Sidebar/chrome background should be almost white, matching the chat background

- **Surface:** the app chrome around the chat — left sidebar strip and the top bar, on the new-chat
  screen ("Work in a project", "WePrompt Chat" pills). Screenshot supplied 2026-08-18, light theme.
  **Which exact element is meant is not fully determined from the crop** — see Open.
- **Actual:** the chrome reads as a warmer, darker beige than the chat surface beside it, so the two
  planes visibly disagree.
- **Expected:** make it **almost white, the same as the chat background**.
- **Kind:** polish.
- **Rider (reporter's own):** apply the same treatment wherever else it applies — "Maybe you can
  check other screen for consistency". Treat the consistency sweep as part of this item, not a
  separate defect: one token change, audited across screens.
- **Notes (verbatim):** "make this background almost white (just as the chat background) Maybe you
  can check other screen for consistency"
- **Lead (found 2026-08-18 during intake):** the target colour already exists as a token.
  `styles/themes/default-color-scheme.css` defines the light palette as `--bg-base: #faf6ee` (cream
  working surface), `--bg-1: #f6f0e4`, `--bg-2: #f0e9db` (warm cream panels) — and
  **`--bg-chat-surface: #fffdf9`**, which is the near-white the reporter is pointing at. So C-04
  reads as "move the chrome from the cream family onto (or toward) `--bg-chat-surface`".
  **Notable:** in the dark palette `--bg-chat-surface` is already `var(--bg-base)` (`:132`) — the two
  planes are identical there — so this is a **light-theme-only** divergence, and a fix must not
  flatten dark. Which token the sidebar actually consumes is not yet traced.

- **Open:** exactly which surfaces — sidebar only, sidebar + top bar, or every chrome plane? And is
  this a **token** change (every consumer follows) or a per-surface override? A token change is the
  cheaper fix but has the widest blast radius, so it needs the consistency sweep done _first_, not
  after.

### C-05 — Sidebar entries should adopt the Creative Studio button's hover behaviour

- **Surface:** the left sidebar's primary entries — **New Chat**, **Assistants**, **Scheduled
  Tasks** — measured against the **Creative Studio** entry in the same sidebar.
- **Actual:** those three do not behave like the Studio entry on hover.
- **Expected:** same behaviour as the Creative Studio button — **on hover the icon turns orange**.
- **Kind:** polish / consistency.
- **Notes (verbatim):** "make all the button New Chat, assistants, scheduled tasks with the same
  behaviour as the Creative Studio button. Users hover over the button, the icon turn orange"
- **Scope note:** this does **not** breach the Creative Studio boundary. The Studio entry is the
  _reference_; the change lands on the main sidebar. Nothing under the Studio programme is edited.
- **Lead — the premise needs verifying before this is planned (found 2026-08-18 during intake).**
  I could not find the orange. All four sidebar entries already render their icon with
  `fill='currentColor'` (`SiderStudioEntry.tsx:50`, `SiderAssistantEntry.tsx:50,78`,
  `SiderScheduledEntry.tsx:50,78`, `SiderToolbar.tsx:45,75`), so icon colour follows text colour
  identically for all of them — the fill is **not** the difference. The only hover rule in
  `Sider.module.css` is a **scale** transform on New Chat (`:12` → `scale(0.92)`), and the file
  contains no orange/brand colour at all. Studio's entry differs from the others only by
  `studioType.bodyTextAction` typography and `bg-fill-3` hover, neither of which is a colour change
  on the icon.
  **So one of these is true and triage must settle which:** (a) the orange comes from a rule I have
  not traced (a global Arco `.arco-btn-text:hover` brand colour would do it, and would then apply to
  all four equally); (b) the reporter's reference is a _different_ Creative Studio button, not the
  sidebar entry — note the new-chat screen renders "WePrompt Chat" in orange in the C-04 screenshot;
  or (c) the desired behaviour is aspirational — "make them all do what Studio does" where Studio is
  remembered rather than observed. Verify live over CDP with a real `Input.dispatchMouseEvent` hover
  before writing any code.

- **Open:** is the icon colour the whole of it, or does the Studio entry also change label colour /
  background on hover that should come along? And does the same treatment apply to the remaining
  sidebar entries not named here (consistency, as in C-04)?

### C-06 — The in-chat Templates panel layout breaks as templates are added

- **Surface:** the **Templates** panel opened from inside a conversation (over the chat transcript,
  above the composer). Compare against the same panel on the **new-chat** screen, which is correct.
  Two screenshots supplied 2026-08-18.
- **Actual:** with more templates installed the in-chat panel loses its structure. In the screenshot
  it shows **no artifact-type grouping at all** and a ragged grid: `Project Kickoff`, `Simple Light`
  and `Proposal / SOW` sit on one row, then the middle column alone continues downward with
  `HTML Report Template Specification — Navy …` and `Minimal Editorial …` stacked beneath it, with a
  scroll chevron floating over the last card. Columns 1 and 3 are empty below the first row.
- **Expected:** **list the templates horizontally, per artifact type** — i.e. the in-chat panel
  should present like the new-chat one, which groups into `Presentations · PPTX 4`, `Web · HTML 8`,
  `Documents · DOCX 4` with a horizontal row inside each group.
- **Kind:** bug — the reporter's framing is "when you add more template, the layout broke", so it is
  a defect that scales with content, not a preference.
- **Notes (verbatim):** "when you add more template, the layout broke. 1. When in the chat, make
  sure to list the template horizontally for each artifact type"
- **Open:** should the in-chat panel become _the same component_ as the new-chat one (one layout,
  two mount points), or keep a distinct compact presentation that merely adopts the grouping? The
  first is less code and cannot drift again; the second preserves whatever the compact panel was for.

### C-07 — Long template names overflow and clip

- **Surface:** the Templates panel — visible on the **new-chat** screen, under `Web · HTML`.
- **Actual:** long names break out of their card. `Minimal Editorial HTML Template Specification`
  renders wider than its thumbnail and is clipped at the panel's left edge; `Reusable HTML Templa…`
  overflows its card to the right; the third card in the row is sliced by the container edge showing
  only `W…` / `Sys…`. The caption line beneath is truncated hard against the delete icon.
- **Expected:** handle the long-name case properly.
- **Kind:** bug.
- **Notes (verbatim):** "2. Take care of the case where template name is too long"
- **Open:** what is the intended treatment — truncate with an ellipsis plus a tooltip carrying the
  full name, wrap to a second line with a fixed card height, or shrink the type? Truncation needs the
  full name reachable somewhere or the user cannot tell two long names apart. Note the **thumbnail**
  overflow and the **caption** truncation are two different failures in one item; they may need two
  fixes even though they read as one bug.

### C-08 — The Settings and Back buttons are too small and unlabelled

- **Surface:** the sidebar footer. Two screenshots supplied 2026-08-18: one shows a lone **gear**
  icon; the other shows a **back arrow** (circled) beside a **moon** icon on a different screen.
  Likely `components/layout/Sider/SiderFooter.tsx` — not yet traced.
- **Actual:** both are small, icon-only targets sitting in a large empty footer.
- **Expected:** make them **bigger**. Reporter also suggests labels — "Settings" and "Back to Chat".
- **Kind:** polish, with an accessibility edge — an unlabelled icon-only control is also a
  screen-reader and hit-target concern, so the label suggestion is worth more than taste.
- **Notes (verbatim):** "Make the Setting + Backs button bigger. Maybe you can add the text Settings
  and \"back to Chat\""
- **Open:** the labels are offered as **"maybe"**, not settled — decide before building. Also: does
  the label survive the **collapsed** sidebar, where there is no room for text? The existing entries
  solve this with a tooltip + `aria-label` when `collapsed` (see `SiderStudioEntry.tsx:36-38`); the
  footer should probably follow that same rule rather than invent a second one.

### C-09 — Put the dark-mode toggle on the home screen, next to Settings

- **Surface:** the home screen's sidebar footer. The moon (dark mode) control currently appears on
  the _other_ screen shown in the second screenshot, beside the back arrow — not on home.
- **Actual:** on the home screen the footer carries Settings only; dark mode is not reachable there.
- **Expected:** the dark-mode button also appears on the home screen, **next to Settings**.
- **Kind:** improvement (a feature request, not a defect).
- **Notes (verbatim):** "Can we have the DarkMode button on the home screen, next to settings?"
- **Pairs with C-08:** both change the same footer, and C-08 changes button size/labelling that C-09's
  new button must match. Plan them together or the footer will need reworking twice.
- **Open:** is this a **move** (dark mode leaves the screen it is on today) or a **second mount**
  (present in both places)? Two mounts of one toggle need one shared state, which the theme already
  is — but it also means two controls to keep visually in sync.

### C-10 — The "Install in Template Gallery" button is malformed

- **Surface:** the in-chat **template review card** (EPIC-002 Epic A's install path) — the orange
  primary button beneath "Theme content is retained locally and used in future templated sends."
  Screenshot supplied 2026-08-18.
- **Actual:** the circled-plus icon and the label are flush against each other with **no gap** — the
  glyph touches the "I" of "Install", so the control reads as broken rather than styled.
- **Expected (reporter's own fix):** "you can just remove the icon".
- **Kind:** bug.
- **Notes (verbatim):** "Fix this button. you can just remove the icon"
- **Distinction worth keeping:** the _defect_ is the missing icon/label spacing; _removing the icon_
  is one fix for it, and the one the reporter offered. Adding the gap is the other. Removing is
  safer — it cannot regress at other text lengths or in locales with longer labels — but it is a
  content decision, so confirm rather than assume.
- **Touches Stream B's feature.** This button is on the path EPIC-002 Epic A verified working on
  2026-08-18. Any change here must not disturb the install behaviour that smoke proved; the seven
  smoke cases are the regression net.
- **Lead:** the label is the i18n key `templateReview.confirm`
  (`renderer/services/i18n/locales/en-US/messages.json:23`), in the `templateReview` block alongside
  `reviewing` / `installing` / `installed`. Removing the icon is a component change only and needs no
  locale edit; **changing the wording would need all 12 locales in the same task**.
- **Open:** remove the icon, or add the gap? And is the same button used anywhere else (e.g. the
  Vietnamese-locale card) where the label length differs?

### C-11 — The Reject button has no visual weight

- **Surface:** the in-chat **permission prompt** ("Choose an action:") — the row
  `Allow once` / `Always allow` / `Reject`. Screenshot supplied 2026-08-18, light theme.
- **Actual:** `Allow once` and `Always allow` are solid orange; `Reject` is a very pale grey fill on
  a cream card with no border, so it reads as **disabled or absent** rather than as the third
  choice. On this surface that is worse than cosmetic: the safe/refusing option is the one that
  disappears, while the two granting options are the only ones that look pressable.
- **Expected:** give it a border "or something" — enough weight to read as an available action.
- **Kind:** bug.
- **Rider (reporter's own):** "Can you check other similar button?" — sweep the same secondary /
  tertiary button treatment wherever else it appears, as in C-04.
- **Notes (verbatim):** "Reject button need a border or something. Can you check other similar
  button?"
- **Implementation traps already known in this repo** (both cost a session before):
  - Arco moves the `className` onto a wrapper `<span>` when a Button is **disabled**, so
    `:not(:disabled)` paints the wrapper and `:disabled` rules go dead.
  - `.arco-btn-text:not(.arco-btn-disabled)` outranks a bare CSS-module class, so setting a
    background on a text Button silently does nothing — and **jsdom cannot catch either**, so this
    item's evidence has to be a real computed style in the running app, not a unit test.
- **Open:** border, or a stronger fill, or both? And should `Reject` stay visually _quieter_ than the
  allow actions (deliberate hierarchy) or become equal in weight? Those give different designs — and
  on a permission dialog the answer is a safety judgement, not only a visual one.

### C-12 — The sidebar `+` icons and the row chevron are not aligned

- **Surface:** the left sidebar — the section headers `Teams` and `Projects` each carry a trailing
  `+`, and the project row `aa` carries a trailing `⌄` chevron. Screenshot supplied 2026-08-18.
- **Actual:** the `+` icons and the chevron do not sit on a common vertical line down the sidebar's
  right edge.
- **Expected:** aligned.
- **Kind:** bug — this is objectively measurable, unlike most of the polish items here.
- **Notes (verbatim):** "icon + and arrow not aligned"
- **Hypothesis, unverified:** the headers and the rows live in different containers with different
  right-hand padding. `Sider.module.css` already reserves a **28px** right slot on pinned rows,
  dropping to **18px** on hover (`.pinnedTextSlot`, `:47-53`), and `.scrollArea` zeroes the scrollbar
  width specifically so "icons in the fixed top nav and the scrollable list stay on the same vertical
  center line" — i.e. this exact class of misalignment has been fought once already in this file, for
  a different pair of elements. Check whether the header `+` sits outside the scroll area while the
  row chevron sits inside it.
- **Verification note:** settle this by reading `getBoundingClientRect().right` on both icons in the
  running app, not by eye — the screenshot crop cannot prove which element is off, or by how much.
- **Open:** which one is correct — should the chevron move to meet the `+`, or the reverse? And does
  the misalignment persist in the **collapsed** sidebar and at other zoom levels?

### C-13 — Two warm surfaces on the project home should match the composer's lighter fill

- **Surface:** the **project home** screen ("New chat — scoped to this project"). Screenshot supplied
  2026-08-18 with the reporter's own red annotations 1/2/3:
  - **1** = the assistant-mode **pill bar** background, behind `WePrompt Chat` / `WePrompt Code` /
    `Web Scraper` / `More`.
  - **2** = the **chat row** background on `what is MedCAt?` under `Chats 1`.
  - **3** = the **composer** background ("Start a new chat in this project…"), the lighter fill.
- **Actual:** 1 and 2 are a warmer, darker cream than 3.
- **Expected:** "make 1 and 2 same color as 3".
- **Kind:** polish.
- **Notes (verbatim):** "make 1 and 2 same color as 3"
- **Same family as C-04** — both ask for warm cream surfaces to move toward a lighter one. Decide the
  palette question **once**, across C-04 and C-13 together, rather than patching surfaces one at a
  time; otherwise the sweep C-04 already asks for gets done twice and still disagrees.
- **⚠ Risk on element 2 — it may be a _state_, not a resting colour.** The row shows its pin / edit /
  delete actions, which normally appear on **hover**, so the fill being complained about may be
  `--bg-hover` (`#f4f1ea`) or `--bg-active` (`#eae1d3`) rather than the row's base background. If so,
  flattening it to match the composer removes the hover feedback entirely — the same failure mode as
  C-11, where the control that loses contrast is the one that stops reading as interactive. **Confirm
  the row's resting vs hovered colour in the running app before changing anything.**
- **Open:** is element 2 the row's resting fill or its hover/selected fill? If hover, what replaces
  the feedback?

### C-14 — File names should not be orange

- **Surface:** the project home **Files** card (beneath the Knowledge Base card) — the file tree
  listing `.aionrs`, `MedCAT_Flyer_EN_generated.pdf`, `MedCAT_Flyer_EN_landscape.html`, and so on.
  Screenshot supplied 2026-08-18.
- **Actual:** **every** entry in the list is rendered in brand orange, so a plain directory listing
  reads as a column of warnings.
- **Expected:** don't use orange — the reporter's objection is that it is "too alert-ty".
- **Kind:** polish, shading into a semantics problem: orange is the app's alert/attention colour and
  it is being spent on ordinary content.
- **Notes (verbatim):** "don't use orange. too alert-ty"
- **⚠ Directly in tension with C-03 — resolve them together.** C-03 asks for clickable links to be
  _distinguishable_; C-14 says the colour currently doing that job is too loud. Orange is also the
  link colour elsewhere in the product (`www.medcat.vn` and the `Technical Details` disclosure in the
  C-02/C-03 screenshot are both orange). So the two items are one question: **what is the link
  treatment?** Answering C-03 with "more orange" would make C-14 worse, and answering C-14 with
  "plain text" would make C-03 worse. Whatever is chosen has to work at single-link density _and_ at
  full-column density like this file list.
- **Open:** should file names be plain text with an underline-on-hover, plain text with a distinct
  (non-orange) link colour, or keep a colour but reserve orange strictly for alerts? And is orange
  the _brand_ colour here — in which case removing it from links is a broader identity decision that
  should be made deliberately, not per-screen.

### C-16 — The settings page header renders as a warm band on the lighter page

- **Surface:** settings pages — measured on `#/settings/agent`. The sticky header block holding the
  title, search, primary action, description and tabs. Screenshot supplied 2026-08-18.
- **Actual:** the block painted `rgb(246,240,228)` (`--bg-1`) while the content plane beneath it was
  `rgb(255,253,249)`, so the header read as a distinct warm band floating on the page.
- **Expected:** it should not read as a separate band.
- **Kind:** polish — same family as C-04 and C-13.
- **Reported:** by screenshot mid-session, after C-04 landed. Note C-04 is what _created_ the
  mismatch: lightening the content plane left this header on its old tone.
- **Fixed the same session.** `SettingsPageHeader.tsx:61` now uses `bg-chat-surface`. Verified live:
  band and plane both `rgb(255,253,249)` in light and both `rgb(11,14,20)` in dark.
- **The fill could not simply be removed.** The component's own comment records that the background
  exists to mask content scrolling underneath in `sticky` mode, and that non-sticky callers
  deliberately have none. So the fix is to make the mask _match the page it masks_, not to drop it —
  the known `SettingsPageHeader` bg/`sticky` coupling in this repo.

### C-17 — The Profile "Instructions" textarea fills with a heavy warm shade

- **Surface:** Settings → Profile, the global user-instructions `Input.TextArea` (helper text
  "Applies to your chats. Specialized assistants follow their own rules."). Screenshot supplied
  2026-08-18.
- **Actual:** the field fills with Arco's `--color-fill-2`, measured at **`#f0e9db`** — the same warm
  cream as `--bg-2` — which reads as a heavy block on the near-white settings page.
- **Expected:** "make it with a light shade".
- **Kind:** polish. Same family as C-02, C-04, C-13 and C-16.
- **Fixed:** `ProfileSettings.tsx` sets `className='!bg-base'` (`#faf6ee`), matching the composer
  surface C-13 settled on. **Scoped to this field deliberately** — `--color-fill-2` is Arco's shared
  fill token and retuning it would repaint every Arco input, select and fill in the app. `!` is
  required because Arco's own selector outranks a bare utility class.
- **First fix was wrong, and dark is why.** Using `--bg-base` lightened light correctly but
  **`--bg-base` IS the page colour in dark** (`#0b0e14`), so the field became completely invisible
  there — worse than the reported problem. Reported back by screenshot the same session.
- **Fixed properly with a token pair plus a border**, at the reporter's instruction ("fix dark mode.
  Add a border for both light/dark"). `--input-surface` / `--input-border` per theme; dark's surface
  is deliberately **raised above** its page rather than equal to it. Applied as an inline `style`
  rather than utilities, for two reasons: it beats Arco's selector without an `!important` fight, and
  this repo's numeric border utilities set colour but never width, so `border-1` would have produced
  no border at all.
- **Verified live in both themes**, with the app's route and theme restored afterwards:

  | theme | fill               | border             | page behind        |
  | ----- | ------------------ | ------------------ | ------------------ |
  | light | `rgb(250,246,238)` | `rgb(216,203,182)` | `rgb(255,253,249)` |
  | dark  | `rgb(22,28,39)`    | `rgb(42,51,68)`    | `rgb(11,14,20)`    |

- **The predicted risk was real, and it was the one I named.** The intake note said a near-page fill
  with no border would read flat and would need a hairline rather than a darker fill. That is exactly
  what happened — in dark it went past flat to invisible. The border is now what carries the field's
  identity in both themes, so neither fill has to fight its page.

### C-18 — Dark agent logos are invisible in dark mode

- **Surface:** Settings → Agents, the 32px logo beside each agent. Screenshot supplied 2026-08-18,
  dark theme.
- **Actual:** several logos read as faint smudges or nothing at all — **Amp**, **Autohand Code**,
  **Copilot**'s mark and **Cortex Code** are bare dark glyphs with no self-contained background, and
  the page behind them is `#0b0e14`.
- **Expected:** the logos should be visible.
- **Kind:** bug — a genuine dark-mode visibility failure, not polish.
- **Reported as:** "visibility issue with some back icon" (black icon).
- **Root cause:** `AgentCard.tsx:132` hardcoded `backgroundColor: avatar.kind === 'image' ?
'transparent' : 'var(--color-fill-2)'`. Image logos therefore had nothing behind them in either
  theme; in light that is fine, because the near-white page _is_ what these logos are drawn for.
- **Fixed:** `--agent-logo-surface` / `--agent-logo-border`, theme-scoped — `transparent` in light,
  `#f4f4f5` with a `#2a3344` hairline in dark. Light is unchanged **by construction**, confirmed by
  measurement (transparent before and after).
- **Checked for the inverse regression.** A light tile could in principle hide a _white_ glyph. All
  sampled logos were screenshotted in dark after the change: Kimi, Amp, Auggie, Autohand, Claude
  Code, CodeBuddy, Codex CLI, Copilot and Cortex Code are all legible, and none regressed. No
  white-on-transparent logo appeared in the set — worth re-checking if a new agent is added with one.
- **Scope left deliberately narrow.** Logos also render in `AgentBadge`, the model selectors and the
  sidebar. Those may have the same defect, but only the reported surface was changed. **Filed as a
  follow-up rather than swept in**, since each of those surfaces has its own background and needs its
  own look.

### C-19 — macOS has no control to open the right pane

- **Surface:** the chat header. Reported as "i need a button to toggle on the files/preview panel".
- **Actual:** on macOS there is **no** control at all. Two complementary gates fail to cover it:
  the header toggle renders only when `isWindowsRuntime`, and `DesktopWorkspaceToggle` renders only
  when `!isMacRuntime && !isWindowsRuntime` (Linux). macOS falls through both, so the only way to
  open the pane is to open a file, which force-expands it as a side effect.
- **This is the follow-up predicted while building C-01**, where the same gap blocked verification.
- **Changed:** the header toggle now renders on macOS as well as Windows, so each platform has
  exactly one control. Verified rendering: `aria-label="Toggle project panel"` present on a
  conversation route, and clicking it dispatches `WORKSPACE_TOGGLE_EVENT` (confirmed with an
  instrumented listener).
- **RESOLVED — root cause was `PreviewPanel`, found by instrumenting the state setter.** A stack
  trace on every `setRightSiderCollapsed` call showed two calls per click: `handleWorkspaceToggle`
  expanding it, then `setArtifactCollapsed(true)` from **`PreviewPanel.tsx:345`** via
  `onRequestCollapse` shutting it again in the same tick. `PreviewPanel` asks the pane to collapse
  when it has nothing to preview — correct when the pane _was_ the preview, wrong now that it also
  hosts Files and Changes. It also explains why opening a file always worked: a preview tab exists,
  so no collapse is requested.
  **Fixed two ways:** the request is honoured only while Preview is the visible tab, and the pane now
  opens on **Files** rather than Preview, so an empty preview can never hold it shut.
  **Verified:** toggle opens the pane to 776px on Files, toggle again closes it, and clicking a real
  file switches to Preview.
- **Superseded note — what static reading got wrong.** Clicking the button, and dispatching the toggle
  and expand events directly, all leave the pane unrendered, while **opening a file does** open it.
  So `artifactVisible` stays false even though `workspace-preference-<id>` reads `expanded`.
  Ruled out: not mobile (viewport 1512, no mobile overlay, chat pane on the desktop path);
  `workspaceEnabled` is true (the flyout depends on it and renders); the render condition is intact;
  and `handleHasFiles` is **not** fighting it — it early-returns when `autoExpandOnWorkspaceFiles` is
  false, which is the case in `project-menu` presentation.
- **Next step, cheap:** have a human click it once. Every observation here came from synthetic clicks
  on a route this session navigated to programmatically, and the pane may simply have been remounting.
  If it works for a real user, this is closed; if not, the collapse state's owner needs tracing with a
  React devtools read rather than DOM probing.

### C-20 — A grey horizontal line crosses the Changes panel

- **Surface:** the right pane's Changes tab, under the "No changes yet" empty state. Screenshot
  supplied 2026-08-18; reported as "what is the horizontal line".
- **What it was:** a **horizontal scrollbar**, not a divider or a border.
- **Cause — a CSS-spec detail.** `.workspace-section-scroll` declared only
  `overflow-y: auto`. Per spec, when one overflow axis is not `visible`, the other computes from
  `visible` to **`auto`** — so horizontal scrolling was silently enabled, and any 1px of overflow
  drew a bar across the panel. Nothing in the rule mentions the x axis, which is exactly why it is
  easy to miss by reading.
- **Second defect found in the same rule.** `max-height: min(420px, calc(100vh - 150px))` is sized
  for the narrow flyout popover. Portalled into the pane it left the panel **124px tall inside an
  808px slot**, which is why the empty state floated with dead space beneath it — the line marked the
  bottom of the capped scroller, not the bottom of the pane.
- **Fixed:** `overflow-x: hidden` stated explicitly on the shared rule, and a
  `.workspace-pane-section` override releasing the cap for the pane only, so the flyout keeps its
  popover sizing.
- **Verified:** `overflow-x: hidden`, `max-height: none`, scroller height 808 matching the slot.
- **Note:** content is still marginally wider than the container, so it now clips instead of
  scrolling. That matches the flyout's behaviour and is not the reported defect, but it means
  something inside is slightly over-wide and could be worth its own look.

### C-21 — The panel has no close button of its own

- **Surface:** the right pane. Reported as "i need a button to close this panel".
- **Actual:** the only way to close it was the header toggle, which sits out in the chat header —
  far from the thing it acts on, and easy to miss (the reporter's screenshot shows it as a small
  glyph outside the pane entirely).
- **Fixed:** a collapse button in the pane's own toolbar, beside the external-tool control. Reuses
  the existing `common.chrome.collapseProjectPanel` label, so **no new i18n key**. It calls the
  _unguarded_ collapse deliberately — this is an explicit user action, unlike `PreviewPanel`'s
  request, which C-19 restricted to when Preview is the visible tab.
- **Verified:** the button renders with `aria-label="Collapse project panel"`, and clicking it closes
  the pane (776px → absent).
- **VERIFIED by the reporter 2026-08-18, including the toggle.** The suspected flakiness did not
  reproduce for a human: sequential header-toggle clicks after a _programmatic_ route change had given
  `null → null → 776 → null`, but that was the harness — hash-navigating and clicking within four
  seconds is not something a real user does. Recorded rather than deleted, because it is the **third**
  false negative this stream produced from synthetic interaction, after C-19's toggle and C-24's URL
  bar. In all three the code was fine and the probe was wrong, and in all three one human interaction
  settled it faster than further automated digging.

### C-22 — The active view segment used the navy brand, not the orange accent

- **Surface:** the preview toolbar's `Source / Split / Preview` control, inside the right pane.
- **Actual:** the active segment painted `rgb(55,78,162)` — `--brand` / `--aou-6`, the Forge navy —
  while every other active-state signal in the same pane is the primary orange `#f05a22`, including
  the file tab's own rule directly above it. Both are real brand colours; mixing them inside one
  stack of chrome is a large part of what the reporter described as "different shades".
- **Fixed:** `bg-primary` with a `bg-primary-7` hover.
- **Verified:** visible as orange in the C-23 baseline screenshot.
- **Record note:** this entry was written retroactively. The fix shipped in `cbfea2601` with a test
  and a commit message, but no intake item — found while auditing the numbering. **There is also no
  C-15**: the sequence jumps C-14 → C-16 because a number was skipped, not because an item is
  missing.

### C-23 — The pane's chrome stacked four shades

- **Surface:** the right pane with a file open. Reported as "too messy. different shades."
- **Measured before:** four stacked surfaces — pane tab row `rgb(255,253,249)`, file-tab strip
  `rgb(240,233,219)`, preview toolbar `rgb(240,233,219)`, active file tab `rgb(246,240,228)` — two
  visible seams plus a step where the active tab met the strip, in ~114px of chrome. Plus the active
  segment in navy `rgb(55,78,162)` (fixed separately as C-22) against orange everywhere else.
- **Resolved by showing options rather than guessing.** Two variants were built and screenshotted
  against the baseline: unify everything onto the pane's near-white plane, or make all the chrome
  cream. The reporter chose the near-white plane — consistent with C-04, C-16 and C-17, where the
  same preference was expressed each time — and then refined it: **the active pane tab loses its
  cream pill and turns orange instead.**
- **Shipped:** `.tabsRoot` and the preview toolbar both use the pane surface; the active pane tab is
  `!text-primary` with `!bg-transparent`. Orange is now the only active-state signal in the stack.
- **Deliberately left alone:** the active _file_ tab keeps its cream fill and orange rule. It is a
  different level of hierarchy from the pane tabs and was not raised.
- **Still true, and not addressed:** the chrome is still ~114px tall in three rows, and **"Preview"
  still appears twice** — once as a pane tab, once in the Source/Split/Preview control. Unifying the
  shades removed the seams, not the depth or the duplication. Merging the view switcher into the pane
  tab row would fix both and remains unbuilt.

### C-24 — A general in-pane browser with a URL bar

- **Asked for:** the Browser entry the upstream pane has (reporter's phone photo of the upstream app
  showed `VS Code / Terminal / File Explorer / ─── Browser ✓`), specified as "general in-pane browser
  with a URL bar".
- **Nothing new was written for the browser itself.** `components/media/WebviewHost.tsx` already
  provides a URL input, back/forward, reload and Escape-to-reset, behind a `showNavBar` prop, and is
  the same component the extension-settings pages mount. This item is a tab plus a mount.
- **Decisions taken here, both worth knowing:**
  - **Starts at `about:blank`.** Defaulting a homepage or a search provider is a product and privacy
    decision, not something to pick silently. The URL bar is live from first paint.
  - **Lazily mounted, then kept alive.** No webview is created until the browser is first opened;
    after that it persists across tab switches so history and session survive. `partition:
persist:workspace-pane-browser` keeps logins across restarts and separate from the extension
    webviews.
- **i18n:** `conversation.workspace.changes.browserTab` added to all 12 locales, types regenerated,
  gate green.
- **Verified live:** four tabs render (`Files | Changes | Preview | Browser`); opening Browser mounts
  a real `<webview>` with a URL `<input>` reading `about:blank`.
- **Navigation VERIFIED by the reporter 2026-08-18** — "I tried, the browser works". The earlier
  failure was the harness, not the feature: a synthetic Enter updated the field but left
  `webview.getURL()` at `about:blank`, while a real keystroke navigates. Recorded because it is the
  second time in this stream that a synthetic-event probe produced a false negative (the first was
  C-19's toggle), and both times a single human interaction resolved it faster than further probing.
- **Note on "browse upstream":** no upstream remote is configured in this checkout (only the two
  forks, `ghk` and `origin`), so upstream source could not be consulted. It was not needed — the
  capability already existed locally.

### C-25 — The Project flyout is redundant now the pane exists

- **Raised by the reporter** once the pane carried Files, Changes, Preview and Browser: the flyout
  offered `Files / Context / Changes`, so two of its three entries were a second door to the same
  panels.
- **Decision, and then its reversal — worth recording as a pair.** The flyout was removed and Context
  dropped with it, on the reasoning that users can read `Context.md` directly and that `/context`
  already exposes `open`, `compact`, `pin` and `handoff`. **That reasoning was correct about
  capability and wrong about discoverability.** The reporter went looking for Context within minutes,
  in a temporary-workspace conversation where the file had never been created, and found an empty
  tree and no affordance. The command does everything the panel did — but only for someone who
  already knows it exists.
- **Context is therefore back as a pane tab** (`Files / Changes / Context / Preview / Browser`),
  gated on `backend === 'aionrs'` to match the panel's own `showContextSection` check, since a tab
  that can only ever be empty is worse than no tab. The flyout stays removed: the redundancy is gone
  without losing the readout. Verified live — the panel reports `Context.md · Not created`,
  `Budget · Estimated 0%`, `No pinned context yet`, which is precisely the state the reporter could
  not otherwise see.
- **The lesson is about what "redundant" meant.** Files and Changes genuinely were duplicated. Context
  looked duplicated because a _file_ existed with the same name, but the panel also carried state the
  file cannot show — whether it exists at all, the budget, and pinned entries.
- **Two constraints made this more than a deletion:**
  1. **The Workspace component must still render.** The pane's Files and Changes tabs are portals out
     of that instance, and its drag-import and paste handlers wrap the chat. Only the flyout's own
     markup is suppressed.
  2. **The suppression is scoped.** It is gated on `paneActiveView !== null`, true only when
     ChatLayout mounted the tabbed pane. Teams uses the `panel` presentation and provides no pane
     context, so its flyout is untouched.
- **Verified live:** flyout trigger absent, Workspace controller still present, four tabs still
  render, and the Files tab lists 9 rows — proving the portal survived the removal.

### C-26 — The pane's left edge is too thick and crowds the Context panel

- **Surface:** the right pane's left edge, reported against the Context tab.
- **Measured:** two rules in the same colour stacked on top of each other — the pane's own
  `border-left: 1px rgb(229,220,201)`, plus the split handle painting a **2px** bar in
  `rgb(229,220,201)` at `opacity-90`, inside a 12px `absolute left-0` strip that overlaps the
  content. Together they read as a single ~3px rule pressed against the panel.
- **Fixed:** the grip is transparent at rest and appears only on hover/active — what a splitter
  should do. Its hover colour is now the primary accent rather than the navy `--aou-6`, which C-22
  had already removed from this same pane.
- **Verified:** handle background `rgba(0,0,0,0)` at rest, leaving only the 1px border; screenshot
  confirms a single hairline with the Context content clear of it.
- **Shared component, deliberately.** `useResizableSplit` also drives the main sidebar's handle, so
  both splitters now behave the same way. That is the intended outcome rather than a side effect —
  the alternative would be two resize affordances that look different for no reason.

### C-27 — The file search field is too wide

- **Surface:** the pane's Files tab (and the project-home Files card, which shares the component).
- **Measured:** 439px inside a 441px container — effectively full-bleed, which made the field the
  heaviest element in the panel.
- **Fixed:** inset symmetrically to 415px. Fluid, so it still adapts when the pane is resized.
- **The margin alone did nothing.** Arco's `.arco-input-group-wrapper` sets `width: 100%` with
  `box-sizing: content-box`, so adding a margin pushed the field into **overflow** rather than
  shrinking it — the measured width stayed at 439 while the element started 12px further right.
  `width: auto` is the half that actually works. Caught by measuring after the first attempt rather
  than assuming the margin had landed.
- **Shared surface:** the project-home Files card uses the same component and is narrowed too. Not
  reported there, but consistency is the point of sharing the component.

### C-28 — Panel content sits against the pane border

- **Surface:** the pane's panels, reported against Context. Measured: content started **1px** from
  the pane's left border.
- **Cause is mine, from C-01.** The Project flyout's popover supplied the panels' horizontal
  breathing room. When the same panels were portalled into the pane, the portal slot had no padding,
  so they rendered flush against the border. Files and Changes had the same defect; only Context made
  it obvious, because its Budget row and progress bar run the full width with no leading icon to
  disguise the gap.
- **Fixed:** `padding: 0 12px` on `.workspace-pane-section`, which covers all three panels in one
  place rather than each inventing its own inset. Content now sits 13px from the border.
- **Also de-duplicated C-27's inset.** The search field carries its own margin for the project-home
  card, which is not inside a pane section. Inside the pane that margin would stack with the new
  container padding and push the field out of line with the tree beneath it, so it is zeroed there.
  The project-home card keeps its narrowing.

### C-29 — Remove the Budget row and gauge from the Context panel

- **Asked for:** "remove the budget and gauge... we have another place to show it".
- **Confirmed the other place before removing it.** The composer renders a live `Context …%`
  indicator — verified in the same session, with the panel's copy gone and the composer's still
  present. So this deletes a duplicate readout, not the only one.
- **Removed:** the `Budget` label row and the Arco `Progress` gauge from `ContextHandoffPanel`, plus
  the three imports that became unused (`Progress`, `contextUsageProgressPercent`,
  `formatContextUsagePercent`) and the two orphaned CSS rules. Lint clean.
- **The budget computation stays.** `budget` still feeds telemetry (`last_budget_status`), so only
  the render was cut — removing the subscription would have changed behaviour, not just appearance.
- **Result:** the panel now reads `Context.md · Not created` and `Pinned context`, which is the state
  the file itself cannot show. That is the whole reason the tab was restored in C-25.

### C-30 — The Browser tab is invisible at the pane's default width

- **Reported:** "by default size, I won't see the Browser".
- **Measured, and it was not marginal.** The pane's default width is **340px**, which is exactly
  `MIN_ARTIFACT_PANEL_PX` — it opens at its own minimum. Five text labels needed **412px**, so
  Browser's right edge sat at 1575 against a pane edge of 1492, and the open-in and close controls
  were pushed off too: 170px of overflow in total. Tightening padding would have recovered ~20px
  against a ~85px shortfall, so it was never a spacing tweak.
- **Fixed by dropping the labels.** Each tab is now a 28px icon — 140px for all five, inside 340px,
  with the close control still visible. Files, Changes and Context reuse the icons the **Project
  flyout** used (`FolderOpen`, `BranchOne`, `FileText`), so their meaning carries over from the UI
  the pane replaced; Preview and Browser use `PreviewOpen` and `Earth`, both already in use in this
  codebase rather than guessed at.
- **The name is still reachable** through a tooltip and an `aria-label` — an icon-only control with
  no accessible name is unusable by screen reader and unguessable by everyone else.
- **Rejected:** a horizontal scroller (Browser would still be hidden, which is the actual complaint)
  and raising `MIN_ARTIFACT_PANEL_PX` to ~430 (permanently takes ~90px from the chat on narrow
  windows). Chosen from measurements rather than taste.

## Integration notes for merging Stream C into sprint4

Raised by the `sprint4` session on 2026-08-19 and verified here before recording.

**1. C-16 depends on C-04, and they are separate commits.** `bg-chat-surface` does not exist in
`sprint4`'s `uno.config.ts` (confirmed: `git show sprint4:uno.config.ts | grep -c bg-chat-surface`
→ 0). The utility is added by **`a6ab18ad4`** (C-04, the content plane) and first consumed by
**`99996f919`** (C-16, the settings header). Merging the branch whole is safe. **Cherry-picking C-16
without C-04 would compile the sticky header to no background at all** — and that background is not
decorative: it exists solely to mask content scrolling under the sticky header. If these ever have to
land separately, C-04 goes first.

**2. A card now renders inside that sticky header.** The `sprint4` session has since added an App
Operations panel there, on `bg-fill-0` with a 1px border, in a restructured two-column header. C-16
moves the sticky plane to a near-white surface, so a near-white card on a near-white plane may lose
its edge. Purely visual, no textual conflict — the two changes are orthogonal (theirs is layout,
ours is the background colour, and they did not touch the `sticky &&` line). Worth an eye at merge.

**3. The green gate is a snapshot, not a guarantee.** The `sprint4` session reports a load-sensitive
flake family on the sprint3 line (`renderService.integration`, `jobManager`,
`PresentationSourceGrantStore`, `pdfExtract`), reproduced under deliberate CPU saturation. Stream C's
`just push` run was green across 8274 tests, but a red re-run on a busy machine is not automatically a
Stream C regression.

**4. `sprint4` is a moving target.** It was `bc7decfc6` when this branch was cut and `a969ddc19` when
last read, with a workflow actively committing. The `merge-tree` check (exit 0, zero conflicts) should
be re-run immediately before any actual merge rather than trusted from this document.

## Decisions taken 2026-08-18 (by the reporter, after intake closed)

| id       | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DC-1** | **C-01 means the workspace file-tree pane.** Single chat moves from `workspacePresentation='project-menu'` back to `'panel'` — the same pane Teams uses today. The Project flyout goes. Candidate change is the two literals at `ChatConversation.tsx:245,423`; the always-open artifact preview that `project-menu` carries (`ChatLayout/index.tsx:296`) is displaced by this and its fate must be decided explicitly, not by accident.                                                                                                                                                                                                                                                                                                                                                             |
| **DC-2** | **Orange stays for real hyperlinks; file names become plain text.** Resolves C-03 and C-14 together. Consequence to design around: colour then distinguishes an `http(s)` link from a file entry, so the file list needs a _non-colour_ affordance (hover underline or similar) or C-03's complaint simply moves to the file list.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **DC-3** | **Background lightening is per-surface, not a token sweep.** Only the surfaces pointed at: sidebar/chrome (C-04), the assistant-mode pill bar and the chat rows (C-13). `--bg-chat-surface` is the reference value. The token ramp is **not** redefined, so dark theme is untouched by construction. C-04's "check other screens" rider stays a manual audit, reported rather than silently applied.                                                                                                                                                                                                                                                                                                                                                                                                 |
| **DC-5** | **C-01 removes the always-open artifact preview, and that is intended.** Switching single chat to `'panel'` stops `ChatLayout/index.tsx:296` rendering. The reporter confirmed the preview is part of what is being reverted, so its removal is a decision, not a side effect to mitigate.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **DC-6** | **Stream C verifies on Electron slot 2 (`~/.aionui-dev-2`), not slot 1.** Slot 1's app belongs to peer session `46112f54`, which never answered; a second peer declined to authorize it on their behalf. Slot 2 is a fresh profile, so items needing content (C-06/C-07 templates, C-10 review card, C-11 permission prompt, C-13/C-14 project data) must be **seeded before they are reproducible** — and an item that cannot be reproduced must be reported as unverified, never as passing.                                                                                                                                                                                                                                                                                                       |
| **DC-9** | **C-13's chat row is left unchanged — the reported fill is a hover state, not a resting colour.** Measured on project home: at rest the row paints **no background at all** (transparent); on hover a 791×54 div appears at `rgb(240,233,219)`. So the screenshot captured a hover, and there is no warm band at rest to remove. Matching it to the composer would set the hover to `rgb(250,246,238)` against a `rgb(255,253,249)` page — a 5–11 per-channel difference, i.e. a hover the user could barely see, which is the same failure mode as C-11's invisible Reject. Decided by the reporter after seeing the measurement. **C-13 therefore closes with the pill bar (element 1) fixed and element 2 deliberately untouched.**                                                               |
| **DC-7** | **C-05: New Chat adopts the Studio behaviour too** — grey at rest, orange on hover, matching Assistants and Scheduled Tasks. Accepted consequence: New Chat loses the permanent orange accent that currently marks it as the primary action. Decided by the reporter after seeing the measured colours.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **DC-8** | **Stream C stays on Electron slot 2 for the whole sweep.** Slot 1 was offered by its owner and the reporter approved switching, but the offer was **retracted** the same minute: `~/.aionui-dev` underwent a plaintext→encrypted at-rest migration at 09:54 and its live DB is now unreadable by the app (0 conversations). Independently corroborated here read-only: live db 708,608 bytes reporting as `data`, plaintext backup 4,526,080 bytes reporting as valid SQLite, and zero processes holding the directory. Slot 1's only advantage was its real content, which is currently unreachable — so the switch was cancelled on the facts, not on preference. **Consequence to honour: items needing content or a live model turn are reported UNVERIFIED, never assumed passing** (see DC-6). |
| **DC-4** | **Reject gets a border and stays quieter than the allow actions.** Fixes the invisibility without changing which action the prompt nudges toward. `Always allow` keeps its current prominence — noted as a deliberate choice, not an oversight.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

## Static triage pass — 2026-08-18 (no running app; nothing here is confirmed by observation)

Everything below is read from source. Each still needs a live computed-style check before it is
treated as fact, for the reason C-11 records: jsdom cannot see Arco specificity.

| item              | finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C-09**          | **Exact cause found.** `SiderFooter.tsx` computes `const showThemeToggle = isSettings && !collapsed` — the theme toggle renders **only on the settings screen**. That is precisely why the moon appears beside the back arrow and never on home. The fix is this one condition.                                                                                                                                                                                                                                                                                                                    |
| **C-08**          | Both footer buttons are `!h-32px !w-32px !p-0` — a 32×32 icon-only target. **The labels already exist**: `settingsLabel = isSettings ? t('common.back') : t('common.settings')`, already wired to `aria-label` and the tooltip. So rendering visible text needs **no new i18n keys** — but the reporter's suggested wording _"Back to Chat"_ is not `common.back` ("Back"), and adopting it **would** need all 12 locales in the same task.                                                                                                                                                        |
| **C-01**          | Confirmed. The `panel` branch (`ChatLayout/index.tsx:267`) renders `WorkspacePanelHeader` + `props.sider` — the file-tree pane DC-1 asks for. Switching to it **stops the `!isWorkspacePanePresentation && artifactVisible` branch at `:296` from rendering**, i.e. the always-open artifact preview goes away with the flyout. DC-1 already flags this must be decided, not absorbed silently.                                                                                                                                                                                                    |
| **C-14**          | **Root cause is not a link style at all.** Each file row is an Arco `<Button type='text'>` (`WorkspaceProjectFilesFlyout.tsx:62-63`) and `.workspace-project-files-name` (`workspace.css:294`) sets **no colour**. The orange is Arco's default text-button colour bleeding through — the known `.arco-btn-text:not(.arco-btn-disabled)` trap. So these names were never deliberately styled as links; they leak the primary. That makes C-14 a smaller and better-founded fix than "change the link colour", and it means **DC-2 needs no new link colour for this surface** — just stop leaking. |
| **C-14 coupling** | `WorkspaceProjectFilesFlyout` is shared by the project-home **Files card** (`ProjectFilesCard.tsx:91`) and the chat **Project flyout**. One fix covers both — and note DC-1 deletes the flyout consumer, so sequence C-01 and C-14 deliberately.                                                                                                                                                                                                                                                                                                                                                   |
| **C-11**          | There are **two** permission components, not one: `Messages/components/MessagePermission.tsx` and `Messages/acp/MessageAcpPermission.tsx`. The reporter's "check other similar button" rider therefore has a concrete first answer — both must change, or the two backends will disagree.                                                                                                                                                                                                                                                                                                          |
| **C-11 copy**     | The prompt's heading is `messages.json:88` `chooseAction`. Note the screenshot reads "Allow once" while `codex.json:84` holds "Allow Once" — different capitalisation, so the screenshot's prompt is **not** the codex key set. Identify the actual key before touching copy.                                                                                                                                                                                                                                                                                                                      |

## Live verification — 2026-08-18, Electron slot 2 (`~/.aionui-dev-2`, CDP 9231, vite 5174)

Measured with real `Input.dispatchMouseEvent` hovers (synthetic events do not match `:hover`), each
reading taken with the cursor parked off-target first and 250ms allowed for transitions to settle.

### C-05 — premise CONFIRMED, and the item is bigger than reported

| sidebar entry       | icon at rest                | icon on hover               | turns orange?               | hover background   |
| ------------------- | --------------------------- | --------------------------- | --------------------------- | ------------------ |
| **Creative Studio** | `rgb(91,100,114)` grey      | **`rgb(240,90,34)` orange** | **yes**                     | `rgb(240,233,219)` |
| New Chat            | `rgb(240,90,34)` **orange** | `rgb(240,90,34)` orange     | no — already orange at rest | `rgb(233,223,206)` |
| Assistants          | `rgb(20,24,31)` near-black  | `rgb(20,24,31)`             | no                          | `rgb(233,223,206)` |
| Scheduled Tasks     | `rgb(20,24,31)` near-black  | `rgb(20,24,31)`             | no                          | `rgb(233,223,206)` |

**The reporter was right and the static triage was wrong.** My source read concluded no orange
existed because all four use `fill='currentColor'` and `Sider.module.css` holds no colour rule; the
orange arrives from a rule that read never traced. Recorded as a correction, not quietly fixed.

Four consequences that change what C-05 costs:

1. **The target behaviour is icon-only.** Studio's _label_ stays `rgb(91,100,114)` through hover —
   only the icon turns. So "same behaviour" means the icon alone, and the open question in C-05 is
   answered: no label or background change comes along.
2. **Studio rests at a different colour from the other three.** Studio is `rgb(91,100,114)`
   (`--bg-8`), the others `rgb(20,24,31)` (`--bg-10`). Matching Studio therefore means _lightening
   their rest state too_, not merely adding a hover rule. That is a visible change at rest, on every
   screen, which the reporter has not seen yet.
3. **New Chat's icon is already permanently orange.** Making it behave like Studio would _remove_
   orange at rest and only restore it on hover. That may well be deliberate — New Chat is the primary
   action — so it needs an explicit decision rather than being swept in with the other two.
4. **The hover backgrounds already disagree** — Studio `rgb(240,233,219)` (`--bg-2`) versus
   `rgb(233,223,206)` for the other three. A second inconsistency in the same row, not reported, and
   worth fixing in the same change or deliberately leaving alone.

### C-08/C-09 shipped — and C-10's root cause is probably the same Arco behaviour

Building C-08 reproduced **C-10's exact defect by accident**: the gear icon sat flush against the
"Settings" label, with no gap. Diagnosed live rather than guessed:

- Arco's `.arco-btn` computes **`display: block`** with **`text-align: center`**.
- So `justify-content` and `gap` are **inert** on it — they were set and had no effect — and an icon
  passed via the `icon` prop ends up butted against the label with `margin-right: 0`.
- Adding `flex items-center` makes the gap and alignment apply. The sidebar nav entries
  (`SiderStudioEntry`) already do exactly this, which is why they never showed the defect.

**Therefore C-10 ("Install in Template Gallery", icon touching the label) is very likely the same
cause, not a one-off.** That matters for DC-4's open question — _remove the icon, or add the gap?_ —
because "add the gap" is now a known one-line class fix with a proven mechanism, rather than a
guess. Confirm on that component before deciding; if it is the same, removing the icon would be
treating a symptom that will recur on the next Arco button someone builds with an icon.

**Verified live** (slot 2, `#/guid`): Settings renders 184×34 with a visible label and an 8px gap,
the theme toggle sits beside it at 32×32, and the collapsed rail keeps the icon-only form with the
name on the tooltip. jsdom passed **7/7 while the button was still visually broken** — the defect
was only visible in a screenshot, which is this stream's standing argument for not trusting unit
tests alone on visual work.

### C-05 shipped for two of three entries — New Chat held for a decision

**Done:** Assistants and Scheduled Tasks now match Creative Studio exactly, measured live:
rest `rgb(91,100,114)`, hover `rgb(240,90,34)` — identical to Studio's own values.

**Held: New Chat.** DC-7 said it should match, but that decision was taken on my description
"already permanently orange", which was accurate and **incomplete**. New Chat's icon is not a bare
orange glyph — it is a deliberate 22px badge: `bg-[rgba(var(--primary-6),0.12)]`, a
`rgba(var(--primary-6),0.24)` border, and a `group-hover` intensification of both
(`SiderToolbar.tsx`). Flattening it to a plain grey icon removes a designed primary-action
affordance, which is materially more than the reporter agreed to. Not done; needs a fresh decision.

**Mechanism note — Studio's orange is an accident.** `StudioTypography.module.css:57-63` pins
`bodyTextAction` to `--text-secondary` across `:hover`, `:focus` and `:active`. It loses:
Arco's `.arco-btn-text:not(.arco-btn-disabled):hover` is the more specific selector, so the button
turns orange anyway and only the label span holds grey via `._body`. The behaviour everyone likes is
Studio's own CSS failing. The other rows can't inherit an accident, so `NAV_ICON_HOVER` states it
explicitly.

**Trap worth keeping — `text-[rgb(var(--primary-6))]` compiles to nothing.** The first
implementation used it, passed `tsc` and jsdom, put the class in the DOM, and did nothing: UnoCSS
cannot decide whether an arbitrary `text-[…]` value is a size or a colour once it wraps a `var()`,
so it emits no rule. Live measurement caught it — the icon went to `rgb(20,24,31)` on hover instead
of orange. `bg-[rgba(var(--primary-6),…)]` works elsewhere only because `bg-` has no such ambiguity.
Use `text-primary`. Both facts are now pinned by mutation-tested guards.

### C-07 reproduced on slot 2 — and it is a sizing bug, not a truncation bug

Reproduced by seeding two `source: 'user'` templates into
`Forge-Dev-2/presentation-templates/`, using the reporter's own two names verbatim rather than an
invented long string. Template metadata was copied from a real `template.json` (`editorial-field-report`)
so the fixture comes from reality — the habit this sprint's BUG-046/049/050 postmortem asks for.

**Measured card widths, same row:**

| template name                                                        | card width |
| -------------------------------------------------------------------- | ---------- |
| `Minimal Editorial HTML Template Specification`                      | **281px**  |
| `Reusable HTML Template Specification — Clean Report (Navy & Cream)` | **417px**  |
| short builtin names (`Simple Dark`, `Project Kickoff`, …)            | uniform    |

**So the card sizes itself to its title.** The caption element does carry `white-space: nowrap` and
`overflow: hidden` and truncates _within_ the card — but an ancestor with `overflow: visible` and
`white-space: normal` has already been widened to fit the full string, so truncation never gets the
chance to constrain anything. The row then overflows its container and the last card is sliced by
the panel edge — exactly the reporter's screenshot, now reproduced from a clean profile.

**Consequence for the fix:** adding an ellipsis alone will not work; the grid item needs a width
constraint (`min-width: 0` on the flex/grid child, or a fixed card width) _before_ truncation has any
effect. That is a different change from the one C-07's intake entry assumed.

**Still unverified:** whether the in-chat panel (C-06) shows the same or a different failure — that
needs a conversation, which needs a configured provider.

### C-12 confirmed by measurement — 5px, and the chevron is the outlier

Measured on slot 2 with a seeded project, reading `getBoundingClientRect().right` rather than
judging by eye:

| element                           | right edge | state          |
| --------------------------------- | ---------- | -------------- |
| `Teams` `+`                       | **236.0**  | always visible |
| `Projects` `+`                    | **236.0**  | always visible |
| `Chats` `+`                       | **236.0**  | always visible |
| project row chevron               | **241.0**  | hover only     |
| project row secondary icon (menu) | **219.0**  | hover only     |

The three section `+` icons agree exactly. The chevron sits **5px further right**, 3px from the
sidebar's right edge (244) where the `+` icons sit 8px in. The reporter's "not aligned" is real and
the chevron is the outlier, so it should move left to 236 rather than the three headers moving.

**Hypothesis from the static pass was wrong.** Intake guessed different containers with different
right-hand padding, pointing at `.pinnedTextSlot`'s 28px/18px rule. The measurement does not support
that: the three headers agree perfectly across two different containers, so container nesting is not
the cause. The chevron simply has its own offset.

**Note for whoever fixes it:** the row's trailing icons are **hover-only** — at rest the project row
has no trailing icon at all. The reporter's screenshot showed a chevron because their project was
expanded with a child chat. So the fix must be verified in the hovered state; a screenshot at rest
will show nothing to align.

### C-14 fixed — the colours were already right, only the specificity was wrong

Measured before: all 7 file rows `rgb(240,90,34)`. After: `rgb(78,89,105)` at rest,
`rgb(29,33,41)` with a `rgb(246,241,232)` background on hover.

`workspace.css:256-275` already declared `color: var(--color-text-2)` at rest and
`var(--color-text-1)` on hover. It never applied: the rows are Arco text Buttons, and
`.arco-btn-text:not(.arco-btn-disabled)` scores **(0,3,0)** against the bare
`.workspace-project-files-row` at **(0,1,0)**. The fix adds the qualifier so the existing intent
wins; no colour value was chosen or changed.

**DC-2's affordance condition is met without adding one.** The concern was that removing the colour
would leave clickable file names unmarked. It doesn't: the row already responds on hover with both a
text-colour shift and a background, so clickability is signalled by more than colour alone.

**The first guard test was vacuous and mutation testing caught it.** It asserted the rest-state
selector with `toContain`, which the `:hover` rule satisfies as a prefix — so deleting the
rest-state qualifier left the suite green. Tightened to require the selector terminated by `,` or
`{`; the mutation now fails as it should. Same class as BUG-051.

### C-01 attempted and reverted — DC-1's "two literals" estimate is wrong

Switching `ChatConversation.tsx` to `workspacePresentation='panel'` at both call sites type-checks and
changes nothing useful: measured live on a real conversation, the **Project flyout was still present**
and the artifact pane rendered **1px wide** containing the text "Project".

Cause: `Workspace/index.tsx:531-544` builds `projectMenu` and returns it **unconditionally** — the
component has no presentation mode at all. `props.sider` therefore _is_ the project menu, whichever
branch `ChatLayout` takes. Setting `'panel'` only relocates that same flyout into the artifact pane.

**So C-01 needs the Workspace component to grow a file-tree presentation**, which is what the fork
replaced. That is a real feature-sized change, not a config flip. The intake lead and DC-1 both
under-estimated it, and this correction supersedes them.

Reverted to `'project-menu'` — the half-applied state was worse than the original, since it produced
a 1px pane. Nothing about C-01 is shipped.

**Note on how this was found:** it type-checked. The only thing that exposed it was opening a real
conversation and measuring the pane. Third time in this stream that a green static check accompanied
a completely non-functional change (see also C-05's uncompiled utility and C-08's flush icon).

### C-12 fixed — two independent causes, both measured

Every rightmost trailing icon in the sider now sits at **right=236**, verified by hovering each row
in turn: `Teams` 236, `Projects` 236, project row 236, `Chats` 236, conversation row 236.

**Cause 1 — the container inset.** The row action strips are **absolutely positioned**
(`absolute right-8px`), so they ignore the row's padding entirely and set their own inset. The
section labels use `pr-12px`. That 4px difference is most of the gap. This also means the intake
doc's earlier guess — and my first fix attempt, changing `WorkspaceCollapse`'s `pr-8px` to
`pr-12px` — were both wrong: the padding is not what positions these icons, and that edit did
nothing at all. Reverted.

**Cause 2 — the button size.** With the insets aligned the icons were still **1px** apart: a 14px
icon centres 3px from the edge of a 20px button but 4px from a 22px one, and the section `+` uses
22px. Row action buttons are now 22px too.

**Scope grew by measurement.** C-12 was reported against the project row, but conversation rows use
the same `absolute right-8px` strip and measured the same 241. Both are fixed; leaving one would
have left the sider half-aligned.

### C-07 fixed — the constraint was missing, not the truncation

Every card now measures exactly **160px** (`uniqueWrapWidths: [160]`), against 281px and 417px
before. The two long names report `nameClipped: true`; short names report `false`.

**The caption already had `truncate`.** It could never engage: the card's wrapper was
`flex flex-col shrink-0` with **no width**, so it sized itself to the caption instead of the other
way round. Truncation has nothing to truncate against until the wrapper is bounded. Two changes:

- The wrapper now carries the same `CARD_W` the thumbnail uses, hoisted into one constant so the
  two cannot drift apart — the drift is the bug.
- `TEMPLATE_NAME` gained `min-w-0`, without which `truncate` is inert inside a flex row.

**This confirms the intake correction and refutes the original entry.** C-07 was reported and
recorded as a truncation/overflow problem; it is a sizing problem, and an ellipsis-only fix would
have changed nothing.

**Not a bug, for the record:** the partially visible card at the row's right edge is the horizontal
scroller working as designed (`overflow-x-auto snap-x`), signalling more content. That is distinct
from the original defect, where the card's _size_ was wrong.

### C-06 fixed — and the intake entry's description of it was wrong

Measured in-chat, before: cards per row `{3,3,3,3,1,1}`. After: `{4,6,4}` — one row per artifact
type, matching the group counts exactly.

**The intake entry claimed the in-chat panel showed "no artifact-type grouping at all". That is
false** — the headings were always there. The real difference is the _shelf direction_.
`TemplateGalleryColumns` has two variants: `compact` lays each type out as a vertical column
(`shelf: 'flex flex-col'`) and wraps the columns; `large` gives each type one horizontal,
scrollable shelf. `TemplateGalleryExpanded` (new-chat) passed `size='large'`; `TemplateGalleryPanel`
(in-chat) passed `size='compact'`. So the ragged grid in the screenshot is three vertical columns
side by side, not a broken grid.

**Fix is the one-word answer to C-06's open question:** both surfaces now use the same component
_and_ the same variant, so they cannot drift apart again. The panel is wide enough for shelves, and
`large` scrolls horizontally when it is not.

### C-11 fixed on both backends — and the reported labels belong to only one of them

Measured on a live AionRS prompt. Before: `Yes, allow once` and `Yes, allow always` solid orange
`rgb(240,90,34)`; `No (esc)` a pale `rgb(242,243,245)` fill with a **transparent** border. After: the
deny button carries `rgb(216,203,182)` (`--bg-4`) at 1px and keeps its quieter fill — DC-4 exactly.

**The reporter's screenshot is the ACP prompt, not the one most reachable in dev.** Its labels are
`Allow once` / `Always allow` / `Reject`; AionRS says `Yes, allow once` / `Yes, allow always` /
`No (esc)`. Same decision, two components, different copy — the triage note that C-11 touches **two**
files is confirmed, and fixing only the reported one would have left the other backend broken.

Both now read the border from one shared constant (`permissionButtonStyles.ts`), so they cannot
drift. Colour only, no width: Arco already supplies the 1px, and numeric border utilities in this
repo set colour and never width.

**Also confirmed:** `MessagePermission` already de-emphasises `always allow` for _destructive_
actions, so this fix did not disturb an existing safety behaviour.

### C-02 + C-03 fixed together — and C-02 alone would have shipped a regression

Measured live. Inline code: `rgb(229,220,201)` → **`rgb(240,233,219)`** in light, and
`rgb(30,37,54)` unchanged in dark. Links: `none` → **`underline`** on hover. File chip: gains a
**`1px rgb(216,203,182)`** border.

**The renderer duplication is the load-bearing discovery.** Chat replies render inside a **shadow
root**, so `markdown.css` does not style them at all — `ShadowView.tsx` carries its own near-duplicate
rules and those are what users see. `markdown.css` writes its copy with `:where()`, which contributes
**zero specificity**, so even where both are in scope the shadow copy wins. Editing `markdown.css`
alone changes nothing visible in chat, which cost a full diagnostic cycle here. Two consequences were
invisible until measured: the chip fill, and the fact that **markdown.css's link-underline rule has
never applied to chat at all** — chat links had colour and nothing else, which is exactly C-03.

**C-02 created C-03's collision, exactly as intake predicted.** The intake entry warned that
"whatever lighter shade C-02 lands on must still leave room for C-03's distinction". It did not:
`.markdown-local-file-link` — the _clickable_ chip — already used `--bg-2` `#f0e9db`, and C-02 moved
inline code onto that same value, making a clickable chip and an inert one identical. Shipping C-02
by itself would have been a regression. Resolved by moving the affordance off colour entirely:

| element               | fill               | border                 | colour                     |
| --------------------- | ------------------ | ---------------------- | -------------------------- |
| inline code (inert)   | `rgb(240,233,219)` | none                   | dark                       |
| file chip (clickable) | `rgb(240,233,219)` | `1px rgb(216,203,182)` | dark                       |
| hyperlink             | none               | none                   | orange, underline on hover |

DC-2 holds: orange still means a real hyperlink, and nothing else acquired it.

### C-10 fixed by mechanism — NOT live-verified

`TemplateMessageCard.tsx` renders an Arco `Button` with an `icon` prop and `className='w-fit'`,
which is the **same markup that produced the identical defect on the sider footer in C-08**: Arco's
button computes `display: block` with `text-align: center`, so the glyph butts against the label and
`gap` is inert until `flex` is added. The fix is the same one-line class change, and C-08's version
of it was measured and screenshotted.

**VERIFIED by the reporter 2026-08-18.** During implementation the card was never seen — two attempts
to trigger the in-chat creation path produced no card, so the fix shipped on a proven mechanism and an
unproven surface, labelled accordingly. The reporter has since exercised it in the running app and
confirmed the button renders correctly. The mechanism (Arco's `display: block` defeating `gap` until
`flex` is added) is now confirmed on both surfaces it was applied to, C-08 and C-10.

**The reporter's suggested fix — "you can just remove the icon" — was deliberately not taken.** Now
that the mechanism is known, removing the icon would treat a symptom that recurs on the next Arco
button anyone builds with one, and it is a content change rather than a layout fix. Say so when
reporting, and offer removal if the icon is unwanted on its own merits.

### C-13 closed — element 2 needed no change, and the intake warning was right

The intake entry flagged: "it may be a _state_, not a resting colour… flattening it removes the hover
feedback entirely — the same failure mode as C-11". Measured, that is exactly what it is.

| state   | chat row background        |
| ------- | -------------------------- |
| at rest | **none** (transparent)     |
| hovered | `rgb(240,233,219)`, 791×54 |

So the reporter's screenshot captured a hovered row. There is no resting band to lighten, and the
comparison in "make 1 and 2 the same colour as 3" does not hold: element 1 was a resting fill,
element 2 is a hover.

**Worth keeping as a method note:** this is the second item in the stream (with C-05) where the
reported symptom was real but the _mechanism_ was not what the report implied, and only a
rest-vs-hover measurement separated them. Reading a colour off a screenshot cannot distinguish a
resting fill from a hover; a `mouseMoved`-then-read pass can.

### C-01 implemented — flyout kept, file tree added to the pane — but NOT behaviourally verified

**Decision (2026-08-18, revised):** keep the Project flyout **and** bring the file tree back, per the
reporter. This supersedes DC-1 and DC-5, which assumed the flyout would be replaced.

**Shape, chosen after measuring the alternatives.** The right pane is not artifact-triggered —
`artifactVisible = workspaceEnabled && isDesktop && !artifactCollapsed` — so it is a permanent column
already holding `PreviewPanel`. The tree therefore shares it behind a **Files / Preview** tab pair,
with both views kept mounted and toggled via `hidden` so switching neither discards preview state nor
remounts the tree.

**Why a portal rather than a second tree.** The tree's state, event wiring and file operations all
live in one `Workspace` instance (`useWorkspaceTree`, `useWorkspaceFileOps`, plus the modals and
message API the latter requires). A standalone pane would have had to reproduce nearly all of
`Workspace/index.tsx`, and the two copies could then disagree about expansion and selection.
`filesPanel` is presentational, so the same element is rendered in both the flyout and the pane via
`createPortal` — one source of truth. `filesPaneContext.tsx` carries the container.

**i18n:** one new key, `conversation.workspace.changes.previewTab`, added to all 12 locales with
`i18n-keys.d.ts` regenerated. `conversation.workspace.contextMenu.preview` was **not** reused: it is
a context-menu _action_ and reads as a verb phrase in several locales, which is the documented
four-keys-say-"Report Issue" trap in this repo. `changes.filesTab` _was_ reused because it is already
a tab label.

**VERIFIED 2026-08-18** by the reporter's own screenshot: the Files / Preview tabs render in the
right pane, the Project flyout is still present, and opening `reference-notes.md` shows the preview
with its Source / Split / Preview controls. The caveat below is retained for the record of how it was
built, but C-01's wiring is confirmed working.

**⚠ Was NOT verified at commit time — this was the honest state then.** The tabs were never observed
rendering during implementation. The artifact
pane **defaults to collapsed** (`useWorkspaceCollapse` starts `true`), and on macOS neither expand
control renders: `DesktopWorkspaceToggle` is gated `!isMacRuntime && !isWindowsRuntime`, and the
header toggle is `isWindowsRuntime` only. The documented reachable path is that _opening a preview
force-expands the pane_, which needs a real file click; the attempt to drive that collided with the
user working in the same app. So: typecheck clean, i18n gate green, wiring guarded by tests — and
zero behavioural evidence. **Do not report C-01 as working until someone opens the pane and sees the
tabs.**

**Possible separate finding:** if the only way to expand that pane on macOS is to open a file
preview, there may be no direct control for it at all on this platform. Worth its own item rather
than being folded into C-01.

### C-01 extended — the pane now carries Files, Changes and Preview

**Reporter, after seeing the Files/Preview version working:** "i want to use the original preview
pane, with file and changes". Decided: **Files | Changes | Preview** — the original pane's two views
plus the artifact preview, which the reporter was actively using.

**One non-obvious blocker.** `changesPanel` was gated on
`projectMenuOpen && activeProjectPanel === 'changes'` — pure **flyout** state. A pane tab could
therefore never have had anything to show, and the changes _refresh_ effect is gated on the same flag,
so it would not have refreshed for the pane either. The gate now also honours the pane's active view,
which meant the context had to carry `activeView` and not just a container.

**Verified live** with real content: the pane listed `2 file(s) changed`, `A NEW_UNTRACKED.txt`,
`M README.md`, tabs reading `Files | Changes* | Preview`, flyout still present.

**A first measurement showed the Changes tab empty, and that was the fixture's fault, not the code's.**
The seeded project was not a git repository, so there were no changes to list and no way to tell a
working panel from a broken one. `git init` plus one modified and one untracked file turned a vacuous
check into a real one — the same fixtures-from-reality lesson this sprint's postmortem is about.

## Open questions (batched — to ask once intake closes)

- **C-01** — Does "revert" mean (a) restore upstream's preview panel and drop the Project flyout,
  (b) restore the panel and keep the flyout, or (c) keep the flyout but change what its entries
  open? And is the complaint the _menu_ or the _panel it leads to_?

### Landing protocol agreed with the sprint4 owner (2026-08-19)

`sprint4` is checked out in `.worktrees/sprint4`, so this session **cannot** move the
ref — git refuses to update a branch checked out in another worktree. The merge is
therefore prepared here and landed there. Route agreed by both sessions, each with
its own user's approval:

1. The sprint4 owner's provider-rows workflow finishes (it commits fixups directly
   to `sprint4`).
2. The owner pings this session with the **settled tip SHA** and confirms the branch
   is quiescent — clean worktree, no live processes.
3. This session re-cuts the merge against that SHA in a throwaway detached worktree
   and hands back the merge commit.
4. The owner runs `git merge --ff-only <merge commit>` then `just push`.

Do **not** re-cut before step 2: the fix agent commits directly to `sprint4`, so any
merge base taken earlier expires within minutes. A first cut against `a969ddc19`
produced merge `3440ef106` with **zero conflicts** — useful as a signal that the two
lines do not textually collide, but superseded once fixups land.

**Approval does not transfer between sessions.** This session's user approved the
combine-and-push; the owner correctly declined to act on that relayed approval and
obtained their own. Neither session treats a peer message as authorisation.

#### Load sensitivity — read before believing any gate result

Two peers independently measured this host. Full-suite runs go from 0 failures to 4
on load alone, same commit; a wall-clock latency probe spreads 38ms at load 2 versus
3358ms at load 21. The recurring offenders are the BUG-046 family
(`renderService.integration`, `pdfExtract`, `PresentationSourceGrantStore`,
`jobManager`) plus `directorCommandLifecycle`, `store.test.ts`,
`presentationRunJournal`. The failing set varies run to run, which is itself evidence
of load rather than a fixed defect.

Consequences, both directions:

- A **red** gate under contention is not evidence of a defect. Re-run the offenders
  isolated before concluding anything.
- A **green** gate under contention is _stronger_ evidence than a green on a quiet
  host, not weaker. Contention can only cause timing failures, it cannot mask them,
  so passing while starved means the assertions had margin. The Stream C gate at
  `0f2bd0da3` was green under unknown load; that is a reason for more confidence in
  it, not less. (An earlier revision of this note claimed the opposite. It was wrong
  — it treated the evidence as symmetric when the mechanism is not.)
- The one narrow exception: a race that only manifests when the host is _fast_ can be
  accidentally serialised by slowness, so a green under load does not cover
  fast-path-only races. That class is rare and is not what the BUG-046 family is.
- Judge a gate by **exit code and `uptime` together**, and announce full-suite runs
  to the other sessions first — three concurrent runners produce only phantoms.

`officeCliRunner.test.ts` has two genuinely intermittent process races (a PID-file
read and an escaping `kill ESRCH`) that are independent of load and already tracked
separately. Do not chase them here.
