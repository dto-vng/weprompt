import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../../../../packages/desktop/src/renderer');
const THEME = readFileSync(resolve(SRC, 'styles/themes/default-color-scheme.css'), 'utf8');
const PROFILE = readFileSync(resolve(SRC, 'pages/settings/ProfileSettings.tsx'), 'utf8');

// C-17 — the instructions field filled with Arco's --color-fill-2 (#f0e9db), a heavy warm
// block on the near-white settings page. The first fix used --bg-base, which is the *page
// colour* in dark, so the field became invisible there. Hence a token PAIR, per theme, plus
// a border that guarantees the field reads as a field however close its fill sits to the page.
//
// Measured live: light fill rgb(250,246,238) on rgb(255,253,249) with a rgb(216,203,182)
// hairline; dark fill rgb(22,28,39) on rgb(11,14,20) with a rgb(42,51,68) hairline.
describe('text input surface is defined per theme with a border', () => {
  it('defines both tokens in the light palette', () => {
    expect(THEME).toMatch(/--input-surface:\s*#faf6ee/);
    expect(THEME).toMatch(/--input-border:\s*#d8cbb6/);
  });

  it('gives dark a surface RAISED above its page, not equal to it', () => {
    expect(THEME).toMatch(/--input-surface:\s*#161c27/);
    expect(THEME).toMatch(/--input-border:\s*#2a3344/);
    // #0b0e14 is the dark page (--bg-base). If the dark surface is ever set to it, the field
    // disappears — that was the bug this pair replaced.
    expect(THEME).not.toMatch(/--input-surface:\s*(#0b0e14|var\(--bg-base\))/);
  });

  it('applies both to the instructions field', () => {
    expect(PROFILE).toMatch(/background:\s*'var\(--input-surface\)'/);
    expect(PROFILE).toMatch(/border:\s*'1px solid var\(--input-border\)'/);
  });
});
