# Project Kickoff — Theme Specification

> A PPTX template. The attached `reference.pptx` IS the visual system — clone it, never rebuild it.
> Before any work: run `officecli load_skill pptx` and follow its rules together with this spec.
> At any point, an explicit user styling request (colors, chart type, layout) overrides this spec's defaults — comply and note the deviation in one line of your reply; never refuse and never ask for a waiver.

## Workflow (mandatory)

1. Copy the attached `reference.pptx` to the output file (descriptive snake_case name, saved in the conversation workspace). Never create a deck from scratch and never write raw OOXML.
2. Open the copy with officecli. Run `officecli view <file> outline` and `view annotated` to map the eight reference slides.
3. Plan the full slide-title sequence first. Map each content section to a reference slide via the layout catalog below; duplicate a reference slide when a pattern is needed twice; delete reference slides you do not use.
4. Replace ALL sample content — every project name, person, date and sentence in the reference is placeholder material. Keep positions, sizes, fonts, colors and the slide chrome exactly as they are.
5. Update speaker notes on every slide (the reference carries notes explaining each slide's role — replace them with a real presenter script).
6. If the user attached source documents (Excel, Word, CSV, PDF), extract their real content first (`officecli view <file> text` reads Office files) and build slide content and chart data from it — never invent numbers when sources are attached.

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
- Template slots ≠ your items: when you have fewer items than the reference shows (e.g. 3 phases on a 4-box timeline, 3 risks on a 2×2 grid), delete EVERY shape of the unused row, box or card — badge, lead, body, date label, card background, its connectors — and re-space the remainder. A partial or displaced leftover is a defect.
- Flow connectors keep their arrowheads — a directionless line between phases is a defect.

## Delivery gates (all must pass before the deck is done)

1. `officecli validate <file>` — zero errors.
2. `officecli view <file> issues` — zero issues; fix and re-run until clean.
3. Placeholder scan — BOTH checks must print nothing:
   - `officecli view <file> text | grep -iE 'lorem|TODO|xxx'`
   - `officecli view <file> text | grep -iE 'atlas|osei|m\. tran|ibarra|novak|l\. devi|warehouse|operator shifts|steering review|roastery'` — these tokens exist only in the reference's sample content; any hit is a leftover you must replace or delete. Dividers and the closing slide are the most commonly forgotten — check them slide by slide.
4. Visual audit: `officecli view <file> screenshot --page N` for every slide; inspect each image for overflow, overlap, low contrast and margin violations; fix and re-render until a full pass finds zero new issues (max 3 cycles).

## Follow-up edits (all later change requests in this conversation)

1. **Locate.** There is ONE live deck in the conversation directory — the `.pptx` you produced earlier. Edit it in place; never create a second deck file.
2. **Target.** A slide number from the user names the target slide; an attached screenshot identifies it visually. If the target is ambiguous, run `officecli view <file> outline` and ask which slide — do not guess.
3. **User overrides theme.** An explicit user styling request (colors, chart type, layout) overrides this spec's defaults. Comply, and note the deviation in one line of your reply. Do not refuse and do not ask for a waiver.
4. **Edit.** Apply the change with officecli only (never raw OOXML). Preserve everything the user did not ask to change.
5. **Verify.** Re-run `officecli validate <file>` and `officecli view <file> issues`; both must be clean before you reply (fix and re-run, max 3 cycles).
6. **Show.** Re-render only the changed slide(s) into the conversation directory: `officecli view <file> screenshot --page N -o slide-N.png`, inspect the render for overflow, overlap and contrast, then embed it in your reply as a markdown image with an absolute path: `![Slide N](/absolute/path/to/slide-N.png)`.
7. **Close the loop.** End with a one-line summary of what changed and invite the next adjustment.

## Voice

Direct and operational. Every commitment has an owner and a date. Milestones are demos, not documents. Titles keep one grammar across the deck.
