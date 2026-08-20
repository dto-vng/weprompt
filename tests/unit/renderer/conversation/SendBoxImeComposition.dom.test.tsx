/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import GuidInputCard from '@/renderer/pages/guid/components/GuidInputCard';
import SendBox from '@/renderer/components/chat/SendBox';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

// Mock set mirrors tests/unit/renderer/conversation/UsageMeterComposer.dom.test.tsx, the
// existing harness that mounts the real SendBox.
const { layoutState } = vi.hoisted(() => ({
  layoutState: { current: { isMobile: false } },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      listAvailableSkills: { invoke: vi.fn().mockResolvedValue([]) },
      listWorkspaceFiles: { invoke: vi.fn().mockResolvedValue([]) },
    },
  },
}));
vi.mock('@/renderer/components/chat/AtFileMenu', () => ({ default: () => null }));
vi.mock('@/renderer/components/chat/BtwOverlay', () => ({ default: () => null }));
vi.mock('@/renderer/components/chat/BtwOverlay/useBtwCommand', () => ({
  useBtwCommand: () => ({ ask: vi.fn(), answer: null, dismiss: vi.fn(), isLoading: false, isOpen: false }),
}));
vi.mock('@/renderer/components/chat/SlashCommandMenu', () => ({ default: () => null }));
vi.mock('@/renderer/components/chat/SpeechInputButton', () => ({ default: () => null }));
vi.mock('@/renderer/components/media/UploadProgressBar', () => ({ default: () => null }));
// useCompositionInput is deliberately NOT mocked here: the composition path is
// what this file tests, so it runs against the real hook and the real Arco textarea.
vi.mock('@/renderer/hooks/chat/useInputFocusRing', () => ({
  useInputFocusRing: () => ({
    activeBorderColor: 'transparent',
    activeShadow: 'none',
    inactiveBorderColor: 'transparent',
  }),
}));
vi.mock('@/renderer/hooks/chat/useSlashCommandController', () => ({
  getFuzzyMatchIndices: () => null,
  useSlashCommandController: () => ({ filteredCommands: [], isOpen: false, onKeyDown: () => false, query: '' }),
}));
vi.mock('@/renderer/hooks/context/ConversationContext', () => ({
  useConversationContextSafe: () => null,
}));
vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => layoutState.current,
}));
vi.mock('@/renderer/hooks/file/useAbortUploadsOnConversationChange', () => ({
  useAbortUploadsOnConversationChange: vi.fn(),
}));
vi.mock('@/renderer/hooks/file/useConversationExport', () => ({
  useConversationExport: () => ({
    closeExportFlow: vi.fn(),
    filename: '',
    handleKeyDown: () => false,
    isOpen: false,
    loading: false,
    openExportFlow: vi.fn(),
    pathPreview: '',
    setFilename: vi.fn(),
    showMenu: vi.fn(),
    submitFilename: vi.fn(),
  }),
}));
vi.mock('@/renderer/hooks/file/useDragUpload', () => ({
  useDragUpload: () => ({ dragHandlers: {}, isFileDragging: false }),
}));
vi.mock('@/renderer/hooks/file/usePasteService', () => ({
  usePasteService: () => ({ onFocus: vi.fn(), onPaste: vi.fn() }),
}));
vi.mock('@/renderer/hooks/file/useUploadState', () => ({
  useUploadState: () => ({ isUploading: false }),
}));
vi.mock('@/renderer/hooks/system/useLiveTranscriptInsertion', () => ({
  createChainedDispatch: () => ({ dispatch: vi.fn(), reset: vi.fn() }),
  useLiveTranscriptInsertion: () => ({ handleLiveTranscript: vi.fn() }),
}));
vi.mock('@/renderer/pages/conversation/Messages/hooks', () => ({ useMessageList: () => [] }));
vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({
    clearDomSnippets: vi.fn(),
    domSnippets: [],
    removeDomSnippet: vi.fn(),
    setSendBoxHandler: vi.fn(),
  }),
}));
vi.mock('@/renderer/services/FileService', () => ({ allSupportedExts: [] }));
vi.mock('@/renderer/utils/emitter', () => ({ emitter: { emit: vi.fn() }, useAddEventListener: vi.fn() }));
vi.mock('@/renderer/components/media/FilePreview', () => ({ default: () => null }));
vi.mock('@/renderer/pages/guid/components/GuidWorkspaceFootnote', () => ({ default: () => null }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => {
      const translations: Record<string, string> = {
        'common.send': 'Send',
        'conversation.chat.stopGenerating': 'Stop generating',
      };
      return translations[key] ?? options?.defaultValue ?? key;
    },
  }),
}));

