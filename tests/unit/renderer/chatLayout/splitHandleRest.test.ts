import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SPLIT = readFileSync(
  resolve(__dirname, '../../../../packages/desktop/src/renderer/hooks/ui/useResizableSplit.tsx'),
  'utf8'
);

// C-26 — the pane's left edge read as one thick rule pressed against the content. Measured: the
// pane draws its own 1px border AND the split handle painted a 2px bar in the SAME colour
// (rgb(229,220,201)) directly on top of it, inside a 12px strip overlapping the content.
//
// The grip is now invisible at rest and appears on hover/active, which is what a splitter should
// do. Its hover colour is the primary accent, not the navy --aou-6 that C-22 removed from this
// same pane. Verified live: handle background rgba(0,0,0,0) at rest, leaving the 1px border alone.
describe('split handle is invisible at rest', () => {
  it('paints nothing at rest so the pane border is the only rule', () => {
    expect(SPLIT).toMatch(/w-2px bg-transparent/);
    expect(SPLIT).not.toMatch(/w-2px bg-3 opacity-90/);
  });

  it('shows the grip in the primary accent on hover and drag, not the navy brand', () => {
    expect(SPLIT).toMatch(/group-hover:bg-primary/);
    expect(SPLIT).toMatch(/group-active:bg-primary/);
    expect(SPLIT).not.toMatch(/group-hover:bg-aou-6/);
    expect(SPLIT).not.toMatch(/group-active:bg-aou-6/);
  });
});
