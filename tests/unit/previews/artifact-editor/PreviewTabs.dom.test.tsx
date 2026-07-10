import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'preview.closeTabTitle': 'Close tab',
        'preview.collapsePanel': 'Collapse panel',
        'preview.unsavedChangesTitle': 'Unsaved changes',
      };
      return translations[key] ?? key;
    },
  }),
}));

import PreviewTabs from '@/renderer/pages/conversation/Preview/components/PreviewPanel/PreviewTabs';

const tabs = [
  { id: 'tab-1', title: 'First' },
  { id: 'tab-2', title: 'Second', isDirty: true },
  { id: 'tab-3', title: 'Third' },
];

const renderTabs = () => {
  const onSwitchTab = vi.fn();
  const onCloseTab = vi.fn();
  const onClosePanel = vi.fn();
  render(
    <PreviewTabs
      tabs={tabs}
      activeTabId='tab-1'
      tabFadeState={{ left: false, right: false }}
      tabsContainerRef={createRef<HTMLDivElement>()}
      onSwitchTab={onSwitchTab}
      onCloseTab={onCloseTab}
      onContextMenu={vi.fn()}
      onClosePanel={onClosePanel}
    />
  );
  return { onSwitchTab, onCloseTab, onClosePanel };
};

describe('PreviewTabs', () => {
  it('supports roving focus and explicit keyboard activation with tab semantics', async () => {
    const user = userEvent.setup();
    const { onSwitchTab } = renderTabs();
    const tablist = screen.getByRole('tablist');
    const renderedTabs = screen.getAllByRole('tab');

    expect(tablist).toContainElement(renderedTabs[0]);
    expect(renderedTabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(renderedTabs[0]).toHaveAttribute('tabindex', '0');
    expect(renderedTabs[1]).toHaveAttribute('tabindex', '-1');

    renderedTabs[0].focus();
    await user.keyboard('{ArrowRight}');
    expect(renderedTabs[1]).toHaveFocus();
    expect(onSwitchTab).not.toHaveBeenCalled();

    await user.keyboard('{Enter}');
    expect(onSwitchTab).toHaveBeenLastCalledWith('tab-2');
    await user.keyboard('{End}');
    expect(renderedTabs[2]).toHaveFocus();
    await user.keyboard('{Space}');
    expect(onSwitchTab).toHaveBeenLastCalledWith('tab-3');

    await user.keyboard('{Home}');
    expect(renderedTabs[0]).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(renderedTabs[2]).toHaveFocus();
  });

  it('closes a tab without activating it and exposes translated icon controls', async () => {
    const user = userEvent.setup();
    const { onSwitchTab, onCloseTab, onClosePanel } = renderTabs();

    await user.click(screen.getAllByRole('button', { name: 'Close tab' })[1]);
    expect(onCloseTab).toHaveBeenCalledWith('tab-2');
    expect(onSwitchTab).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Collapse panel' }));
    expect(onClosePanel).toHaveBeenCalledOnce();
  });
});
