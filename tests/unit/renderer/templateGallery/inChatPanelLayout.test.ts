import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = resolve(__dirname, '../../../../packages/desktop/src/renderer/components/chat/TemplateGallery');
const read = (f: string) => readFileSync(resolve(DIR, f), 'utf8');

// C-06 — the in-chat panel stacked each artifact type vertically in its own column, so
// installing more templates grew it downward into a ragged grid. The new-chat gallery was
// already correct. Both surfaces must use the same `large` layout: one horizontal shelf
// per type.
//
// jsdom lays nothing out, so it cannot see rows. Measured in the running app: cards per
// row went from {3,3,3,3,1,1} to {4,6,4}, matching the group counts exactly.
describe('template gallery layout is the same in-chat and on the new-chat screen', () => {
  it('the in-chat panel uses the horizontal shelf layout', () => {
    expect(read('TemplateGalleryPanel.tsx')).toMatch(/size='large'/);
    expect(read('TemplateGalleryPanel.tsx')).not.toMatch(/size='compact'/);
  });

  it('the new-chat gallery uses it too, so the two cannot drift', () => {
    expect(read('TemplateGalleryExpanded.tsx')).toMatch(/size='large'/);
  });

  it('the large variant is a horizontal, scrollable shelf', () => {
    // If this ever becomes a column stack again, C-06 is back regardless of the size prop.
    expect(read('TemplateGalleryColumns.tsx')).toMatch(
      /large:\s*\{[^}]*shelf:\s*'flex gap-12px items-start overflow-x-auto/s
    );
  });
});
