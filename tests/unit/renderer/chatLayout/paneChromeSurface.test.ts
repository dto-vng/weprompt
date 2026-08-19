import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../../../../packages/desktop/src/renderer');
const TABS_CSS = readFileSync(
  resolve(SRC, 'pages/conversation/Preview/components/PreviewPanel/PreviewTabs.module.css'),
  'utf8'
);
const TOOLBAR = readFileSync(
  resolve(SRC, 'pages/conversation/Preview/components/PreviewPanel/PreviewToolbar.tsx'),
  'utf8'
);
const CHAT_LAYOUT = readFileSync(resolve(SRC, 'pages/conversation/components/ChatLayout/index.tsx'), 'utf8');

// C-23 — the pane stacked four surfaces: a near-white tab row, a cream file-tab strip, a cream
// toolbar, and a cream pill on the active tab. Measured: rgb(255,253,249) / rgb(240,233,219) /
// rgb(240,233,219) / rgb(246,240,228). Two visible seams plus a step where the active tab met
// the strip, which is what "too messy, different shades" described.
//
// Resolution: one continuous plane for the chrome, with the primary orange as the only
// active-state signal. Chosen from side-by-side screenshots against a cream-everything variant.
describe('artifact pane chrome is one surface', () => {
  it('puts the preview file-tab strip on the pane surface, not a cream band', () => {
    expect(TABS_CSS).toMatch(/\.tabsRoot\s*\{[^}]*background:\s*var\(--bg-artifact-surface\)/s);
    expect(TABS_CSS).not.toMatch(/\.tabsRoot\s*\{[^}]*background:\s*var\(--bg-2\)/s);
  });

  it('puts the preview toolbar on the same surface', () => {
    expect(TOOLBAR).toMatch(/h-32px px-10px bg-chat-surface/);
    expect(TOOLBAR).not.toMatch(/h-32px px-10px bg-2\b/);
  });

  it('signals the active pane tab with colour, not a fill', () => {
    expect(CHAT_LAYOUT).toMatch(/'!rounded-6px !bg-transparent'/);
    // Weight dropped when the tabs became icons in C-30; colour still carries active state.
    expect(CHAT_LAYOUT).toMatch(/artifactPaneView === view \? '!text-primary'/);
    // A pill here would reintroduce the fourth shade this item removed.
    expect(CHAT_LAYOUT).not.toMatch(/artifactPaneView === view \? '!bg-fill-3/);
  });
});
