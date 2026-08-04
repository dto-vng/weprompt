/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { StudioRouteCatalog } from '@/common/types/project/creativeStudioTypes';
import { AssistantDock } from '@renderer/pages/studio/components/PhaseShell/AssistantDock';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const readyStoryboard: StudioRouteCatalog['storyboard'] = {
  status: 'ready',
  selected: { providerId: 'story-provider', model: 'planner-model' },
  options: [
    {
      providerId: 'story-provider',
      providerName: 'Storyboard Provider',
      model: 'planner-model',
      health: 'available',
    },
  ],
};

describe('AssistantDock', () => {
  it('shows truthful configured model status and one draft action in the inline presentation', () => {
    const onDraftStoryboard = vi.fn();
    render(
      <AssistantDock
        kind='write'
        layoutMode='inline'
        drawerVisible={false}
        storyboard={readyStoryboard}
        catalogLoading={false}
        drafting={false}
        disabled={false}
        onOpenChange={vi.fn()}
        onDraftStoryboard={onDraftStoryboard}
      />
    );

    const assistant = screen.getByRole('complementary', {
      name: 'conversation.creativeStudio.phase.write.assistantTitle',
    });
    expect(within(assistant).getByText('conversation.creativeStudio.draft.ready')).toBeInTheDocument();
    expect(within(assistant).getByText('Storyboard Provider')).toBeInTheDocument();
    expect(within(assistant).getByText('planner-model')).toBeInTheDocument();
    expect(
      within(assistant).getByText('conversation.creativeStudio.phase.write.textChargeDisclosure')
    ).toBeInTheDocument();

    fireEvent.click(
      within(assistant).getByRole('button', {
        name: 'conversation.creativeStudio.phase.write.draftStoryboard',
      })
    );
    expect(onDraftStoryboard).toHaveBeenCalledOnce();
    expect(within(assistant).queryByText(/apply|discard|undo|quick reply|proposal history/i)).not.toBeInTheDocument();
  });

  it('uses one controlled Drawer in compact mode and opens it from Ask assistant', () => {
    const onOpenChange = vi.fn();
    const props = {
      kind: 'write' as const,
      layoutMode: 'drawer' as const,
      drawerVisible: false,
      storyboard: readyStoryboard,
      catalogLoading: false,
      drafting: false,
      disabled: false,
      onOpenChange,
      onDraftStoryboard: vi.fn(),
    };
    const view = render(<AssistantDock {...props} />);

    expect(document.querySelector('.arco-drawer')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'conversation.creativeStudio.phase.write.askAssistant',
      })
    );
    expect(onOpenChange).toHaveBeenCalledWith(true);

    view.rerender(<AssistantDock {...props} drawerVisible />);
    const drawers = document.querySelectorAll('.arco-drawer');
    expect(drawers).toHaveLength(1);
    expect(
      within(drawers[0] as HTMLElement).getByText('conversation.creativeStudio.phase.write.textChargeDisclosure')
    ).toBeInTheDocument();
  });

  it.each(['setup_required', 'unavailable'] as const)(
    'reports %s storyboard readiness without authorizing a draft',
    (status) => {
      render(
        <AssistantDock
          kind='write'
          layoutMode='inline'
          drawerVisible={false}
          storyboard={{ status, selected: null, options: [] }}
          catalogLoading={false}
          drafting={false}
          disabled={false}
          onOpenChange={vi.fn()}
          onDraftStoryboard={vi.fn()}
        />
      );

      expect(
        screen.getByText(
          status === 'setup_required'
            ? 'conversation.creativeStudio.draft.setupRequired'
            : 'conversation.creativeStudio.draft.unavailable'
        )
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'conversation.creativeStudio.phase.write.draftStoryboard' })
      ).toBeDisabled();
    }
  );
});
