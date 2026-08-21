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
    expect(CHAT_LAYOUT).toMatch(/PANE_TAB_ORDER = \['files', 'changes', 'context', 'preview', 'browser'\] as const/);
    // `hidden` keeps both mounted; unmounting would discard preview state on every toggle.
    expect(CHAT_LAYOUT).toMatch(/hidden=\{artifactPaneView !== 'files'\}/);
    expect(CHAT_LAYOUT).toMatch(/hidden=\{artifactPaneView !== 'changes'\}/);
    expect(CHAT_LAYOUT).toMatch(/hidden=\{artifactPaneView !== 'preview'\}/);
  });

  it('does not let an empty PreviewPanel collapse the whole pane', () => {
    // PreviewPanel calls onRequestCollapse when it has nothing to show. That was correct when
    // this pane WAS the preview; now it also hosts Files and Changes, so honouring it
    // unconditionally made the pane impossible to open — the toggle expanded it and an empty
    // PreviewPanel shut it in the same tick. Found from a setter stack trace, not by reading.
    expect(CHAT_LAYOUT).toMatch(/onRequestCollapse=\{collapseArtifactPaneFromPreview\}/);
    expect(CHAT_LAYOUT).toMatch(/if \(artifactPaneViewRef\.current !== 'preview'\) return;/);
  });

  it('puts a close affordance on the panel itself', () => {
    // The header toggle can also close it, but it sits out in the chat header, far from the
    // thing it acts on. Uses the UNGUARDED collapse: this is an explicit user action, unlike
    // PreviewPanel's request which is only honoured while Preview is visible.
    expect(CHAT_LAYOUT).toMatch(/data-testid='artifact-pane-collapse'/);
    expect(CHAT_LAYOUT).toMatch(/aria-label=\{t\('common\.chrome\.collapseProjectPanel'\)\}/);
    expect(CHAT_LAYOUT).toMatch(/onClick=\{collapseArtifactPane\}/);
  });

  it('opens on Files, since an empty preview cannot hold the pane open', () => {
    expect(CHAT_LAYOUT).toMatch(/useState<WorkspacePaneView>\('files'\)/);
  });

  it('reveals the Preview tab when a preview opens', () => {
    // Without this the file opens into a hidden tab and the click looks inert — exactly how
    // it was reported ("I cannot open a file from there"). PreviewContext dispatches
    // WORKSPACE_EXPAND_EVENT on every openPreview as an explicit "show me this".
    expect(CHAT_LAYOUT).toMatch(/WORKSPACE_EXPAND_EVENT/);
    expect(CHAT_LAYOUT).toMatch(/const revealPreview = \(\) => setArtifactPaneView\('preview'\)/);
  });

  it('offers the external-tool control the panel presentation already had', () => {
    // VS Code / Terminal / File Explorer. WorkspaceOpenButton already existed and is rendered
    // by WorkspacePanelHeader, which only mounts in the `panel` presentation — so this pane
    // was missing it purely because it has no header.
    expect(CHAT_LAYOUT).toMatch(
      /<WorkspaceOpenButton workspacePath=\{workspacePath\} isTemporary=\{isTemporaryWorkspace\} \/>/
    );
  });

  it('provides the pane container to the Workspace', () => {
    expect(CHAT_LAYOUT).toMatch(
      /<WorkspaceFilesPaneProvider activeView=\{artifactPaneView\} containers=\{panePortalTargets\}>/
    );
    expect(CHAT_LAYOUT).toMatch(/ref=\{setFilesPaneEl\}/);
    expect(CHAT_LAYOUT).toMatch(/ref=\{setChangesPaneEl\}/);
  });

  it('builds the changes panel when EITHER surface shows changes', () => {
    // This gate read flyout state alone, so a pane tab could never have had content — and
    // the changes refresh effect is gated on the same flag. Verified live: the pane's
    // Changes tab listed 2 real git changes.
    expect(WORKSPACE).toMatch(
      /\(projectMenuOpen && activeProjectPanel === 'changes'\) \|\| paneActiveView === 'changes'/
    );
    expect(WORKSPACE).toMatch(/createPortal\(changesPanel, paneContainers\.changes\)/);
  });

  it('portals the existing filesPanel instead of building a second tree', () => {
    expect(WORKSPACE).toMatch(/createPortal\(filesPanel, paneContainers\.files\)/);
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
