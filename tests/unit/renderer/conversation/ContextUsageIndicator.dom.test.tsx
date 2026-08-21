/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button } from '@arco-design/web-react';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import ContextUsageIndicator from '@/renderer/components/agent/ContextUsageIndicator';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { limit?: string | number; percent?: string | number; used?: string | number }) => {
      if (options && 'defaultValue' in options) {
        throw new Error('Translation fallbacks are not allowed');
      }

      const translations: Record<string, string> = {
        'conversation.contextUsage.contextWindow': 'Context window',
        'conversation.contextUsage.percentUsed': '{{percent}}% used',
        'conversation.contextUsage.tokenCount': '{{used}} of {{limit}} tokens',
        'conversation.contextUsage.triggerLabel': 'Show context usage',
        'conversation.contextUsage.estimated': 'Estimated',
        'conversation.contextUsage.unavailable': 'Context usage unavailable',
        'conversation.contextHandoff.budget.healthy': 'Context {{percent}}',
        'conversation.contextHandoff.budget.watch': 'Context watch {{percent}}',
        'conversation.contextHandoff.budget.compress': 'Compress soon {{percent}}',
        'conversation.contextHandoff.budget.too_large': 'Context large {{percent}}',
      };

      return (translations[key] ?? key).replace(
        /{{(limit|percent|used)}}/g,
        (_match, interpolationKey: 'limit' | 'percent' | 'used') => String(options?.[interpolationKey] ?? '')
      );
    },
  }),
}));

describe('ContextUsageIndicator', () => {
  // The gauge is coloured from how full the window is, not from the budget status:
  // `compress` begins at 50%, which is when compaction becomes worthwhile, not when a
  // user should be warned. Before this, the healthy colour was `--primary-6` — the brand
  // orange — so an empty context looked the same as a nearly-full one.
  it.each([
    ['healthy well below the threshold', 120_000, 'rgb(var(--success-6))'],
    ['still healthy just under 80%', 799_000, 'rgb(var(--success-6))'],
    ['warns exactly at 80%', 800_000, 'rgb(var(--warning-6))'],
    ['still warning just under the danger status', 890_000, 'rgb(var(--warning-6))'],
  ])('colours the gauge: %s', async (_case, totalTokens, expected) => {
    render(<ContextUsageIndicator tokenUsage={{ total_tokens: totalTokens }} context_limit={1_000_000} />);
    fireEvent.focus(screen.getByRole('button', { name: /Show context usage/ }));

    await screen.findByText('Context window');
    expect(screen.getByTestId('context-usage-progress')).toHaveStyle({ backgroundColor: expected });
  });

  it('opens the context usage popover on keyboard focus', async () => {
    render(<ContextUsageIndicator tokenUsage={{ total_tokens: 122_700 }} context_limit={1_000_000} />);

    const trigger = screen.getByRole('button', { name: 'Show context usage: 12% used' });
    fireEvent.focus(trigger);

    expect(await screen.findByText('Context window')).toBeInTheDocument();
    expect(screen.getByText('12% used')).toBeInTheDocument();
    expect(screen.getByText('122.7K of 1M tokens')).toBeInTheDocument();
    expect(screen.getByTestId('context-usage-progress')).toHaveStyle({ width: '12.27%' });
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
  });

  it('caps only the visual progress when context usage exceeds its limit', async () => {
    render(<ContextUsageIndicator tokenUsage={{ total_tokens: 1_250_000 }} context_limit={1_000_000} />);

    const trigger = screen.getByRole('button', { name: 'Show context usage: 125% used' });
    fireEvent.mouseEnter(trigger);

    expect(await screen.findByText('125% used')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByTestId('context-usage-progress')).toHaveStyle({ width: '100%' });
    expect(trigger.querySelector('svg circle:last-of-type')).toHaveAttribute('stroke-dashoffset', '0');
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    'renders the unknown-state meter for invalid context usage %s',
    (totalTokens) => {
      render(<ContextUsageIndicator tokenUsage={{ total_tokens: totalTokens }} />);

      expect(screen.getByRole('button', { name: 'Show context usage: Context usage unavailable' })).toBeInTheDocument();
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    }
  );

  it('renders the unknown-state meter when finite inputs would produce a non-finite percentage', () => {
    render(<ContextUsageIndicator tokenUsage={{ total_tokens: Number.MAX_VALUE }} context_limit={Number.MIN_VALUE} />);

    expect(screen.getByRole('button', { name: 'Show context usage: Context usage unavailable' })).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it.each([undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'renders the unknown-state meter for an unknown or invalid context limit %s',
    (contextLimit) => {
      render(<ContextUsageIndicator tokenUsage={{ total_tokens: 102_400 }} context_limit={contextLimit} />);

      expect(screen.getByRole('button', { name: 'Show context usage: Context usage unavailable' })).toBeInTheDocument();
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    }
  );

  it('keeps the unknown-state trigger when context usage is unavailable', () => {
    render(
      <>
        <ContextUsageIndicator tokenUsage={null} />
        <Button>Send</Button>
      </>
    );

    expect(screen.getByRole('button', { name: 'Show context usage: Context usage unavailable' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  it('keeps an accessible unknown-state circle when the context limit is unavailable', async () => {
    render(
      <ContextUsageIndicator
        tokenUsage={null}
        budget={{
          source: 'estimated',
          totalTokens: 10_000,
          contextLimit: undefined,
          ratio: null,
          status: 'healthy',
        }}
      />
    );

    const trigger = screen.getByRole('button', { name: 'Show context usage: Context usage unavailable' });
    fireEvent.focus(trigger);

    expect(await screen.findAllByText('Context usage unavailable')).toHaveLength(2);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('labels estimated usage in the trigger, popover, and polite status announcement', async () => {
    render(
      <ContextUsageIndicator
        tokenUsage={null}
        budget={{
          source: 'estimated',
          totalTokens: 5_000,
          contextLimit: 100_000,
          ratio: 0.05,
          status: 'healthy',
        }}
      />
    );

    const trigger = screen.getByRole('button', { name: 'Show context usage: Estimated · 5% used' });
    fireEvent.focus(trigger);

    expect(await screen.findByText('Estimated · 5% used')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Context 5%');
  });
});
