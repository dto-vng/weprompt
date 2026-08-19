import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../../../../packages/desktop/src/renderer');
const WORKSPACE = readFileSync(resolve(SRC, 'pages/conversation/Workspace/index.tsx'), 'utf8');
const CHAT_LAYOUT = readFileSync(resolve(SRC, 'pages/conversation/components/ChatLayout/index.tsx'), 'utf8');

// C-25 — once the pane carried Files and Changes, the Project flyout was a second entry point to
// the same panels. It is no longer rendered where the pane hosts them.
//
// Two things make this safe, and both are load-bearing:
//
//  1. The Workspace component must STILL RENDER. The pane's Files and Changes tabs are portals out
//     of that instance, and its drag-import and paste handlers wrap the chat. Only the flyout's own
//     markup is suppressed — verified live: flyout absent, controller present, Files listing 9 rows.
//  2. The suppression is gated on `paneActiveView !== null`, which is true ONLY when ChatLayout
//     mounted the tabbed pane (the project-menu presentation). Teams uses the `panel` presentation
//     and provides no context, so its flyout is untouched.
//
// Context was dropped rather than moved: `/context` already exposes open, compact, pin and handoff,
// so the panel was the only UI for capabilities that remain reachable.
describe('project flyout is removed where the pane replaces it', () => {
  it('suppresses only the flyout markup, not the Workspace', () => {
    expect(WORKSPACE).toMatch(/paneHostsWorkspacePanels \? null : projectMenuSlot/);
    // The portals and the drag wrapper must survive; if this render disappears, so do the tabs.
    expect(WORKSPACE).toMatch(/createPortal\(filesPanel, paneContainers\.files\)/);
    expect(WORKSPACE).toMatch(/createPortal\(changesPanel, paneContainers\.changes\)/);
  });

  it('scopes the suppression so the panel presentation keeps its flyout', () => {
    expect(WORKSPACE).toMatch(/const paneHostsWorkspacePanels = paneActiveView !== null;/);
  });

  it('keeps Context reachable as a pane tab', () => {
    // Dropped with the flyout at first, on the reasoning that /context covers it. The reporter
    // then went looking for Context and found nothing — the command does everything the panel
    // does, but only if you already know it exists. Restored as a tab.
    expect(CHAT_LAYOUT).toMatch(/artifact-pane-context/);
    expect(CHAT_LAYOUT).toMatch(
      /const PANE_TAB_ORDER = \['files', 'changes', 'context', 'preview', 'browser'\] as const;/
    );
  });

  it('hides the Context tab on backends that have no context panel', () => {
    // showContextSection is `eventPrefix === 'aionrs'`; a tab that can only ever be empty is
    // worse than no tab.
    expect(CHAT_LAYOUT).toMatch(/view !== 'context' \|\| backend === 'aionrs'/);
  });
});
