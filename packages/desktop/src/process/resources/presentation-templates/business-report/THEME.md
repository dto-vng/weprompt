# Business Report — Theme Specification

A long-form formal report: navy and slate, Cambria display over Calibri body, a cover
page, a contents page, and prose-led sections with supporting tables.

## Workflow (mandatory)

1. Run `officecli load_skill docx` and follow it.
2. Copy the attached `reference.docx` to the output file. Edit the copy. Never build
   from scratch, never write raw OOXML.
3. If the user attached source documents (Excel, Word, CSV, PDF), read them with
   `officecli view <file> text` and build every number and claim from that data.
4. Replace the sample content wholesale. Keep the styles, numbering definitions, page
   setup, and structure.

## Visual system

### Palette (do not change)

- Navy `#1F3864` — Title, Heading 1, rules
- Ink `#2A2E35` — body text, Heading 2/3
- Muted `#6B7280` — captions, cover metadata, classification line
- Tint `#EDF1F8` — callout fill

### Typography (defined as real Word styles — use the styles, never ad-hoc formatting)

- `Title` — Cambria 32pt bold navy
- `heading 1` — Cambria 16pt bold navy, 18pt before / 8pt after
- `heading 2` — Cambria 13pt bold ink
- `heading 3` — Calibri 11pt bold ink
- `Normal` — Calibri 11pt ink, 8pt after

Never fake a heading with a bold oversized body run. Never fake a bullet with a literal
`•` or a manual `1.` — the reference defines decimal numbering as `numId=1` and bullet
numbering as `numId=2`.

## Page geometry

US Letter portrait, 1 inch margins on all sides (12240 × 15840 twips, margins 1440).
Table `colWidths` must sum to 9360 twips. Tables use `layout=fixed` and `padding=100`;
column widths are chosen by content, never equal by default.

## Structure catalog — what to clone

- **Cover** — classification line, Title, italic subtitle, three centred metadata lines,
  then a page break. Keep it on its own page.
- **Contents** — see the TOC rule below.
- **Section** — `heading 1` numbered `N.`, optional `heading 2` / `heading 3`
  subsections, prose paragraphs, bullets only where order does not matter.
- **Lead callout** — a bold paragraph with the tint fill, used once per report for the
  recommendation. Not a table.
- **Table + caption** — a table followed by a 9pt italic muted caption paragraph
  (`Table N — …`). Keep the caption with its table.
- **Closing rule** — the final paragraph carries a navy bottom border.

## The TOC rule (important)

This template uses a **static dot-leader contents list**, not a live Word TOC field.
A live `TOC` field renders the literal text "Update field to see table of contents"
until a human recalculates it in Word, and no headless pipeline can pre-populate it.

Each contents line is one paragraph whose text is `Label\tPage`, with a tab stop added
to that paragraph (`pos=6in`, `val=right`, `leader=dot`).

When you add, remove, or reorder `heading 1` sections, regenerate these lines and their
page numbers to match. Do **not** replace them with `--type toc`.

## Hard bans

- No live TOC field.
- No table used as a horizontal rule — use a paragraph bottom border (`pbdr.bottom`).
- No fixed row heights.
- No placeholder tokens (`{name}`, `$VAR$`, `TODO`, `lorem`) in delivered content.
- No runs of empty paragraphs for spacing — use `spaceBefore` / `spaceAfter`.

## Delivery gates (all must pass before the document is done)

1. `officecli validate <file>` returns `no errors found`.
2. `officecli view <file> issues` is clean.
3. No placeholder tokens remain.
4. Contact-sheet visual pass: `officecli view <file> screenshot --grid auto`, inspected
   for pagination faults, blank pages, clipped table text, and heading rhythm. Confirm
   any fine call on the page with `screenshot --page N`. Fix and re-render until a full
   pass finds zero new issues (max 3 cycles).

## Follow-up edits (all later change requests in this conversation)

Edit the existing document in place — never regenerate it from the reference. Re-run
every delivery gate above. If headings changed, regenerate the static contents lines.
Show the re-rendered changed page(s) in your reply as a markdown image.

## Voice

Declarative and specific. Lead each section with the conclusion, then the evidence.
Prefer prose to bullets for reasoning; reserve bullets for genuinely parallel items.
