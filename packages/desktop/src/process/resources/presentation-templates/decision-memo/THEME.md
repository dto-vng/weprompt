# Decision Memo — Theme Specification

A one-to-three page decision memo: black on white, a single red accent rule, no cover
and no contents page. The recommendation appears before the reasoning.

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

- Ink `#111111` — all headings and body text
- Accent `#B22222` — the masthead word and the rule beneath it, nothing else
- Muted `#666666` — table notes
- Tint `#F4F4F4` — recommendation callout fill

### Typography (real Word styles only)

- `Title` — Calibri 22pt bold ink (the subject line, not a cover title)
- `heading 2` — Calibri 13pt bold ink, used for every section
- `Normal` — Calibri 11pt ink, 8pt after

`heading 1` exists in the style sheet but is unused in this template — a memo has one
level of section. Do not introduce it.

## Page geometry

US Letter portrait, 1 inch margins. Table `colWidths` must sum to 9360 twips,
`layout=fixed`, `padding=100`.

## Structure catalog — what to clone

- **Masthead** — the word `MEMORANDUM` in 10pt bold accent, carrying an accent bottom
  border. One line, nothing above it.
- **Subject** — `Title` style, the decision in a single noun phrase.
- **Addressing block** — four paragraphs, each `LABEL:\tvalue`. Keep all four; keep the
  tab so the values align.
- **Recommendation** — a bold paragraph with the tint fill, immediately after the
  `Recommendation` heading. It states the decision, the scope, and the date needed.
  This is always the first content the reader meets.
- **Reasoning sections** — `heading 2` plus prose. Two or three, never more.
- **Options table** — three columns: option, effect, principal risk. Follow it with a
  10pt italic muted note explaining the rejected options.
- **Ask** — a numbered list of what the reader must decide or approve.

## Hard bans

- No cover page, no contents page, no TOC field.
- No table used as a horizontal rule — use `pbdr.bottom`.
- No accent colour anywhere except the masthead word and its rule.
- No placeholder tokens (`{name}`, `$VAR$`, `TODO`, `lorem`) in delivered content.
- No runs of empty paragraphs for spacing.
- Never exceed three pages. If the reasoning does not fit, it belongs in an appendix
  document, not in the memo.

## Delivery gates (all must pass before the document is done)

1. `officecli validate <file>` returns `no errors found`.
2. `officecli view <file> issues` is clean.
3. No placeholder tokens remain.
4. Contact-sheet visual pass: `officecli view <file> screenshot --grid auto`, inspected
   for page count, addressing-block alignment, callout width, and clipped table text.
   Confirm any fine call with `screenshot --page N`. Fix and re-render until a full pass
   finds zero new issues (max 3 cycles).

## Follow-up edits (all later change requests in this conversation)

Edit the existing document in place — never regenerate it from the reference. Re-run
every delivery gate above. Show the re-rendered changed page(s) in your reply as a
markdown image.

## Voice

Decisive. State the recommendation as an instruction, not an observation. Give the
reader the date by which the decision is needed. Prose over bullets except for the ask.
