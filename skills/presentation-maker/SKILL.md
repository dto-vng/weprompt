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
   - Output `{"status": "PYTHON_TOO_OLD", ...}` → show the user the `fix`
     message from the output (upgrade Python), and offer the HTML fallback
     (read `guidance/html-fallback.md`) for this session.
   - `python3` itself not found → treat as MISSING_PYTHON: tell the user how to
     install Python 3 (macOS: `brew install python3`), and offer the HTML
     fallback (read `guidance/html-fallback.md`) instead. Never start building
     a deck that cannot be finished.

2. **Brief.** If the user has not provided an outline or content, ask at most
   3 questions in ONE message: audience, purpose, brand colors or preferred
   mood (and slide count if unclear). If they already gave content, skip this.

3. **Source extraction.** Mandatory whenever the user attached a data file
   (`.xlsx`, `.csv`, `.docx`, `.md`, …); skip it entirely otherwise.
   - For `.xlsx`, first run `python3 -c "import openpyxl"`. If it fails, ask
     permission and run `python3 -m pip install openpyxl`. If that install
     also fails, ask the user to paste the key figures instead — never guess
     a number.
   - Write `facts.md` next to the deck. Record the exact figures, package and
     tier names, limits, eligibility rules, and contacts, each tagged with the
     sheet or section it came from. No rounding, no invention.
   - Every number on every slide must appear in `facts.md`. If a figure is not
     in `facts.md`, it does not go on a slide.

4. **Outline.** Propose a slide-by-slide outline (number, slide type, title,
   1-line content summary). Every content-slide title must be an action title:
   it states the takeaway, with a number when possible (e.g.
   `L1-2 nhận gói S.1 — nội trú tới 80 triệu đ/năm`), never a bare topic label
   (`Gói bảo hiểm`). The per-slide-type character caps still apply. Wait for
   the user to confirm before generating any file.

5. **Theme commitment.** Read `guidance/design-principles.md`. Write ONE theme
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

6. **Build.** Write one Python script that imports `scripts/deck_helpers.py`
   and assembles the deck ONLY through its functions:
   `new_deck(THEME, footer="<short deck label>")`, `add_title_slide`,
   `add_agenda_slide(prs, theme, items, title="Agenda")`,
   `add_section_slide`, `add_bullets_slide`, `add_two_column_slide`,
   `add_table_slide(prs, theme, title, headers, rows, highlight_col=None, source=None, kicker="")`,
   `add_big_number_slide(prs, theme, kicker, number, unit, support_lines)`,
   `add_process_slide(prs, theme, title, steps)` (each step is a
   `{"label": ..., "desc": ...}` dict), `add_stats_slide`, `add_quote_slide`,
   `add_image_slide`, `add_closing_slide`, `save_deck`. Run it. Section and
   closing slides render on a full-color background automatically; stats,
   two-column, process, table, and big-number content sit on cards or styled
   tables that the helpers draw — you never draw shapes, badges, or gridlines
   yourself. `add_table_slide` right-aligns numeric columns and omits vertical
   gridlines on its own. Tables hold at most 8 body rows × 5 columns; split
   larger data across slides. Use `add_image_slide` (and the title slide's
   `logo_path`) only with image files the user provided or that already exist
   on disk — never invent paths. When `facts.md` exists, tables and big
   numbers are the default anchors for the deck's data; a bullets slide is the
   fallback, not the default. Keep bullets ≤ 12 words where possible; the
   guidance file has per-slide-type content limits.

7. **Validate loop (max 3 iterations).** Run
   `python3 scripts/validate.py <deck.pptx>`.
   - `"ok": true` → proceed to step 8.
   - Otherwise fix every listed issue (shorten text, split slides, resize via
     helper parameters) and re-run. After 3 iterations, stop and report any
     residual issues to the user honestly — do not hide them.

8. **Deliver.** Give the user the absolute `.pptx` path and a one-paragraph
   summary: theme used, slide count, validation result.
