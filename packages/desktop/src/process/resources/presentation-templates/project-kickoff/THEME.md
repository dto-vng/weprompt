# Project Kickoff — Theme Specification

> A PPTX template. The attached `reference.pptx` IS the visual system — clone it, never rebuild it.
> Before any work: run `officecli load_skill pptx` and follow its rules together with this spec.

## Workflow (mandatory)

1. Copy the attached `reference.pptx` to the output file (descriptive snake_case name, saved in the conversation workspace). Never create a deck from scratch and never write raw OOXML.
2. Open the copy with officecli. Run `officecli view <file> outline` and `view annotated` to map the eight reference slides.
3. Plan the full slide-title sequence first. Map each content section to a reference slide via the layout catalog below; duplicate a reference slide when a pattern is needed twice; delete reference slides you do not use.
4. Replace ALL sample content — every project name, person, date and sentence in the reference is placeholder material. Keep positions, sizes, fonts, colors and the slide chrome exactly as they are.
5. Update speaker notes on every slide (the reference carries notes explaining each slide's role — replace them with a real presenter script).

## Visual system

Sandwich structure: deep-teal cover, section dividers and closing slide; white content slides.

### Palette (do not change)

| Role           | Hex                 | Use                                                                   |
| -------------- | ------------------- | --------------------------------------------------------------------- |
| Deep           | `#0A4F4E` deep teal | Dark slide backgrounds, titles on white                               |
| Accent         | `#0E7C7B` teal      | Circle badges, phase boxes, chart series, ghost numerals on deep teal |
| Tint           | `#EAF4F3`           | Highlighted cards (in-scope, decision rights, alternating phases)     |
| Panel          | `#F4F6F6`           | Neutral cards (out-of-scope, risks)                                   |
| Text on light  | `#1F2933`           | Body text on white slides                                             |
| Muted on light | `#7B8794`           | Dates, captions, de-emphasized headers                                |
| Muted on dark  | `#B9D6D4`           | Kickers, subtitles, owner/date labels, footers on deep teal           |

### Typography (set explicitly on every shape — never rely on theme defaults)

| Element                                      | Font          | Size                                |
| -------------------------------------------- | ------------- | ----------------------------------- |
| Slide titles                                 | Cambria bold  | 36–44pt                             |
| Card headers                                 | Cambria bold  | 20pt                                |
| Body text                                    | Calibri       | ≥18pt (never smaller for sentences) |
| Leads/statements                             | Calibri bold  | 20pt                                |
| Kickers, dates, owner labels, severity chips | Consolas bold | 12–14pt, UPPERCASE                  |
| Circle badge initials                        | Calibri bold  | 13pt                                |

### Motif

Teal circles (1.7cm) carrying step numbers or role initials, and the large circle bleeding off the cover's top-right corner. Keep the motif on every slide you add; do not introduce a second motif.

## Layout catalog — which reference slide to clone

| Content type                                          | Reference slide | Pattern                                                                                  |
| ----------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------- |
| Cover                                                 | 1               | Deep teal, bleeding circle, kicker + 44pt title + sponsor/PM/date line                   |
| Problem / motivation / any 3-point argument           | 2               | Numbered teal circles + lead/body rows, native column chart right                        |
| Two-bucket comparison (in/out of scope, before/after) | 3               | Tint card vs panel card side by side (15.06cm cards, 0.76cm gap), summary line below     |
| People / roles / responsibilities                     | 4               | Initial-badge rows left, tint decision-rights card right                                 |
| Timeline / phases / process                           | 5               | 4 phase boxes with arrow connectors, Consolas dates below, milestone strip               |
| Section break                                         | 6               | Deep teal divider, ghost section number, kicker + 40pt title                             |
| Risks / options / quadrant content                    | 7               | 2×2 card grid with Consolas severity chips top-right                                     |
| Next steps / closing                                  | 8               | Deep teal, 20pt statements with right-aligned Consolas OWNER · DATE labels, muted footer |

Grid rules: 1.5cm side margins minimum, 0.76cm gaps between cards, ≥20% of each slide left as whitespace.

## Charts

- Use native officecli charts only — never a chart pasted as an image, never a fake chart drawn from rectangles.
- Single series in `#0E7C7B`; a second series uses `#B9D6D4`.
- Column for category/period comparison, bar for ≥5 categories, line for time series. A single KPI is a large-number card, never a chart.
- Every chart carries a short title naming its unit (e.g. "Cost of waiting, $K per quarter").

## Hard bans

- No decorative accent stripes, bars, or title underlines anywhere.
- No text-only content slides — every content slide keeps a chart, card, badge row, phase flow, or grid from the reference.
- No centered body text (center only titles and text inside boxes/badges).
- No invented facts: if a name, date or figure is missing, mark it clearly (e.g. "[sponsor to confirm]") and say so in the reply.
- No leftover reference content: every sample project, person and date must be replaced or the slide deleted.
- Flow connectors keep their arrowheads — a directionless line between phases is a defect.

## Delivery gates (all must pass before the deck is done)

1. `officecli validate <file>` — zero errors.
2. `officecli view <file> issues` — zero issues; fix and re-run until clean.
3. Placeholder scan of `officecli view <file> text` — no lorem/TODO/xxx and no surviving reference sample content.
4. Visual audit: `officecli view <file> screenshot --page N` for every slide; inspect each image for overflow, overlap, low contrast and margin violations; fix and re-render until a full pass finds zero new issues (max 3 cycles).

## Voice

Direct and operational. Every commitment has an owner and a date. Milestones are demos, not documents. Titles keep one grammar across the deck.
