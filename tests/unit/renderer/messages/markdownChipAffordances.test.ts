import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../../../../packages/desktop/src/renderer');
const SHADOW = readFileSync(resolve(SRC, 'components/Markdown/ShadowView.tsx'), 'utf8');
const MARKDOWN_CSS = readFileSync(resolve(SRC, 'styles/markdown.css'), 'utf8');
const THEME = readFileSync(resolve(SRC, 'styles/themes/default-color-scheme.css'), 'utf8');

// C-02 / C-03 — chat replies render inside a shadow root, so markdown.css does NOT style
// them; ShadowView carries its own near-duplicate rules and those are what users see. Two
// consequences this guards:
//
//  * C-02: the inline-code chip borrowed --bg-3, the hairline-BORDER tone, and read as a
//    heavy block. It now uses --md-inline-code-bg, which is lighter in light and keeps
//    --bg-3 in dark (where that tone is the raised surface, not the heaviest).
//  * C-03: lightening code put it on the same fill as the *clickable* file chip. The chip
//    therefore needs a visible border to stay distinguishable, and links need an underline
//    on hover — markdown.css had that rule but it never reached the shadow root.
//
// Measured live: code rgb(240,233,219) light / rgb(30,37,54) dark; file chip same fill plus
// a 1px rgb(216,203,182) border; links none -> underline on hover.
describe('markdown chips and links stay distinguishable', () => {
  it('defines the inline-code fill per theme', () => {
    expect(THEME).toMatch(/--md-inline-code-bg:\s*#f0e9db/);
    expect(THEME).toMatch(/--md-inline-code-bg:\s*var\(--bg-3\)/);
  });

  it('the shadow copy uses the token — it is the one chat actually gets', () => {
    expect(SHADOW).toMatch(/\.markdown-shadow-body code:not\(pre code\)\s*\{[^}]*background:\s*var\(--md-inline-code-bg\)/s);
  });

  it('markdown.css agrees, so the duplicate pair cannot drift', () => {
    expect(MARKDOWN_CSS).toMatch(/background:\s*var\(--md-inline-code-bg\)/);
  });

  it('the clickable file chip carries a visible border', () => {
    // Shares a fill with inline code by design; the border is what marks it clickable.
    expect(SHADOW).toMatch(/\.markdown-local-file-link\s*\{[^}]*border:\s*1px solid var\(--bg-4\)/s);
  });

  it('links gain a non-colour affordance on hover', () => {
    expect(SHADOW).toMatch(/a:hover\s*\{\s*text-decoration:\s*underline;/);
  });
});