/**
 * SendBox is fully controlled — `value`/`onChange` are props — so the harness has
 * to own the text the way the conversation page does. Rendering a bare <SendBox />
 * pins nothing: its setter defaults to a no-op, and the send button stays disabled
 * no matter what is typed.
 */
const ControlledSendBox: React.FC = () => {
  const [value, setValue] = React.useState('');
  return <SendBox value={value} onChange={setValue} onSend={vi.fn()} />;
};

describe('SendBox with an IME composition open', () => {
  const sendButton = () => screen.getByRole('button', { name: 'Send' });
  const composer = () => screen.getByTestId('sendbox-input');

  /**
   * Reported by a user typing Vietnamese: "the arrow button is not enabled
   * until I hit space or click on something". Reproduced against the running
   * app by driving a real composition over CDP — the textarea's DOM value read
   * "a", "ab", "abc" while the send button stayed `disabled: true`, flipping
   * only once the composition committed.
   *
   * The cause is upstream. Arco's `useComposition.valueChangeHandler` withholds
   * `props.onChange` for the whole composition and updates only its own display
   * value, so a controlled parent's state stays empty while text is visibly on
   * screen. Every control derived from that state is wrong until commit — and
   * for Telex, commit is the space key, which is exactly what was reported.
   */
  it('enables send from text that is still being composed', () => {
    render(<ControlledSendBox />);

    expect(sendButton()).toBeDisabled();

    fireEvent.compositionStart(composer());
    fireEvent.input(composer(), { target: { value: 'xin' } });

    expect(sendButton()).toBeEnabled();
  });

  it('still enables send for plain typing that never opens a composition', () => {
    render(<ControlledSendBox />);

    // `input`, not `change`: typing fires the former, and it is the event both
    // Arco's onChange and the composition sync listen to.
    fireEvent.input(composer(), { target: { value: 'hello' } });

    expect(sendButton()).toBeEnabled();
  });

  it('keeps send enabled once the composition commits', () => {
    render(<ControlledSendBox />);

    fireEvent.compositionStart(composer());
    fireEvent.input(composer(), { target: { value: 'xin' } });
    fireEvent.compositionEnd(composer(), { target: { value: 'xin ch\u00e0o' } });

    expect(sendButton()).toBeEnabled();
  });

  it('leaves send disabled when the composition carries only whitespace', () => {
    render(<ControlledSendBox />);

    fireEvent.compositionStart(composer());
    fireEvent.input(composer(), { target: { value: '   ' } });

    expect(sendButton()).toBeDisabled();
  });
});

/**
 * The Guid page and the project-home card share GuidInputCard, and their send
 * button is disabled from `!input.trim()` in useGuidSend — the same shape as
 * SendBox's, one component further out. GuidInputCard does not own that button
 * (the action row is passed in), so the contract to pin here is the one that
 * feeds it: composing text must be reported to the parent, not withheld.
 */
describe('GuidInputCard with an IME composition open', () => {
  const renderCard = (onInputChange: (value: string) => void) =>
    render(
      <GuidInputCard
        input=''
        onInputChange={onInputChange}
        onKeyDown={vi.fn()}
        onPaste={vi.fn()}
        onFocus={vi.fn()}
        onBlur={vi.fn()}
        placeholder='Message'
        isInputActive={false}
        isFileDragging={false}
        activeBorderColor='#000'
        inactiveBorderColor='#ccc'
        activeShadow='none'
        dragHandlers={{}}
        files={[]}
        onRemoveFile={vi.fn()}
        actionRow={<div>Actions</div>}
        workspaceDir='/Users/me/Finance Close'
        onSelectWorkspace={vi.fn()}
        onClearWorkspace={vi.fn()}
      />
    );

  it('reports text that is still being composed', () => {
    const onInputChange = vi.fn();
    renderCard(onInputChange);

    fireEvent.compositionStart(screen.getByTestId('guid-input'));
    fireEvent.input(screen.getByTestId('guid-input'), { target: { value: 'xin' } });

    expect(onInputChange).toHaveBeenCalledWith('xin');
  });

  it('reports plain typing exactly once, with no composition open', () => {
    // Typing fires `input`, which both Arco's onChange and the composition sync
    // are wired to. Without the not-composing guard the parent hears every
    // keystroke twice, so this is what pins the guard rather than the sync.
    const onInputChange = vi.fn();
    renderCard(onInputChange);

    fireEvent.input(screen.getByTestId('guid-input'), { target: { value: 'hello' } });

    expect(onInputChange).toHaveBeenCalledExactlyOnceWith('hello', expect.anything());
  });
});
