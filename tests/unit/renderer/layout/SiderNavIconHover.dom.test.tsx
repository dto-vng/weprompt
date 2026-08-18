import { render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import SiderAssistantEntry from '@/renderer/components/layout/Sider/SiderNav/SiderAssistantEntry';
import SiderScheduledEntry from '@/renderer/components/layout/Sider/SiderNav/SiderScheduledEntry';
import { NAV_ICON_HOVER } from '@/renderer/utils/ui/rowActivation';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// C-05 — the sider entries should behave like the Creative Studio entry: icon muted
// at rest, brand orange while the row is hovered.
//
// jsdom cannot verify the *colour*: UnoCSS generates no stylesheet here, and the real
// defect this guards against was invisible to both jsdom and tsc — the class was present
// in the DOM while UnoCSS silently emitted no rule for it. The colour evidence is a live
// computed-style measurement, recorded in the Stream C intake doc. These tests guard the
// wiring: that the treatment is applied, and that it stays in a form UnoCSS can compile.
describe('sider nav icon hover treatment', () => {
  it('uses a form UnoCSS can actually compile', () => {
    expect(NAV_ICON_HOVER).toContain('text-t-secondary');
    expect(NAV_ICON_HOVER).toContain('group-hover:text-primary');
    // `text-[rgb(var(--primary-6))]` compiles to nothing: UnoCSS cannot tell a size from a
    // colour once the value wraps a var(), so the class silently does nothing.
    expect(NAV_ICON_HOVER).not.toContain('text-[');
  });

  const entries = [
    ['SiderAssistantEntry', SiderAssistantEntry],
    ['SiderScheduledEntry', SiderScheduledEntry],
  ] as const;

  for (const [name, Entry] of entries) {
    for (const collapsed of [false, true]) {
      it(`applies the treatment in ${name} (collapsed=${collapsed})`, () => {
        const { container } = render(
          <Entry isMobile={false} isActive={false} collapsed={collapsed} siderTooltipProps={{}} onClick={vi.fn()} />
        );

        const treated = container.querySelector('.group-hover\\:text-primary');
        expect(treated).not.toBeNull();

        // group-hover only resolves inside an ancestor carrying `group`; the collapsed
        // variant historically omitted it, which would make the treatment inert.
        expect(treated?.closest('.group')).not.toBeNull();
      });
    }
  }
});
