/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { iconColors } from '@/renderer/styles/colors';
import { Button, Tooltip } from '@arco-design/web-react';
import { Close } from '@icon-park/react';
import { IconShrink } from '@arco-design/web-react/icon';
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { TabFadeState } from '../../hooks/useTabOverflow';

/**
 * Tab 信息
 * Tab information
 */
export interface PreviewTab {
  /**
   * Tab ID
   */
  id: string;

  /**
   * Tab 标题
   * Tab title
   */
  title: string;

  /**
   * 是否有未保存的修改
   * Whether there are unsaved changes
   */
  isDirty?: boolean;
}

/**
 * PreviewTabs 组件属性
 * PreviewTabs component props
 */
interface PreviewTabsProps {
  /**
   * Tabs 列表
   * Tabs list
   */
  tabs: PreviewTab[];

  /**
   * 当前活动的 Tab ID
   * Current active tab ID
   */
  activeTabId: string | null;

  /**
   * Tab 渐变状态（左右溢出指示器）
   * Tab fade state (left/right overflow indicators)
   */
  tabFadeState: TabFadeState;

  /**
   * Tabs 容器引用
   * Tabs container ref
   */
  tabsContainerRef: React.RefObject<HTMLDivElement>;

  /**
   * 切换 Tab 回调
   * Switch tab callback
   */
  onSwitchTab: (tabId: string) => void;

  /**
   * 关闭 Tab 回调
   * Close tab callback
   */
  onCloseTab: (tabId: string) => void;

  /**
   * Tab 右键菜单回调
   * Tab context menu callback
   */
  onContextMenu: (e: React.MouseEvent, tabId: string) => void;

  /**
   * 关闭预览面板回调
   * Close preview panel callback
   */
  onClosePanel?: () => void;
}

/**
 * 预览面板 Tabs 栏组件
 * Preview panel tabs bar component
 *
 * 显示多个 Tab，支持切换、关闭和右键菜单
 * Displays multiple tabs, supports switching, closing, and context menu
 *
 * 包含左右渐变指示器，提示用户可以滚动查看更多 Tab
 * Includes left/right gradient indicators to prompt users that more tabs can be scrolled
 */
const PreviewTabs: React.FC<PreviewTabsProps> = ({
  tabs,
  activeTabId,
  tabFadeState,
  tabsContainerRef,
  onSwitchTab,
  onCloseTab,
  onContextMenu,
  onClosePanel,
}) => {
  const { t } = useTranslation();
  const { left: showLeftFade, right: showRightFade } = tabFadeState;

  const focusTab = (index: number) => {
    const tabElements = tabsContainerRef.current?.querySelectorAll<HTMLElement>('[role="tab"]');
    tabElements?.[index]?.focus();
  };

  const handleTabKeyDown = (event: React.KeyboardEvent, index: number, tabId: string) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;

    if (nextIndex !== null) {
      event.preventDefault();
      focusTab(nextIndex);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Space' || event.key === 'Spacebar') {
      event.preventDefault();
      onSwitchTab(tabId);
    }
  };

  return (
    <div
      className='relative flex-shrink-0 bg-bg-2'
      style={{ minHeight: '36px', borderBottom: '1px solid var(--border-base)' }}
    >
      <div className='flex items-center h-36px w-full'>
        {/* Tabs 滚动区域 / Tabs scroll area */}
        <div ref={tabsContainerRef} role='tablist' className='flex items-center h-full flex-1 overflow-x-auto'>
          {tabs.length > 0 ? (
            tabs.map((tab, index) => (
              <div
                key={tab.id}
                className={`flex h-full flex-shrink-0 items-center transition-colors ${tab.id === activeTabId ? 'bg-bg-1 text-t-primary' : 'text-t-secondary hover:bg-bg-3'}`}
                onContextMenu={(e) => onContextMenu(e, tab.id)}
              >
                <Button
                  type='text'
                  role='tab'
                  aria-selected={tab.id === activeTabId}
                  tabIndex={tab.id === activeTabId ? 0 : -1}
                  className='!h-full !rd-0 !px-10px !text-inherit'
                  onClick={() => onSwitchTab(tab.id)}
                  onKeyDown={(event) => handleTabKeyDown(event, index, tab.id)}
                >
                  <span className='flex items-center gap-4px whitespace-nowrap text-12px'>
                    {tab.title}
                    {tab.isDirty && (
                      <span className='h-6px w-6px rd-full bg-primary' title={t('preview.unsavedChangesTitle')} />
                    )}
                  </span>
                </Button>
                <Tooltip content={t('preview.closeTabTitle')}>
                  <Button
                    type='text'
                    size='mini'
                    aria-label={t('preview.closeTabTitle')}
                    icon={<Close theme='outline' size='14' fill={iconColors.secondary} />}
                    className='!mr-6px hover:!text-primary'
                    onClick={(event) => {
                      event.stopPropagation();
                      onCloseTab(tab.id);
                    }}
                  />
                </Tooltip>
              </div>
            ))
          ) : (
            <div className='text-12px text-t-tertiary px-10px'>{t('preview.noTabs')}</div>
          )}
        </div>

        {/* 收起面板按钮 / Collapse panel button */}
        {onClosePanel && (
          <div className='flex items-center h-full px-10px flex-shrink-0 rounded-tr-[16px]'>
            <Tooltip content={t('preview.collapsePanel')}>
              <Button
                type='text'
                size='mini'
                aria-label={t('preview.collapsePanel')}
                icon={<IconShrink style={{ fontSize: 14, color: iconColors.secondary }} />}
                className='!h-20px !w-20px !p-0'
                onClick={onClosePanel}
              />
            </Tooltip>
          </div>
        )}
      </div>

      {/* 左侧渐变指示器 / Left gradient indicator */}
      {showLeftFade && (
        <div
          className='pointer-events-none absolute left-0 top-0 bottom-0 w-32px rounded-tl-[16px]'
          style={{
            background: 'linear-gradient(90deg, var(--bg-2) 0%, transparent 100%)',
          }}
        />
      )}

      {/* 右侧渐变指示器 / Right gradient indicator */}
      {showRightFade && (
        <div
          className='pointer-events-none absolute right-0 top-0 bottom-0 w-32px rounded-tr-[16px]'
          style={{
            background: 'linear-gradient(270deg, var(--bg-2) 0%, transparent 100%)',
          }}
        />
      )}
    </div>
  );
};

export default PreviewTabs;
