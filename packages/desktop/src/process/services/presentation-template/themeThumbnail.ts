/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PresentationTemplateFormat } from '@/common/types/office/presentationTemplate';

const HEX_RE = /#[0-9a-fA-F]{6}\b/g;
const GOOGLE_FAMILY_RE = /family=([A-Za-z][A-Za-z+]*)/g;

export function parseThemeTokens(markdown: string): { colors: string[]; fonts: string[] } {
  const colors: string[] = [];
  for (const match of markdown.match(HEX_RE) ?? []) {
    const hex = match.toLowerCase();
    if (!colors.includes(hex)) colors.push(hex);
    if (colors.length === 6) break;
  }

  const fonts: string[] = [];
  for (const match of markdown.matchAll(GOOGLE_FAMILY_RE)) {
    const family = match[1].replace(/\+/g, ' ');
    if (!fonts.includes(family)) fonts.push(family);
    if (fonts.length === 3) break;
  }
  return { colors, fonts };
}

const escapeXml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * A deterministic 320x200 "theme token card": background from the lightest
 * color, a title, a font line, a swatch row and a format badge. Used for
 * user-imported templates where no authored preview exists.
 */
export function renderThemeThumbnailSvg(input: {
  name: string;
  format: PresentationTemplateFormat;
  colors: string[];
  fonts: string[];
}): string {
  const luminance = (hex: string): number => {
    const n = parseInt(hex.slice(1), 16);
    return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  };
  const sorted = [...input.colors].toSorted((a, b) => luminance(b) - luminance(a));
  const background = sorted[0] ?? '#f5f5f5';
  const ink = sorted[sorted.length - 1] ?? '#1a1a1a';
  const accent = input.colors.find((c) => c !== background && c !== ink) ?? ink;

  const swatches = input.colors
    .slice(0, 6)
    .map((color, index) => `<rect x="${20 + index * 34}" y="150" width="26" height="26" rx="4" fill="${color}"/>`)
    .join('');
  const fontLine = escapeXml(input.fonts.slice(0, 3).join(' · ') || 'System fonts');
  const badge = input.format === 'pptx' ? 'PPTX' : 'HTML';

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">`,
    `<rect width="320" height="200" fill="${background}"/>`,
    `<rect x="20" y="24" width="80" height="6" fill="${accent}"/>`,
    `<text x="20" y="70" font-family="Georgia, serif" font-size="24" font-weight="700" fill="${ink}">${escapeXml(input.name.slice(0, 24))}</text>`,
    `<text x="20" y="96" font-family="monospace" font-size="11" fill="${ink}" opacity="0.7">${fontLine}</text>`,
    `<rect x="20" y="112" width="200" height="4" fill="${ink}" opacity="0.15"/>`,
    `<rect x="20" y="124" width="160" height="4" fill="${ink}" opacity="0.15"/>`,
    swatches,
    `<rect x="252" y="150" width="48" height="22" rx="11" fill="${ink}"/>`,
    `<text x="276" y="165" font-family="monospace" font-size="10" fill="${background}" text-anchor="middle">${badge}</text>`,
    `</svg>`,
  ].join('');
}

export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf-8').toString('base64')}`;
}
