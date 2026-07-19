# Design principles

Read this before committing a theme. Copy one palette and one font pair
straight into the `THEME` dict, then obey every layout and content limit
below. Good decks come from restraint: one idea per slide, generous space,
one accent color, tight word counts.

## Choosing a theme

- Pick the theme in one decision, before building any slide, and never change it mid-deck.
- Match mood to purpose: dark palettes for keynotes and product launches; light palettes for reports, training, and print handouts.
- If the user gave brand colors, map their darkest brand color to `bg` (or `text` on a light deck) and their signature color to `primary`; fill the rest from the nearest palette below.
- If the user gave no colors, ask for audience and mood, then pick: navy or charcoal for executive/finance, teal or sage for healthcare/sustainability, cream for editorial/education, coral for creative/marketing.
- Use exactly one `primary` accent across the whole deck. Never introduce a second accent color.
- Prefer a light palette when the deck will be printed or read on paper; dark palettes band and smear on cheap printers.
- Confirm the room: dark themes win on a projector in a dim room; light themes win on laptops, in bright rooms, and over video calls.

## Palettes

Each palette lists the five theme-dict color slots as 6-digit hex, no `#`.
Paste them directly into `THEME["colors"]`. `bg` is the slide background,
`primary` is the single accent, `text` is body/heading text, `muted` is
secondary text and captions. `surface` is the card fill: `add_stats_slide`
and `add_two_column_slide` render it automatically as rounded panels. Never
draw panel shapes yourself — the helpers place every decorative shape.

- **Dark corporate navy** (executive, finance, product) — bg `0F1B2D`, surface `1B2C44`, primary `4DA3FF`, text `F5F8FC`, muted `9FB2CC`.
- **Charcoal minimal** (bold, modern, understated) — bg `141414`, surface `232323`, primary `E0A82E`, text `F2F2F2`, muted `A0A0A0`.
- **Warm editorial cream** (education, storytelling, print) — bg `FAF6EF`, surface `F1E9DB`, primary `B5451F`, text `2B2320`, muted `6B6156`.
- **Teal trust** (healthcare, research, nonprofit) — bg `F5FAFA`, surface `E4F0F0`, primary `0F7A78`, text `12292B`, muted `5C7375`.
- **Bold coral** (marketing, creative, launch) — bg `FFF7F4`, surface `FCE9E2`, primary `C9341A`, text `2A1D1A`, muted `806761`.
- **Sage calm** (sustainability, wellness, strategy) — bg `F4F7F2`, surface `E4EBDF`, primary `3F6B4A`, text `222A22`, muted `606E5E`.

Palette rules:

- Never recolor text or background per slide; the five slots are fixed for the whole deck.
- Use `primary` sparingly — for one keyword, a stat number, a rule line, or a section marker — not for large text blocks.
- Use `muted` only for captions, sources, footnotes, and secondary labels, never for the main message.
- Do not invent extra hexes. If you need emphasis, use `primary`; if you need grouping, use the card slides (stats, two-column) — never freehand shapes.
- Every palette above already clears high text-on-background contrast; do not darken `text` or lighten `bg` to "improve" it.

## Typography

Pick one pairing and use `heading` for all titles and `body` for everything
else. These fonts ship on both Windows and macOS, so the deck renders
identically everywhere. Do not use system-only or web fonts.

- **Georgia / Calibri** — classic serif headings, clean sans body. Default for reports and editorial decks.
- **Palatino Linotype / Verdana** — elegant serif with a highly legible body; best for text-dense or small-screen decks.
- **Arial Black / Arial** — heavy, punchy headings; use for bold marketing and launch decks.
- **Trebuchet MS / Calibri** — friendly, rounded sans throughout; use for training and internal decks.

Size scale (points) — apply consistently across every slide:

- Title slide headline: **44** (single line).
- Section and slide headers: **36** for sections, **28** for content-slide titles.
- Body and bullets: **18** primary, **16** for denser slides.
- Captions, sources, labels: **14**, or **12** for footnotes only.

Typography rules:

- Never mix more than two typefaces in one deck.
- Bold for emphasis; never underline, and use italics only for quotes or citations.
- Keep line length under ~45 characters for headings; break long titles rather than shrinking the font.
- Left-align body text and bullets. Only titles, quotes, stats, and closing lines may be centered.

## Layout rules

- One idea per slide. If a slide needs two verbs, split it into two slides.
- Keep at least a 0.83in margin on all four edges; never let text or shapes touch the slide border.
- Give the largest element the most space; surround the key message with whitespace instead of filling gaps.
- Never center-align body paragraphs or bullet lists — center only single lines (titles, quotes, big stats).
- Align everything to a shared left edge or a consistent grid; ragged left edges look broken.
- Present stats in groups of three; two or four read as unbalanced, five-plus becomes a table.
- Limit each content slide to five bullets and one visual idea; move overflow to a new slide.
- Establish clear hierarchy: title, then one supporting line or list, then optional caption — in that vertical order.
- Open with the title slide, close with the closing slide — both carry the accent color as full blocks and bookend the deck.
- Insert a section divider (`add_section_slide`) before each chapter of 2-5 content slides; 2-4 dividers per deck give it rhythm. Give each a kicker like "Part 1".
- Give `new_deck` a short `footer` label (≤ 40 characters); content slides then carry the footer and page number automatically.
- Keep the accent line, section marker, or footer in the same position on every slide for rhythm.
- Repeat layout patterns across similar slides so the deck feels like one document, not a collage.

