/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { StudioRendererProject } from '@/common/types/project/creativeStudioTypes';
import { StudioPhaseHeader } from '@renderer/pages/studio/components/PhaseShell/StudioPhaseHeader';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const project: StudioRendererProject = {
  schemaVersion: 1,
  revision: 2,
  id: 'project-1',
  name: 'Launch film',
  brief: 'A short launch video',
  aspectRatio: '16:9',
  targetDurationSeconds: 15,
  resolution: '720p',
  sceneOrder: [],
  scenes: {},
  assets: {},
  jobs: {},
  routing: { storyboard: null, image: null, video: null },
  createdAt: '2026-07-30T00:00:00.000Z',
  updatedAt: '2026-07-30T00:00:00.000Z',
};

describe('StudioPhaseHeader', () => {
  it('keeps the project breadcrumb and renders only the active phase action slot', () => {
    render(<StudioPhaseHeader project={project} onBack={vi.fn()} actions={<span>phase action</span>} />);

    expect(screen.getByRole('navigation', { name: 'conversation.creativeStudio.project.backToLibrary' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: 'Launch film' })).toBeVisible();
    expect(screen.getByText('phase action')).toBeVisible();
    expect(screen.queryByText('conversation.creativeStudio.project.readiness')).not.toBeInTheDocument();
  });

  it('omits the action container when the active phase has no page-level action', () => {
    const { container } = render(<StudioPhaseHeader project={project} onBack={vi.fn()} />);

    expect(container.querySelector('[data-studio-phase-actions]')).toBeNull();
  });
});
