/**
 * @vitest-environment jsdom
 */

import type { ForgeProject } from '@/common/types/project/projectTypes';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.fn();
const setSelectedAssistantIdMock = vi.fn();
const sendMessageHandlerMock = vi.fn();
const capturedGuidSendDeps: Array<Record<string, unknown>> = [];

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
// this test only needs a fixed selection to assert the deps handed to
// useGuidSend.
vi.mock('@renderer/pages/guid/hooks/useGuidAssistantSelection', () => ({
  useGuidAssistantSelection: () => ({
    selectedAssistantId: 'asst-1',
    assistants: [],
    selectedAssistant: undefined,
    setSelectedAssistantId: setSelectedAssistantIdMock,
    selectedAssistantBackend: 'aionrs',
    selectedMode: 'default',
    selectedAcpModel: null,
    selectedThoughtLevelValue: '',
    currentAcpCachedModelInfo: null,
  }),
}));

// Avoids the real hook's SWR-backed provider list + Google Auth status
// checks — this test only needs a fixed model to assert the deps handed to
// useGuidSend.
vi.mock('@renderer/pages/guid/hooks/useGuidModelSelection', () => ({
  useGuidModelSelection: () => ({
    modelList: [],
    isGoogleAuth: false,
    formatGeminiModelLabel: () => '',
    current_model: { id: 'provider-1', name: 'Provider', models: ['model-a'], use_model: 'model-a', enabled: true },
    setCurrentModel: vi.fn(),
    resetCurrentModel: vi.fn(),
  }),
}));

// useGuidInput itself runs for real (plain input/dir/projectId state plus a
// locationState-seeding effect) so this test can exercise real typing and
// confirm the project's workspace/id actually reach useGuidSend. Its drag +
// paste sub-hooks are stubbed exactly like useGuidInput's own dom test does,
// since this suite has no file-upload UI to exercise.
vi.mock('@/renderer/hooks/file/useDragUpload', () => ({
  useDragUpload: () => ({ isFileDragging: false, dragHandlers: {} }),
}));

vi.mock('@/renderer/hooks/file/usePasteService', () => ({
  usePasteService: () => ({ onPaste: vi.fn(), onFocus: vi.fn() }),
}));

// Stubs the real create+navigate implementation (already covered by
// useGuidSend.dom.test.ts) so this suite only has to assert the composer
// wires the submit button / Cmd+Enter shortcut to `sendMessageHandler` and
// forwards project-scoped deps — it must NOT assert a `/guid` handoff.
vi.mock('@renderer/pages/guid/hooks/useGuidSend', () => ({
  useGuidSend: (deps: Record<string, unknown>) => {
    capturedGuidSendDeps.push(deps);
    return {
      handleSend: vi.fn(),
      sendMessageHandler: sendMessageHandlerMock,
      isButtonDisabled: !(deps.input as string).trim(),
    };
  },
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
    sendMessageHandlerMock.mockReset();
    capturedGuidSendDeps.length = 0;
  });

  it('disables submit when the input is empty', () => {
    render(<ProjectNewChatComposer project={project} />);

    expect(screen.getByTestId('project-composer-submit')).toBeDisabled();
    expect(sendMessageHandlerMock).not.toHaveBeenCalled();
  });

  it('stays disabled for whitespace-only input', () => {
    render(<ProjectNewChatComposer project={project} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } });

    expect(screen.getByTestId('project-composer-submit')).toBeDisabled();
  });

  it('creates the conversation in place via useGuidSend, scoped to the project, instead of handing off to /guid', () => {
    render(<ProjectNewChatComposer project={project} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Summarize the README' } });
    expect(screen.getByTestId('project-composer-submit')).not.toBeDisabled();

    fireEvent.click(screen.getByTestId('project-composer-submit'));

    expect(sendMessageHandlerMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).not.toHaveBeenCalled();

    const latestDeps = capturedGuidSendDeps.at(-1);
    expect(latestDeps).toMatchObject({
      input: 'Summarize the README',
      dir: '/w/alpha',
      projectId: 'p1',
      selectedAssistantId: 'asst-1',
    });
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

    expect(sendMessageHandlerMock).toHaveBeenCalledTimes(1);
  });

  it('does not submit on Cmd/Ctrl+Enter when the input is empty', () => {
    render(<ProjectNewChatComposer project={project} />);

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', ctrlKey: true });

    expect(sendMessageHandlerMock).not.toHaveBeenCalled();
  });
});
