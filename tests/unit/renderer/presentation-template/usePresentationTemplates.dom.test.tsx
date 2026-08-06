/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  PresentationTemplateFormat,
  PresentationTemplateSummary,
} from '@/common/types/office/presentationTemplate';
import {
  getPresentationRunEligibility,
  resolveManagedPresentationInitialSend,
  type PresentationRunEligibilityInput,
  usePresentationTemplates,
} from '@/renderer/components/chat/TemplateGallery/usePresentationTemplates';
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

describe('getPresentationRunEligibility', () => {
  const eligibleInput: PresentationRunEligibilityInput = {
    featureEnabled: true,
    isDesktop: true,
    scope: 'individual',
    runtime: 'aionrs',
    templateFormat: 'pptx',
  };

  it.each(['aionrs', 'acp'])('accepts a selected PPTX for the supported %s desktop runtime', (runtime) => {
    expect(getPresentationRunEligibility({ ...eligibleInput, runtime })).toBe(true);
  });

  it.each([
    { name: 'feature flag is false', override: { featureEnabled: false } },
    { name: 'environment is browser', override: { isDesktop: false } },
    { name: 'scope is team', override: { scope: 'team' as const } },
    { name: 'scope is unknown', override: { scope: 'unknown' as const } },
    { name: 'template is unselected', override: { templateFormat: null } },
    { name: 'template format is DOCX', override: { templateFormat: 'docx' as PresentationTemplateFormat } },
    { name: 'template format is HTML', override: { templateFormat: 'html' as PresentationTemplateFormat } },
    { name: 'runtime is unsupported', override: { runtime: 'claude' } },
    { name: 'runtime is unknown', override: { runtime: null } },
  ])('rejects managed UX when $name', ({ override }) => {
    expect(getPresentationRunEligibility({ ...eligibleInput, ...override })).toBe(false);
  });
});

describe('resolveManagedPresentationInitialSend', () => {
  it('recovers raw user input and the selected template without forwarding template paths', () => {
    expect(
      resolveManagedPresentationInitialSend(
        'Create a presentation from the request below. Managed rules.\n\nQuarterly review',
        [
          '/private/presentation-templates/business-review/THEME.md',
          '/private/presentation-templates/business-review/reference.pptx',
        ]
      )
    ).toEqual({
      input: 'Quarterly review',
      selectedTemplateId: 'business-review',
      injectSkills: ['officecli'],
    });
  });

  it('rejects an initial managed send that still contains a raw user attachment', () => {
    expect(
      resolveManagedPresentationInitialSend(
        'Create a presentation from the request below. Managed rules.\n\nQuarterly review',
        [
          '/private/presentation-templates/business-review/THEME.md',
          '/private/presentation-templates/business-review/reference.pptx',
          '/private/user/revenue.xlsx',
        ]
      )
    ).toBeNull();
  });
});

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
