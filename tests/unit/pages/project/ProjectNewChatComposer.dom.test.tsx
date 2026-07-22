/**
 * @vitest-environment jsdom
 */

import type { ForgeProject } from '@/common/types/project/projectTypes';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.fn();
const setSelectedAssistantIdMock = vi.fn();

vi.mock('react-i18next', () => ({
  // i18n.language is required alongside t: the component resolves localeKey
  // from it (mirrors GuidPage), so the stub must include it too.
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

// Avoids the real hook's SWR-backed assistant fetch + configService read —
// this test only needs a fixed selection to assert the handoff payload.
vi.mock('@renderer/pages/guid/hooks/useGuidAssistantSelection', () => ({
  useGuidAssistantSelection: () => ({
    selectedAssistantId: 'asst-1',
    assistants: [],
    setSelectedAssistantId: setSelectedAssistantIdMock,
  }),
}));

// Trivial stub — real AssistantSelectionArea has its own dedicated test
// suite (tests/unit/settings/AssistantSelectionArea.dom.test.tsx). This stub
// still surfaces the props it received and a way to trigger
// `onSelectAssistant`, so this test can guard the wiring between the
// composer and the picker without exercising the real component's
// search/dropdown internals.
vi.mock('@renderer/pages/guid/components/AssistantSelectionArea', () => ({
  default: ({
    selectedAssistantId,
    localeKey,
    onSelectAssistant,
  }: {
    selectedAssistantId?: string | null;
    localeKey: string;
    onSelectAssistant: (assistantId: string) => void;
  }) => (
    <button
      type='button'
      data-testid='assistant-selection-area-stub'
      data-selected-assistant-id={selectedAssistantId ?? ''}
      data-locale-key={localeKey}
      onClick={() => onSelectAssistant('asst-2')}
    >
      assistant-selector
    </button>
  ),
}));

import ProjectNewChatComposer from '@renderer/pages/project/components/ProjectNewChatComposer';

const project: ForgeProject = {
  id: 'p1',
  name: 'Alpha Project',
  workspace: '/w/alpha',
  created_at: 1,
  updated_at: 1,
};

describe('ProjectNewChatComposer', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    setSelectedAssistantIdMock.mockReset();
  });

  it('disables submit when the input is empty', () => {
    render(<ProjectNewChatComposer project={project} />);

    expect(screen.getByTestId('project-composer-submit')).toBeDisabled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('stays disabled for whitespace-only input', () => {
    render(<ProjectNewChatComposer project={project} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } });

    expect(screen.getByTestId('project-composer-submit')).toBeDisabled();
  });

  it('hands off to the Guid create flow with the scoped state on submit, then clears the draft', () => {
    render(<ProjectNewChatComposer project={project} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Summarize the README' } });
    expect(screen.getByTestId('project-composer-submit')).not.toBeDisabled();

    fireEvent.click(screen.getByTestId('project-composer-submit'));

    expect(navigateMock).toHaveBeenCalledExactlyOnceWith('/guid', {
      state: {
        workspace: '/w/alpha',
        projectId: 'p1',
        prefillPrompt: 'Summarize the README',
        selectedAssistantId: 'asst-1',
      },
    });
    expect(screen.getByRole('textbox')).toHaveValue('');
  });

  it('passes the current selection down to the assistant picker and forwards its selection changes', () => {
    render(<ProjectNewChatComposer project={project} />);

    const picker = screen.getByTestId('assistant-selection-area-stub');
    expect(picker).toHaveAttribute('data-selected-assistant-id', 'asst-1');
    expect(picker).toHaveAttribute('data-locale-key', 'en-US');

    fireEvent.click(picker);

    expect(setSelectedAssistantIdMock).toHaveBeenCalledExactlyOnceWith('asst-2');
  });

  it('submits on Cmd/Ctrl+Enter from the textarea', () => {
    render(<ProjectNewChatComposer project={project} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Draft the release notes' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', ctrlKey: true });

    expect(navigateMock).toHaveBeenCalledExactlyOnceWith('/guid', {
      state: {
        workspace: '/w/alpha',
        projectId: 'p1',
        prefillPrompt: 'Draft the release notes',
        selectedAssistantId: 'asst-1',
      },
    });
  });
});
