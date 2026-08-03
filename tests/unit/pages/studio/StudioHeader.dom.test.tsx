/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { StudioRendererProject, StudioRouteCatalog } from '@/common/types/project/creativeStudioTypes';
import { StudioHeader, type StudioHeaderProps } from '@renderer/pages/studio/components/StudioHeader';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const project = (sceneOrder: string[] = []): StudioRendererProject => ({
  schemaVersion: 1,
  revision: 2,
  id: 'project-1',
  name: 'Launch film',
  brief: 'A short launch video',
  aspectRatio: '16:9',
  targetDurationSeconds: 15,
  resolution: '720p',
  sceneOrder,
  scenes: {},
  assets: {},
  jobs: {},
  routing: { storyboard: null, image: null, video: null },
  createdAt: '2026-07-30T00:00:00.000Z',
  updatedAt: '2026-07-30T00:00:00.000Z',
});

const storyboard = (overrides: Partial<StudioRouteCatalog['storyboard']> = {}): StudioRouteCatalog['storyboard'] => ({
  status: 'ready',
  selected: { providerId: 'provider-1', model: 'story-model' },
  options: [{ providerId: 'provider-1', providerName: 'Provider', model: 'story-model', health: 'available' }],
  ...overrides,
});

const props = (overrides: Partial<StudioHeaderProps> = {}): StudioHeaderProps => ({
  project: project(),
  storyboard: storyboard(),
  catalogLoading: false,
  catalogErrorMessageKey: null,
  drafting: false,
  onBack: vi.fn(),
  onOpenDraft: vi.fn(),
  ...overrides,
});

describe('StudioHeader', () => {
  it('disables drafting until an explicit Storyboard selection is ready', () => {
    render(<StudioHeader {...props({ storyboard: storyboard({ status: 'selection_required', selected: null }) })} />);

    expect(screen.getByRole('button', { name: 'conversation.creativeStudio.draft.action' })).toBeDisabled();
  });

  it('keeps Draft storyboard primary for an empty ready project', () => {
    render(<StudioHeader {...props()} />);

    expect(screen.getByRole('button', { name: 'conversation.creativeStudio.draft.action' })).toHaveClass(
      'arco-btn-primary'
    );
  });

  it('uses a secondary Redraft storyboard action for an existing storyboard', () => {
    render(<StudioHeader {...props({ project: project(['scene-1']) })} />);

    expect(screen.getByRole('button', { name: 'conversation.creativeStudio.draft.redraftAction' })).not.toHaveClass(
      'arco-btn-primary'
    );
  });
});
