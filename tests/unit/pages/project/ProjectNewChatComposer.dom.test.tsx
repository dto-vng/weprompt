/**
 * @vitest-environment jsdom
 */

import type { IMcpServer } from '@/common/config/storage';
import type { ForgeProject } from '@/common/types/project/projectTypes';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock(...) calls below are hoisted above these bindings (and even above
// this file's own top-level imports — native ESM import evaluation runs
// before local top-level statements). A plain `const` here would still be in
// its temporal dead zone when a hoisted factory that captures it by value
// (not behind a nested closure) runs, so every mock referenced directly
// inside a factory body is declared via `vi.hoisted` instead, matching
// guidPage.dom.test.tsx's own pattern for the same reason.
const {
  navigateMock,
  setSelectedAssistantIdMock,
  setSelectedModeMock,
  setSelectedAcpModelMock,
  setSelectedThoughtLevelValueMock,
  sendMessageHandlerMock,
  capturedGuidSendDeps,
  listAvailableSkillsMock,
  ensureBackendMcpCatalogMock,
  useSWRMock,
} = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  setSelectedAssistantIdMock: vi.fn(),
  setSelectedModeMock: vi.fn(),
  setSelectedAcpModelMock: vi.fn(),
  setSelectedThoughtLevelValueMock: vi.fn(),
  sendMessageHandlerMock: vi.fn(),
  capturedGuidSendDeps: [] as Array<Record<string, unknown>>,
  listAvailableSkillsMock: vi.fn().mockResolvedValue([] as unknown[]),
  ensureBackendMcpCatalogMock: vi.fn().mockResolvedValue({ allServers: [] as unknown[] }),
  useSWRMock: vi.fn().mockReturnValue({ data: null as unknown }),
}));

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

// The composer now loads the skill catalog and resolves an assistant-detail
// SWR key exactly like GuidPage does (see guidPage.dom.test.tsx, which this
// file's mocking strategy mirrors). Only the two ipcBridge namespaces the
// composer itself calls need stubbing — everything else it depends on
// (useGuidInput's FileService/caret utils) reaches a different, unmocked
// module path (@/common/adapter/httpBridge, @/common/config/constants), so
// replacing the bare '@/common' module here doesn't affect them.
vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      listAvailableSkills: { invoke: listAvailableSkillsMock },
    },
    assistants: {
      get: { invoke: vi.fn().mockResolvedValue(null) },
    },
  },
}));

vi.mock('@/renderer/hooks/mcp/catalog', () => ({
  ensureBackendMcpCatalog: ensureBackendMcpCatalogMock,
}));

vi.mock('@/renderer/hooks/chat/useInputFocusRing', () => ({
  useInputFocusRing: () => ({
    activeBorderColor: '#000',
    inactiveBorderColor: '#ccc',
    activeShadow: 'none',
  }),
}));

// Controls the assistant-detail fetch the composer keys off
// `guid.assistant.detail.<id>.<locale>` — kept at `{ data: null }` for most
// tests so `resolveGuidAssistantDefaults` (left un-mocked; it's a pure
// function) resolves to its all-empty shape.
vi.mock('swr', async () => {
  const actual = await vi.importActual<typeof import('swr')>('swr');
  return {
    ...actual,
    default: (...args: Parameters<typeof useSWRMock>) => useSWRMock(...args),
    mutate: vi.fn(),
  };
});

// Avoids the real hook's SWR-backed assistant fetch + configService read —
// this test only needs a fixed selection to assert the deps handed to
// useGuidSend and the derived setters forwarded to the model/mode pickers.
vi.mock('@renderer/pages/guid/hooks/useGuidAssistantSelection', () => ({
  useGuidAssistantSelection: () => ({
    selectedAssistantId: 'asst-1',
    assistants: [],
    selectedAssistant: undefined,
    setSelectedAssistantId: setSelectedAssistantIdMock,
    selectedAssistantBackend: 'aionrs',
    selectedMode: 'default',
    setSelectedMode: setSelectedModeMock,
    selectedAcpModel: null,
    setSelectedAcpModel: setSelectedAcpModelMock,
    selectedThoughtLevelValue: '',
    setSelectedThoughtLevelValue: setSelectedThoughtLevelValueMock,
    currentAcpCachedModelInfo: null,
    currentAgentAvailableCommands: [],
    currentAgentModeOptions: [],
    currentThoughtLevelOption: null,
  }),
}));

