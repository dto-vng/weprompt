/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StudioRouteCatalog, StudioRouteCatalogEntry } from '@/common/types/project/creativeStudioTypes';
import { StudioModelBar, type StudioModelBarProps } from '@renderer/pages/studio/components/Models/StudioModelBar';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

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
    options: [
      {
        providerId: 'story-provider',
        providerName: 'Story Provider',
        model: 'story-model',
        health: 'available',
      },
    ],
  },
  image: { status: 'selection_required', selected: null, selectedRoute: null, options: [mediaRoute('image')] },
  video: { status: 'selection_required', selected: null, selectedRoute: null, options: [mediaRoute('video')] },
  catalogVersion: 'catalog-1',
  ...overrides,
});

const props = (overrides: Partial<StudioModelBarProps> = {}): StudioModelBarProps => ({
  catalog: catalog(),
  loading: false,
  errorMessageKey: null,
  pendingRole: null,
  disabled: false,
  onRefresh: vi.fn(),
  onSelectionChange: vi.fn(),
  onOpenSettings: vi.fn(),
  ...overrides,
});

describe('StudioModelBar', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders three labeled selectors with sanitized model and provider labels', async () => {
    render(<StudioModelBar {...props()} />);

    const storyboard = screen.getByLabelText('conversation.creativeStudio.models.storyboard');
    const image = screen.getByLabelText('conversation.creativeStudio.models.image');
    const video = screen.getByLabelText('conversation.creativeStudio.models.video');
    expect(storyboard).toBeInTheDocument();
    expect(image).toBeInTheDocument();
    expect(video).toBeInTheDocument();
    expect(storyboard.closest('label')).toBeNull();
    expect(image.closest('label')).toBeNull();
    expect(video.closest('label')).toBeNull();

    fireEvent.click(image);
    expect(await screen.findByText(/image-model · image Provider/)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('weprompt-image-v1');
  });

  it('marks a sole option as suggested without selecting it automatically', async () => {
    render(<StudioModelBar {...props()} />);
    const storyboard = screen.getByLabelText('conversation.creativeStudio.models.storyboard');

    expect(storyboard).not.toHaveTextContent('story-model');
    fireEvent.click(storyboard);
    const option = (await screen.findByText(/story-model · Story Provider/)).closest('[role=option]');
    expect(option).toHaveTextContent('conversation.creativeStudio.models.suggested');
  });

  it('keeps an unavailable persisted selection visible with a safe provider fallback', () => {
    render(
      <StudioModelBar
        {...props({
          catalog: catalog({
            storyboard: {
              status: 'unavailable',
              selected: { providerId: 'missing-provider', model: 'retired-model' },
              options: [],
            },
          }),
        })}
      />
    );

    expect(screen.getByLabelText('conversation.creativeStudio.models.storyboard')).toHaveTextContent(
      'retired-model · missing-provider'
    );
    expect(document.body).toHaveTextContent('conversation.creativeStudio.models.unavailable');
  });

  it('consolidates an all-setup-required catalog into one Settings action', () => {
    const onOpenSettings = vi.fn();
    render(
      <StudioModelBar
        {...props({
          catalog: catalog({
            storyboard: { status: 'setup_required', selected: null, options: [] },
            image: { status: 'setup_required', selected: null, options: [] },
            video: { status: 'setup_required', selected: null, options: [] },
          }),
          onOpenSettings,
        })}
      />
    );

    const settingsActions = screen.getAllByRole('button', {
      name: 'conversation.creativeStudio.models.openSettings',
    });
    expect(settingsActions).toHaveLength(1);
    expect(screen.getByLabelText('conversation.creativeStudio.models.storyboard')).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByLabelText('conversation.creativeStudio.models.image')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByLabelText('conversation.creativeStudio.models.video')).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(settingsActions[0]!);
    expect(onOpenSettings).toHaveBeenCalledExactlyOnceWith('/settings/model');
  });

  it('keeps configured model selectors usable when another role needs setup', () => {
    render(
      <StudioModelBar
        {...props({
          catalog: catalog({
            storyboard: { status: 'setup_required', selected: null, options: [] },
          }),
        })}
      />
    );

    expect(screen.getAllByRole('button', { name: 'conversation.creativeStudio.models.openSettings' })).toHaveLength(1);
    expect(screen.getByLabelText('conversation.creativeStudio.models.storyboard')).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByLabelText('conversation.creativeStudio.models.image')).not.toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('emits only a role-compatible route and disables the pending role', async () => {
    const onSelectionChange = vi.fn();
    render(<StudioModelBar {...props({ pendingRole: 'video', onSelectionChange })} />);

    expect(screen.getByLabelText('conversation.creativeStudio.models.video')).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(screen.getByLabelText('conversation.creativeStudio.models.image'));
    const listbox = await screen.findByRole('listbox');
    fireEvent.click(within(listbox).getByText(/image-model · image Provider/));

    expect(onSelectionChange).toHaveBeenCalledExactlyOnceWith({
      role: 'image',
      selection: {
        choiceId: 'choice_image',
      },
    });
    expect(onSelectionChange).not.toHaveBeenCalledWith(
      expect.objectContaining({ role: 'image', selection: expect.objectContaining({ model: 'video-model' }) })
    );
  });
});
