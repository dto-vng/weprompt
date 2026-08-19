import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = readFileSync(
  resolve(
    __dirname,
    '../../../../packages/desktop/src/renderer/components/chat/TemplateGallery/TemplateGalleryColumns.tsx'
  ),
  'utf8'
);

// C-07 — a long template name used to widen its whole card, breaking the row: measured
// 281px and 417px cards among otherwise uniform ones. The caption already had `truncate`;
// it could not engage because the card's wrapper had no width to truncate against, so the
// wrapper sized itself to the caption instead.
//
// jsdom resolves no UnoCSS and lays nothing out, so it cannot see card widths. Measured in
// the running app instead: every wrapper now reports exactly 160px and only the long names
// report clipped. These assertions guard the two things that measurement traced it to.
describe('template card width is independent of its name', () => {
  it('shares one width constant between the thumbnail and the wrapper', () => {
    expect(SRC).toMatch(/const CARD_W = 'w-160px';/);
    expect(SRC).toMatch(/const CARD = `\$\{CARD_W\} h-100px`;/);
  });

  it('constrains the card wrapper, not just the thumbnail', () => {
    // Without CARD_W here the wrapper grows to fit the caption and the row breaks.
    expect(SRC).toMatch(/flex flex-col shrink-0 snap-start \$\{CARD_W\}/);
  });

  it('lets the name truncate inside the flex caption row', () => {
    // `truncate` alone is inert in a flex row; min-w-0 is what allows the shrink.
    expect(SRC).toMatch(/const TEMPLATE_NAME = '[^']*truncate[^']*min-w-0'/);
  });
});

// The install button carries no icon: it is a single centred label. Arco's button computes
// display:block with text-align:center, so the label centres on its own and any `flex`
// override would defeat that. The earlier C-10 guard required the opposite — `flex
// items-center gap-8px` — because the button then had an `icon` prop whose glyph rendered
// flush against the text. The icon was removed on request, so the guard is inverted here
// rather than deleted: it now pins the absence that makes native centring work.
//
// jsdom resolves no UnoCSS and lays nothing out, so this asserts the source contract, not
// the rendered result.
describe('template install button is a centred label with no icon', () => {
  const src = readFileSync(
    resolve(
      __dirname,
      '../../../../packages/desktop/src/renderer/components/chat/TemplateGallery/TemplateMessageCard.tsx'
    ),
    'utf8'
  );

  it('passes no icon to the button', () => {
    expect(src).not.toMatch(/icon=\{<AddOne/);
    expect(src).not.toMatch(/\bAddOne\b/);
  });

  it('does not override Arco own centring with a flex container', () => {
    expect(src).toMatch(/className='w-fit'/);
    expect(src).not.toMatch(/className='w-fit flex items-center gap-8px'/);
  });
});