## Density floor

- Every content slide needs one dominant anchor: a table, a big number, a process, or an image.
- A slide carrying only 2–4 short bullets is a defect when the source has data that could fill an anchor.
- For a tabular source, target at least 3 table slides in a 12-slide deck.
- The restraint limits still cap the maximum; this rule floors the minimum. Restraint means "one idea per slide", not "one thin slide per idea".

## Action titles

- Titles state the takeaway, not the topic. Lead with the fact, and include the number when you have one.
- A topic label makes the audience read the body to learn the point; an action title delivers the point in the title.
- Vietnamese good/bad pairs:
  - Bad `Quyền lợi nội trú` → good `Nội trú được chi trả tới 80 triệu đ/năm`.
  - Bad `Gói bảo hiểm S.1` → good `Gói S.1 phù hợp với nhân viên L1-2`.
  - Bad `Thời gian chờ` → good `Thai sản có thời gian chờ 270 ngày`.

## Tables

- No vertical gridlines — `add_table_slide` omits them for you; do not try to add borders.
- Put the unit in the header (`Chi trả (triệu đ)`), never repeated in every cell.
- Numbers are right-aligned automatically when a whole column is numeric; do not pad cells to fake alignment.
- Highlight at most one column — the audience's own package or tier — via `highlight_col`.
- More than 8 rows → split across slides. Never shrink cell text below 11pt to force extra rows onto one slide.
- Always pass `source=` when the data came from a document, so the slide cites where the figures live.

## Per-slide-type content limits

Build the deck with the helper functions. Start with `new_deck(THEME)` and
end with `save_deck(path)`. Respect each helper's caps — the geometric
validator rejects text that overflows its frame, and every overflow burns a
validate/fix iteration.

- **`add_title_slide`** — title **≤ 34 characters** (44pt, wraps to two lines at most); optional subtitle ≤ 60 characters; optional `logo_path` for a real logo file. The accent band is drawn automatically.
- **`add_section_slide`** — title **≤ 40 characters** (36pt). One divider per major section; no body content.
- **`add_bullets_slide`** — title **≤ 50 characters** (28pt); **≤ 5 bullets**, each **≤ 12 words**, ideally 6–8. No sub-bullets.
- **`add_two_column_slide`** — title **≤ 50 characters** (28pt); **≤ 4 bullets per column**, each **≤ 12 words**. Use for compare/contrast or before/after only.
- **`add_image_slide`** — title **≤ 50 characters** (28pt); caption ≤ 90 characters; image must be a real file on disk (user-provided or generated earlier in the conversation) — never a guessed path or URL.
- **`add_stats_slide`** — title **≤ 50 characters** (28pt); exactly **3 stats**; each stat number short (≤ 6 characters) with a ≤ 5-word label.
- **`add_quote_slide`** — quote text **≤ 200 characters**; attribution ≤ 40 characters. One quote per slide, no other content.
- **`add_closing_slide`** — title **≤ 35 characters** (40pt); one call-to-action or contact line ≤ 50 characters.
- **`add_agenda_slide`** — **3–8 items**, each **≤ 6 words**; items mirror the section-divider titles (`title` defaults to `Agenda`).
- **`add_table_slide`** — title **≤ 50 characters**; **≤ 8 body rows × 5 columns**; header cells **≤ 3 words**; first-column cells **≤ 8 words**; `source` **≤ 70 characters**.
- **`add_big_number_slide`** — number **≤ 16 characters**; unit **≤ 20 characters**; **≤ 3 support lines**, each **≤ 12 words**; kicker **≤ 30 characters**.
- **`add_process_slide`** — title **≤ 50 characters**; **3–6 steps**. With 5–6 steps keep each `label` **≤ 14 characters** and `desc` **≤ 45 characters**; with 3–4 steps `label` **≤ 20 characters** and `desc` **≤ 90 characters**.
- **General** — keep the deck to 8–15 slides; if a slide breaks two caps, split it rather than shrinking text.

## Common mistakes

- **Wall of text.** Paragraphs on a slide. Fix: cut to ≤ 5 bullets of ≤ 12 words, or split the slide.
- **Overlong titles.** Titles that wrap or overflow their frame. Fix: obey the per-type character caps; rephrase, do not shrink.
- **Rainbow accents.** Multiple accent colors competing. Fix: use one `primary` color everywhere, `muted` for the rest.
- **Centered body copy.** Centered bullet lists and paragraphs. Fix: left-align everything except single titles, quotes, and stats.
- **Cramped edges.** Text or boxes touching the slide border. Fix: keep the 0.83in margin and let the message breathe.
- **Too many stats.** Five or more numbers crammed on one slide. Fix: show three, or move the rest to a follow-up slide.
- **Flat monotony.** Ten identical text slides in a row. Fix: break chapters with section dividers, put numbers on stat cards, and use an image slide when the user supplied a picture.
- **Thin slides.** Three-line bullet slides while the source workbook holds real figures. Fix: extract the figures to `facts.md`, then anchor the slide with a table or a big number.
- **Table flattened to bullets.** Tabular data paraphrased into prose bullets. Fix: never narrate a table — render it with `add_table_slide`.
