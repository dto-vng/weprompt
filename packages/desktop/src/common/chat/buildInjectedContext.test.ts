import { describe, expect, it } from 'vitest';
import { buildInjectedContext } from './buildInjectedContext';

describe('buildInjectedContext', () => {
  it('returns empty string when no layers have text', () => {
    expect(buildInjectedContext([])).toBe('');
    expect(buildInjectedContext([{ label: 'A', text: '   ' }])).toBe('');
  });

  // Labels here are arbitrary: this joiner is label-agnostic. The real labels
  // live in GLOBAL_CONTEXT_LABEL and resolveInjectedContext, which have their
  // own tests — deliberately not reused here so this file stays generic.
  it('renders a single non-empty layer as a labelled block', () => {
    expect(buildInjectedContext([{ label: 'Global', text: 'Be concise.' }])).toBe('[Global]\nBe concise.');
  });

  it('joins multiple layers in order, trimming each, dropping empties', () => {
    const out = buildInjectedContext([
      { label: 'Global', text: '  Be concise.  ' },
      { label: 'Project', text: '' },
      { label: 'Project: HR', text: 'Use formal Vietnamese.' },
    ]);
    expect(out).toBe('[Global]\nBe concise.\n\n[Project: HR]\nUse formal Vietnamese.');
  });
});
