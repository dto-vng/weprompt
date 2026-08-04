/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StudioRouteCatalog, StudioRouteCatalogEntry } from '@/common/types/project/creativeStudioTypes';
import { StudioModelBar, type StudioModelBarProps } from '@renderer/pages/studio/components/Models/StudioModelBar';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values
        ? `${key}:${Object.entries(values)
            .map(([name, value]) => `${name}=${String(value)}`)
            .join(',')}`
        : key,
  }),
}));

const mediaRoute = (
  kind: 'image' | 'video',
  overrides: Partial<StudioRouteCatalogEntry> = {}
): StudioRouteCatalogEntry => ({
  choiceId: `choice_${kind}`,
  providerId: `${kind}-provider`,
  providerName: `${kind} Provider`,
  model: `${kind}-model`,
  health: 'available',
  kind,
  constraints: {
    aspectRatios: ['16:9'],
    resolutions: ['720p'],
    minDurationSeconds: 1,
    maxDurationSeconds: 60,
    supportsFirstFrame: true,
    silentOutput: true,
  },
  ...overrides,
});

const catalog = (overrides: Partial<StudioRouteCatalog> = {}): StudioRouteCatalog => ({
  storyboard: {
    status: 'selection_required',
    selected: null,
    options: [],
  },
  image: { status: 'selection_required', selected: null, selectedRoute: null, options: [mediaRoute('image')] },
  video: { status: 'selection_required', selected: null, selectedRoute: null, options: [mediaRoute('video')] },
  catalogVersion: 'catalog-1',
  ...overrides,
});

const props = (overrides: Partial<StudioModelBarProps> = {}): StudioModelBarProps => ({
  catalog: catalog(),
  disabled: false,
  onOpenSettings: vi.fn(),
  ...overrides,
});

describe('StudioModelBar', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not turn available options into implicit project selections', () => {
    const { container } = render(<StudioModelBar {...props()} />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('shows only real ready selected routes and their contract duration', () => {
    const selected = mediaRoute('image', {
      model: 'selected-image-model',
      constraints: { ...mediaRoute('image').constraints, maxDurationSeconds: 47 },
    });
    render(
      <StudioModelBar
        {...props({
          catalog: catalog({
            image: {
              status: 'ready',
              selected: { choiceId: selected.choiceId, providerId: selected.providerId, model: selected.model },
              selectedRoute: selected,
              options: [selected, mediaRoute('image', { choiceId: 'unused', model: 'unused-option' })],
            },
          }),
        })}
      />
    );

    expect(screen.getByText(/model=selected-image-model/)).toBeVisible();
    expect(screen.getByText(/seconds=47/)).toBeVisible();
    expect(screen.queryByText(/unused-option/)).not.toBeInTheDocument();
  });

  it('opens the existing Model Settings surface from Change engines', () => {
    const onOpenSettings = vi.fn();
    const selected = mediaRoute('video');
    render(
      <StudioModelBar
        {...props({
          catalog: catalog({
            video: {
              status: 'ready',
              selected: { choiceId: selected.choiceId, providerId: selected.providerId, model: selected.model },
              selectedRoute: selected,
              options: [selected],
            },
          }),
          onOpenSettings,
        })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'conversation.creativeStudio.phase.produce.changeEngines' }));

    expect(onOpenSettings).toHaveBeenCalledExactlyOnceWith('/settings/model');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
