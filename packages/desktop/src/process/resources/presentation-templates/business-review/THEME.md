# Business Review — Theme Specification

> A PPTX template. The attached `reference.pptx` IS the visual system — clone it, never rebuild it.
> Before any work: run `officecli load_skill pptx` and follow its rules together with this spec.

## Workflow (mandatory)

1. Copy the attached `reference.pptx` to the output file (descriptive snake_case name, saved in the conversation workspace). Never create a deck from scratch and never write raw OOXML.
2. Open the copy with officecli. Run `officecli view <file> outline` and `view annotated` to map the eight reference slides.
3. Plan the full slide-title sequence first. Map each content section to a reference slide via the layout catalog below; duplicate a reference slide when a pattern is needed twice; delete reference slides you do not use.
4. Replace ALL sample content — every number, name, date and sentence in the reference is placeholder material. Keep positions, sizes, fonts, colors and the slide chrome exactly as they are.
5. Update speaker notes on every slide (the reference carries notes explaining each slide's role — replace them with a real presenter script).

## Visual system

Sandwich structure: dark navy cover, section dividers and closing slide; white content slides.

### Palette (do not change)

| Role           | Hex             | Use                                                                               |
| -------------- | --------------- | --------------------------------------------------------------------------------- |
| Primary        | `#0B1F3A` navy  | Dark slide backgrounds, titles on white, chart series 1                           |
| Card           | `#14294D`       | Card fills on dark and light slides, giant ghost numerals on navy                 |
| Accent         | `#F2A33C` amber | Square markers, numbered circles, kickers, KPI deltas — sparing, one-hit emphasis |
| Text on light  | `#1F2933`       | Body text on white slides                                                         |
| Muted on light | `#5B6B82`       | Owner/date labels, captions on white                                              |
| Muted on dark  | `#9DB0C9`       | Subtitles, sublabels, footers on navy; chart series 2                             |
| Panel          | `#F5F7FA`       | Light insight cards on white slides                                               |

### Typography (set explicitly on every shape — never rely on theme defaults)

| Element                    | Font          | Size                                |
| -------------------------- | ------------- | ----------------------------------- |
| Slide titles               | Cambria bold  | 36–44pt                             |
| Section/card headers       | Cambria bold  | 20pt                                |
| Body text                  | Calibri       | ≥18pt (never smaller for sentences) |
| Leads/statements           | Calibri bold  | 20pt                                |
| Kickers, owner/date labels | Consolas bold | 12–14pt, UPPERCASE                  |
| KPI hero numbers           | Cambria bold  | 54–66pt                             |
| Card sublabels/captions    | Calibri       | 14–15pt                             |

### Motif

Small amber squares (0.42cm) as list markers and amber numbered circles (1.7cm) for ordered rows. Giant ghost numerals (`#14294D`, ~220pt) on dark slides. Keep the motif on every slide you add; do not introduce a second motif.

## Layout catalog — which reference slide to clone

| Content type                     | Reference slide | Pattern                                                                                               |
| -------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------- |
| Cover                            | 1               | Navy, kicker + 44pt title + subtitle, ghost quarter numeral right                                     |
| Executive summary / 3 key points | 2               | Numbered amber circles + lead/body rows, navy hero-number card right                                  |
| KPI snapshot                     | 3               | 4-card grid (7.15cm cards, 0.76cm gaps, 1.5cm margins), hero number + sublabel + amber delta per card |
| Trend or comparison data         | 4               | Native column chart left two-thirds, panel insight card right third                                   |
| Per-segment / per-item results   | 5               | Bold lead + driver/action rows left, native bar chart right                                           |
| Section break                    | 6               | Navy divider, ghost section number, kicker + 40pt title                                               |
| Priorities / decisions / asks    | 7               | Numbered rows with right-aligned Consolas OWNER · DATE labels                                         |
| Closing / outlook                | 8               | Navy, amber square markers + 20pt statements, muted footer                                            |

Grid rules: 1.5cm side margins minimum, 0.76cm gaps between cards, ≥20% of each slide left as whitespace.

## Charts

- Use native officecli charts only — never a chart pasted as an image, never a fake chart drawn from rectangles.
- Series colors: first `#0B1F3A`, second `#9DB0C9`; highlight a single series or point with `#F2A33C` only when it is the point of the slide.
- Column for category/period comparison, bar for ≥5 categories, line for time series. A single KPI is a hero-number card (slide 3 pattern), never a chart.
- Every chart carries a short title naming its unit (e.g. "Revenue by quarter, $M").

## Hard bans

- No decorative accent stripes, bars, or title underlines anywhere.
- No text-only content slides — every content slide keeps a chart, card, circle row, or marker system from the reference.
- No centered body text (center only titles and hero numbers).
- No invented facts: if data for a slot is missing, mark it clearly (e.g. "[metric owner to supply]") and say so in the reply.
- No leftover reference content: every sample name, number and date must be replaced or the slide deleted.
- Template slots ≠ your items: when you have fewer items than the reference shows (e.g. 2 priorities on a 3-row slide, 3 KPIs on a 4-card grid), delete EVERY shape of the unused row or card — circle, lead, body, owner label, card background — and re-space the remainder. A partial or displaced leftover row is a defect.
- KPI hero slots hold short values only ('$4.2M', '48%', '+22%', 'Flat' — ≤6 characters). Hero text must never wrap to a second line; a longer status belongs in the sublabel, not the hero slot.

## Delivery gates (all must pass before the deck is done)

1. `officecli validate <file>` — zero errors.
2. `officecli view <file> issues` — zero issues; fix and re-run until clean.
3. Placeholder scan — BOTH checks must print nothing:
   - `officecli view <file> text | grep -iE 'lorem|TODO|xxx'`
   - `officecli view <file> text | grep -iE 'acme|jordan lee|emea|nrr|j\. lee|a\. kim|r\. shah|prepared by finance|q4 guidance raised|cac payback'` — these tokens exist only in the reference's sample content; any hit is a leftover you must replace or delete. Dividers and the closing slide are the most commonly forgotten — check them slide by slide.
4. Visual audit: `officecli view <file> screenshot --page N` for every slide; inspect each image for overflow, overlap, low contrast and margin violations; fix and re-render until a full pass finds zero new issues (max 3 cycles).

## Voice

Board-meeting register: numbers first, adjectives last. Every metric carries a period-over-period delta. Titles state findings ("Revenue beat plan by 18%"), not topics, and keep one grammar across the deck.
