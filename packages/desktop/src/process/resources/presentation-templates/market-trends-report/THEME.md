# Market Trends Report — Theme Specification

> A data-forward market/trends report theme. Output is ONE self-contained HTML scrolling report (not slides). Charts via Chart.js CDN; fonts via Google Fonts; no other external assets.

## Design philosophy

The chart is the argument. Every section is built around one exhibit; prose sets up the chart and interprets it. Neutral, analyst-grade tone — closer to a research desk note than a pitch.

## Colors

```
--bg:       #ffffff
--ink:      #101418   /* primary text */
--muted:    #5c6672   /* secondary text, axis labels */
--line:     #e2e6ea   /* hairlines, grid */
--primary:  #0f5fd7   /* series 1 / emphasis */
--secondary:#c2410c   /* series 2 / contrast */
--tertiary: #0e7c62   /* series 3 / positive */
--surface:  #f6f8fa   /* callout blocks */
```

## Typography

Load: `https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap`

- Report title: Source Serif 4, 56px, weight 700
- Section headings: Source Serif 4, 32px, weight 600
- Body: Inter 400, 16.5px, line-height 1.6, max-width 720px
- Exhibit titles, stat labels, table headers: JetBrains Mono 11px uppercase, 0.14em tracking
- Stat values: Source Serif 4, 34px, weight 700

## Layout

Container max-width 960px, padding 56px 40px 96px. Order:

1. Header — mono eyebrow (`MARKET TRENDS · <QUARTER/YEAR>`), title, one-paragraph abstract, byline/date, 1px `--ink` bottom rule
2. Key-numbers band — 3–4 stat tiles in a grid, `--surface` background, each: mono label / serif value / delta in `--tertiary` (up) or `--secondary` (down)
3. Sections (4–7), each: mono exhibit tag (`EXHIBIT 1`), heading, 1–3 paragraphs of setup, the chart, a one-sentence takeaway in a `--surface` callout with 3px `--primary` left border
4. Methodology & sources — small muted text, 1px top rule

## Chart.js conventions

```javascript
Chart.defaults.font = { family: "'Inter', sans-serif", size: 11 };
Chart.defaults.color = '#5c6672';
```

- Wrap every canvas in `position: relative; height: 300px`; `responsive: true, maintainAspectRatio: false`
- Series colors in order: `#0f5fd7`, `#c2410c`, `#0e7c62`; never more than 3 series per chart
- Hide the built-in legend; render an HTML legend of mono labels with 8px color dots above the canvas
- Line charts: `tension: 0.3, borderWidth: 2, pointRadius: 0` (points only on the final value)
- Bar charts: `borderRadius: 2`, category gap ≥ 40%
- Y grid `#e2e6ea`, X grid hidden; axis titles in mono via `scales.*.title`
- Tooltip label callbacks must include units (`$`, `%`, `pts`)

## Voice

Analyst register: measured, specific, sourced. Every claim that can carry a number carries one. Takeaways are single sentences that answer "so what?". No hype adjectives ("massive", "explosive"); deltas and time ranges instead.

## Anti-patterns

- ❌ A section without an exhibit, or an exhibit without a takeaway
- ❌ Pie charts with more than 4 slices (prefer bars)
- ❌ Dual y-axes
- ❌ Default Chart.js palette or legend
- ❌ Emoji, icons, decorative imagery

**End of spec.**