// Avoids the real hook's SWR-backed provider list + Google Auth status
// checks — this test only needs a fixed model to assert the deps handed to
// useGuidSend and the model picker.
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
// wires the submit button / Enter shortcut to `sendMessageHandler` and
// forwards project-scoped + assistant-default deps — it must NOT assert a
// `/guid` handoff.
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

// Trivial stub — real GuidModelSelector has its own dedicated test suite
// (tests/unit/renderer/hooks/guidModelSelector.dom.test.tsx). This test only
// needs to confirm the model picker renders on this surface (full parity
// with GuidPage's composer).
vi.mock('@renderer/pages/guid/components/GuidModelSelector', () => ({
  default: () => <div data-testid='guid-model-selector' />,
}));

// Stub — the real GuidActionRow (its "+" dropdown with files/skills/MCP
// submenus, mode selector, and send button) is exercised by GuidPage's own
// tests. This composer only needs to confirm: the tools/MCP control and the
// model-selector node it's handed both render, and that its onSend/
// onToggleSkill/onToggleMcpServer callbacks are the ones actually wired to
// this composer's state — asserted below via real button clicks (not by
// extracting and invoking captured props directly) so the interactions stay
// wrapped in Testing Library's `act`.
vi.mock('@renderer/pages/guid/components/GuidActionRow', () => ({
  default: (props: Record<string, unknown>) => {
    const allSkills = (props.allSkills as Array<{ name: string; isAuto: boolean }>) ?? [];
    const mcpServers = (props.mcpServers as Array<{ id: string }>) ?? [];
    return (
      <div data-testid='guid-action-row'>
        {props.modelSelectorNode as React.ReactNode}
        <div data-testid='guid-tools-mcp-control'>
          {allSkills.map((skill) => (
            <button
              key={skill.name}
              type='button'
              data-testid={`toggle-skill-${skill.name}`}
              onClick={() => (props.onToggleSkill as (name: string, isAuto: boolean) => void)(skill.name, skill.isAuto)}
            >
              {skill.name}
            </button>
          ))}
          {mcpServers.map((server) => (
            <button
              key={server.id}
              type='button'
              data-testid={`toggle-mcp-${server.id}`}
              onClick={() => (props.onToggleMcpServer as (id: string) => void)(server.id)}
            >
              {server.id}
            </button>
          ))}
        </div>
        <button
          type='button'
          data-testid='guid-send-btn'
          disabled={props.isButtonDisabled as boolean}
          onClick={props.onSend as () => void}
        >
          send
        </button>
      </div>
    );
  },
}));

