/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SettingsPageHeader — the shared header paradigm for settings pages.
 *
 * Layout:
 *   1. Title block: page title + description, with the action slot on its right.
 *   2. Status panel (optional): a fixed-width card BESIDE the title block on wide
 *      viewports, wrapping to its own full-width row below it when there is not
 *      room for both. It is never squeezed into the leftover width.
 *   3. Tabs (optional): underline tabs with an optional count badge.
 *
 * Pages own everything below the header (their list/content). This keeps the
 * title sizing, description, action placement, tab styling and responsive
 * breakpoints identical across Agents / Skills / Tools.
 */

import classNames from 'classnames';
import React from 'react';

export type SettingsPageTab = {
  key: string;
  label: string;
  /** Optional count badge shown after the label. */
  count?: number;
};

type SettingsPageHeaderProps = {
  title: React.ReactNode;
  /** Secondary description under the title; may contain inline links. */
  description?: React.ReactNode;
  /** Right-aligned action slot (search, create button, dropdowns, …). */
  actions?: React.ReactNode;
  /**
   * Where `actions` sits. `title-row` (default) right-aligns them beside the
   * title. `below-description` stacks them under the description instead, so a
   * page carrying a status panel does not leave a button stranded in the gap
   * between the title block and the panel column.
   */
  actionsPlacement?: 'title-row' | 'below-description';
  /**
   * Status-panel slot inside the sticky header, for a panel that must stay
   * glanceable while the body scrolls. It sits in its own column beside the title
   * block — not in `actions`, whose `shrink-0` sizing would force the whole header
   * to the panel's max-content width and overflow the page.
   *
   * The slot owns the column width, not the panel: the panel renders `w-full` and
   * the column caps it at the card width once there is room for both. The column
   * is `empty:hidden`, so a panel component that renders `null` (this prop is a
   * live element either way) leaves no phantom column behind to squeeze the title.
   */
  statusPanel?: React.ReactNode;
  tabs?: SettingsPageTab[];
  activeTab?: string;
  onTabChange?: (key: string) => void;
  /** Disable sticky behavior when the caller renders a fixed header outside its scroll body. */
  sticky?: boolean;
  /** Extra testid for the whole header block. */
  'data-testid'?: string;
};

const SettingsPageHeader: React.FC<SettingsPageHeaderProps> = ({
  title,
  description,
  actions,
  actionsPlacement = 'title-row',
  statusPanel,
  tabs,
  activeTab,
  onTabChange,
  sticky = true,
  'data-testid': dataTestId,
}) => {
  return (
    <div
      data-testid={dataTestId}
      // The background exists only to mask content scrolling underneath in sticky
      // mode. Non-sticky callers render this header outside their scroll body, and
      // painting it there leaves a panel the width of the caller's content column
      // instead of the full page width.
      //
      // C-15: it must match the page it masks, not merely be opaque. At bg-1 it read as
      // a warm band floating on the lighter content plane; bg-chat-surface is the plane
      // itself, so the mask becomes invisible while still doing its job.
      className={classNames(sticky && 'bg-chat-surface sticky top-0 z-10 -mt-14px pt-14px md:-mt-32px md:pt-32px')}
    >
      <div className='flex flex-col gap-14px min-[1080px]:flex-row min-[1080px]:items-start min-[1080px]:gap-28px'>
        <div className='min-w-0 min-[1080px]:flex-1'>
          <div className='flex items-center justify-between gap-12px sm:gap-16px'>
            <h1 className='m-0 min-w-0 flex-1 text-22px md:text-24px font-bold leading-[1.2] text-t-primary'>
              {title}
            </h1>
            {actions && actionsPlacement === 'title-row' ? (
              <div className='shrink-0 flex flex-wrap items-center justify-end gap-8px'>{actions}</div>
            ) : null}
          </div>
          {description ? <p className='m-0 mt-8px text-13px leading-relaxed text-t-secondary'>{description}</p> : null}
          {actions && actionsPlacement === 'below-description' ? (
            <div className='mt-18px flex flex-wrap items-center gap-8px'>{actions}</div>
          ) : null}
        </div>
        <div
          data-testid='settings-header-status-panel'
          className='empty:hidden w-full min-w-0 min-[1080px]:w-330px min-[1080px]:shrink-0'
        >
          {statusPanel}
        </div>
      </div>

      {tabs && tabs.length > 0 ? (
        <div className='mt-18px flex gap-26px border-b border-[var(--color-border-2)]' role='tablist'>
          {tabs.map((tab) => {
            const isActive = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                type='button'
                role='tab'
                aria-selected={isActive}
                data-testid={`settings-tab-${tab.key}`}
                onClick={() => onTabChange?.(tab.key)}
                className={classNames(
                  'relative inline-flex cursor-pointer items-center border-none bg-transparent px-2px pb-12px text-14px leading-none transition-colors',
                  isActive ? 'font-600 text-t-primary' : 'font-500 text-t-tertiary hover:text-t-secondary'
                )}
              >
                <span>{tab.label}</span>
                {typeof tab.count === 'number' ? (
                  <span
                    className={classNames(
                      'ml-6px inline-flex h-16px min-w-16px items-center justify-center rounded-999px px-5px text-10px font-500 leading-none',
                      isActive ? 'bg-primary-1 text-primary-6' : 'bg-fill-2 text-t-quaternary'
                    )}
                  >
                    {tab.count}
                  </span>
                ) : null}
                {isActive ? <span className='absolute inset-x-0 -bottom-1px h-2px rounded-2px bg-primary-6' /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

export default SettingsPageHeader;
