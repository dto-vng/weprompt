import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SettingsPageHeader from '@/renderer/pages/settings/components/SettingsPageHeader';

/**
 * The header's fill exists only to mask content scrolling underneath it
 * in sticky mode. Callers that render the header outside their scroll body —
 * inside a narrow centred column — used to get that fill painted at the column's
 * width instead of the page's, leaving a visible seam either side. Guard both
 * halves of that contract.
 */
const headerEl = () => screen.getByTestId('page-header');

describe('SettingsPageHeader background', () => {
  it('paints a background when sticky, so scrolled content cannot show through', () => {
    render(<SettingsPageHeader data-testid='page-header' title='Assistants' />);
    // C-16: the mask must MATCH the page it masks, not merely be opaque. At bg-1 it read as a
    // warm band on the lighter content plane C-04 introduced.
    expect(headerEl().className).toContain('bg-chat-surface');
  });

  it('paints no background when not sticky, so it cannot seam against its wrapper', () => {
    render(<SettingsPageHeader data-testid='page-header' title='Assistants' sticky={false} />);
    expect(headerEl().className).not.toContain('bg-1');
  });

  it('drops the sticky offset classes along with the background', () => {
    render(<SettingsPageHeader data-testid='page-header' title='Assistants' sticky={false} />);
    const className = headerEl().className;
    // The -mt/pt pair only compensates for sticky positioning; keeping it while
    // unstuck would pull the header up out of its wrapper's padding.
    expect(className).not.toContain('sticky');
    expect(className).not.toContain('-mt-32px');
  });
});

describe('SettingsPageHeader tabs', () => {
  const tabs = [
    { key: 'mine', label: 'My Assistants', count: 4 },
    { key: 'official', label: 'Official', count: 21 },
  ];

  it('marks only the active tab as selected', () => {
    render(<SettingsPageHeader title='Assistants' tabs={tabs} activeTab='mine' sticky={false} />);
    expect(screen.getByTestId('settings-tab-mine')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('settings-tab-official')).toHaveAttribute('aria-selected', 'false');
  });

  it('renders no tablist when the caller passes an empty tab list', () => {
    render(<SettingsPageHeader title='Assistants' tabs={[]} sticky={false} />);
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });
});
