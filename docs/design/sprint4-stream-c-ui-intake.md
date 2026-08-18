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
  cheaper fix but has the widest blast radius, so it needs the consistency sweep done *first*, not
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
  *reference*; the change lands on the main sidebar. Nothing under the Studio programme is edited.
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
  all four equally); (b) the reporter's reference is a *different* Creative Studio button, not the
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
- **Open:** should the in-chat panel become *the same component* as the new-chat one (one layout,
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
  the *other* screen shown in the second screenshot, beside the back arrow — not on home.
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
- **Distinction worth keeping:** the *defect* is the missing icon/label spacing; *removing the icon*
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
- **Open:** border, or a stronger fill, or both? And should `Reject` stay visually *quieter* than the
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
- **⚠ Risk on element 2 — it may be a *state*, not a resting colour.** The row shows its pin / edit /
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
  *distinguishable*; C-14 says the colour currently doing that job is too loud. Orange is also the
  link colour elsewhere in the product (`www.medcat.vn` and the `Technical Details` disclosure in the
  C-02/C-03 screenshot are both orange). So the two items are one question: **what is the link
  treatment?** Answering C-03 with "more orange" would make C-14 worse, and answering C-14 with
  "plain text" would make C-03 worse. Whatever is chosen has to work at single-link density *and* at
  full-column density like this file list.
- **Open:** should file names be plain text with an underline-on-hover, plain text with a distinct
  (non-orange) link colour, or keep a colour but reserve orange strictly for alerts? And is orange
  the *brand* colour here — in which case removing it from links is a broader identity decision that
  should be made deliberately, not per-screen.

## Open questions (batched — to ask once intake closes)

- **C-01** — Does "revert" mean (a) restore upstream's preview panel and drop the Project flyout,
  (b) restore the panel and keep the flyout, or (c) keep the flyout but change what its entries
  open? And is the complaint the *menu* or the *panel it leads to*?
