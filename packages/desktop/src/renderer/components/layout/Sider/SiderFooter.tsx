/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Tooltip } from '@arco-design/web-react';
import { ArrowCircleLeft, CloseOne, Moon, SettingTwo, SunOne } from '@icon-park/react';
import classNames from 'classnames';
import { iconColors } from '@renderer/styles/colors';
import type { SiderTooltipProps } from '@renderer/utils/ui/siderTooltip';

type SiderFooterProps = {
  isMobile: boolean;
  isSettings: boolean;
  collapsed?: boolean;
  theme: string;
  siderTooltipProps: SiderTooltipProps;
  onSettingsClick: () => void;
  onThemeToggle: () => void;
  showLogout?: boolean;
  onLogoutClick?: () => void;
};

const SiderFooter: React.FC<SiderFooterProps> = ({
  isMobile,
  isSettings,
  collapsed = false,
  theme,
  siderTooltipProps,
  onSettingsClick,
  onThemeToggle,
  showLogout = false,
  onLogoutClick,
}) => {
  const { t } = useTranslation();

  const settingsIcon = isSettings ? (
    <ArrowCircleLeft
      theme='outline'
      size='16'
      fill='currentColor'
      className='block leading-none'
      style={{ lineHeight: 0 }}
    />
  ) : (
    <SettingTwo
      theme='outline'
      size='16'
      fill='currentColor'
      className='block leading-none'
      style={{ lineHeight: 0 }}
    />
  );
  const showThemeToggle = !collapsed;
  const themeTooltip = theme === 'dark' ? t('settings.lightMode') : t('settings.darkMode');
  const settingsLabel = isSettings ? t('common.back') : t('common.settings');

  return (
    <div className='shrink-0 sider-footer mt-auto pt-8px pb-8px border-t border-solid border-[var(--color-border-2)] border-l-0 border-r-0 border-b-0'>
      <div className={classNames('flex', collapsed ? 'flex-col items-center gap-2px' : 'items-center gap-8px px-10px')}>
        {/* C-08: matches the nav entries above (34px row, icon + label) instead of a
            32px icon-only target. Collapsed keeps the icon-only form, where the
            tooltip carries the name — the same rule the nav entries follow. */}
        <Tooltip {...siderTooltipProps} content={settingsLabel} position='right' disabled={!collapsed}>
          <Button
            aria-label={settingsLabel}
            className={classNames(
              // `flex` is load-bearing: Arco's button is display:block with
              // text-align:center, so justify and gap are inert without it and the
              // icon ends up flush against the label. Same shape as the nav
              // entries above (SiderStudioEntry).
              '!h-34px !rounded-8px !text-t-secondary hover:!bg-fill-3 hover:!text-t-primary flex items-center',
              collapsed ? '!w-32px !p-0 justify-center' : 'flex-1 justify-start gap-8px !px-10px',
              isMobile && 'sider-footer-btn-mobile',
              isSettings && '!bg-fill-3'
            )}
            type='text'
            icon={settingsIcon}
            onClick={onSettingsClick}
          >
            {!collapsed && <span className='leading-24px'>{settingsLabel}</span>}
          </Button>
        </Tooltip>
        {showLogout && onLogoutClick && (
          <Tooltip {...siderTooltipProps} content={t('settings.googleLogout')} position='right'>
            <Button
              aria-label={t('settings.googleLogout')}
              className={classNames(
                '!h-32px !w-32px !p-0 !rounded-8px hover:!bg-[rgba(var(--primary-6),0.14)]',
                isMobile && 'sider-footer-btn-mobile'
              )}
              type='text'
              icon={<CloseOne theme='outline' size='16' fill={iconColors.primary} />}
              onClick={onLogoutClick}
            />
          </Tooltip>
        )}
        {/* Theme toggle — lightweight icon button, beside Settings on every screen.
            Hidden only in collapsed mode, where the rail has no room for a second control. */}
        {showThemeToggle && (
          <Tooltip {...siderTooltipProps} content={themeTooltip} position='right'>
            <Button
              className={classNames(
                '!h-32px !w-32px !p-0 !rounded-8px !text-t-secondary hover:!bg-fill-2 hover:!text-t-primary active:!bg-fill-3',
                isMobile && 'sider-footer-btn-mobile'
              )}
              aria-label={themeTooltip}
              type='text'
              icon={
                theme === 'dark' ? (
                  <SunOne theme='outline' size='18' fill='currentColor' />
                ) : (
                  <Moon theme='outline' size='18' fill='currentColor' />
                )
              }
              onClick={onThemeToggle}
            />
          </Tooltip>
        )}
      </div>
    </div>
  );
};

export default SiderFooter;
