import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../../../../packages/desktop/src/renderer');
const read = (p: string) => readFileSync(resolve(SRC, p), 'utf8');

const GROUPED_HISTORY = read('pages/conversation/GroupedHistory/index.tsx');
const CONVERSATION_ROW = read('pages/conversation/GroupedHistory/ConversationRow.tsx');
const WORKSPACE_COLLAPSE = read('pages/conversation/components/WorkspaceCollapse.tsx');

// C-12 — the sider's trailing icons must share one vertical line. Two independent
// things decide where an icon lands, and both were wrong:
//
//  1. The container inset. Row action strips are absolutely positioned, so they ignore
//     the row's padding and set their own. The section labels use `pr-12px`; the rows
//     used `right-8px`, putting their icons 5px further right.
//  2. The button size. A 14px icon centres 3px from the edge of a 20px box but 4px from
//     a 22px one, so 20px buttons stayed 1px off even after (1) was fixed.
//
// Measured in the running app: every rightmost trailing icon now sits at right=236.
// jsdom cannot reproduce that — it resolves no UnoCSS — so these assertions guard the
// two decisions the measurement traced the alignment to.
describe('sider trailing icons share one right edge', () => {
  it('section labels define the reference inset', () => {
    expect(GROUPED_HISTORY).toContain('pr-12px');
  });

  it('the project row action strip uses the same inset', () => {
    expect(WORKSPACE_COLLAPSE).toMatch(/absolute right-12px/);
    expect(WORKSPACE_COLLAPSE).not.toMatch(/absolute right-8px/);
  });

  it('the conversation row action strip uses the same inset', () => {
    expect(CONVERSATION_ROW).toMatch(/absolute right-12px/);
    expect(CONVERSATION_ROW).not.toMatch(/absolute right-8px/);
  });

  it('row action buttons are 22px so their icons centre like the section "+"', () => {
    expect(GROUPED_HISTORY).toMatch(/!w-22px !h-22px !min-w-22px/);
    expect(GROUPED_HISTORY).not.toMatch(/!w-20px !h-20px !min-w-20px/);
    expect(CONVERSATION_ROW).toMatch(/size-22px/);
    expect(CONVERSATION_ROW).not.toMatch(/size-20px/);
  });
});
