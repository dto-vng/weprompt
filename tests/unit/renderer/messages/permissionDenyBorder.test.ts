import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = resolve(__dirname, '../../../../packages/desktop/src/renderer/pages/conversation/Messages');
const read = (f: string) => readFileSync(resolve(DIR, f), 'utf8');

// C-11 — Arco's `type='secondary'` paints a pale fill with a *transparent* border, so on the
// cream message card the refusing option read as disabled while both granting options were
// solid orange. On a permission prompt that is a safety problem, not a cosmetic one: the
// action that disappeared was the one that declines.
//
// jsdom cannot see this — it resolves neither Arco's cascade nor UnoCSS. Measured in the
// running app: the deny button went from borderColor rgba(0,0,0,0) to rgb(216,203,182)
// while keeping its quieter fill.
describe('permission prompts give the refusing option a visible border', () => {
  it('defines the border in one shared place', () => {
    const styles = read('permissionButtonStyles.ts');
    expect(styles).toMatch(/PERMISSION_DENY_BORDER = '!border-4'/);
  });

  it('the AionRS prompt applies it to the de-emphasised option', () => {
    const src = read('components/MessagePermission.tsx');
    expect(src).toContain('PERMISSION_DENY_BORDER');
    expect(src).toMatch(/className=\{deEmphasize \? PERMISSION_DENY_BORDER : undefined\}/);
  });

  it('the ACP prompt applies it too, so the two backends cannot disagree', () => {
    const src = read('acp/MessageAcpPermission.tsx');
    expect(src).toContain('PERMISSION_DENY_BORDER');
    expect(src).toMatch(/className=\{isDeny \? PERMISSION_DENY_BORDER : undefined\}/);
  });
});
