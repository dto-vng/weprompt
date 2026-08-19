import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../../../../packages/desktop/src/renderer');
const CSS = readFileSync(resolve(SRC, 'pages/conversation/Workspace/workspace.css'), 'utf8');
const CHAT_LAYOUT = readFileSync(resolve(SRC, 'pages/conversation/components/ChatLayout/index.tsx'), 'utf8');

// C-20 — a grey horizontal line appeared across the Changes panel under an empty state. It was
// a horizontal SCROLLBAR, caused by a CSS-spec detail: when one overflow axis is not `visible`,
// the other computes from `visible` to `auto`. So `overflow-y: auto` alone silently enabled
// horizontal scrolling, and any 1px of overflow drew a bar.
//
// The same rule also caps height at 420px for the narrow flyout popover, which left the panel
// at 124px inside an 808px pane. Measured after the fix: overflow-x hidden, max-height none,
// scroller height 808 matching the slot.
describe('workspace section scroll behaves in the artifact pane', () => {
  it('pins overflow-x so no phantom horizontal scrollbar is drawn', () => {
    expect(CSS).toMatch(/\.workspace-section-scroll\s*\{[^}]*overflow-x:\s*hidden/s);
  });

  it('releases the popover height cap when portalled into the pane', () => {
    expect(CSS).toMatch(/\.workspace-pane-section \.workspace-section-scroll\s*\{[^}]*max-height:\s*none/s);
  });

  it('marks the pane portal containers so that override applies', () => {
    const marked = CHAT_LAYOUT.match(/workspace-pane-section/g)?.length ?? 0;
    expect(marked).toBe(3); // files + changes + context slots
  });
});

// C-27 — the file search field ran the full width of the panel (439px inside a 441px
// container), making it the heaviest element there. It is now inset symmetrically.
//
// `width: auto` is the load-bearing half: Arco's input wrapper sets width:100% with
// content-box sizing, so the margin alone pushed the field into overflow rather than
// shrinking it. Measured after: 415px wide, inset 13px, no overflow.
describe('file search is inset rather than full-bleed', () => {
  it('insets the field and overrides the Arco width', () => {
    const css = readFileSync(
      resolve(__dirname, '../../../../packages/desktop/src/renderer/pages/conversation/Workspace/workspace.css'),
      'utf8'
    );
    expect(css).toMatch(/\.workspace-project-files-search\s*\{[^}]*width:\s*auto/s);
    expect(css).toMatch(/\.workspace-project-files-search\s*\{[^}]*margin:\s*0 12px 6px/s);
  });
});
