/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PresentationTemplateSummary } from '@/common/types/office/presentationTemplate';
import { usePresentationTemplates } from '@/renderer/components/chat/TemplateGallery/usePresentationTemplates';
import { emitter } from '@/renderer/utils/emitter';

const {
  allocateScratchInvokeMock,
  completeScratchInvokeMock,
  discardScratchInvokeMock,
  messageWarningMock,
  retainScratchInvokeMock,
} = vi.hoisted(() => ({
  allocateScratchInvokeMock: vi.fn(),
  completeScratchInvokeMock: vi.fn(),
  discardScratchInvokeMock: vi.fn(),
  messageWarningMock: vi.fn(),
  retainScratchInvokeMock: vi.fn(),
}));

vi.mock('@arco-design/web-react', () => ({
  Button: () => null,
  Message: {
    error: vi.fn(),
    success: vi.fn(),
    warning: messageWarningMock,
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    presentationTemplates: {
      list: { invoke: vi.fn().mockResolvedValue([]) },
      importSpec: { invoke: vi.fn() },
      remove: { invoke: vi.fn() },
      allocateScratch: { invoke: allocateScratchInvokeMock },
      completeScratch: { invoke: completeScratchInvokeMock },
      retainScratch: { invoke: retainScratchInvokeMock },
      discardScratch: { invoke: discardScratchInvokeMock },
    },
    dialog: {
      showOpen: { invoke: vi.fn() },
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const template: PresentationTemplateSummary = {
  manifest: {
    id: 'business-review',
    name: 'Business Review',
    description: 'Quarterly review',
    format: 'pptx',
    kind: 'deck',
    source: 'builtin',
    themeFile: 'THEME.md',
    referenceFile: 'reference.pptx',
    preview: 'preview.svg',
    version: 1,
    createdAt: 'now',
  },
  themePath: '/templates/business-review/THEME.md',
  referencePath: '/templates/business-review/reference.pptx',
  previewDataUrl: 'data:image/svg+xml;base64,x',
};

const allocation = {
  runId: '5a68fccc-7b90-49b4-88f9-d78bb88255ed',
  directory: '/tmp/aionui-artifact-runs/5a68fccc-7b90-49b4-88f9-d78bb88255ed',
  readyMarker: '/tmp/aionui-artifact-runs/5a68fccc-7b90-49b4-88f9-d78bb88255ed/.aionui-delivery-ready',
};

describe('usePresentationTemplates artifact scratch lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    allocateScratchInvokeMock.mockResolvedValue(allocation);
    completeScratchInvokeMock.mockResolvedValue({ status: 'cleaned' });
    retainScratchInvokeMock.mockResolvedValue({
      status: 'retained',
      directory: allocation.directory,
      reason: 'failed',
    });
    discardScratchInvokeMock.mockResolvedValue({ status: 'cleaned' });
  });

  it('allocates an owned path and cleans the matching run only after a completed terminal', async () => {
    const { result } = renderHook(() => usePresentationTemplates('conversation-1'));
    act(() => result.current.selectTemplate(template));

    const scratch = await result.current.prepareScratch('conversation-1');
    expect(allocateScratchInvokeMock).toHaveBeenCalledWith({
      conversation_id: 'conversation-1',
      template_id: 'business-review',
    });
    const composed = result.current.composeSend('Build the review', [], scratch);
    expect(composed.artifactScratchRunId).toBe(allocation.runId);

    act(() => result.current.registerScratchTurn('turn-1', allocation.runId));
    act(() => {
      emitter.emit('artifact.scratch.terminal', {
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        outcome: 'completed',
      });
    });

    await waitFor(() => {
      expect(completeScratchInvokeMock).toHaveBeenCalledWith({ run_id: allocation.runId });
    });
    expect(retainScratchInvokeMock).not.toHaveBeenCalled();
  });

  it('retains the matching run on failure and ignores terminals from other conversations', async () => {
    const { result } = renderHook(() => usePresentationTemplates('conversation-1'));
    act(() => result.current.registerScratchTurn('turn-1', allocation.runId));

    act(() => {
      emitter.emit('artifact.scratch.terminal', {
        conversationId: 'conversation-2',
        turnId: 'turn-1',
        outcome: 'failed',
      });
    });
    expect(retainScratchInvokeMock).not.toHaveBeenCalled();

    act(() => {
      emitter.emit('artifact.scratch.terminal', {
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        outcome: 'failed',
      });
    });
    await waitFor(() => {
      expect(retainScratchInvokeMock).toHaveBeenCalledWith({ run_id: allocation.runId, reason: 'failed' });
    });
    expect(messageWarningMock).toHaveBeenCalledWith(expect.objectContaining({ duration: 0, closable: true }));
    expect(completeScratchInvokeMock).not.toHaveBeenCalled();
  });
});
