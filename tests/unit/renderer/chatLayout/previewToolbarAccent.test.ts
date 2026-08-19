import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const TOOLBAR = readFileSync(
  resolve(
    __dirname,
    '../../../../packages/desktop/src/renderer/pages/conversation/Preview/components/PreviewPanel/PreviewToolbar.tsx'
  ),
  'utf8'
);

// C-22 — the Source/Split/Preview control marked its active segment with the navy --brand
// (#374ea2), measured live, while every other active-state signal in the same pane is the
// primary orange (#f05a22) — including the file tab's underline immediately above it. Both are
// real brand colours; mixing them in one 114px stack of chrome is what read as "different
// shades".
describe('preview toolbar active segment uses the primary accent', () => {
  it('uses bg-primary, not the navy brand', () => {
    expect(TOOLBAR).toMatch(/toolbarBtnActive = '[^']*bg-primary\b/);
    expect(TOOLBAR).not.toMatch(/toolbarBtnActive = '[^']*bg-brand\b/);
  });

  it('keeps a distinct hover on the active segment', () => {
    expect(TOOLBAR).toMatch(/hover:bg-primary-7/);
  });
});
