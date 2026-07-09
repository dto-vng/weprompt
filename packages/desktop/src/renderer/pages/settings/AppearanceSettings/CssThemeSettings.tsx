/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { configService } from '@/common/config/configService';
import type { Theme } from '@/common/theme/types';
import { ipcBridge } from '@/common';
import { useThemeContext } from '@renderer/hooks/context/ThemeContext.tsx';
import { Message, Radio } from '@arco-design/web-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BUILTIN_THEMES, DEFAULT_THEME_ID } from './presets.ts';
import { OFFICIAL_THEME_IDS } from '@renderer/theme/builtinThemes';
import { BACKGROUND_BLOCK_START, injectBackgroundCssBlock } from './backgroundUtils.ts';
import { resolveExtensionAssetUrl } from '@renderer/utils/platform.ts';

const ensureBackgroundCss = <T extends { id?: string; cover?: string; css?: string; builtin?: boolean }>(
  theme: T
): T => {
  // Skip builtin themes (Light/Dark have no decorative css to inject)
  if (theme.builtin) {
    return theme;
  }
  if (theme.cover && theme.css && !theme.css.includes(BACKGROUND_BLOCK_START)) {
    return { ...theme, css: injectBackgroundCssBlock(theme.css, theme.cover) };
  }
  return theme;
};

/**
 * CSS 主题设置组件 / CSS Theme Settings Component
 * 用于管理和切换 CSS 皮肤主题 / For managing and switching CSS skin themes
 */
const CssThemeSettings: React.FC = () => {
  const { t } = useTranslation();
  const { activeTheme, activeId, selectTheme } = useThemeContext();
  const [themes, setThemes] = useState<Theme[]>([]);

  const activeThemeId = activeId ?? activeTheme?.id ?? DEFAULT_THEME_ID;

  const displayThemes = useMemo(() => {
    return themes.filter((theme) => OFFICIAL_THEME_IDS.has(theme.id));
  }, [themes]);

  // 加载主题列表 / Load theme list
  useEffect(() => {
    const loadThemes = async () => {
      try {
        const userThemes = (configService.get('theme.userThemes') as Theme[]) ?? [];

        // Apply background CSS to user themes that have cover images
        const normalizedUserThemes = userThemes.map((theme) => ensureBackgroundCss(theme));

        // 加载扩展主题 / Load extension-contributed themes
        let extensionThemes: Theme[] = [];
        try {
          const loadedExtensionThemes = await ipcBridge.extensions.getThemes.invoke();
          // Map extension themes to Theme shape (css-only, builtin: true, appearance inferred as 'light')
          extensionThemes = loadedExtensionThemes.map((theme) => ({
            id: theme.id,
            name: theme.name,
            cover: resolveExtensionAssetUrl(theme.cover),
            css: theme.css,
            appearance: 'light' as const,
            builtin: true,
            created_at: theme.created_at ?? 0,
            updated_at: theme.updated_at ?? 0,
          }));
        } catch {
          // Extensions not available (e.g., WebUI mode or not initialized yet)
        }

        // 合并主题，按 ID 去重（先出现的优先）
        // Merge builtin, extension, and user themes; deduplicate by ID (first occurrence wins)
        const seenIds = new Set<string>();
        const allThemes: Theme[] = [];
        for (const theme of [...BUILTIN_THEMES, ...extensionThemes, ...normalizedUserThemes]) {
          if (!theme?.id || seenIds.has(theme.id)) continue;
          seenIds.add(theme.id);
          allThemes.push(theme);
        }

        setThemes(allThemes);
      } catch (error) {
        console.error('Failed to load CSS themes:', error);
      }
    };
    void loadThemes();
  }, []);

  /**
   * 选择主题 / Select theme
   */
  const handleSelectTheme = useCallback(
    async (theme: Theme) => {
      try {
        await selectTheme(theme.id);
        Message.success(t('settings.cssTheme.applied', { name: theme.name }));
      } catch {
        Message.error(t('settings.cssTheme.applyFailed'));
      }
    },
    [selectTheme, t]
  );

  const handleThemeChange = useCallback(
    (themeId: string) => {
      const selectedTheme = displayThemes.find((theme) => theme.id === themeId);
      if (!selectedTheme) return;
      void handleSelectTheme(selectedTheme);
    },
    [displayThemes, handleSelectTheme]
  );

  return (
    <div className='space-y-12px'>
      {/* 标题栏 / Header */}
      <div className='flex items-start md:items-center justify-between gap-8px flex-wrap'>
        <span className='text-14px text-t-secondary leading-22px'>{t('settings.cssTheme.selectOrCustomize')}</span>
      </div>

      <Radio.Group
        direction='vertical'
        value={activeThemeId}
        onChange={handleThemeChange}
        className='w-full flex flex-col gap-8px'
      >
        {displayThemes.map((theme) => {
          const isActive = activeThemeId === theme.id;
          return (
            <Radio
              key={theme.id}
              value={theme.id}
              className={`!m-0 w-full min-h-48px px-12px py-10px rounded-8px border border-solid transition-colors ${isActive ? 'border-[var(--color-primary)] bg-[var(--color-primary-light-1)]' : 'border-border-2 bg-1 hover:bg-3'}`}
            >
              <span className='text-14px text-t-primary leading-22px truncate'>{theme.name}</span>
            </Radio>
          );
        })}
      </Radio.Group>
    </div>
  );
};

export default CssThemeSettings;
