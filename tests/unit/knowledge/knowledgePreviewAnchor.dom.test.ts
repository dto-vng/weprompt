/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { findCitationHeading } from '@/renderer/pages/project/components/knowledgePreviewAnchor';

// Mirrors the production layout: the markdown container lives inside an open
// shadow root, and the finder receives the in-shadow container element.
const buildTree = (html: string): HTMLElement => {
  const host = document.createElement('div');
  const shadow = host.attachShadow({ mode: 'open' });
  const container = document.createElement('div');
  container.innerHTML = html;
  shadow.appendChild(container);
  return container;
};

describe('findCitationHeading', () => {
  it('finds the page heading for a page-range anchor', () => {
    const tree = buildTree('<h2>Page 1</h2><p>a</p><h2>Page 2</h2><p>b</p>');
    expect(findCitationHeading(tree, 'Pages 2–3')?.textContent).toBe('Page 2');
  });

  it('finds the most specific heading of a trail', () => {
    const tree = buildTree('<h1>HR</h1><h2>Visa letters</h2>');
    expect(findCitationHeading(tree, 'HR > Visa letters')?.textContent).toBe('Visa letters');
  });

  it('matches heading text with surrounding whitespace', () => {
    const tree = buildTree('<h2>\n  Page 3\n</h2>');
    expect(findCitationHeading(tree, 'Page 3')).not.toBeNull();
  });

  it('returns null when nothing matches or the anchor is blank', () => {
    const tree = buildTree('<h2>Other</h2>');
    expect(findCitationHeading(tree, 'Missing heading')).toBeNull();
    expect(findCitationHeading(tree, '')).toBeNull();
  });
});
