# Monthly SteerCo — Theme Specification

> A PPTX template. The attached `reference.pptx` IS the visual system — clone it, never rebuild it.
> Before any work: run `officecli load_skill pptx` and follow its rules together with this spec.
> At any point, an explicit user styling request (colors, chart type, layout) overrides this spec's defaults — comply and note the deviation in one line of your reply; never refuse and never ask for a waiver.

## Workflow (mandatory)

1. Copy the attached `reference.pptx` to the output file (descriptive snake_case name, saved in the conversation workspace). Never create a deck from scratch and never write raw OOXML.
2. Open the copy with officecli. Run `officecli view <file> outline` and `view annotated` to map the eight reference slides.
3. Plan the full slide-title sequence first. Map each content section to a reference slide via the layout catalog below; duplicate a reference slide when a pattern is needed twice; delete reference slides you do not use.
4. Replace ALL sample content — every number, name, date and sentence in the reference is placeholder material. Keep positions, sizes, fonts, colors and the slide chrome exactly as they are.
5. Update speaker notes on every slide (the reference carries notes explaining each slide's role — replace them with a real presenter script).
6. If the user attached source documents (Excel, Word, CSV, PDF), extract their real content first (`officecli view <file> text` reads Office files) and build slide content and chart data from it — never invent numbers when sources are attached.

## Visual system

Light sandwich: white background on every slide, no dark slides anywhere in this deck.

### Palette (do not change)

| Role   | Hex       | Use                                                                                   |
| ------ | --------- | ------------------------------------------------------------------------------------- |
| Orange | `#F1592A` | Kickers, GAP labels, "NEXT" step labels, caveat-banner text                           |
| Navy   | `#122B45` | Titles, section/agenda numbers, program boxes, divider numerals, "WE ARE HERE" marker |
| Gold   | `#C9A227` | Short underline bar under every display title (this deck's signature)                 |
| Cream  | `#FBF0E7` | Deliverables panel, timeline phase bars, status caveat banner                         |
| Green  | `#00A651` | "On track" status chips, check-row marks, next-step numbered circles                  |
| Red    | `#D7282F` | Timeline month pills, "At risk" status chip, GAP label accent                         |
| Ink    | `#1F2933` | Body text, card/status prose on white                                                 |
| Muted  | `#5B6B82` | Owner/date labels, footers, `[COMPANY LOGO]` slot text                                |
| Peach  | `#FDE4D8` | Overlapping cover circles (top-right corner motif)                                    |
| White  | `#FFFFFF` | Slide background everywhere; text on navy/red/green fills                             |

### Typography (set explicitly on every shape — never rely on theme defaults)

| Element                         | Font          | Size                                |
| ------------------------------- | ------------- | ----------------------------------- |
| Slide titles / cover title      | Cambria bold  | 36–44pt                             |
| Section-divider numeral         | Cambria bold  | ~170pt                              |
| Agenda / decision-card numbers  | Cambria bold  | 20–28pt                             |
| Body text                       | Calibri       | ≥18pt (never smaller for sentences) |
| Leads/statements (asks, status) | Calibri bold  | 20pt                                |
| Kickers, owner/date labels      | Consolas bold | 12–14pt, UPPERCASE                  |
| Card sublabels/captions         | Calibri       | 14–15pt                             |

### Motif

Short gold underline bar (≈3.5cm × 0.12cm) under every display title. Two overlapping peach (`#FDE4D8`) circles in the top-right corner of the cover slide. A `[COMPANY LOGO]` text slot (Consolas 10pt, muted, top-right) on the cover, section dividers and the closing slide — replace the slot with the user's company NAME as text when given; never insert or fabricate a logo image; delete the slot if asked. Keep the motif on every slide you add; do not introduce a second motif.

## Layout catalog — which reference slide to clone

| Content type          | Reference slide | Pattern                                                                                                                      |
| --------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Cover                 | 1               | White, kicker + 44pt navy title + gold bar + peach corner circles + `[COMPANY LOGO]` slot                                    |
| Agenda / sections     | 2               | Three numbered rows (Cambria numeral + bold name + description), gold bar under title                                        |
| Section break         | 3               | ~170pt ghost-scale navy numeral, gold bar, 32pt title, `[COMPANY LOGO]` slot, whitespace-dominant                            |
| Program status board  | 4               | Left rail of navy program boxes with status chips, center status lines, right cream deliverables panel with green-check rows |
| Delivery timeline     | 5               | Five red month pills across the top, cream phase bars staggered below, navy "WE ARE HERE" marker                             |
| Decisions / asks grid | 6               | 3-card `gridX(3)` grid, each card: navy number, bold title, red GAP label + line, green PROPOSAL label + line                |
| Status & next steps   | 7               | Cream caveat banner, numbered rows (green circle + Consolas label + lead + right-aligned Consolas owner·date)                |
| Closing / asks        | 8               | White, 36pt navy title, gold-bar-marked statements, muted footer, `[COMPANY LOGO]` slot                                      |

Grid rules: 1.5cm side margins minimum, 0.76cm gaps between cards, ≥20% of each slide left as whitespace.

## Charts

- Use native officecli charts only — never a chart pasted as an image, never a fake chart drawn from rectangles.
- Series colors: first `#00A651` (green), second `#122B45` (navy); highlight a single series or point with `#F1592A` only when it is the point of the slide.
- Column for category/period comparison, bar for ≥5 categories, line for time series. A single KPI belongs in a card or pill, never a chart.
- Every chart carries a short title naming its unit (e.g. "Rollout progress by wave, % sites live").

## Hard bans

- No decorative elements beyond the gold underline bar and the peach corner circles — no drop shadows, gradients, or a second accent shape system.
- No text-only content slides — every content slide keeps a program box, chip, pill, panel, card or numbered row from the reference.
- No centered body text (center only titles, divider numerals, and chip/pill labels).
- No invented facts: if data for a slot is missing, mark it clearly (e.g. "[metric owner to supply]") and say so in the reply.
- No leftover reference content: every sample name, number and date must be replaced or the slide deleted.
- Template slots ≠ your items: when you have fewer items than the reference shows (e.g. 2 agenda rows on a 3-row slide, 2 decision cards on a 3-card grid), delete EVERY shape of the unused row or card — number, chip, lead, body, owner label, background — and re-space the remainder. A partial or displaced leftover row is a defect.
- No logo images: the `[COMPANY LOGO]` slot is text only — never insert, fabricate, or source an actual logo graphic. Replace it with the company name as text, or delete it if asked.

## Delivery gates (all must pass before the deck is done)

1. `officecli validate <file>` — zero errors.
2. `officecli view <file> issues` — zero issues; fix and re-run until clean.
3. Placeholder scan — BOTH checks must print nothing:
   - `officecli view <file> text | grep -iE 'lorem|TODO|xxx'`
   - `officecli view <file> text | grep -iE 'meridian|aurora|k\. dao|t\. le|service desk ai|vendor renewal'` — these tokens exist only in the reference's sample content; any hit is a leftover you must replace or delete. Dividers and the closing slide are the most commonly forgotten — check them slide by slide.
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

Steering-committee register: every item ends in a decision, an owner, and a date.
