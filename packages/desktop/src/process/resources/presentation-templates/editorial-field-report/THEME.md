# Editorial Field Report — Theme Specification

> A print-influenced editorial HTML report theme. Follow every rule in this spec when generating.
> Output is always a single self-contained HTML file. Charts rendered via Chart.js CDN. No external assets except Google Fonts and Chart.js.

---

## 1. Design philosophy

A serious, print-influenced editorial layout — closer to _The Economist_, _The New Yorker_, or a Stripe Press essay than to a slide deck. The reader is one person, alone, reading carefully. Density is fine. Whitespace is fine. Bullet-point fatigue is the enemy.

**Three governing rules:**

1. **Prose over bullets.** This is a report, not a deck. Use full paragraphs. Bullets and tables appear only when the structure of the data demands them — comparison tables, stat rows, numbered takeaways. Never use bullets to summarize what could be a sentence.
2. **One accent color, used sparingly.** Red (`#c8341e`) is the only chromatic accent. It marks emphasis, never decoration. If everything is red, nothing is red.
3. **Typography carries the design.** Two faces: a serif display (Fraunces) and a monospace (JetBrains Mono). No third font. No icons. No emojis.

---

## 2. Color palette

```
--ink:      #0a0a08    /* near-black, primary text */
--paper:    #f5f1e8    /* warm off-white background */
--paper-2:  #ebe5d4    /* slightly darker for callout blocks */
--rule:     #1a1a18    /* hairlines and dividers */
--accent:   #c8341e    /* signature red — emphasis only */
--accent-2: #1a5d3a    /* deep forest green — secondary data */
--muted:    #6b6760    /* secondary text, metadata */
--gold:     #b8932a    /* tertiary data only */
```

**Rules:**

- Background uses a subtle paper-texture effect via two layered radial gradients of dotted noise. Don't skip this — it kills the cold "blank webpage" feel.
- Accent red is used for: section number, drop cap, punchline border, key statistic, italic emphasis in headlines.
- Green (`accent-2`) appears in charts as the secondary series, and occasionally for positive deltas.
- Body text is always `--ink` on `--paper`. Never gray-on-white.

```css
body {
  background-image:
    radial-gradient(rgba(10, 10, 8, 0.025) 1px, transparent 1px),
    radial-gradient(rgba(10, 10, 8, 0.018) 1px, transparent 1px);
  background-size:
    3px 3px,
    9px 9px;
  background-position:
    0 0,
    1px 1px;
}
```

---

## 3. Typography

**Fonts to load (Google Fonts):**

```html
<link
  href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,700;0,9..144,900;1,9..144,400&family=JetBrains+Mono:wght@400;500;700&family=Inter+Tight:wght@400;500;600;700&display=swap"
  rel="stylesheet"
/>
```

**Roles:**

| Face                                | Used for                                                                                 |
| ----------------------------------- | ---------------------------------------------------------------------------------------- |
| **Fraunces** (serif, variable opsz) | All display: title, deck, headlines, body, stat values, pull quotes                      |
| **JetBrains Mono**                  | All metadata: kicker, section number, table headers, chart labels, stat labels, colophon |
| **Inter Tight**                     | Reserved for chart axis labels only (loaded via Chart.js defaults)                       |

**Sizes:**

- `<h1>` (title): 88px, weight 900, line-height 0.92, letter-spacing -0.035em
- `<h2>` (section): 44px, weight 700, line-height 1, letter-spacing -0.025em
- Deck (subtitle under H1): 22px, italic, weight 400
- Body: 17px, line-height 1.55–1.65
- Lede paragraph: 18px, two-column layout with column-rule
- Stat values: 36px serif, weight 700
- Pull quote: 24px italic serif, weight 500
- Kicker / metadata: 11–12px mono, uppercase, letter-spacing 0.18–0.22em

**Important detail:** Headlines use `font-variation-settings: "opsz" 144` (or 96 for smaller display) — Fraunces is a variable font and the optical-size axis dramatically improves character at display sizes. Don't skip this.

**Italic accent in headlines:** Use italic serif in `--accent` red for ONE word per headline. Example: `The Great<br>Acceleration<em>.</em>` or `Nobody loves Jira.<br>Everybody <em>has</em> Jira.`

---

## 4. Layout structure

**Container:**

- Max width: 980px
- Padding: 60px 48px 120px (desktop) / 32px 20px 80px (mobile)
- Single column for body, optional two-column for the lede

**Component order (canonical):**

