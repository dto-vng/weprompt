/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import SendBox from '@/renderer/components/chat/SendBox';
import { render, screen } from '@testing-library/react';
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
vi.mock('@/renderer/hooks/chat/useCompositionInput', () => ({
  useCompositionInput: () => ({
    createCompositionValueSync: () => vi.fn(),
    compositionHandlers: {},
    createKeyDownHandler: () => vi.fn(),
    isComposingState: false,
  }),
}));
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

describe('composer action buttons', () => {
  it('gives the send button an accessible name', () => {
    render(<SendBox onSend={vi.fn()} />);

    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toHaveAttribute('data-testid', 'sendbox-send-btn');
  });

  it('gives the stop button an accessible name and a test handle', () => {
    render(<SendBox loading onSend={vi.fn()} onStop={vi.fn()} />);

    // The stop glyph is a bare square div, so without aria-label the button announces nothing.
    const stop = screen.getByRole('button', { name: 'Stop generating' });
    expect(stop).toHaveAttribute('data-testid', 'sendbox-stop-btn');
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
  });
});
