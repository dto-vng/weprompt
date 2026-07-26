import { describe, expect, it } from 'vitest';
import { buildInjectedContext } from './buildInjectedContext';

describe('buildInjectedContext', () => {
  it('returns empty string when no layers have text', () => {
    expect(buildInjectedContext([])).toBe('');
    expect(buildInjectedContext([{ label: 'A', text: '   ' }])).toBe('');
  });

  it('renders a single non-empty layer as a labelled block', () => {
    expect(buildInjectedContext([{ label: 'Your instructions', text: 'Be concise.' }])).toBe(
      '[Your instructions]\nBe concise.'
    );
  });

  it('joins multiple layers in order, trimming each, dropping empties', () => {
    const out = buildInjectedContext([
      { label: 'Your instructions', text: '  Be concise.  ' },
      { label: 'Project', text: '' },
      { label: 'Project: HR', text: 'Use formal Vietnamese.' },
    ]);
    expect(out).toBe('[Your instructions]\nBe concise.\n\n[Project: HR]\nUse formal Vietnamese.');
  });
});
