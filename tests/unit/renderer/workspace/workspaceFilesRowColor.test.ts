import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(
  resolve(__dirname, '../../../../packages/desktop/src/renderer/pages/conversation/Workspace/workspace.css'),
  'utf8'
);

// C-14 — the file rows are Arco text Buttons. `.arco-btn-text:not(.arco-btn-disabled)`
// scores (0,3,0) and outranks a bare `.workspace-project-files-row` at (0,1,0), so the
// rows' declared colours were silently overridden and every file name rendered in the
// brand orange.
//
// jsdom cannot catch this: it does not load this stylesheet and does not resolve Arco's
// cascade. The colour evidence is a live computed-style measurement recorded in the
// Stream C intake doc. This guards the one thing a static check can: that the selectors
// keep the qualifier that makes them win.
describe('workspace file row colour survives Arco specificity', () => {
  it('qualifies the rest-state rule against the Arco text button', () => {
    // Must NOT be satisfied by the :hover rule, which contains this selector as a
    // prefix — an earlier version of this test passed on that alone, so removing the
    // rest-state qualifier stayed green. Require the selector terminated by `,` or `{`.
    expect(CSS).toMatch(/\.workspace-project-files-row\.arco-btn-text:not\(\.arco-btn-disabled\)\s*[,{]/);
  });

  it('qualifies the hover-state rule too', () => {
    expect(CSS).toContain('.workspace-project-files-row.arco-btn-text:not(.arco-btn-disabled):hover');
  });

  it('still declares muted rest and emphasised hover colours', () => {
    // The intent was always correct — only the specificity was wrong. If these
    // declarations disappear, the qualifier above is guarding nothing.
    expect(CSS).toMatch(/color:\s*var\(--color-text-2\)/);
    expect(CSS).toMatch(/color:\s*var\(--color-text-1\)/);
  });
});
