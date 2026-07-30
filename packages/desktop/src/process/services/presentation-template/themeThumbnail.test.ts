/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { parseThemeTokens, renderThemeThumbnailSvg, svgToDataUrl } from './themeThumbnail';

const SAMPLE_MD = `
# Editorial Field Report — Theme Specification
--ink: #0a0a08
--paper: #F5F1E8
--accent: #c8341e
Repeated: #c8341e #c8341e
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz@0,9..144&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
`;

describe('parseThemeTokens', () => {
  it('extracts deduped lowercase hex colors in order of appearance', () => {
    const tokens = parseThemeTokens(SAMPLE_MD);
    expect(tokens.colors).toEqual(['#0a0a08', '#f5f1e8', '#c8341e']);
  });

  it('extracts font family names from Google Fonts URLs', () => {
    const tokens = parseThemeTokens(SAMPLE_MD);
    expect(tokens.fonts).toEqual(['Fraunces', 'JetBrains Mono']);
  });

  it('caps colors at 6 and fonts at 3', () => {
    const md = '#111111 #222222 #333333 #444444 #555555 #666666 #777777 family=A&family=B&family=C&family=D';
    const tokens = parseThemeTokens(md);
    expect(tokens.colors).toHaveLength(6);
    expect(tokens.fonts).toHaveLength(3);
  });

  it('returns empty arrays for prose without tokens', () => {
    expect(parseThemeTokens('just words')).toEqual({ colors: [], fonts: [] });
  });
});

describe('renderThemeThumbnailSvg', () => {
  it('renders an svg containing the name, format badge and swatches', () => {
    const svg = renderThemeThumbnailSvg({
      name: 'My Theme',
      format: 'html',
      colors: ['#0a0a08', '#c8341e'],
      fonts: ['Fraunces'],
    });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('My Theme');
    expect(svg).toContain('HTML');
    expect(svg).toContain('#c8341e');
    expect(svg).toContain('Fraunces');
  });

  it('escapes XML-unsafe characters in the name', () => {
    const svg = renderThemeThumbnailSvg({ name: 'A<B>&"C"', format: 'pptx', colors: [], fonts: [] });
    expect(svg).toContain('A&lt;B&gt;&amp;&quot;C&quot;');
    expect(svg).not.toContain('A<B>');
  });
});

describe('svgToDataUrl', () => {
  it('base64-encodes with the svg mime type', () => {
    const url = svgToDataUrl('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(url.startsWith('data:image/svg+xml;base64,')).toBe(true);
    expect(Buffer.from(url.split(',')[1], 'base64').toString('utf-8')).toContain('<svg');
  });
});
