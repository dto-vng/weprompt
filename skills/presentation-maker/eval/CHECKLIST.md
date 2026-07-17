# Golden-prompt acceptance checklist

Run each brief in `briefs/` in a fresh WePrompt conversation with the
presentation-maker skill enabled and model MiniMax M2.5. A brief PASSES only
if ALL of the following hold:

1. The workflow was followed: outline proposed and confirmed before build;
   one theme block written before any slide; validate loop ran.
2. `python3 scripts/validate.py <deck>` reports `"ok": true` (0 issues).
3. The .pptx opens in PowerPoint (or Keynote) with NO repair prompt.
4. Slide count matches the confirmed outline (+/- 1).
5. Visual review: one consistent theme throughout; no unreadable
   text-on-background combination; margins respected on every slide.

Record results here per run (date, brief, model, pass/fail, notes).
Acceptance for the package = all 4 briefs pass.
