# Operations Guide — Theme Specification

A compact standard operating procedure: teal accent, Calibri throughout, tight leading,
built for someone following it under time pressure. No cover page.

## Workflow (mandatory)

1. Run `officecli load_skill docx` and follow it.
2. Copy the attached `reference.docx` to the output file. Edit the copy. Never build
   from scratch, never write raw OOXML.
3. If the user attached source documents (Excel, Word, CSV, PDF), read them with
   `officecli view <file> text` and build every threshold, owner, and step from that
   data.
4. Replace the sample content wholesale. Keep the styles, numbering definitions, page
   setup, and structure.

## Visual system

### Palette (do not change)

- Deep teal `#0A4F4E` — Title, Heading 1
- Teal `#0E7C7B` — the kicker line and the rule under the title block
- Ink `#1F2933` — body text, Heading 2/3
- Muted `#7B8794` — metadata line, captions
- Tint `#E8F3F2` — informational callout fill
- Warn `#FDF3E3` — warning box fill

### Typography (real Word styles only)

- `Title` — Calibri 24pt bold deep teal
- `heading 2` — Calibri 13pt bold ink, used for every section
- `Normal` — Calibri 11pt ink, 8pt after

## Page geometry

US Letter portrait, 1 inch margins. Table `colWidths` must sum to 9360 twips,
`layout=fixed`, `padding=100`.

## Structure catalog — what to clone

- **Title block** — kicker (`STANDARD OPERATING PROCEDURE`), `Title`, then a 9pt muted
  metadata line carrying owner, review cycle, and version. The metadata line carries the
  teal bottom border. No cover page — the procedure starts on page one.
- **Scope** — three labelled paragraphs: applies to, does not apply to, prerequisites.
  Keep all three even when one is short; a reader needs to know what is out of scope.
- **Procedure** — a real numbered list (`numId=1`). One action per step, imperative verb
  first. Never split one action across two steps, never bundle two into one.
- **Warning box** — a bold 10pt paragraph with the warn fill, placed immediately after
  the step it qualifies. Use sparingly; two in a document is already a lot.
- **Threshold table** — signal, threshold, action. Short-value columns stay narrow.
  Follow with a 9pt italic muted caption.
- **Completion checklist** — a real bullet list (`numId=2`) of things that must be true
  before the procedure is considered done.

## Hard bans

- No cover page, no contents page, no TOC field.
- No fake numbering — the steps use `numId=1`, the checklist uses `numId=2`. Never a
  literal `1.` or `•` typed into the text.
- No table used as a horizontal rule — use `pbdr.bottom`.
- No fixed row heights.
- No placeholder tokens (`{name}`, `$VAR$`, `TODO`, `lorem`) in delivered content.
- No runs of empty paragraphs for spacing.

## Delivery gates (all must pass before the document is done)

1. `officecli validate <file>` returns `no errors found`.
2. `officecli view <file> issues` is clean.
3. No placeholder tokens remain.
4. Contact-sheet visual pass: `officecli view <file> screenshot --grid auto`, inspected
   for step-number continuity, wrapped step lines aligning under the text not the marker,
   callout fill width, and clipped table text. Confirm any fine call with
   `screenshot --page N`. Fix and re-render until a full pass finds zero new issues
   (max 3 cycles).

Note: `view text` renders every numbered item as `1.` regardless of the real number.
Judge numbering from the rendered screenshot, not from `view text`.

## Follow-up edits (all later change requests in this conversation)

Edit the existing document in place — never regenerate it from the reference. Re-run
every delivery gate above. Show the re-rendered changed page(s) in your reply as a
markdown image.

## Voice

Imperative and unambiguous. Every step begins with a verb. Say what to do, what to check,
and what to do when the check fails. No hedging — an operator following this at 3am
cannot interpret "consider whether".