1. **Masthead** — newspaper-style top bar with volume/issue, date, location, reader name
2. **Title block** — kicker, H1 with italic accent word, deck (italic subtitle), byline
3. **Lede** — two-column drop-cap intro (`column-count: 2; column-gap: 48px`)
4. **Headline chart** — Exhibit A, the single visual that captures the whole argument
5. **Section blocks** (repeat 4–8 times):
   - Section meta bar (§ NN · CATEGORY)
   - H2 with italic accent word
   - Body paragraphs (prose-first, never bullets)
   - Stat row / table / chart (when needed)
   - Punchline block (one per section, italic pull quote)
6. **Final block** — numbered takeaways (01, 02, 03)
7. **Colophon** — bottom bar matching masthead

---

## 5. Key components (CSS classes)

### Masthead

```html
<div class="masthead">
  <div>VOL. I · ISSUE 01</div>
  <div class="masthead-meta">
    <span>FIELD REPORT</span>
    <span>CITY · MONTH DD, YYYY</span>
    <span>PREPARED FOR READER</span>
  </div>
</div>
```

- Border-top: 4px solid ink, border-bottom: 1px solid ink
- Mono font, uppercase, letter-spacing 0.18em
- First label (e.g. "FIELD REPORT") in red

### Title block

- H1 has italic red accent on one word, often ending with `<em>.</em>` punctuation
- Deck is italic Fraunces, 22px, max-width 680px
- Byline uses mono with `<strong>` labels and value pairs separated by 32px gap
- Bottom border separates from lede

### Lede (drop cap)

```css
.lede {
  column-count: 2;
  column-gap: 48px;
  column-rule: 0.5px solid var(--muted);
}
.lede p:first-child::first-letter {
  font-family: 'Fraunces', serif;
  font-weight: 900;
  font-size: 88px;
  float: left;
  padding: 6px 12px 0 0;
  color: var(--accent);
  font-variation-settings: 'opsz' 144;
}
```

### Section meta

```html
<div class="section-meta">
  <div class="section-num">§ 01</div>
  <div class="section-cat">Build Velocity</div>
</div>
<h2>Code stops being<br />the <em>bottleneck</em>.</h2>
```

- Border-bottom: 2px solid ink under the meta bar
- Section number in red mono, category in muted mono on the right

### Stat row

- Grid: `repeat(4, 1fr)` (or 3, or 2)
- Border-top + border-bottom: 1px solid ink
- Each stat: 24px padding, right-border 0.5px muted
- Label (mono, 10px, uppercase) → Value (36px serif, weight 700) → Foot (italic 13px muted)
- Values can be `.red`, `.green`, or default ink

### Punchline block

```html
<div class="punch">
  <p>One sharp italic sentence that delivers the section's payload.</p>
</div>
```

- Left border: 4px solid red accent
- Background: `--paper-2`
- Padding: 36px 40px 36px 44px
- Decorative oversized `"` glyph in red at top-left (opacity 0.25)
- Quote text: 24px italic serif, weight 500
- One punchline per section, no exceptions

### Chart block

```html
<div class="chart-block">
  <div class="chart-title">Exhibit A · Master Timeline</div>
  <div class="chart-head">Short editorial caption.</div>
  <div class="chart-legend">
    <span style="--c:#c8341e;">Series one</span>
    <span style="--c:#1a5d3a;">Series two</span>
  </div>
  <div class="chart-canvas-wrap"><canvas id="x"></canvas></div>
  <div class="chart-foot">Sources: list, of, sources.</div>
</div>
```

- White background, 0.5px ink border
- Title in mono (10px uppercase), head in serif (20px bold)
- Legend uses dot markers via `::before` with `--c` custom property
- Foot is italic muted text with top border

### Table

- Border-collapse, no vertical borders
- Headers: mono 10px uppercase, top + bottom border 1px ink
- Body cells: serif, td.num for monospace numerical
- Hover row: `--paper-2` background
- td.red / td.green for emphasis

### Takeaway block (final section)

```html
<div class="takeaway">
  <div class="takeaway-num">01</div>
  <div class="takeaway-body">
    <h3>Headline statement.</h3>
    <p>Explanation paragraph.</p>
  </div>
</div>
```

- Grid: 60px column + 1fr column, gap 24px
- Number: 56px serif weight 900 in red
- H3: 24px serif bold

### Colophon

- Mirror of masthead — 1px top border, mono uppercase, three columns

---

## 6. Chart.js setup

**Always:**

```javascript
Chart.defaults.font = { family: "'Inter Tight', sans-serif", size: 11 };
Chart.defaults.color = '#6b6760'; // --muted
Chart.defaults.borderColor = 'rgba(10,10,8,0.08)';
```

**Series colors (in order of preference):**

