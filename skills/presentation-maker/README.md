# Presentation Maker skill for WePrompt

Creates PowerPoint-compatible .pptx decks with a strict design workflow
(theme commitment + geometric validation). All guidance and scripts are original work; the concept is inspired by Anthropic's pptx skill (see VENDOR-NOTES.md for the license review that required this).

## Requirements

- Python 3.9+ on the machine running the agent
- `pip3 install -r scripts/requirements.txt` (the skill's preflight step
  will offer this automatically)

## Install into WePrompt

1. Build the zip (from the repo root):
   `cd skills && zip -r presentation-maker.zip presentation-maker -x '*.DS_Store'`
2. WePrompt → Settings → Skills Hub → Import → choose the zip.
3. Enable the skill for a conversation (directly, or add it to an
   assistant's enabled skills).
4. Type `/presentation-maker` in the chat box — the skill appears as a
   slash command once enabled.

## Recommended assistant setup ("Presentation Maker" buddy)

Settings → Assistants → create assistant:

- Name: Presentation Maker; pick an avatar
- Enabled skills: presentation-maker
- Model: your preferred model (tested with MiniMax M2.5)
- Prompt: "You are a presentation designer. For any request, follow the
  presentation-maker skill workflow exactly."

## Verify the scripts standalone

- `python3 scripts/preflight.py` → `{"status": "OK", ...}`
- `python3 scripts/validate.py --self-test` → `SELF-TEST OK`

## Acceptance

See `eval/CHECKLIST.md` — all 4 golden briefs must pass.
