# Simple Light — Theme Specification

> A clean, minimal light slide-deck theme. Output is ONE self-contained HTML file where each slide is a full-viewport section. No external assets except Google Fonts.

## Design philosophy

Quiet confidence. Generous whitespace, one accent color, large readable type. Every slide makes exactly one point. If a slide needs more than 5 lines of text, split it.

## Colors

```
--bg:      #fcfcfa   /* warm white background */
--ink:     #16161a   /* near-black text */
--muted:   #6e6e76   /* secondary text */
--accent:  #2563eb   /* single blue accent */
--surface: #f1f1ee   /* card / code background */
```

Rules: body text is always `--ink` on `--bg`. The accent marks one element per slide at most (a key number, a highlighted word, a divider). Never use more than these five colors.

## Typography

Load: `https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;600;800&family=JetBrains+Mono:wght@400;500&display=swap`

- Slide titles: Inter Tight 800, 56px, letter-spacing -0.02em
- Body: Inter Tight 400, 24px, line-height 1.5
- Labels / slide numbers / data: JetBrains Mono 400, 13px, uppercase, letter-spacing 0.12em

## Slide structure

Each slide is `<section class="slide">` — `min-height: 100vh; display: flex; flex-direction: column; justify-content: center; padding: 8vh 10vw; scroll-snap-align: start`. The `<body>` uses `scroll-snap-type: y mandatory; overflow-y: scroll; height: 100vh`.

Canonical deck order:

1. Title slide — mono kicker, huge title (one accent word wrapped in `<em>`), subtitle, author/date line
2. Agenda or framing slide — max 4 items, numbered `01`–`04` in mono
3. Content slides (3–8) — title + ONE of: short prose (max 3 paragraphs), a 2–3 column stat row, a comparison table, or a full-bleed quote
4. Closing slide — one-sentence takeaway + contact/footer line

Slide number bottom-right of every slide: mono, `--muted`, format `02 / 09`.

## Components

- Stat row: CSS grid `repeat(3, 1fr)`, top border `1px solid --ink`; each stat = mono label (13px) over Inter Tight 800 value (64px) over muted foot note.
- Quote slide: 40px Inter Tight 600 italic, accent-colored left border 4px, no attribution larger than 16px.
- Table: no vertical borders, mono uppercase headers, 1px ink top/bottom borders, generous 16px cell padding.

## Voice

Terse and declarative. Slide titles are statements, not topics ("Latency dropped 40%", not "Performance results"). No emoji, no icons, no decorative arrows. Specific numbers always.

## Anti-patterns

- ❌ More than one idea per slide
- ❌ Bullet lists deeper than one level
- ❌ Any color outside the five defined above
- ❌ Shadows, gradients, rounded cards — flat surfaces and hairline borders only

**End of spec.**