1. `#c8341e` — accent red (primary or emphasis)
2. `#1a5d3a` — deep green (secondary or positive)
3. `#378ADD` — muted blue (third series only)
4. `#b8932a` — gold (fourth series only)
5. `#0a0a08` — ink (when neutral series needed)

**Chart conventions:**

- Always `responsive: true, maintainAspectRatio: false` with parent `position: relative; height: 320px`
- Hide built-in legend (`plugins: { legend: { display: false } }`) — use the HTML `.chart-legend` above the canvas
- Bar charts use `borderRadius: 2` (subtle, not pill-shaped)
- Line charts use `tension: 0.25–0.3`, `borderWidth: 2.5`, pointRadius 5, pointBorderColor white
- Axis grid: `color: 'rgba(10,10,8,0.05)'` for y, `display: false` for x
- For mixed combo charts: bar gets `order: 2`, line gets `order: 1` so line draws on top
- Stacked bars use no borderRadius (pure stacks)
- Tooltips: customize the label callback to show units (`$X`, `X%`, `X minutes`)

---

## 7. Voice and copy rules

**Tone:** confident, terse, slightly literary. The voice of a smart friend writing a memo, not a consultant pitching. Sentences can be short — even fragments — when they hit. Paragraphs should breathe. Avoid corporate hedging language ("it could be argued", "potentially", "may be").

**Specific moves:**

- **Open with a concrete fact, not abstraction.** "In 2021, shipping a SaaS took seven months." Not "The pace of software development has accelerated."
- **Use specific numbers, always.** "−85.8%" not "significantly". "288 days" not "about nine months".
- **Lead with the counterintuitive finding.** If the data is surprising, that surprise goes in the headline and the deck.
- **One italicized accent word per headline.** Always in the H1 and H2, never in body H3.
- **Punchlines are pull quotes.** They sit on their own, separated by whitespace, in a colored block. They are not bullet summaries. Each one delivers one idea, in 1–3 sentences.
- **Tables are for comparisons across rows.** Stat rows are for snapshots of a moment. Use the right one.
- **End with three takeaways, numbered.** Always exactly three. Each is one H3 statement + one explanatory paragraph.
- **No emoji. No icons. No "🚀" or "→" decorations.** The typography does the work.

**Language:** The report stays English unless the user requests another language.

---

## 8. Response pattern (how Claude should produce these)

1. **Read this spec first.** Confirm theme is invoked.
2. **Read any relevant skill files** (e.g. frontend-design SKILL.md) before building HTML.
3. **Outline sections silently.** Map content to 4–8 sections + final takeaways.
4. **Build the HTML in one file.** Single self-contained file, all CSS inline in `<style>`, all JS inline in `<script>` after the body content. Chart.js loaded from CDN. Fonts from Google.
5. **Verify all sections have:** section meta + H2 with accent word + at least one punchline.
6. **Save the file into the conversation workspace** with a descriptive snake_case name and present it.
7. **Brief response in chat:** one sentence about what the report covers. Don't restate the report. Don't re-summarize sections — the reader has the report.

---

## 9. Anti-patterns (don't do these)

- ❌ Multiple accent colors competing — pick red, stick with red
- ❌ Headers without an italic accent word
- ❌ Bullet lists in body content (tables and stat rows are fine)
- ❌ Emoji or unicode icon decorations
- ❌ Sans-serif body — Fraunces serif always
- ❌ Light gray text on white — use `--ink` on `--paper`
- ❌ Rounded "card" components with shadows — borders only, hairline weight
- ❌ Default Chart.js styling — always override fonts and colors
- ❌ "Executive summary" sections — the deck IS the summary
- ❌ Section count >10 or <4 — sweet spot is 5–7
- ❌ Restating the report in the chat reply afterward

---

## 10. Example structure skeleton

```
- Masthead
- Title block (kicker / H1 with italic / deck / byline)
- Lede (2-col, drop cap)
- Exhibit A — headline chart
- § 01 — Topic A (body + stat row + punchline)
- § 02 — Topic B (body + chart + punchline)
- § 03 — Topic C (body + table + punchline)
- § 04 — Topic D (body + stat row + chart + punchline)
- § 05 — Case study (body + stat row + chart + punchline)
- § 06 — Topic F (body + table + punchline)
- Final takeaways (01 / 02 / 03)
- Punchline (closing)
- Colophon
```

---

## 11. Filename and metadata

- Filename: lowercase, snake*case, descriptive — `<topic>*<year_range>.html`
- Title tag: `<Subject> — A field report on <topic>, <date range>`
- Masthead "PREPARED FOR" defaults to the reader's name if known, otherwise omit the segment
- Date in masthead: actual current date, format `<CITY> · MONTH DD, YYYY` (city from user context, else omit)

---

**End of spec.**
