# Connected Ops — Theme Specification

> A PPTX template. The attached `reference.pptx` IS the visual system — clone it, never rebuild it.
> Before any work: run `officecli load_skill pptx` and follow its rules together with this spec.
> At any point, an explicit user styling request (colors, chart type, layout) overrides this spec's defaults — comply and note the deviation in one line of your reply; never refuse and never ask for a waiver.

## Workflow (mandatory)

1. Copy the attached `reference.pptx` to the output file (descriptive snake_case name, saved in the conversation workspace). Never create a deck from scratch and never write raw OOXML.
2. Open the copy with officecli. Run `officecli view <file> outline` and `view annotated` to map the eight reference slides.
3. Plan the full slide-title sequence first. Map each content section to a reference slide via the layout catalog below; duplicate a reference slide when a pattern is needed twice; delete reference slides you do not use.
4. Replace ALL sample content — every number, name, date and sentence in the reference is placeholder material. Keep positions, sizes, fonts, colors and the slide chrome exactly as they are.
5. Update speaker notes on every slide (the reference carries notes explaining each slide's role — replace them with a real presenter script).
6. If the user attached source documents (Excel, Word, CSV, PDF), extract their real content first (`officecli view <file> text` reads Office files) and build slide content and chart data from it — never invent numbers when sources are attached. If `officecli view <file> text` returns empty or unusable content for any required source, STOP and ask the user for a readable source — never proceed to build.

## Visual system

Light system: white background on cover, agenda, KPI, media, use-case and rollout slides; a muted panel background on the section divider; a deep green background on the closing slide only.

### Palette (do not change)

| Role    | Hex       | Use                                                                                                                       |
| ------- | --------- | ------------------------------------------------------------------------------------------------------------------------- |
| Green   | `#00A650` | Hexagon icon chips, KPI pill accent bars, subtitle "The future is running", agenda bullets                                |
| Deep    | `#0E4D30` | Closing-slide full-bleed background                                                                                       |
| Orange  | `#F59A23` | Hero numerals (KPI headline, section-divider numeral), use-case metric lines, closing hexagon bullets, planned-wave chips |
| Ink     | `#1F2933` | Titles, body text on white/panel slides                                                                                   |
| Muted   | `#5B6B82` | Card body copy, captions, progress-track label                                                                            |
| Pill    | `#EEF2F5` | KPI pill fills, progress track, live-region chip alt fill                                                                 |
| Hexline | `#E3E8EC` | Hexagon outlines, use-case card borders, media-frame borders                                                              |
| Panel   | `#F7F9FA` | Section-divider background, media placeholder fill                                                                        |
| White   | `#FFFFFF` | Base slide background; text on green/deep-green fills                                                                     |

### Typography (set explicitly on every shape — never rely on theme defaults; Calibri-only, sans-serif system)

| Element                      | Font          | Size                                |
| ---------------------------- | ------------- | ----------------------------------- |
| Slide titles                 | Calibri bold  | 36–42pt                             |
| Section-divider numeral      | Calibri bold  | 120pt                               |
| KPI headline hero numeral    | Calibri bold  | 40pt                                |
| KPI pill numbers             | Calibri bold  | 28pt                                |
| Body text                    | Calibri       | ≥18pt (never smaller for sentences) |
| Leads/statements             | Calibri bold  | 20pt                                |
| Kickers, status captions     | Consolas bold | 12–13pt, UPPERCASE                  |
| Card/pill sublabels/captions | Calibri       | 14pt                                |

### Motif

Sparse outlined hexagons (2–4 per chrome slide, sizes 2–6cm, fill `none` or `#F7F9FA`, line `#E3E8EC` 1pt) placed in corners behind content. Green (`#00A650`) accent bars on the left edge of KPI pills. Orange hero numerals for the KPI headline stat and the section-divider numeral. Media slots are placeholder frames only (roundRect, fill `#F7F9FA`, line `#E3E8EC`, centered muted 14pt `[ MEDIA — replace or delete ]`) — media frames stay as placeholder frames unless the user supplies images; never source images from the web; no third-party logos ever. Keep the motif on every slide you add; do not introduce a second motif.

## Layout catalog — which reference slide to clone

| Content type             | Reference slide | Pattern                                                                                                                             |
| ------------------------ | --------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Cover                    | 1               | Hexagon cluster top-left, Consolas kicker, 42pt ink title, green bold subtitle, right-half media placeholder                        |
| Agenda                   | 2               | Four rows: green numbered hexagon chip + 20pt bold item + 18pt description                                                          |
| KPI headline + pill grid | 3               | Orange hero numeral inline in the headline sentence; 6-pill `gridX(3)` × 2 rows, each pill a green accent bar + bold number + label |
| Media + narrative split  | 4               | Left media placeholder frame, right bold lead + two body paragraphs + green bold stat line                                          |
| Use-case cards           | 5               | 3-card `gridX(3)` grid: white card, green hexagon icon chip, bold title, body, orange metric line                                   |
| Section break            | 6               | Panel background, giant orange numeral, two outlined hexagons, 32pt ink title                                                       |
| Rollout status row       | 7               | Four `gridX(4)` region blocks (name + live/planned chip + site count) over a green progress bar on a pill track                     |
| Closing                  | 8               | Deep-green full-bleed, white 36pt title, orange-hexagon-bulleted statements, muted footer                                           |

Grid rules: 1.5cm side margins minimum, 0.76cm gaps between cards, ≥20% of each slide left as whitespace.

## Charts

- Use native officecli charts only — never a chart pasted as an image, never a fake chart drawn from rectangles.
- Series colors: first `#00A650` (green), second `#5B6B82` (muted); highlight a single series or point with `#F59A23` only when it is the point of the slide.
- Column for category/period comparison, bar for ≥5 categories, line for time series. A single KPI is a hero-numeral or pill (KPI grid pattern), never a chart.
- Every chart carries a short title naming its unit (e.g. "Connected sites by region, count").

## Hard bans

- No decorative elements beyond the outlined hexagon accents, pill accent bars, and orange hero numerals — no drop shadows, gradients, or a second accent shape system.
- No text-only content slides — every content slide keeps a pill, card, chip, region block, or hexagon icon from the reference.
- No centered body text (center only titles, hero numerals, and chip/pill labels).
- No invented facts: if data for a slot is missing, mark it clearly (e.g. "[metric owner to supply]") and say so in the reply.
- No leftover reference content: every sample name, number and date must be replaced or the slide deleted.
- Template slots ≠ your items: when you have fewer items than the reference shows (e.g. 3 agenda rows on a 4-row slide, 4 pills on a 6-pill grid, 2 use-case cards on a 3-card grid, 3 region blocks on a 4-block row), delete EVERY shape of the unused row, pill, card or block — chip, number, label, background — and re-space the remainder. A partial or displaced leftover row is a defect.
- Media frames stay as placeholder frames unless the user supplies images; never source images from the web; no third-party logos ever.

## Delivery gates (all must pass before the deck is done)

1. `officecli validate <file>` — zero errors.
2. `officecli view <file> issues` — zero issues; fix and re-run until clean.
3. Placeholder and literal-escape scan — THREE checks must print nothing:
   - `officecli view <file> text | grep -iE 'lorem|TODO|xxx'`
   - `officecli view <file> text | grep -iE 'northwind|predictive quality|guided maintenance|line monitoring'` — these are reference-sample indicators; verify each hit against the user sources and remove it only when it is leftover reference sample content. Legitimate user-source content must not fail this gate. Dividers and the closing slide are the most commonly forgotten — check them slide by slide.
   - `officecli view <file> text | grep -F '\n'` — visible literal newline escapes are a delivery defect.
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

Operations floor: concrete counts, sites, and machines — no abstractions.
