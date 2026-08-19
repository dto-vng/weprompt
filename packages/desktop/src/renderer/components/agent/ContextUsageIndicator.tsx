/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Divider, Popover } from '@arco-design/web-react';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { TokenUsageData } from '@/common/config/storage';
import {
  contextUsagePercent,
  type ContextUsageSnapshot,
} from '@/renderer/pages/conversation/contextHandoff/contextBudget';

type ContextUsageIndicatorProps = {
  tokenUsage?: TokenUsageData | null;
  context_limit?: number;
  budget?: ContextUsageSnapshot;
  className?: string;
  size?: number;
};

const CONTEXT_TRACK_COLOR = 'var(--color-fill-3)';

const ContextUsageIndicator: React.FC<ContextUsageIndicatorProps> = ({
  tokenUsage,
  context_limit,
  budget,
  className = '',
  size = 24,
}) => {
  const { t } = useTranslation();

  const legacyBudget = useMemo<ContextUsageSnapshot>(() => {
    const total = tokenUsage?.total_tokens;
    const validTotal = typeof total === 'number' && Number.isFinite(total) && total >= 0 ? total : null;
    const validLimit =
      typeof context_limit === 'number' && Number.isFinite(context_limit) && context_limit > 0
        ? context_limit
        : undefined;
    const rawRatio = validTotal !== null && validLimit ? validTotal / validLimit : null;
    const ratio = rawRatio !== null && Number.isFinite(rawRatio) ? rawRatio : null;
    const status =
      ratio === null
        ? 'healthy'
        : ratio >= 0.9
          ? 'too_large'
          : ratio >= 0.5
            ? 'compress'
            : ratio >= 0.35
              ? 'watch'
              : 'healthy';

    return {
      source: validTotal === null ? 'unknown' : 'runtime',
      totalTokens: validTotal,
      contextLimit: validLimit,
      ratio,
      status,
    };
  }, [tokenUsage, context_limit]);
  const contextUsage = budget ?? legacyBudget;
  const percentage =
    typeof contextUsage.ratio === 'number' && Number.isFinite(contextUsage.ratio) ? contextUsage.ratio * 100 : null;
  const roundedPercentage = percentage === null ? null : contextUsagePercent(contextUsage.ratio);
  const displayTotal = typeof contextUsage.totalTokens === 'number' ? formatTokenCount(contextUsage.totalTokens) : null;
  const displayLimit = contextUsage.contextLimit ? formatTokenCount(contextUsage.contextLimit, true) : null;
  const isWarning = contextUsage.status === 'compress';
  const isDanger = contextUsage.status === 'too_large';

  const strokeWidth = 2.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const visualPercentage = percentage === null ? 0 : Math.min(Math.max(percentage, 0), 100);
  const strokeDashoffset = circumference - (visualPercentage / 100) * circumference;

  const getStrokeColor = () => {
    if (percentage === null) return 'var(--color-text-3)';
    if (isDanger) return 'rgb(var(--danger-6))';
    if (isWarning) return 'rgb(var(--warning-6))';
    return 'rgb(var(--primary-6))';
  };

  const percentageLabel =
    percentage === null
      ? t('conversation.contextUsage.unavailable')
      : t('conversation.contextUsage.percentUsed', { percent: roundedPercentage });
  const usageLabel =
    contextUsage.source === 'estimated' && percentage !== null
      ? `${t('conversation.contextUsage.estimated')} · ${percentageLabel}`
      : percentageLabel;
  const triggerLabel = `${t('conversation.contextUsage.triggerLabel')}: ${usageLabel}`;
  const statusAnnouncement =
    percentage === null
      ? t('conversation.contextUsage.unavailable')
      : t(`conversation.contextHandoff.budget.${contextUsage.status}`, { percent: `${roundedPercentage}%` });

  const popoverContent = (
    <div className='min-w-240px p-12px'>
      <div className='flex items-baseline justify-between gap-12px'>
        <span className='text-13px text-t-secondary'>{t('conversation.contextUsage.contextWindow')}</span>
        <span className='text-13px font-medium text-t-primary whitespace-nowrap'>{usageLabel}</span>
      </div>
      {displayTotal && displayLimit && (
        <div className='mt-3px text-12px text-t-secondary'>
          {t('conversation.contextUsage.tokenCount', { used: displayTotal, limit: displayLimit })}
        </div>
      )}
      {percentage !== null && (
        <div
          aria-label={usageLabel}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={visualPercentage}
          className='mt-8px h-5px overflow-hidden rounded-full bg-3'
          role='progressbar'
        >
          <div
            className='h-full rounded-full'
            data-testid='context-usage-progress'
            style={{ backgroundColor: getStrokeColor(), width: `${visualPercentage}%` }}
          />
        </div>
      )}
    </div>
  );

  return (
    <Popover
      content={popoverContent}
      position='top'
      trigger={['hover', 'focus']}
      triggerProps={{ focusDelay: 0, mouseEnterDelay: 0 }}
      className='context-usage-popover'
    >
      <Button
        aria-label={triggerLabel}
        className={`context-usage-indicator flex items-center justify-center ${className}`}
        shape='circle'
        size='mini'
        style={{ height: size, width: size }}
        type='text'
      >
        <svg
          aria-hidden='true'
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          width={size}
          style={{ transform: 'rotate(-90deg)' }}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill='none'
            stroke={CONTEXT_TRACK_COLOR}
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill='none'
            stroke={getStrokeColor()}
            strokeWidth={strokeWidth}
            strokeLinecap='round'
            strokeDasharray={percentage === null ? '2 3' : circumference}
            strokeDashoffset={percentage === null ? undefined : strokeDashoffset}
            style={{ transition: 'stroke-dashoffset 0.3s ease, stroke 0.3s ease' }}
          />
        </svg>
        <span className='sr-only' role='status' aria-live='polite'>
          {statusAnnouncement}
        </span>
      </Button>
    </Popover>
  );
};

/**
 * 格式化 token 数量显示
 * @param count token 数量
 * @param hideZeroDecimals 是否隐藏小数点为0的情况（如 1.0M 显示为 1M），默认为 false
 * @returns 格式化后的字符串，如 "37.0K" 或 "1.2M"，当 hideZeroDecimals 为 true 时 "1.0M" 显示为 "1M"
 */
export function formatTokenCount(count: number, hideZeroDecimals = false): string {
  if (count >= 1_000_000) {
    const value = count / 1_000_000;
    const formatted = value.toFixed(1);
    return hideZeroDecimals && formatted.endsWith('.0') ? `${Math.floor(value)}M` : `${formatted}M`;
  }
  if (count >= 1_000) {
    const value = count / 1_000;
    const formatted = value.toFixed(1);
    return hideZeroDecimals && formatted.endsWith('.0') ? `${Math.floor(value)}K` : `${formatted}K`;
  }
  return count.toString();
}

export default ContextUsageIndicator;
