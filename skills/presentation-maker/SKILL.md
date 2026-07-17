---
name: presentation-maker
description: Create beautiful, PowerPoint-compatible .pptx presentations from a brief. Use when the user asks for slides, a deck, or a presentation. Follows a strict design workflow with geometric validation.
---

# Presentation Maker

Build a `.pptx` deck through the bundled Python scripts. Never write raw OOXML.
Follow every step below in order. Do not skip the validate loop.

## Workflow

1. **Preflight.** Run `python3 scripts/preflight.py` from this skill's directory.
   - Output `{"status": "OK"}` → continue.
   - Output `{"status": "MISSING_DEPS", ...}` → show the user the exact `fix`
     command from the output, ask permission to run it, run it, re-run preflight.
   - `python3` itself not found → treat as MISSING_PYTHON: tell the user how to
     install Python 3 (macOS: `brew install python3`), and offer the HTML
     fallback (read `guidance/html-fallback.md`) instead. Never start building
     a deck that cannot be finished.

2. **Brief.** If the user has not provided an outline or content, ask at most
   3 questions in ONE message: audience, purpose, brand colors or preferred
   mood (and slide count if unclear). If they already gave content, skip this.

3. **Outline.** Propose a slide-by-slide outline (number, slide type, title,
   1-line content summary). Wait for the user to confirm before generating
   any file.

4. **Theme commitment.** Read `guidance/design-principles.md`. Write ONE theme
   block as a Python dict (see schema below) chosen from the guidance —
   palette hexes, font pair — BEFORE building any slide. Every slide must use
   this theme. Do not change the theme mid-deck.

   ```python
   THEME = {
       "name": "<theme-name>",
       "colors": {  # 6-digit hex, no '#'
           "bg": "......", "surface": "......", "primary": "......",
           "text": "......", "muted": "......",
       },
       "fonts": {"heading": "<font name>", "body": "<font name>"},
   }
   ```

5. **Build.** Write one Python script that imports `scripts/deck_helpers.py`
   and assembles the deck ONLY through its functions:
   `new_deck`, `add_title_slide`, `add_section_slide`, `add_bullets_slide`,
   `add_two_column_slide`, `add_stats_slide`, `add_quote_slide`,
   `add_closing_slide`, `save_deck`. Run it. Keep bullets ≤ 12 words where
   possible; the guidance file has per-slide-type content limits.

6. **Validate loop (max 3 iterations).** Run
   `python3 scripts/validate.py <deck.pptx>`.
   - `"ok": true` → proceed to step 7.
   - Otherwise fix every listed issue (shorten text, split slides, resize via
     helper parameters) and re-run. After 3 iterations, stop and report any
     residual issues to the user honestly — do not hide them.

7. **Deliver.** Give the user the absolute `.pptx` path and a one-paragraph
   summary: theme used, slide count, validation result.
