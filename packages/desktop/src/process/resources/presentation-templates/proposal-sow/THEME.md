# Proposal / SOW — Theme Specification

A client-facing proposal and statement of work: warm neutral with a gold accent, Cambria
display over Calibri body, narrative-led with a cover, a priced scope, and a signature
block.

## Workflow (mandatory)

1. Run `officecli load_skill docx` and follow it.
2. Copy the attached `reference.docx` to the output file. Edit the copy. Never build
   from scratch, never write raw OOXML.
3. If the user attached source documents (Excel, Word, CSV, PDF), read them with
   `officecli view <file> text` and build every fee, date, and deliverable from that
   data. Never invent a price.
4. Replace the sample content wholesale. Keep the styles, numbering definitions, page
   setup, and structure.

## Visual system

### Palette (do not change)

- Gold `#9A7B23` — Title, Heading 1, signature rules
- Ink `#2B2622` — body text, Heading 2/3
- Muted `#7A7269` — cover metadata, captions, signature labels
- Tint `#F7F3EA` — reserved for an emphasis block; unused by default

### Typography (real Word styles only)

- `Title` — Cambria 30pt bold gold
- `heading 1` — Cambria 16pt bold gold
- `heading 2` — Cambria 13pt bold ink, used for phases and sub-sections
- `Normal` — Calibri 11pt ink, 8pt after

## Page geometry

US Letter portrait, 1 inch margins. Table `colWidths` must sum to 9360 twips,
`layout=fixed`, `padding=100`.

## Structure catalog — what to clone

- **Cover** — kicker, `Title`, italic subtitle, three centred metadata lines including a
  validity date, then a page break. A proposal without an expiry date is an open offer;
  always carry the date.
- **Our understanding** — prose. State the client's problem in their terms before
  proposing anything, and state explicitly what is out of scope.
- **Scope of work** — `heading 1`, then one `heading 2` per phase with a prose paragraph
  describing what the phase produces. Deliverables are named, not implied.
- **Timeline table** — phase, duration, key deliverable. Duration stays narrow.
- **Commercials table** — item, basis, amount. Amounts right-aligned in a narrow column;
  the final row is the total, bolded across every cell in that row so it reads as a sum
  rather than another line item. Follow with a caption naming what is excluded. This
  section starts on a forced page break so the "Commercials" heading and its table stay
  together — `keepNext` on the heading was tried first and does not survive rendering
  against a following table, so the break is deliberate, not accidental. A downstream
  author replacing the sample content should re-evaluate whether the break is still
  needed once real content changes how much fits on the preceding page, rather than
  keeping it by default.
- **Assumptions** — a bullet list of what must be true for the price to hold.
- **Signature block** — a paragraph carrying a gold bottom border as the signing rule,
  followed by a 9pt muted "Name and title" label. Two of these, with real vertical space
  between them.

## Hard bans

- No contents page and no TOC field — a proposal is read start to finish.
- No table used as a horizontal rule, including for signature lines — use `pbdr.bottom`
  on a paragraph.
- No fixed row heights.
- No invented prices, dates, or client names. Where the user has not supplied a value,
  ask rather than fill.
- No placeholder tokens (`{name}`, `$VAR$`, `TODO`, `lorem`) in delivered content.
- No runs of empty paragraphs for spacing.

## Delivery gates (all must pass before the document is done)

1. `officecli validate <file>` returns `no errors found`.
2. `officecli view <file> issues` is clean.
3. No placeholder tokens remain, and no fee or date is fabricated.
4. Contact-sheet visual pass: `officecli view <file> screenshot --grid auto`, inspected
   for the cover standing alone, table column proportions, the total row reading as a
   total, signature rules having room to sign between them, and no page ending in a large
   blank gap. Confirm any fine call with `screenshot --page N`. Fix and re-render until a
   full pass finds zero new issues (max 3 cycles).

## Follow-up edits (all later change requests in this conversation)

Edit the existing document in place — never regenerate it from the reference. Re-run
every delivery gate above. If fees changed, re-check the total row. Show the re-rendered
changed page(s) in your reply as a markdown image.

## Voice

Confident and concrete. Describe what will be delivered, not what will be "explored".
Name the client's problem before naming the solution. Every commitment carries a date or
a deliverable.
