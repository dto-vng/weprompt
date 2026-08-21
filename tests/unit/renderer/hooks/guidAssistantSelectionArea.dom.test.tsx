/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import AssistantSelectionArea, {
  hasTruncatedAssistantLabels,
  resolveAssistantVisibleLimit,
} from '@/renderer/pages/guid/components/AssistantSelectionArea';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue || key,
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  return {
    ...actual,
    Message: {
      useMessage: () => [{ warning: vi.fn() }, <div key='message-holder' />],
    },
  };
});

describe('AssistantSelectionArea', () => {
  it('maps available width to 4, 3, 2, then 1 visible assistant slots', () => {
    expect(resolveAssistantVisibleLimit(800)).toBe(4);
    expect(resolveAssistantVisibleLimit(680)).toBe(3);
    expect(resolveAssistantVisibleLimit(520)).toBe(2);
    expect(resolveAssistantVisibleLimit(390)).toBe(1);
  });

  it('detects labels that are visually truncated', () => {
    const root = document.createElement('div');
    const label = document.createElement('span');
    label.setAttribute('data-assistant-label', 'true');
    Object.defineProperty(label, 'clientWidth', { configurable: true, value: 80 });
    Object.defineProperty(label, 'scrollWidth', { configurable: true, value: 120 });
    root.appendChild(label);

    expect(hasTruncatedAssistantLabels(root)).toBe(true);

    Object.defineProperty(label, 'scrollWidth', { configurable: true, value: 80 });

    expect(hasTruncatedAssistantLabels(root)).toBe(false);
  });

  it('keeps the assistant picker visible after an assistant is selected', () => {
    render(
      <AssistantSelectionArea
        selectedAssistantId='bare-aionrs'
        assistants={assistants()}
        localeKey='en-US'
        onSelectAssistant={vi.fn()}
      />
    );

    expect(screen.getByTestId('preset-pill-bare-aionrs')).toBeInTheDocument();
    expect(screen.queryByTestId('btn-add-preset')).not.toBeInTheDocument();
    expect(screen.queryByText('Select an assistant to start a task')).not.toBeInTheDocument();
    expect(screen.queryByText('Try these example prompts:')).not.toBeInTheDocument();
    expect(screen.queryByText('Summarize today')).not.toBeInTheDocument();
  });

  it('moves overflow assistants into a more dropdown', async () => {
    render(
      <AssistantSelectionArea
        selectedAssistantId='bare-aionrs'
        assistants={manyAssistants()}
        localeKey='en-US'
        onSelectAssistant={vi.fn()}
      />
    );

    // Selection lists group by source: CLI (generated) → user → official
    // (builtin). So the top row is [bare-aionrs, user-research, user-review,
    // user-translate] and the official Writer + trailing user-finance overflow.
    expect(screen.getByTestId('preset-pill-bare-aionrs')).toBeInTheDocument();
    expect(screen.getByTestId('preset-pill-user-research')).toBeInTheDocument();
    expect(screen.getByTestId('preset-pill-user-review')).toBeInTheDocument();
    expect(screen.getByTestId('preset-pill-user-translate')).toBeInTheDocument();
    expect(screen.queryByTestId('preset-pill-builtin-writer')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('assistant-more-btn'));

    expect(await screen.findByTestId('assistant-overflow-user-finance')).toBeInTheDocument();
    expect(screen.getByTestId('assistant-overflow-builtin-writer')).toBeInTheDocument();
    expect(screen.queryByTestId('assistant-overflow-bare-aionrs')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-overflow-user-research')).not.toBeInTheDocument();
  });

  it('lays out the overflow dropdown as a grid matching the visible pill count', async () => {
    render(
      <AssistantSelectionArea
        selectedAssistantId='bare-aionrs'
        assistants={manyAssistants()}
        localeKey='en-US'
        onSelectAssistant={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('assistant-more-btn'));

    const panel = await screen.findByTestId('assistant-overflow-panel');
    // jsdom reports a wide window, so the width limit resolves to 4 columns.
    expect(panel.getAttribute('data-overflow-columns')).toBe('4');
    const grid = panel.querySelector<HTMLElement>('.grid');
    expect(grid?.style.gridTemplateColumns).toBe('repeat(4, minmax(0, 1fr))');
  });

  it('narrows the overflow grid together with the visible pill count', async () => {
    render(
      <AssistantSelectionArea
        selectedAssistantId='bare-aionrs'
        assistants={manyAssistants()}
        localeKey='en-US'
        maxVisibleAssistants={2}
        onSelectAssistant={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('assistant-more-btn'));

    const panel = await screen.findByTestId('assistant-overflow-panel');
    expect(panel.getAttribute('data-overflow-columns')).toBe('2');
    const grid = panel.querySelector<HTMLElement>('.grid');
    expect(grid?.style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))');
  });

  it('hides the overflow search until the list exceeds five rows', async () => {
    render(
      <AssistantSelectionArea
        selectedAssistantId='bare-aionrs'
        assistants={manyAssistants()}
        localeKey='en-US'
        onSelectAssistant={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('assistant-more-btn'));

    await screen.findByTestId('assistant-overflow-panel');
    // 2 overflow assistants in 4 columns → 1 row, far below the 5-row threshold.
    expect(screen.queryByPlaceholderText('Search')).not.toBeInTheDocument();
  });

  it('shows the overflow search once the list exceeds five rows', async () => {
    const bulk = Array.from({ length: 25 }, (_, index) =>
      mkAssistant(`user-bulk-${index}`, `Bulk ${index}`, 'user', 'claude', 100 + index)
    );

    render(
      <AssistantSelectionArea
        selectedAssistantId='bare-aionrs'
        assistants={[...manyAssistants(), ...bulk]}
        localeKey='en-US'
        maxVisibleAssistants={1}
        onSelectAssistant={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('assistant-more-btn'));

    await screen.findByTestId('assistant-overflow-panel');
    // 30 overflow assistants in 1 column → 30 rows, search becomes necessary.
    expect(screen.getByPlaceholderText('Search')).toBeInTheDocument();
  });

  it('limits the top assistant row when a smaller visible count is provided', async () => {
    render(
      <AssistantSelectionArea
        selectedAssistantId='bare-aionrs'
        assistants={manyAssistants()}
        localeKey='en-US'
        maxVisibleAssistants={1}
        onSelectAssistant={vi.fn()}
      />
    );

    expect(screen.getByTestId('preset-pill-bare-aionrs')).toBeInTheDocument();
    expect(screen.queryByTestId('preset-pill-user-research')).not.toBeInTheDocument();
    expect(screen.queryByTestId('preset-pill-user-review')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('assistant-more-btn'));

    expect(await screen.findByTestId('assistant-overflow-user-research')).toBeInTheDocument();
    expect(screen.getByTestId('assistant-overflow-user-review')).toBeInTheDocument();
  });

  it('reports the real assistant id when a pill is selected', () => {
    const onSelectAssistant = vi.fn();

    render(
      <AssistantSelectionArea
        selectedAssistantId='bare-aionrs'
        assistants={assistants()}
        localeKey='en-US'
        onSelectAssistant={onSelectAssistant}
      />
    );

    fireEvent.click(screen.getByTestId('preset-pill-builtin-writer'));

    expect(onSelectAssistant).toHaveBeenCalledWith('builtin-writer');
  });

  it('orders assistant pills by group then sort_order before applying overflow', () => {
    render(
      <AssistantSelectionArea
        selectedAssistantId='bare-aionrs'
        assistants={[
          mkAssistant('late', 'Late', 'user', 'claude', 90),
          mkAssistant('early', 'Early', 'user', 'claude', 5),
          ...assistants(),
          mkAssistant('mid', 'Mid', 'user', 'claude', 15),
        ]}
        localeKey='en-US'
        onSelectAssistant={vi.fn()}
      />
    );

    // CLI (generated) first, then user-created by sort_order (Early 5, Mid 15,
    // Late 90); the official Writer sinks to the bottom group and overflows.
    expect(
      screen
        .getAllByRole('button')
        .slice(0, 4)
        .map((node) => node.textContent?.trim())
    ).toEqual(['Aion CLI', 'Early', 'Mid', 'Late']);
  });

  it('keeps a selected overflow assistant visible in the top pill row', () => {
    render(
      <AssistantSelectionArea
        selectedAssistantId='user-finance'
        assistants={manyAssistants()}
        localeKey='en-US'
        onSelectAssistant={vi.fn()}
      />
    );

    // The selected overflow assistant (finance) is pulled into the top row;
    // translate (the last of the visible-4 before pull-in) drops to overflow.
    expect(screen.getByTestId('preset-pill-user-finance')).toBeInTheDocument();
    expect(screen.queryByTestId('preset-pill-user-translate')).not.toBeInTheDocument();
  });

  it('uses the last visible slot for an overflow selection at smaller visible counts', () => {
    render(
      <AssistantSelectionArea
        selectedAssistantId='user-finance'
        assistants={manyAssistants()}
        localeKey='en-US'
        maxVisibleAssistants={2}
        onSelectAssistant={vi.fn()}
      />
    );

    expect(screen.getAllByTestId(/^preset-pill-/).map((node) => node.getAttribute('data-assistant-id'))).toEqual([
      'bare-aionrs',
      'user-finance',
    ]);
    expect(screen.queryByTestId('preset-pill-user-research')).not.toBeInTheDocument();
  });

  it('can re-render from an empty assistant catalog without breaking hook order', () => {
    const { rerender } = render(
      <AssistantSelectionArea
        selectedAssistantId={null}
        assistants={[]}
        localeKey='en-US'
        onSelectAssistant={vi.fn()}
      />
    );

    expect(() =>
      rerender(
        <AssistantSelectionArea
          selectedAssistantId='bare-aionrs'
          assistants={assistants()}
          localeKey='en-US'
          onSelectAssistant={vi.fn()}
        />
      )
    ).not.toThrow();

    expect(screen.getByTestId('preset-pill-bare-aionrs')).toBeInTheDocument();
  });

  /**
   * Measured in the running app at a 1209px window, project home, dark theme.
   * The composer column was 394→772; the hero bar hugged its single visible
   * pill at 470→696 and painted `--color-guid-agent-bar` (#1e2536) — a third
   * surface, matching neither the composer below it (#161c27) nor the card
   * around it (#232324). Stranded in 378px of card, that reads as a floating
   * island rather than part of the composer.
   *
   * jsdom gives every element a zero width, so the span itself cannot be
   * asserted here; the classes and the surface variable that produce it can.
   * That is weaker than a rendered measurement and is the strongest guard
   * this layer offers.
   */
  const renderBar = (variant?: 'hero' | 'inline') => {
    const { container } = render(
      <AssistantSelectionArea
        selectedAssistantId='bare-aionrs'
        assistants={assistants()}
        localeKey='en-US'
        variant={variant}
        onSelectAssistant={vi.fn()}
      />
    );

    const bar = container.querySelector<HTMLElement>('[data-assistant-bar-variant]');
    if (!bar) throw new Error('assistant bar not rendered');
    return { bar, row: bar.parentElement as HTMLElement, outer: bar.parentElement?.parentElement as HTMLElement };
  };

  it('defaults to the hero bar: hugs its pills, centres, and keeps its own surface', () => {
    const { bar, row } = renderBar();

    expect(bar.dataset.assistantBarVariant).toBe('hero');
    // classList, not a substring match: `max-w-full` contains `w-full`.
    expect(bar.classList.contains('inline-flex')).toBe(true);
    expect(bar.classList.contains('w-full')).toBe(false);
    expect(row.classList.contains('justify-center')).toBe(true);
    expect(bar.style.background).toBe('var(--color-guid-agent-bar, var(--aou-2))');
  });

  it('spans the full column on the inline surface so it lines up with the composer beneath it', () => {
    const { bar, row } = renderBar('inline');

    expect(bar.classList.contains('w-full')).toBe(true);
    expect(bar.classList.contains('inline-flex')).toBe(false);
    expect(row.classList.contains('justify-center')).toBe(false);
    // `w-full` alone is not enough: the bar is a flex item, and `min-width: auto`
    // lets it grow past the column to its content's min-content width. Measured
    // at an 880px window, where the project-home grid crushes this card to 43px,
    // the bar sat at 394→449 against a 394→437 composer until these were added.
    expect(bar.classList.contains('min-w-0')).toBe(true);
    expect(bar.classList.contains('max-w-full')).toBe(true);
    // Same variable the composer shell paints itself with (`.guidInputCardWrap`),
    // so the bar and the input read as one control instead of two surfaces.
    expect(bar.style.background).toBe('var(--bg-2)');
  });

  it('drops the hero top margin inline, where the card body already provides the gap', () => {
    expect(renderBar('inline').outer.classList.contains('mt-18px')).toBe(false);
    expect(renderBar().outer.classList.contains('mt-18px')).toBe(true);
  });
});

function assistants(): Assistant[] {
  return [
    {
      id: 'bare-aionrs',
      source: 'generated',
      name: 'Aion CLI',
      name_i18n: {},
      description_i18n: {},
      enabled: true,
      sort_order: 10,
      preset_agent_type: 'aionrs',
      enabled_skills: [],
      custom_skill_names: [],
      disabled_builtin_skills: [],
      context_i18n: {},
      prompts: ['Summarize today'],
      prompts_i18n: {},
      models: [],
      agent_status: 'online',
      team_selectable: true,
      deletable: false,
    },
    {
      id: 'builtin-writer',
      source: 'builtin',
      name: 'Writer',
      name_i18n: {},
      description_i18n: {},
      enabled: true,
      sort_order: 20,
      preset_agent_type: 'claude',
      enabled_skills: [],
      custom_skill_names: [],
      disabled_builtin_skills: [],
      context_i18n: {},
      prompts: ['Draft a post'],
      prompts_i18n: {},
      models: [],
      agent_status: 'online',
      team_selectable: true,
      deletable: false,
    },
  ];
}

function manyAssistants(): Assistant[] {
  return [
    ...assistants(),
    mkAssistant('user-research', 'Researcher', 'user', 'gemini', 30),
    mkAssistant('user-review', 'Reviewer', 'user', 'codex', 40),
    mkAssistant('user-translate', 'Translator', 'user', 'qwen', 50),
    mkAssistant('user-finance', 'Finance', 'user', 'claude', 60),
  ];
}

function mkAssistant(
  id: string,
  name: string,
  source: Assistant['source'],
  preset_agent_type: string,
  sort_order: number
): Assistant {
  return {
    id,
    source,
    name,
    name_i18n: {},
    description_i18n: {},
    enabled: true,
    sort_order,
    preset_agent_type,
    enabled_skills: [],
    custom_skill_names: [],
    disabled_builtin_skills: [],
    context_i18n: {},
    prompts: [],
    prompts_i18n: {},
    models: [],
    agent_status: 'online',
    team_selectable: true,
    deletable: source === 'user',
  };
}
