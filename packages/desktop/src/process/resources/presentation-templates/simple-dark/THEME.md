# Simple Dark — Theme Specification

> A minimal dark slide-deck theme for technical audiences. Output is ONE self-contained HTML file where each slide is a full-viewport section. No external assets except Google Fonts.

## Design philosophy

Terminal calm. A near-black canvas, restrained neon accent, monospace structure. Built for code, architecture and data — content glows, chrome disappears.

## Colors

```
--bg:      #0d0f12   /* near-black background */
--ink:     #e8eaed   /* off-white text */
--muted:   #8a8f98   /* secondary text */
--accent:  #34d399   /* single green accent */
--surface: #16191e   /* card / code background */
--line:    #262b33   /* hairline borders */
```

Rules: body text is `--ink` on `--bg` — never pure white on pure black. The accent marks one element per slide (key number, highlighted word, active state). Code blocks sit on `--surface` with a `1px solid --line` border.

## Typography

Load: `https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=JetBrains+Mono:wght@400;500&display=swap`

- Slide titles: Space Grotesk 700, 52px, letter-spacing -0.02em
- Body: Space Grotesk 400, 23px, line-height 1.55
- Code, labels, slide numbers, data values: JetBrains Mono, code at 18px / labels at 13px uppercase with 0.12em tracking

## Slide structure

Same skeleton as a scroll-snap deck: `<section class="slide">` with `min-height: 100vh; display: flex; flex-direction: column; justify-content: center; padding: 8vh 10vw; scroll-snap-align: start`; body uses `scroll-snap-type: y mandatory; height: 100vh; overflow-y: scroll`.

Canonical deck order:

1. Title slide — mono kicker in accent, big title, subtitle, author/date in mono
2. Context slide — the problem in ≤3 sentences
3. Content slides (3–8) — title + ONE of: code block, architecture list, 2–3 column stat row, comparison table
4. Closing slide — one-line takeaway in accent + footer

Slide number bottom-right: mono, `--muted`, format `02 / 09`.

## Components

- Code block: `--surface` background, `1px solid --line`, 12px padding, JetBrains Mono 18px, no syntax-highlight colors beyond `--accent` for emphasis lines.
- Stat row: grid `repeat(3, 1fr)`, top border `1px solid --line`; mono label, Space Grotesk 700 value 60px (accent for THE key stat only), muted foot.
- Table: mono uppercase headers, `--line` horizontal borders only, hover row `--surface`.

## Voice

Precise, engineering-grade. Titles are claims with numbers where possible. No emoji, no icons, no gradients, no glassmorphism.

## Anti-patterns

- ❌ Pure #000 background or #fff text
- ❌ More than one accent element per slide
- ❌ Rainbow syntax highlighting
- ❌ Decorative glow/shadow effects

**End of spec.**