// Stub — real GuidInputCard (workspace footnote, file previews, drag
// styling) has its own dedicated test suite
// (tests/unit/renderer/GuidInputCard.dom.test.tsx). This composer only
// needs a real, controlled textarea wired to the composer's input/keydown
// handlers, plus its actionRow rendered in place.
vi.mock('@renderer/pages/guid/components/GuidInputCard', () => ({
  default: (props: Record<string, unknown>) => (
    <div data-testid='guid-input-card'>
      <textarea
        value={props.input as string}
        onChange={(event) => (props.onInputChange as (value: string) => void)(event.target.value)}
        onKeyDown={props.onKeyDown as React.KeyboardEventHandler<HTMLTextAreaElement>}
      />
      {props.actionRow as React.ReactNode}
    </div>
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
    setSelectedModeMock.mockReset();
    setSelectedAcpModelMock.mockReset();
    setSelectedThoughtLevelValueMock.mockReset();
    sendMessageHandlerMock.mockReset();
    capturedGuidSendDeps.length = 0;
    listAvailableSkillsMock.mockReset().mockResolvedValue([]);
    ensureBackendMcpCatalogMock.mockReset().mockResolvedValue({ allServers: [] });
    useSWRMock.mockReset().mockReturnValue({ data: null });
  });

  it('disables submit when the input is empty', () => {
    render(<ProjectNewChatComposer project={project} />);

    expect(screen.getByTestId('guid-send-btn')).toBeDisabled();
    expect(sendMessageHandlerMock).not.toHaveBeenCalled();
  });

  it('stays disabled for whitespace-only input', () => {
    render(<ProjectNewChatComposer project={project} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } });

    expect(screen.getByTestId('guid-send-btn')).toBeDisabled();
  });

  it('renders the model picker and the tools/MCP control, matching the main new-chat composer', () => {
    render(<ProjectNewChatComposer project={project} />);

    expect(screen.getByTestId('guid-model-selector')).toBeInTheDocument();
    expect(screen.getByTestId('guid-tools-mcp-control')).toBeInTheDocument();
  });

  it('creates the conversation in place via useGuidSend, scoped to the project, instead of handing off to /guid', () => {
    render(<ProjectNewChatComposer project={project} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Summarize the README' } });
    expect(screen.getByTestId('guid-send-btn')).not.toBeDisabled();

    fireEvent.click(screen.getByTestId('guid-send-btn'));

    expect(sendMessageHandlerMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).not.toHaveBeenCalled();

    const latestDeps = capturedGuidSendDeps.at(-1);
    expect(latestDeps).toMatchObject({
      input: 'Summarize the README',
      dir: '/w/alpha',
      projectId: 'p1',
      selectedAssistantId: 'asst-1',
      // The real model/skills/MCP deps now reach useGuidSend instead of the
      // undefined/empty placeholders the surface used to pass.
      current_model: { use_model: 'model-a' },
      assistantDefaultSkillIds: [],
      assistantDefaultDisabledBuiltinSkillIds: [],
      assistantDefaultMcpIds: [],
      availableMcpServers: [],
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

  it('submits on Enter from the textarea', () => {
    render(<ProjectNewChatComposer project={project} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Draft the release notes' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });

    expect(sendMessageHandlerMock).toHaveBeenCalledTimes(1);
  });

  it('does not submit on Enter when the input is empty', () => {
    render(<ProjectNewChatComposer project={project} />);

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });

    expect(sendMessageHandlerMock).not.toHaveBeenCalled();
  });

  it('does not submit on Shift+Enter, leaving it free to insert a newline', () => {
    render(<ProjectNewChatComposer project={project} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Draft the release notes' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', shiftKey: true });

    expect(sendMessageHandlerMock).not.toHaveBeenCalled();
  });

  it('forwards skill toggles from the tools/MCP control to useGuidSend', async () => {
    listAvailableSkillsMock.mockResolvedValue([
      {
        name: 'pdf-skill',
        description: 'PDF skill',
        location: '/skills/pdf-skill',
        is_auto_inject: false,
        is_custom: true,
        source: 'custom',
      },
    ]);

    render(<ProjectNewChatComposer project={project} />);

    fireEvent.click(await screen.findByTestId('toggle-skill-pdf-skill'));

    await vi.waitFor(() => {
      expect(capturedGuidSendDeps.at(-1)).toMatchObject({ guidEnabledSkills: ['pdf-skill'] });
    });
  });

  it('forwards MCP server toggles from the tools/MCP control to useGuidSend', async () => {
    ensureBackendMcpCatalogMock.mockResolvedValue({
      allServers: [{ id: 'srv-1', name: 'Server 1', enabled: true, builtin: false } as IMcpServer],
    });

    render(<ProjectNewChatComposer project={project} />);

    fireEvent.click(await screen.findByTestId('toggle-mcp-srv-1'));

    await vi.waitFor(() => {
      expect(capturedGuidSendDeps.at(-1)).toMatchObject({ selectedMcpServerIds: ['srv-1'] });
    });
  });
});
