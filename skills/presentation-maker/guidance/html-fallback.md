# HTML fallback (no Python available)

Use this path ONLY when preflight failed and the user declined to install
Python. Deliver a single self-contained `slides.html` instead of a `.pptx`.

1. Still complete the Brief, Outline, and Theme commitment steps from
   SKILL.md — the theme dict maps directly to CSS custom properties.
2. Produce ONE `slides.html` file: each slide is a `<section>` sized
   16:9 (aspect-ratio: 16/9), all CSS inline in a `<style>` block, no
   external fonts, scripts, or images.
3. Apply the same design rules from design-principles.md (palette,
   type scale, margins, content limits).
4. Add minimal keyboard navigation: arrow keys switch the visible section
   (a 10-line inline script is enough).
5. Tell the user clearly: this is an HTML deck for presenting in a
   browser; a .pptx requires Python (repeat the preflight fix command).
