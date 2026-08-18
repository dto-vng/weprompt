import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../../../../packages/desktop/src/renderer');
const read = (p: string) => readFileSync(resolve(SRC, p), 'utf8');

const CHAT_LAYOUT = read('pages/conversation/components/ChatLayout/index.tsx');
const WORKSPACE = read('pages/conversation/Workspace/index.tsx');
const CONTEXT = read('pages/conversation/Workspace/filesPaneContext.tsx');

// C-01 — the file tree returns to the right pane WITHOUT displacing the Project flyout.
//
// The load-bearing property is that there is still exactly ONE Workspace instance. The
// tree's state, event wiring and file operations live there (useWorkspaceTree,
// useWorkspaceFileOps and the modals it needs); mounting a second Workspace for the pane
// would duplicate all of it and let the two surfaces disagree about expansion and
// selection. So the pane receives the SAME presentational `filesPanel` through a portal.
//
// These are wiring assertions only. This change is NOT behaviourally verified: the artifact
// pane defaults to collapsed and could not be opened during the session that wrote it, so
// the tabs were never observed rendering. Do not read a green run here as proof the pane
// works.
describe('C-01 files pane wiring', () => {
  it('keeps the Project flyout mounted in project-menu mode', () => {
    // If this gate ever moves to `panel`, the flyout disappears — the thing C-01 must keep.
    expect(CHAT_LAYOUT).toMatch(/workspacePresentation === 'project-menu' && \(/);
    expect(CHAT_LAYOUT).toMatch(/className='workspace-project-controller'>\{props\.sider\}/);
  });

  it('offers both views in the pane, toggled rather than swapped', () => {
    // The testid is built from a template literal, so assert the template and the two
    // values it can take rather than the resolved strings.
    expect(CHAT_LAYOUT).toMatch(/artifact-pane-tab-\$\{view\}/);
    expect(CHAT_LAYOUT).toMatch(/\['files', 'preview'\] as const/);
    // `hidden` keeps both mounted; unmounting would discard preview state on every toggle.
    expect(CHAT_LAYOUT).toMatch(/hidden=\{artifactPaneView !== 'files'\}/);
    expect(CHAT_LAYOUT).toMatch(/hidden=\{artifactPaneView !== 'preview'\}/);
  });

  it('provides the pane container to the Workspace', () => {
    expect(CHAT_LAYOUT).toMatch(/<WorkspaceFilesPaneProvider container=\{filesPaneEl\}>/);
    expect(CHAT_LAYOUT).toMatch(/ref=\{setFilesPaneEl\}/);
  });

  it('portals the existing filesPanel instead of building a second tree', () => {
    expect(WORKSPACE).toMatch(/createPortal\(filesPanel, filesPaneContainer\)/);
    // A second useWorkspaceTree in the Workspace file would mean a duplicated tree.
    expect(WORKSPACE.match(/useWorkspaceTree\(/g)?.length ?? 0).toBe(1);
    expect(CONTEXT).toMatch(/useWorkspaceFilesPane/);
  });

  it('uses tab labels that exist as tab labels, not borrowed action labels', () => {
    expect(CHAT_LAYOUT).toMatch(/conversation\.workspace\.changes\.filesTab/);
    expect(CHAT_LAYOUT).toMatch(/conversation\.workspace\.changes\.previewTab/);
    // contextMenu.preview is a verb phrase in several locales — deliberately not reused.
    expect(CHAT_LAYOUT).not.toMatch(/workspace\.contextMenu\.preview/);
  });
});
