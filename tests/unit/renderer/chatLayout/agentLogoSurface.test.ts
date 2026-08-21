import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../../../../packages/desktop/src/renderer');
const THEME = readFileSync(resolve(SRC, 'styles/themes/default-color-scheme.css'), 'utf8');
const CARD = readFileSync(resolve(SRC, 'pages/settings/AgentSettings/AgentCard.tsx'), 'utf8');

// C-18 — image avatars were hardcoded to `transparent`. Several vendor logos are bare dark
// glyphs drawn for light backgrounds (Amp, Autohand, Copilot's mark, Cortex) and disappeared
// against the #0b0e14 dark page.
//
// The tile must be theme-scoped, not unconditional: in light the page is already near-white,
// so a tile there is pointless and would box every logo for no reason.
//
// Verified by screenshot in dark: all sampled logos legible, and none regressed — no
// white-glyph-on-white case appeared. Light measured transparent before and after.
describe('agent logo tile is theme-scoped', () => {
  it('light needs no tile', () => {
    expect(THEME).toMatch(/--agent-logo-surface:\s*transparent/);
  });

  it('dark gets a near-white tile so dark glyphs survive', () => {
    expect(THEME).toMatch(/--agent-logo-surface:\s*#f4f4f5/);
    // A dark tile would not solve anything — the glyphs are the dark part.
    expect(THEME).not.toMatch(/--agent-logo-surface:\s*(#0b0e14|#161c27|var\(--bg-base\))/);
  });

  it('the card reads the token instead of hardcoding transparent', () => {
    expect(CARD).toMatch(/backgroundColor:\s*avatar\.kind === 'image' \? 'var\(--agent-logo-surface\)'/);
    expect(CARD).not.toMatch(/avatar\.kind === 'image' \? 'transparent'/);
  });
});
